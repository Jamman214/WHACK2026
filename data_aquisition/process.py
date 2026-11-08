"""Embed new articles, then two-pass cluster everything into topics -> subtopics.

    python process.py [--merge-pctile 90] [--sub-min 6]
"""
import argparse
import json
import logging
import os
import re
import time
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from sklearn.cluster import HDBSCAN, AgglomerativeClustering

import db

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

EMBED_MODEL = "google/embeddinggemma-2"
EMBED_DIM = 768
NAME_MODEL = os.getenv("NAME_MODEL", "gemini-3.5-flash-lite")
HEADLINES_PER_NAME = 8


# ---------------------------------------
# 1. Embedding
# ---------------------------------------

def embed_new(conn):
    rows = conn.execute(
        # wrong length = vector from an older model; re-embed so all vectors are comparable
        "SELECT id, title, description FROM articles "
        "WHERE embedding IS NULL OR length(embedding) != ?", (EMBED_DIM * 4,)
    ).fetchall()
    if not rows:
        logging.info("No new articles to embed")
        return

    import torch  # slow imports; skip when nothing to do
    from sentence_transformers import SentenceTransformer
    # bfloat16 halves RAM (model is 740M params; float16 is unsupported); skipping the
    # vision/audio encoders saves more. Loader still needs pillow + torchvision installed.
    model = SentenceTransformer(EMBED_MODEL, device="cpu",
                                model_kwargs={"torch_dtype": torch.bfloat16},
                                config_kwargs={"vision_config": None, "audio_config": None})
    texts = [f"{title}. {desc or ''}" for _, title, desc in rows]
    vecs = model.encode(texts, prompt_name="Clustering", batch_size=16,
                        normalize_embeddings=True, show_progress_bar=True).astype(np.float32)

    with conn:
        conn.executemany(
            "UPDATE articles SET embedding = ? WHERE id = ?",
            [(v.tobytes(), row[0]) for v, row in zip(vecs, rows)]
        )
    logging.info("Embedded %d articles", len(rows))


# ---------------------------------------
# 2. Two-pass clustering
# ---------------------------------------

def cluster(vecs, merge_pctile, sub_min):
    """Bottom-up two-level clustering. Returns (top, sub) label arrays.
    Articles in no subtopic are -1 in both: ungrouped rather than forced into a topic."""
    # 1. Fine subtopics: density clustering fails in high dims (nearly all noise), so
    #    UMAP to 5 dims first. UMAP keeps local structure well but places separate
    #    groups arbitrarily, so it is only trusted for this fine level.
    from umap import UMAP  # slow import (numba)
    reduced = UMAP(n_components=5, n_neighbors=15, min_dist=0.0, metric="cosine",
                   random_state=42).fit_transform(vecs)  # fixed seed: similar topics between runs
    sub = HDBSCAN(min_cluster_size=sub_min, min_samples=3, copy=True).fit_predict(reduced)

    # UMAP can squash unrelated articles into a subtopic; eject members that are box-plot
    # outliers (below Q1 - 3*IQR, the "extreme" fence) by similarity to the subtopic centre in the original space
    for s in np.unique(sub[sub >= 0]):
        members = np.flatnonzero(sub == s)
        centre = vecs[members].mean(axis=0)
        sims = vecs[members] @ (centre / np.linalg.norm(centre))
        q1, q3 = np.percentile(sims, [25, 75])
        sub[members[sims < q1 - 3 * (q3 - q1)]] = -1  # 1.5*IQR also ejected ordinary edge members
    ids = np.unique(sub[sub >= 0])
    if len(ids) < 2:
        raise SystemExit(f"Only {len(ids)} subtopics with --sub-min {sub_min} on {len(vecs)} articles; lower it.")

    # 2. Parents: merge subtopics only when genuinely similar, in the original space where
    #    global distances hold. A subtopic close to nothing stays its own parent.
    cen = np.stack([vecs[sub == s].mean(axis=0) for s in ids])
    cen /= np.linalg.norm(cen, axis=1, keepdims=True)
    sim = cen @ cen.T
    # Relative cut-off: each model has its own similarity range (MiniLM ~0.1-0.5, Gemma ~0.87-0.95)
    cutoff = np.percentile(sim[~np.eye(len(ids), dtype=bool)], merge_pctile)
    parent = AgglomerativeClustering(n_clusters=None, distance_threshold=1 - cutoff,
                                     metric="cosine", linkage="average").fit_predict(cen)
    top = np.full(len(vecs), -1)
    for s, p in zip(ids, parent):
        top[sub == s] = p

    # Articles in no subtopic join a parent only if their neighbours agree; the rest stay
    # ungrouped (top = -1). They keep sub = -1: they are in the topic but in no story group.
    return attach_loners(vecs, top), sub


def attach_loners(vecs, top, k=10, min_votes=8):
    """Give an ungrouped article the parent topic shared by >= min_votes of its k nearest
    grouped articles. A similarity threshold couldn't separate right from wrong placements;
    neighbour agreement could (8/10 checked by eye on real headlines, 2026-11-07)."""
    top = top.copy()
    grouped, loners = np.flatnonzero(top >= 0), np.flatnonzero(top < 0)
    if not len(loners) or len(grouped) < k:
        return top
    # A far-off article's neighbours can all agree just because one topic is the least far,
    # so also require it to sit inside the topic's own spread (same Q1 - 3*IQR fence as cluster()).
    fence = {}
    for t in np.unique(top[grouped]):
        members = np.flatnonzero(top == t)
        centre = vecs[members].mean(axis=0)
        centre /= np.linalg.norm(centre)
        q1, q3 = np.percentile(vecs[members] @ centre, [25, 75])
        fence[t] = centre, q1 - 3 * (q3 - q1)
    nn = np.argsort(-(vecs[loners] @ vecs[grouped].T), axis=1)[:, :k]
    for i, votes in zip(loners, top[grouped][nn]):
        counts = np.bincount(votes)
        centre, floor = fence[counts.argmax()]
        if counts.max() >= min_votes and vecs[i] @ centre >= floor:
            top[i] = counts.argmax()
    return top


# ---------------------------------------
# 3. Naming
# ---------------------------------------

def reply_json(text):
    """The JSON object in a model reply, or None."""
    # Gemma 4 always thinks first, inside <thought>...</thought> (often echoing the JSON template); drop it
    text = re.sub(r"<thought>.*?</thought>", "", text or "", flags=re.S)
    match = re.search(r"\{.*\}", text, re.S)  # models often wrap JSON in prose/fences
    try:
        return json.loads(match.group(0)) if match else None
    except ValueError:
        return None


def parse_renames(text, n):
    """Pull {"names": [n names]} out of a model reply; None if unusable."""
    try:
        names = [str(x).strip() for x in reply_json(text)["names"]]
        return names if len(names) == n else None
    except (KeyError, TypeError):
        return None


def parse_names(text, n_subs):
    """Pull {"topic": ..., "subtopics": [...]} out of a model reply; None if unusable."""
    try:
        data = reply_json(text)
        subs = [str(x).strip() for x in data["subtopics"]]
        if len(subs) != n_subs:
            return None
        return str(data["topic"]).strip(), subs
    except (ValueError, KeyError, TypeError):
        return None


def make_namer():
    """Return (name, rename):
    name(topic_headlines, [subtopic_headlines, ...], lone_headlines) -> (topic, [subtopics]) or None,
    one call per top-level topic;
    rename([headlines per clashing topic], [their subtopic names], [their names], avoid_names) -> [new names] or None,
    one call per group of clashing topics."""
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        logging.warning("GEMINI_API_KEY not set; using placeholder names")
        return (lambda topic, subs, lone: None), (lambda heads, subnames, names, avoid: None)

    from openai import OpenAI, RateLimitError  # Google AI Studio serves an OpenAI-compatible endpoint
    # default timeout is 10 min x 2 retries; a hung call blocked a whole run for ~30 min
    client = OpenAI(api_key=key, base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                    timeout=120)

    def ask(prompt):
        for attempt in range(6):
            try:
                reply = client.chat.completions.create(
                    model=NAME_MODEL, messages=[{"role": "user", "content": prompt}]
                )
                return reply.choices[0].message.content
            except RateLimitError:  # free tier allows only a few calls per minute; the client's own retries wait ~1s
                logging.info("Rate limited, waiting 20s")
                time.sleep(20)
            except Exception as error:  # one failed call shouldn't lose the whole run
                logging.warning("Naming failed: %s", error)
                return None
        logging.warning("Naming failed: still rate limited")
        return None

    def name(topic, subs, lone):
        groups = "\n\n".join(
            f"SUBTOPIC {i}:\n" + "\n".join(h) for i, h in enumerate(subs, 1)
        )
        lone_text = ("\n\nLONE ARTICLES (in this topic but in no subtopic):\n" + "\n".join(lone)
                     if lone else "")
        prompt = (
            "Name these news clusters. The TOPIC is a broad news section; each SUBTOPIC "
            "is a distinct story group inside it and forms the topic's core. LONE ARTICLES "
            "also belong to the topic but to no subtopic: the topic name should cover them "
            "too, but never name a subtopic after them. Use 2-4 words per name, in the style of "
            "a news section (e.g. 'Money & markets', 'Central banks & rates'). Make "
            "subtopic names distinct from each other.\n"
            f'Reply with JSON only: {{"topic": "...", "subtopics": [{len(subs)} names in order]}}\n\n'
            "TOPIC CORE:\n" + "\n".join(topic) + "\n\n" + groups + lone_text
        )
        text = ask(prompt)
        names = text and parse_names(text, len(subs))
        if text and not names:
            logging.warning("Unusable naming reply: %.200s", text)
        return names

    def rename(heads, subnames, names, avoid):
        # independent calls name similar clusters alike ("World news" x3); seeing them together fixes that
        prompt = (
            "These news topics were given overlapping names. Give each a new 2-4 word name in the "
            "style of a news section (e.g. 'Money & markets'). Each name must be broad enough to cover "
            "ALL of that topic's subtopics, not just its biggest story, yet clearly different from the "
            "other names. Keep words from the current name that are accurate, especially places "
            "(e.g. UK, US): make names differ by adding the distinguishing detail, not by removing it. "
            "If a current name is already accurate and clearly distinct from the others, return it "
            "unchanged; only change the names that need it.\n"
            + (f"Also keep clear of these other topics' names: {', '.join(avoid)}\n" if avoid else "")
            + f'Reply with JSON only: {{"names": [{len(heads)} names in order]}}\n\n'
            + "\n\n".join(f"TOPIC {i} (currently '{n}')\nSubtopics: {', '.join(sn)}\nKey headlines:\n"
                           + "\n".join(h)
                           for i, (h, sn, n) in enumerate(zip(heads, subnames, names), 1))
        )
        text = ask(prompt)
        new = text and parse_renames(text, len(heads))
        if text and not new:
            logging.warning("Unusable renaming reply: %.200s", text)
        return new

    return name, rename


def names_clash(a, b):
    """Two topic names share a meaningful word, e.g. 'World news' / 'World politics'."""
    words = lambda n: set(re.findall(r"[a-z]+", n.lower())) - {"and", "the", "of", "in"}

    def same_root(x, y):
        # a shared prefix covering most of the shorter word: tech/technology, politics/political, election/elections
        p = len(os.path.commonprefix([x, y]))
        return x == y or (p >= 4 and p >= 0.75 * min(len(x), len(y)))

    return any(same_root(x, y) for x in words(a) for y in words(b))


def central_titles(vecs, titles, idx):
    """Headlines closest to the group's centroid: the most representative ones."""
    centroid = vecs[idx].mean(axis=0)
    best = idx[np.argsort(-(vecs[idx] @ centroid))[:HEADLINES_PER_NAME]]
    return [titles[i] for i in best]


# ---------------------------------------
# 4. Main
# ---------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--merge-pctile", type=float, default=90,
                        help="merge subtopics only if more similar than this percentile of all "
                             "subtopic pairs; higher = stricter, more standalone topics")
    parser.add_argument("--sub-min", type=int, default=6, help="min articles per subtopic")
    args = parser.parse_args()

    conn = db.connect()
    embed_new(conn)

    rows = conn.execute(
        "SELECT id, title, embedding FROM articles WHERE embedding IS NOT NULL"
    ).fetchall()
    if not rows:
        raise SystemExit("No articles in the database; run main.py first.")

    article_ids = [r[0] for r in rows]
    titles = [r[1] for r in rows]
    vecs = np.stack([np.frombuffer(r[2], dtype=np.float32) for r in rows])

    top, sub = cluster(vecs, args.merge_pctile, args.sub_min)
    name, rename = make_namer()

    topics = []        # (id, parent_id, name, size)
    top_db_id = {-1: None}  # cluster label -> topics.id; -1 = ungrouped
    sub_db_id = {-1: None}
    groups = []  # (label, member idx, subtopic labels, namer inputs, names or None)
    for t in np.unique(top[top >= 0]):
        idx = np.flatnonzero(top == t)
        sub_labels = [x for x in np.unique(sub[idx]) if x >= 0]
        core, lone = idx[sub[idx] >= 0], idx[sub[idx] < 0]
        inputs = (central_titles(vecs, titles, core),
                  [central_titles(vecs, titles, np.flatnonzero(sub == x)) for x in sub_labels],
                  central_titles(vecs, titles, lone) if len(lone) else [])
        groups.append((t, idx, sub_labels, inputs, name(*inputs)))

    # Names clash if they share a word AND the topics are near neighbours (one-word overlaps between
    # distant topics, e.g. 'Law & Justice' / 'Royal Family & Law', are fine). Each connected group of
    # clashing topics (pair, trio, ...) is renamed together in one call.
    cents = np.stack([vecs[idx].mean(axis=0) for _, idx, *_ in groups])
    cents /= np.linalg.norm(cents, axis=1, keepdims=True)
    sims = cents @ cents.T
    np.fill_diagonal(sims, -np.inf)
    near = [set(np.argsort(-row)[:3]) for row in sims]
    first = [names and names[0] for *_, names in groups]
    tops = list(first)
    comps = []  # sets of topic indices
    for i in range(len(groups)):
        for j in range(i):
            if first[i] and first[j] and (j in near[i] or i in near[j]) and names_clash(first[i], first[j]):
                hit = [c for c in comps if i in c or j in c]
                comps = [c for c in comps if c not in hit] + [{i, j}.union(*hit)]
    for comp in comps:
        members = sorted(comp)
        avoid = [tops[k] for k in range(len(groups)) if k not in comp and tops[k]]
        new = rename([groups[m][3][0] for m in members], [groups[m][4][1] for m in members],
                     [tops[m] for m in members], avoid)
        logging.info("Clash group: %s", [tops[m] for m in members])
        for m, n in zip(members, new or []):
            if n != tops[m]:
                logging.info("Renamed %r -> %r", tops[m], n)
            else:
                logging.info("Kept %r", n)
            tops[m] = n

    next_id = 1
    for (t, idx, sub_labels, _, names), top_name in zip(groups, tops):
        sub_names = names[1] if names else [None] * len(sub_labels)
        top_name = top_name or f"Topic {next_id}"

        top_db_id[t] = next_id
        topics.append((next_id, None, top_name, len(idx)))
        print(f"\n{top_name}  ({len(idx)})")
        next_id += 1

        for x, sub_name in zip(sub_labels, sub_names):
            sidx = np.flatnonzero(sub == x)
            sub_name = sub_name or f"Subtopic {next_id}"
            sub_db_id[x] = next_id
            topics.append((next_id, top_db_id[t], sub_name, len(sidx)))
            print(f"    {sub_name}  ({len(sidx)})")
            next_id += 1

    # One transaction so readers never see half-rebuilt topics
    with conn:
        conn.execute("UPDATE articles SET topic_id = NULL, subtopic_id = NULL")
        conn.execute("DELETE FROM topics")
        conn.executemany("INSERT INTO topics VALUES (?, ?, ?, ?)", topics)
        conn.executemany(
            "UPDATE articles SET topic_id = ?, subtopic_id = ? WHERE id = ?",
            [(top_db_id[t], sub_db_id[s], a) for a, t, s in zip(article_ids, top, sub)]
        )
    conn.close()
    print(f"\n{len(top_db_id) - 1} topics, {len(sub_db_id) - 1} subtopics, "
          f"{int((top < 0).sum())} of {len(rows)} articles ungrouped")


if __name__ == "__main__":
    main()
