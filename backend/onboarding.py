"""Two-way onboarding: the frontend sends the swipe history, the backend returns the next card.

Stateless: everything is worked out from the history on each call, so the server stores nothing
about users. The flow:
  1. Show the most typical article of each group (largest groups first).
  2. If the user swipes right on a group card ("I know this area"), drill in: show the most typical
     article of each of that group's main topics, to find where their bubble ends.
  3. If they swipe left, move straight on to the next group.
  4. Stop after MAX_CARDS swipes, or when there's nothing left to show.
Drilling in never uses up cards that unseen groups still need, so every group gets probed.
"""
from typing import Literal, Optional

from fastapi import APIRouter

from bubble import compute_bubble, latest_swipes
from schemas import Card, OnboardingRequest, OnboardingStep, Progress, StoredArticle
from store import Store, get_store

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

MAX_CARDS = 15
FOLLOW_UPS_PER_GROUP = 3


def group_plan(store: Store) -> list[tuple[StoredArticle, list[StoredArticle]]]:
    """For each group (largest first): its representative card and its follow-up topic cards."""
    plan = []
    for gid in sorted(store.groups, key=lambda g: (-len(store.by_group[g]), g)):
        if not store.by_group[gid]:
            continue
        rep = store.by_group[gid][0]
        # Main topics of the group, skipping the rep's own topic (the rep swipe already covers it).
        topics = [t for t in store.topics_in(gid) if t.id != rep.topicId and store.by_topic[t.id]]
        topics.sort(key=lambda t: (-len(store.by_topic[t.id]), t.id))
        follow_ups = [store.by_topic[t.id][0] for t in topics[:FOLLOW_UPS_PER_GROUP]]
        plan.append((rep, follow_ups))
    return plan


def pick_next(
    swipes: dict[str, str], store: Store
) -> tuple[Optional[StoredArticle], Optional[Literal["group", "topic"]]]:
    remaining = MAX_CARDS - len(swipes)
    if remaining <= 0:
        return None, None
    plan = group_plan(store)
    unseen_groups = sum(1 for rep, _ in plan if rep.id not in swipes)

    # Drill into groups the user said they know, in the order they swiped those group cards,
    # but only while there are enough cards left for every unseen group to get its group card.
    if remaining > unseen_groups:
        follow_ups_by_rep = {rep.id: follow_ups for rep, follow_ups in plan}
        for article_id, direction in swipes.items():  # history order
            if direction == "right" and article_id in follow_ups_by_rep:
                for f in follow_ups_by_rep[article_id]:
                    if f.id not in swipes:
                        return f, "topic"

    # Otherwise probe the next unseen group.
    for rep, _ in plan:
        if rep.id not in swipes:
            return rep, "group"
    return None, None


@router.post("/next", response_model=OnboardingStep)
def onboarding_next(req: OnboardingRequest):
    """Send every swipe so far (empty list to start). Returns the next card, or done=true."""
    store = get_store()
    swipes = latest_swipes(req.history, store)
    card, reason = pick_next(swipes, store)
    return OnboardingStep(
        done=card is None,
        card=Card(**card.model_dump(exclude={"centrality"})) if card else None,
        reason=reason,
        progress=Progress(shown=len(swipes), max=MAX_CARDS),
        bubble=compute_bubble(req.history, store),
        mapVersion=store.version,
    )
