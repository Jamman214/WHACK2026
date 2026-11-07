"""python -m pytest test_process.py   (or just: python test_process.py)"""
import numpy as np

from process import cluster


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

    top, sub = cluster(vecs, n_topics=3, top_min=60, sub_min=10)

    assert (top >= 0).all(), "every article must get a top-level topic"
    assert len(np.unique(top)) == 3
    for t in range(3):  # each true topic lands in exactly one cluster
        assert len(np.unique(top[:240][np.array(truth) == t])) == 1
    assert len(np.unique(sub[sub >= 0])) == 6
    for t in np.unique(top):  # subtopic ids never span two parents
        for s in np.unique(sub[(top == t) & (sub >= 0)]):
            assert (top[sub == s] == t).all()


if __name__ == "__main__":
    test_two_pass_finds_topics_and_subtopics()
    print("ok")
