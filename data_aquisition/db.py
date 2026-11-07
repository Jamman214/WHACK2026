import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "news.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
    id           INTEGER PRIMARY KEY,
    url          TEXT UNIQUE NOT NULL,
    title        TEXT NOT NULL,
    description  TEXT,
    image        TEXT,
    source       TEXT,
    provider     TEXT,
    published_at TEXT NOT NULL,          -- ISO 8601 UTC
    fetched_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    embedding    BLOB,                   -- float32[384], L2-normalised; NULL until processed
    topic_id     INTEGER REFERENCES topics(id),
    subtopic_id  INTEGER REFERENCES topics(id)  -- NULL = "other" within its topic
);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_topic ON articles(topic_id, subtopic_id);

-- Rebuilt on every clustering run: ids are NOT stable across runs.
CREATE TABLE IF NOT EXISTS topics (
    id        INTEGER PRIMARY KEY,
    parent_id INTEGER REFERENCES topics(id),  -- NULL = top-level topic
    name      TEXT NOT NULL,
    size      INTEGER NOT NULL
);
"""


def connect():
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    return conn
