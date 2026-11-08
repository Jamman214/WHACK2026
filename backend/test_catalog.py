"""Offline check of the catalog endpoints on a tiny fixture.  Run: .venv/bin/python test_catalog.py"""
import json
import os
import tempfile

art = lambda i, t, c: {"id": i, "title": f"T {i}", "url": f"https://x/{i}", "provider": "RSS",
                       "groupId": "g-1", "topicId": t, "centrality": c}
fixture = {
    "version": "test",
    "groups": [{"id": "g-1", "label": "G"}],
    "topics": [{"id": "t-1", "groupId": "g-1", "label": "A"}, {"id": "t-2", "groupId": "g-1", "label": "B"}],
    "links": [{"a": "t-1", "b": "t-2", "w": 0.8}],
    "articles": [art("a1", "t-1", 0.2), art("a2", "t-1", 0.9), art("a3", "t-2", 1.0)],
}
path = os.path.join(tempfile.mkdtemp(), "clusters.json")
with open(path, "w") as f:
    json.dump(fixture, f)
os.environ["CLUSTERS_PATH"] = path

from fastapi.testclient import TestClient  # noqa: E402

import app  # noqa: E402

c = TestClient(app.app)
m = c.get("/map").json()
assert [t["id"] for t in m["topics"]] == ["t-1", "t-2"] and m["links"] == [{"a": "t-1", "b": "t-2", "w": 0.8}]

ids = [a["id"] for a in c.get("/topics/t-1/articles").json()]
assert ids == ["a2", "a1"], ids  # most typical first
assert [a["id"] for a in c.get("/groups/g-1/articles?limit=2&offset=1").json()] == ["a2", "a1"]
a = c.get("/articles/a3").json()
assert a["topicId"] == "t-2" and "centrality" not in a  # internal score never sent
assert c.get("/topics/nope/articles").status_code == 404
assert c.get("/articles/nope").status_code == 404
assert c.get("/topics/t-1/articles?limit=0").status_code == 422
print("ok: map + links, articles by group/topic/id, ordering, paging, 404s")

f = c.post("/feed", json={"topics": ["t-2", "nope", "t-1", "t-2"], "perTopic": 1}).json()
assert [a["id"] for a in f] == ["a3", "a2"] and "centrality" not in f[0], f  # request order, deduped, unknown skipped
assert c.post("/feed", json={"topics": ["t-1"], "perTopic": 0}).status_code == 422

b = c.post("/bubble", json={"history": [{"articleId": "a2", "swipe": "right"}]}).json()
assert b["knownTopics"] == ["t-1"] and b["unknownTopics"] == ["t-2"], b  # untested t-2 stays outside the bubble
assert b["topicScores"]["t-2"] == 0.14, b  # ...but its w=0.8 link gives it a small spread
b = c.post("/bubble", json={"history": [{"articleId": "a2", "swipe": "right"}, {"articleId": "a1", "swipe": "left"}]}).json()
assert b["topicScores"] == {"t-1": 0.5}, b  # a right and a left on the same topic cancel out for neighbours
b = c.post("/bubble", json={"history": [{"articleId": "a2", "swipe": "right"}],
                            "topics": {"t-2": False, "nope": True}}).json()
assert b["knownTopics"] == ["t-1"] and b["unknownTopics"] == ["t-2"] and b["groupScores"] == {"g-1": 0.5}, b
assert c.post("/bubble", json={"topics": {"t-2": True}}).json()["knownTopics"] == ["t-2"]  # map add with no swipes
print("ok: batch feed, bubble with map overrides")
