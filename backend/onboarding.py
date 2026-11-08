"""Two-way onboarding: the frontend sends the swipe history, the backend returns the next card.

Stateless: everything is worked out from the history on each call, so the server stores nothing
about users. The flow (MAX_CARDS cards):
  1. Probe: the most typical article of the largest groups, skipping a group whose main topic is
     linked to an already-probed group's main topic (near-duplicates waste a card).
  2. Dive: in groups the user swiped right on (plus topics the spread already touched), show the
     topic the bubble is least sure about, i.e. the edge of what they know.
  3. Explore: card EXPLORE_AT is always the next unprobed group, to catch an interest the probe missed.
With no right swipes there is nothing to dive into, so it keeps probing.
"""
from typing import Literal, Optional

from fastapi import APIRouter

from bubble import compute_bubble, latest_swipes
from schemas import Card, OnboardingRequest, OnboardingStep, Progress, StoredArticle
from store import Store, get_store

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

MAX_CARDS = 15
PROBE_CARDS = 6
EXPLORE_AT = 10  # 0-based card index of the one exploring card
NEAR_PENALTY = 0.2  # per card already shown in the same group or a linked topic, so the dive spreads out


def probe_order(store: Store) -> list[StoredArticle]:
    """One card per group, largest groups first: the best article of the group's largest topic that isn't
    linked to a topic already probed. Groups with no such topic (near-duplicates) go to the end.
    (Centrality is scaled per topic, so the group's top article alone would be an arbitrary topic.)"""
    linked = {(l.a, l.b) for l in store.links} | {(l.b, l.a) for l in store.links}
    first, dupes = [], []
    for g in sorted(store.groups, key=lambda g: (-len(store.by_group[g]), g)):
        topics = sorted((t.id for t in store.topics_in(g) if store.by_topic[t.id]),
                        key=lambda t: (-len(store.by_topic[t]), t))
        fresh = [t for t in topics if not any((t, r.topicId) in linked for r in first)]
        if fresh:
            first.append(store.by_topic[fresh[0]][0])
        elif topics:
            dupes.append(store.by_topic[topics[0]][0])
    return first + dupes


def pick_next(
    swipes: dict[str, str], store: Store, scores: dict[str, float]
) -> tuple[Optional[StoredArticle], Optional[Literal["group", "topic"]]]:
    if len(swipes) >= MAX_CARDS:
        return None, None
    probe = next((r for r in probe_order(store) if r.id not in swipes), None)
    if probe and (len(swipes) < PROBE_CARDS or len(swipes) == EXPLORE_AT):
        return probe, "group"

    swiped_topics = {store.articles[a].topicId for a in swipes}
    known_groups = {store.articles[a].groupId for a, d in swipes.items() if d == "right"}
    linked = {(l.a, l.b) for l in store.links} | {(l.b, l.a) for l in store.links}
    shown = [store.articles[a] for a in swipes]

    def edge(t: str) -> float:
        s = scores.get(t, 0.0)
        g = store.topics[t].groupId
        near = sum(c.groupId == g or (t, c.topicId) in linked for c in shown)
        return 1 - abs(2 * s - 1) - NEAR_PENALTY * near  # 1 at s=0.5, 0 when settled

    candidates = [t for t in store.topics
                  if t not in swiped_topics and store.by_topic[t]
                  and (store.topics[t].groupId in known_groups or t in scores)]
    if known_groups and candidates:
        best = max(candidates, key=lambda t: (edge(t), len(store.by_topic[t]), t))
        return store.by_topic[best][0], "topic"
    return probe, "group" if probe else None


@router.post("/next", response_model=OnboardingStep)
def onboarding_next(req: OnboardingRequest):
    """Send every swipe so far (empty list to start). Returns the next card, or done=true."""
    store = get_store()
    swipes = latest_swipes(req.history, store)
    bubble = compute_bubble(req.history, store)
    card, reason = pick_next(swipes, store, bubble.topicScores)
    return OnboardingStep(
        done=card is None,
        card=Card(**card.model_dump(exclude={"centrality"})) if card else None,
        reason=reason,
        progress=Progress(shown=len(swipes), max=MAX_CARDS),
        bubble=bubble,
        mapVersion=store.version,
    )
