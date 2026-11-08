"""STAND-IN for the real clustering pipeline (vectorise -> 2-layer clustering -> AI labels).

Builds data/clusters.json from real Guardian articles so the onboarding API can be used now.
Here each "topic" is just a Guardian search, and Guardian's relevance rank stands in for centrality.
When the real pipeline is ready, have it write the same JSON shape and delete this script.

Output shape:
{
  "version": "...",
  "groups":   [{"id", "label", "description"}],
  "topics":   [{"id", "groupId", "label", "description", "related": []}],
  "articles": [{"id", "title", "description", "url", "image", "source", "provider",
                "publishedAt", "groupId", "topicId", "centrality"}]
}

Usage (needs GUARDIAN_API_KEY in backend/.env):
    python build_sample_clusters.py
"""
import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

from utils import clean_text, to_iso

ARTICLES_PER_TOPIC = 5
OUT = Path(__file__).parent / "data" / "clusters.json"

# group label -> (description, {topic label: Guardian search query})
# Quoted phrases keep keyword search tighter (plain "battery" also matches assault charges).
SEEDS = {
    "Science & Space": ("Discoveries about the universe and the physical world.", {
        "Moon missions": '"moon mission" OR "Artemis"',
        "Exoplanets": '"exoplanet"',
        "Black holes": '"black hole"',
    }),
    "Energy & Climate": ("How the world powers itself and what it does to the climate.", {
        "Renewable energy": '"renewable energy"',
        "Battery technology": '"battery storage" OR "lithium-ion"',
        "Climate policy": '"climate policy" OR "net zero"',
    }),
    "Technology": ("Computing, the internet and the companies behind them.", {
        "Artificial intelligence": '"artificial intelligence"',
        "Cybersecurity": '"cybersecurity" OR "cyber-attack"',
        "Semiconductors": '"semiconductor" OR "chipmaker"',
    }),
    "Health": ("Medicine, disease and wellbeing.", {
        "Vaccines": '"vaccine"',
        "Mental health": '"mental health"',
        "Antibiotic resistance": '"antibiotic resistance" OR "superbugs"',
    }),
    "Economy & Trade": ("Money, markets and the movement of goods.", {
        "Critical minerals": '"critical minerals" OR "rare earths"',
        "Inflation": '"inflation rate"',
        "Shipping": '"container shipping" OR "shipping lanes"',
    }),
    "Oceans & Nature": ("Wildlife, ecosystems and the natural world.", {
        "Deep sea": '"deep sea" OR "deep-sea"',
        "Coral reefs": '"coral reef"',
        "Biodiversity": '"biodiversity"',
    }),
}


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def article_id(url: str) -> str:
    return hashlib.sha1(url.encode()).hexdigest()[:12]


def main():
    load_dotenv()
    key = os.getenv("GUARDIAN_API_KEY")
    if not key:
        raise SystemExit("GUARDIAN_API_KEY is not set in backend/.env")

    groups, topics, articles, seen = [], [], [], set()
    with httpx.Client(timeout=15) as http:
        for group_label, (group_desc, topic_seeds) in SEEDS.items():
            gid = f"g-{slug(group_label)}"
            groups.append({"id": gid, "label": group_label, "description": group_desc})
            for topic_label, query in topic_seeds.items():
                tid = f"t-{slug(topic_label)}"
                topics.append({"id": tid, "groupId": gid, "label": topic_label,
                               "description": None, "related": []})
                r = http.get("https://content.guardianapis.com/search", params={
                    "q": query, "page-size": ARTICLES_PER_TOPIC, "order-by": "relevance",
                    "show-fields": "trailText,thumbnail", "api-key": key,
                })
                r.raise_for_status()
                results = r.json()["response"]["results"]
                for rank, a in enumerate(results):
                    aid = article_id(a["webUrl"])
                    if aid in seen:  # same article found under two topics: keep the first
                        continue
                    seen.add(aid)
                    articles.append({
                        "id": aid,
                        "title": " ".join(a["webTitle"].split()),
                        "description": clean_text(a.get("fields", {}).get("trailText")),
                        "url": a["webUrl"],
                        "image": a.get("fields", {}).get("thumbnail"),
                        "source": "The Guardian",
                        "provider": "Guardian",
                        "publishedAt": to_iso(a.get("webPublicationDate")),
                        "groupId": gid,
                        "topicId": tid,
                        "centrality": round(1 - rank / ARTICLES_PER_TOPIC, 2),
                    })
                print(f"{group_label:18} / {topic_label:24} {len(results)} articles")
                time.sleep(1.1)  # stay under the Guardian free tier's rate limit

    now = datetime.now(timezone.utc)
    data = {
        "version": f"sample-{now:%Y%m%d-%H%M%S}",
        "groups": groups,
        "topics": topics,
        "articles": articles,
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote {len(groups)} groups, {len(topics)} topics, {len(articles)} articles to {OUT}")


if __name__ == "__main__":
    main()
