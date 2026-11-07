"""Embed new articles, then two-pass cluster everything into topics -> subtopics.

    python process.py [--topics 12] [--top-min 40] [--sub-min 6]
"""
import argparse
import logging
import os
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from sklearn.cluster import HDBSCAN, AgglomerativeClustering

import db

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

EMBED_MODEL = "all-MiniLM-L6-v2"
NAME_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
HEADLINES_PER_NAME = 10


# ---------------------------------------
# 1. Embedding
# ---------------------------------------

def embed_new(conn):
    rows = conn.execute(
        "SELECT id, title, description FROM articles WHERE embedding IS NULL"
    ).fetchall()
    if not rows:
        logging.info("No new articles to embed")
        return

    from sentence_transformers import SentenceTransformer  # slow import; skip when nothing to do
    model = SentenceTransformer(EMBED_MODEL, device="cpu")
    texts = [f"{title}. {desc or ''}" for _, title, desc in rows]
    vecs = model.encode(texts, batch_size=64, normalize_embeddings=True,
                        show_progress_bar=True).astype(np.float32)

    with conn:
        conn.executemany(
            "UPDATE articles SET embedding = ? WHERE id = ?",
            [(v.tobytes(), row[0]) for v, row in zip(vecs, rows)]
        )
    logging.info("Embedded %d articles", len(rows))


# ---------------------------------------
# 2. Two-pass clustering
# ---------------------------------------

def cluster(vecs, n_topics, top_min, sub_min):
    """Bottom-up two-level clustering. Returns (top, sub) label arrays: every article
    gets a top label; sub is -1 for articles that fit no subtopic ("other")."""
    # 1. Fine subtopics: density clustering fails in 384 dims (nearly all noise), so
    #    UMAP to 5 dims first. UMAP keeps local structure well but places separate
    #    groups arbitrarily, so it is only trusted for this fine level.
    from umap import UMAP  # slow import (numba)
    reduced = UMAP(n_components=5, n_neighbors=15, min_dist=0.0, metric="cosine",
                   random_state=42).fit_transform(vecs)  # fixed seed: similar topics between runs
    sub = HDBSCAN(min_cluster_size=sub_min, min_samples=3, copy=True).fit_predict(reduced)
    ids = np.unique(sub[sub >= 0])
    if len(ids) < 2:
        raise SystemExit(f"Only {len(ids)} subtopics with --sub-min {sub_min} on {len(vecs)} articles; lower it.")

    # 2. Parents: group subtopic centroids in the original space, where global distances hold
    cen = np.stack([vecs[sub == s].mean(axis=0) for s in ids])
    cen /= np.linalg.norm(cen, axis=1, keepdims=True)
    parent = AgglomerativeClustering(n_clusters=min(n_topics, len(ids)), metric="cosine",
                                     linkage="average").fit_predict(cen)
    top = np.empty(len(vecs), dtype=int)
    for s, p in zip(ids, parent):
        top[sub == s] = p
    # Unclustered articles join the parent of their nearest subtopic, as that topic's "other"
    noise = sub < 0
    top[noise] = parent[np.argmax(vecs[noise] @ cen.T, axis=1)]

    # 3. Fold topics smaller than top_min into the nearest other topic
    while True:
        labels, sizes = np.unique(top, return_counts=True)
        if len(labels) < 2 or sizes.min() >= top_min:
            break
        small = labels[np.argmin(sizes)]
        others = labels[labels != small]
        centroids = np.stack([vecs[top == t].mean(axis=0) for t in others])
        top[top == small] = others[np.argmax(centroids @ vecs[top == small].mean(axis=0))]
    return top, sub


# ---------------------------------------
# 3. Naming
# ---------------------------------------

def make_namer():
    if not os.getenv("OPENAI_API_KEY"):
        logging.warning("OPENAI_API_KEY not set; using placeholder names")
        return lambda headlines, parent=None: None

    from openai import OpenAI
    client = OpenAI()

    def name(headlines, parent=None):
        context = f' They are a subtopic within "{parent}".' if parent else ""
        prompt = (
            "These news headlines belong to one cluster." + context +
            " Reply with only a 2-4 word topic name in the style of a news "
            "section (e.g. 'Central banks & rates').\n\n" + "\n".join(headlines)
        )
        try:
            reply = client.chat.completions.create(
                model=NAME_MODEL,
                messages=[{"role": "user", "content": prompt}],
            )
            return reply.choices[0].message.content.strip().strip('"\'')
        except Exception as error:  # one failed name shouldn't lose the whole run
            logging.warning("Naming failed: %s", error)
            return None

    return name


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
    parser.add_argument("--topics", type=int, default=12, help="target number of top-level topics")
    parser.add_argument("--top-min", type=int, default=40, help="min articles per top-level topic")
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

    top, sub = cluster(vecs, args.topics, args.top_min, args.sub_min)
    name = make_namer()

    topics = []        # (id, parent_id, name, size)
    top_db_id = {}     # cluster label -> topics.id
    sub_db_id = {-1: None}
    next_id = 1
    for t in np.unique(top):
        idx = np.flatnonzero(top == t)
        top_name = name(central_titles(vecs, titles, idx)) or f"Topic {next_id}"
        top_db_id[t] = next_id
        topics.append((next_id, None, top_name, len(idx)))
        print(f"\n{top_name}  ({len(idx)})")
        next_id += 1

        for s in np.unique(sub[idx]):
            if s < 0:
                continue
            sidx = np.flatnonzero(sub == s)
            sub_name = name(central_titles(vecs, titles, sidx), top_name) or f"Subtopic {next_id}"
            sub_db_id[s] = next_id
            topics.append((next_id, top_db_id[t], sub_name, len(sidx)))
            print(f"    {sub_name}  ({len(sidx)})")
            next_id += 1
        print(f"    (other)  ({int((sub[idx] < 0).sum())})")

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
    print(f"\n{len(top_db_id)} topics, {len(sub_db_id) - 1} subtopics, {len(rows)} articles")


if __name__ == "__main__":
    main()
