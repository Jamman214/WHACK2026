"""Loads the clustering pipeline's output (topic map + clustered articles) from a JSON file.

The file is re-read automatically when it changes, so re-clustering doesn't need a server restart.
Expected shape (see build_sample_clusters.py for a generator):
    {"version": "...", "groups": [Group...], "topics": [Topic...], "articles": [StoredArticle...]}
"""
import json
import os
from collections import defaultdict
from pathlib import Path

from fastapi import HTTPException

from schemas import Group, StoredArticle, Topic

DATA_PATH = Path(os.getenv("CLUSTERS_PATH") or Path(__file__).parent / "data" / "clusters.json")


class Store:
    def __init__(self, raw: dict):
        self.version: str = raw.get("version", "unknown")
        self.groups = {g["id"]: Group(**g) for g in raw["groups"]}
        self.topics = {t["id"]: Topic(**t) for t in raw["topics"]}
        self.articles = {a["id"]: StoredArticle(**a) for a in raw["articles"]}

        for t in self.topics.values():
            if t.groupId not in self.groups:
                raise ValueError(f"topic {t.id} points at unknown group {t.groupId}")
        for a in self.articles.values():
            topic = self.topics.get(a.topicId)
            if topic is None or topic.groupId != a.groupId:
                raise ValueError(f"article {a.id} has topic/group that don't match the map")

        # Most typical articles first, so [0] is always the best representative.
        self.by_group: dict[str, list[StoredArticle]] = defaultdict(list)
        self.by_topic: dict[str, list[StoredArticle]] = defaultdict(list)
        for a in sorted(self.articles.values(), key=lambda a: -a.centrality):
            self.by_group[a.groupId].append(a)
            self.by_topic[a.topicId].append(a)

    def topics_in(self, group_id: str) -> list[Topic]:
        return [t for t in self.topics.values() if t.groupId == group_id]


_cache: dict = {"mtime": None, "store": None}


def get_store() -> Store:
    try:
        mtime = DATA_PATH.stat().st_mtime
    except FileNotFoundError:
        raise HTTPException(
            503,
            f"No clustered data at {DATA_PATH}. Run `python build_sample_clusters.py`, "
            f"or set CLUSTERS_PATH to the clustering pipeline's output file.",
        )
    if _cache["mtime"] != mtime:
        try:
            with open(DATA_PATH, encoding="utf-8") as f:
                _cache["store"] = Store(json.load(f))
        except (ValueError, KeyError) as e:  # bad JSON, missing fields, or inconsistent ids
            raise HTTPException(500, f"Clustered data at {DATA_PATH} is invalid: {e}")
        _cache["mtime"] = mtime
    return _cache["store"]
