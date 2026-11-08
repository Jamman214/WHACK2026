"""Offline self-check for NewsAPI per-region fetch (fake API, no quota used). Run: python test_main.py"""
from collections import Counter
from datetime import timedelta

import main

main.NEWSAPI_KEY = "fake"
calls = []


def fake_get(url, params):
    calls.append((params["from"], params["domains"]))
    domain = params["domains"].split(",")[0]
    t = main.NOW - timedelta(days=1)  # inside the cutoff; the fake ignores the day
    return {"totalResults": 500, "articles": [
        {"title": f"{params['from']} {domain} {i}", "url": f"https://{domain}/{params['from']}/{i}",
         "publishedAt": t.isoformat(), "description": "d", "source": {"name": domain}}
        for i in range(main.NEWSAPI_MAX)]}


main.newsapi_get = fake_get
n_regions = len(main.NEWSAPI_REGIONS)

# every domain in exactly one region
domains = Counter(d for ds in main.NEWSAPI_REGIONS.values() for d in ds)
assert all(n == 1 for n in domains.values()), [d for d, n in domains.items() if n > 1]

articles, used = main.fetch_newsapi(days=3, budget=100)
assert used == len(calls) == 3 * n_regions, used
assert len(articles) == 3 * n_regions * 100
days = [c[0] for c in calls]
assert days == sorted(days, reverse=True), "newest day first"
assert days[0] == (main.NOW - timedelta(days=1)).strftime("%Y-%m-%d"), "starts at yesterday"
assert {c[1] for c in calls} == {",".join(v) for v in main.NEWSAPI_REGIONS.values()}, "each region queried"

calls.clear()
articles, used = main.fetch_newsapi(days=3, budget=n_regions + 2)
assert used == n_regions + 2, "budget respected"
assert len({c[0] for c in calls}) == 2, "budget drops the oldest day"

calls.clear()
articles, used = main.fetch_newsapi(days=2, budget=100, only="uk")
assert used == 2 and all(c[1] == ",".join(main.NEWSAPI_REGIONS["uk"]) for c in calls)

print(f"ok: {n_regions} regions, 1 request each per day, newest first, budget cap, --only")


# strip_html drops publisher "read more" trailers but keeps the real text
for raw, want in [
    ("<p>Body text here. Continue reading...</p>", "Body text here."),
    ('Body ends with Continue reading "el-Sisi Fulfills Promise"', "Body ends with"),
    ("Body. The post Some Title appeared first on Grist.", "Body."),
    ('Body Continue reading "T" The post T first appeared on Egyptian Streets .', "Body"),
    ("Body text [&#8230;] Read more", "Body text"),
    ("Continue reading about the Kraków plan is fine in the middle. Done.",
     "Continue reading about the Kraków plan is fine in the middle. Done."),
]:
    assert main.strip_html(raw) == want, (raw, main.strip_html(raw))
print("strip_html trailer checks OK")
