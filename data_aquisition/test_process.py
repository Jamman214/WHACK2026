"""python -m pytest test_process.py   (or just: python test_process.py)"""
import numpy as np

from process import attach_loners, cluster, names_clash, parse_names, parse_renames


def test_two_pass_finds_topics_and_subtopics():
    rng = np.random.default_rng(0)
    dim = 32
    # 3 topics, each with 2 well-separated subtopics of 40 points, plus a few stray points
    vecs, truth = [], []
    for t in range(3):
        topic_centre = rng.normal(size=dim) * 10
        for s in range(2):
            centre = topic_centre + rng.normal(size=dim) * 2
            vecs.append(centre + rng.normal(size=(40, dim)) * 0.2)
            truth += [t] * 40
    vecs.append(rng.normal(size=(5, dim)) * 10)
    vecs = np.vstack(vecs).astype(np.float32)
    vecs /= np.linalg.norm(vecs, axis=1, keepdims=True)

    # 6 subtopics = 15 pairs, 3 of them same-topic: 80th pctile merges just those 3
    top, sub = cluster(vecs, merge_pctile=80, sub_min=10)

    assert (top[:240] >= 0).all(), "every real article gets a topic"
    assert (top[240:] < 0).all(), "stray articles must stay ungrouped, not be forced in"
    assert len(np.unique(top[top >= 0])) == 3
    for t in range(3):  # each true topic lands in exactly one cluster
        assert len(np.unique(top[:240][np.array(truth) == t])) == 1
    assert len(np.unique(sub[sub >= 0])) == 6
    for t in np.unique(top):  # subtopic ids never span two parents
        for s in np.unique(sub[(top == t) & (sub >= 0)]):
            assert (top[sub == s] == t).all()


def test_attach_loners_needs_agreement():
    # topic 0 around e0, topic 1 around e1; loners: one near e0, one halfway (neighbours split)
    rng = np.random.default_rng(1)
    e0, e1 = np.eye(8)[0], np.eye(8)[1]
    vecs = np.vstack([e0 + rng.normal(size=(10, 8)) * 0.05,
                      e1 + rng.normal(size=(10, 8)) * 0.05,
                      e0 + 0.1 * e1, (e0 + e1) / 2])
    vecs /= np.linalg.norm(vecs, axis=1, keepdims=True)
    top = np.array([0] * 10 + [1] * 10 + [-1, -1])
    # k=10 so the halfway point's nearest 10 split roughly 5/5 between topics
    out = attach_loners(vecs, top, k=10, min_votes=8)
    assert out[20] == 0, "loner whose neighbours agree joins their topic"
    assert out[21] == -1, "loner with split neighbours stays ungrouped"
    assert (top[20:] == -1).all(), "input not modified"


def test_parse_names():
    reply = 'Sure!\n```json\n{"topic": "Sport", "subtopics": ["Football", "F1"]}\n```'
    assert parse_names(reply, 2) == ("Sport", ["Football", "F1"])
    assert parse_names(reply, 3) is None  # wrong count must not mislabel subtopics
    assert parse_names("no json here", 1) is None
    assert parse_names('{"topic": "x"}', 1) is None
    thinking = ('<thought>Reply format: `{"topic": "...", "subtopics": [...]}`.</thought>'
                '```json\n{"topic": "Sport", "subtopics": ["Football"]}\n```')
    assert parse_names(thinking, 1) == ("Sport", ["Football"]), "JSON echoed while thinking is ignored"


def test_names_clash():
    assert names_clash("World news", "World politics & affairs")
    assert not names_clash("Money & markets", "Film & cinema")
    assert names_clash("Tech markets", "Media & technology")
    assert names_clash("Political reform", "UK politics")
    assert not names_clash("UK politics", "US elections")


def test_parse_renames():
    assert parse_renames('```json\n{"names": ["UK politics", "US politics"]}\n```', 2) == ["UK politics", "US politics"]
    assert parse_renames('{"names": ["only one"]}', 2) is None
    assert parse_renames("no json here", 2) is None


if __name__ == "__main__":
    test_parse_renames()
    test_names_clash()
    test_parse_names()
    test_attach_loners_needs_agreement()
    test_two_pass_finds_topics_and_subtopics()
    print("ok")
