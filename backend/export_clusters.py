"""Turn the data pipeline's database (data_aquisition: bge-small embeddings + 2-level clustering)
into data/clusters.json, the file the onboarding API reads.

    python export_clusters.py [--db ../data/news.db]

Run it after `python process.py` in data_aquisition. The API notices the new file by itself.

How the pipeline's names map onto the API's:
    pipeline top-level topic  -> group   (broad area, e.g. "Money & markets")
    pipeline subtopic         -> topic   (specific story group inside it)
Articles in no subtopic (loners and ungrouped) are left out: onboarding cards need a topic.
"""
import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from utils import to_iso

HERE = Path(__file__).resolve().parent
DEFAULT_DB = HERE.parent / "data" / "news.db"  # where data_aquisition/db.py writes it
OUT = HERE / "data" / "clusters.json"
RELATED_PER_TOPIC = 3


def article_id(url: str) -> str:
    # Hash of the URL rather than the DB row id, so the id is the same on every teammate's DB.
    return hashlib.sha1(url.encode()).hexdigest()[:12]


def export(db_path: Path) -> dict:
    if not db_path.exists():
        raise SystemExit(f"No database at {db_path}. Run data_aquisition/main.py and process.py first, "
                         f"or pass --db with the path to news.db.")
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)  # read-only: never touch the pipeline's data
    topic_rows = conn.execute("SELECT id, parent_id, name FROM topics").fetchall()
    rows = conn.execute(
        "SELECT url, title, description, image, source, provider, published_at, topic_id, subtopic_id, embedding "
        "FROM articles WHERE subtopic_id IS NOT NULL AND embedding IS NOT NULL"
    ).fetchall()
    conn.close()
    if not rows:
        raise SystemExit("The database has no clustered articles yet; run process.py first.")

    parents = {tid: name for tid, parent, name in topic_rows if parent is None}
    subs = {tid: (parent, name) for tid, parent, name in topic_rows if parent is not None}
    vecs = np.stack([np.frombuffer(r[9], dtype=np.float32) for r in rows])
    sub_of = np.array([r[8] for r in rows])

    # Centrality: cosine similarity to the subtopic's centre, rescaled to 0..1 inside each subtopic
    # (embedding similarities all sit in a narrow band, so raw values would look identical).
    centrality = np.zeros(len(rows))
    centres = {}
    for s in np.unique(sub_of):
        idx = np.flatnonzero(sub_of == s)
        c = vecs[idx].mean(axis=0)
        c /= np.linalg.norm(c)
        centres[int(s)] = c
        sims = vecs[idx] @ c
        span = sims.max() - sims.min()
        centrality[idx] = (sims - sims.min()) / span if span > 0 else 1.0

    # Related topics: nearest other subtopics by centre similarity (for bridges later).
    sub_ids = sorted(centres)
    C = np.stack([centres[s] for s in sub_ids])
    sim = C @ C.T
    np.fill_diagonal(sim, -np.inf)
    related = {s: [f"t-{sub_ids[j]}" for j in np.argsort(-sim[i])[:RELATED_PER_TOPIC]]
               for i, s in enumerate(sub_ids)}
    # Same neighbours as weighted undirected links (like the frontend's {a, b, w}); one per pair.
    pairs = {tuple(sorted((i, int(j)))) for i in range(len(sub_ids))
             for j in np.argsort(-sim[i])[:RELATED_PER_TOPIC]}
    links = [{"a": f"t-{sub_ids[i]}", "b": f"t-{sub_ids[j]}", "w": round(float(sim[i, j]), 3)}
             for i, j in sorted(pairs)]

    used_parents = sorted({subs[s][0] for s in sub_ids})
    groups = [{"id": f"g-{p}", "label": parents.get(p, f"Topic {p}"), "description": None}
              for p in used_parents]
    topics = [{"id": f"t-{s}", "groupId": f"g-{subs[s][0]}", "label": subs[s][1],
               "description": None, "related": related[s]} for s in sub_ids]

    articles, seen = [], set()
    for r, cent in zip(rows, centrality):
        url, title, desc, image, source, provider, published, tid, sid, _ = r
        aid = article_id(url)
        if aid in seen:
            continue
        seen.add(aid)
        articles.append({
            "id": aid,
            "title": " ".join(title.split()),
            "description": desc or None,
            "url": url,
            "image": image,
            "source": source,
            "provider": provider or "Unknown",
            "publishedAt": to_iso(published),
            "groupId": f"g-{subs[sid][0]}",
            "topicId": f"t-{sid}",
            "centrality": round(float(cent), 3),
        })

    now = datetime.now(timezone.utc)
    return {"version": f"embeddings-{now:%Y%m%d-%H%M%S}", "groups": groups, "topics": topics, "links": links,
            "articles": articles}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="path to the pipeline's news.db")
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()

    data = export(args.db)
    args.out.parent.mkdir(exist_ok=True)
    tmp = args.out.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(args.out)  # swap in one step so the API never reads a half-written file
    print(f"Wrote {len(data['groups'])} groups, {len(data['topics'])} topics, "
          f"{len(data['articles'])} articles to {args.out}")
    for g in data["groups"]:
        ts = [t for t in data["topics"] if t["groupId"] == g["id"]]
        print(f"  {g['label']}: " + ", ".join(t["label"] for t in ts))


if __name__ == "__main__":
    main()
