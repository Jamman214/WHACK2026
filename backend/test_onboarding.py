"""Offline check of the onboarding picker on a tiny fixture.  Run: .venv/bin/python test_onboarding.py"""
import onboarding
from bubble import compute_bubble, latest_swipes
from schemas import Swipe
from store import Store

art = lambda i, g, t, c=1.0: {"id": i, "title": i, "url": f"https://x/{i}", "provider": "RSS",
                               "groupId": g, "topicId": t, "centrality": c}
store = Store({
    "groups": [{"id": g, "label": g} for g in ("g-a", "g-b", "g-c")],
    "topics": [{"id": t, "groupId": g, "label": t} for t, g in
               [("t-a1", "g-a"), ("t-a2", "g-a"), ("t-a3", "g-a"), ("t-b1", "g-b"), ("t-c1", "g-c")]],
    # g-c's main topic sits right next to g-a's, so g-c is a near-duplicate probe
    "links": [{"a": "t-a1", "b": "t-a2", "w": 0.95}, {"a": "t-a1", "b": "t-c1", "w": 0.9}],
    "articles": [art("a1", "g-a", "t-a1"), art("a1b", "g-a", "t-a1", 0.5), art("a2", "g-a", "t-a2"),
                 art("a3", "g-a", "t-a3"), art("c1", "g-c", "t-c1"), art("c1b", "g-c", "t-c1", 0.5),
                 art("b1", "g-b", "t-b1")],
})
assert [r.id for r in onboarding.probe_order(store)] == ["a1", "b1", "c1"]  # g-c (bigger than g-b) moved last


def run(answer):
    """Play onboarding to the end, answering each card with answer(card); returns [(card id, reason)]."""
    history, out = [], []
    while True:
        swipes = latest_swipes(history, store)
        card, reason = onboarding.pick_next(swipes, store, compute_bubble(history, store).topicScores)
        if card is None:
            return out
        out.append((card.id, reason))
        history.append(Swipe(articleId=card.id, swipe=answer(card)))


onboarding.PROBE_CARDS, onboarding.EXPLORE_AT = 1, 3
# All left: nothing to dive into, so it only probes, then stops.
assert run(lambda c: "left") == [("a1", "group"), ("b1", "group"), ("c1", "group")]
# Right on g-a: dive to the edge first (t-a2, then t-c1 in another group, both raised by the spread),
# explore g-b at card 3, then the untouched t-a3 in the known group.
assert run(lambda c: "right" if c.groupId == "g-a" else "left") == [
    ("a1", "group"), ("a2", "topic"), ("c1", "topic"), ("b1", "group"), ("a3", "topic")]
print("ok: probe order, all-left probes only, dive to the edge, explore card")
