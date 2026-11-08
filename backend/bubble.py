"""Builds a user's bubble from their swipe history.

The bubble is always rebuilt from scratch against the current topic map, so it survives
re-clustering: the history only mentions article ids, never cluster ids.
"""
from collections import defaultdict
from statistics import mean

from fastapi import APIRouter

from schemas import Bubble, BubbleRequest, Swipe
from store import Store, get_store

router = APIRouter(tags=["bubble"])

KNOWN_THRESHOLD = 0.5
INFERRED_WEIGHT = 0.5  # untested topics in a group get half the group's tested average...
INFERRED_CAP = 0.45  # ...but never reach KNOWN_THRESHOLD: only a right swipe or a map add counts as known


def latest_swipes(history: list[Swipe], store: Store) -> dict[str, str]:
    """articleId -> 'left'/'right', last swipe wins, unknown articles dropped (keeps history order)."""
    out: dict[str, str] = {}
    for s in history:
        if s.articleId in store.articles:
            out.pop(s.articleId, None)
            out[s.articleId] = s.swipe
    return out


def compute_bubble(history: list[Swipe], store: Store, topics: dict[str, bool] | None = None) -> Bubble:
    swipes = latest_swipes(history, store)

    # 1. Topics the user actually swiped on: right = 1, left = 0, averaged.
    votes: dict[str, list[float]] = defaultdict(list)
    for article_id, direction in swipes.items():
        votes[store.articles[article_id].topicId].append(1.0 if direction == "right" else 0.0)
    scores = {t: mean(v) for t, v in votes.items()}

    # 2. Topics in the same group that weren't tested: infer closeness from the group's tested topics.
    #    Liking one cybersecurity card shouldn't claim the user knows AI, so inferred scores stay outside the bubble.
    tested_groups = {store.topics[t].groupId for t in scores}
    for gid in tested_groups:
        group_topics = store.topics_in(gid)
        group_avg = mean(scores[t.id] for t in group_topics if t.id in scores)
        for t in group_topics:
            scores.setdefault(t.id, min(group_avg * INFERRED_WEIGHT, INFERRED_CAP))

    # 3. Explicit adds/removes from the map override everything (unknown ids dropped).
    for t, inside in (topics or {}).items():
        if t in store.topics:
            scores[t] = 1.0 if inside else 0.0

    scored_groups = {store.topics[t].groupId for t in scores}
    group_scores = {
        gid: mean(scores[t.id] for t in store.topics_in(gid) if t.id in scores) for gid in scored_groups
    }
    return Bubble(
        topicScores={t: round(s, 2) for t, s in scores.items()},
        groupScores={g: round(s, 2) for g, s in group_scores.items()},
        knownTopics=sorted(t for t, s in scores.items() if s >= KNOWN_THRESHOLD),
        unknownTopics=sorted(t for t, s in scores.items() if s < KNOWN_THRESHOLD),
    )


@router.post("/bubble", response_model=Bubble)
def bubble(req: BubbleRequest):
    """The user's bubble from their onboarding swipes plus any topics added/removed on the map.
    Stateless like onboarding: the frontend keeps both and sends them each time."""
    return compute_bubble(req.history, get_store(), req.topics)
