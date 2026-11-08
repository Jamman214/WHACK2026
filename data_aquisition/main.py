
import os
import html
import re
import hashlib
import logging
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import requests
import feedparser
from dotenv import load_dotenv
from dateutil import parser as date_parser

import db

HERE = Path(__file__).resolve().parent
FEEDS_FILE = HERE / "feeds.txt"
load_dotenv(HERE / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s"
)

NEWSAPI_KEY = os.getenv("NEWSAPI_KEY")
DAYS_BACK = int(os.getenv("DAYS_BACK", "7"))

NEWSAPI_URL = "https://newsapi.org/v2/everything"

NOW = datetime.now(timezone.utc)
CUTOFF = NOW - timedelta(days=DAYS_BACK)


# ---------------------------------------
# 1. Helpers
# ---------------------------------------

def parse_date(value):
    if not value:
        return None

    try:
        result = date_parser.parse(str(value))

        if result.tzinfo is None:
            result = result.replace(tzinfo=timezone.utc)

        return result.astimezone(timezone.utc)

    except (ValueError, TypeError, OverflowError):
        return None


def clean_url(url):
    if not url:
        return ""

    try:
        parts = urlsplit(url.strip())

        # Remove tracking parameters and fragments
        return urlunsplit((
            parts.scheme.lower(),
            parts.netloc.lower(),
            parts.path.rstrip("/"),
            "",
            ""
        ))

    except ValueError:
        return url.strip()


def make_article(
    title,
    description,
    url,
    image,
    source,
    provider,
    published_at
):
    published = parse_date(published_at)

    if not title or not url or not published:
        return None

    if published < CUTOFF or published > NOW + timedelta(hours=1):
        return None

    return {
        "title": str(title).strip(),
        "description": strip_html(description),
        "url": url.strip(),
        "image": image or None,
        "source": str(source or "Unknown").strip(),
        "provider": provider,
        "publishedAt": published.isoformat()
    }


def strip_html(text):
    # RSS summaries often embed <p>/<img> tags; embeddings want plain text
    text = re.sub(r"<[^>]+>", " ", str(text or ""))
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


# ---------------------------------------
# 2. RSS
# ---------------------------------------

def fetch_rss():
    logging.info("Fetching RSS feeds...")

    articles = []

    if not FEEDS_FILE.exists():
        logging.warning("feeds.txt not found")
        return articles

    with open(FEEDS_FILE, encoding="utf-8") as file:
        feeds = [
            line.strip()
            for line in file
            if line.strip() and not line.startswith("#")
        ]

    for feed_url in feeds:
        try:
            logging.info("Reading %s", feed_url)

            response = requests.get(
                feed_url,
                timeout=15,
                headers={"User-Agent": "HackathonNewsAggregator/1.0"}
            )
            response.raise_for_status()

            feed = feedparser.parse(response.content)

            feed_title = (
                feed.feed.get("title")
                or urlsplit(feed_url).netloc
            )

            for item in feed.entries:
                # RSS dates may use different field names
                published = (
                    item.get("published")
                    or item.get("updated")
                )

                # Convert RSS date struct to datetime if available
                if item.get("published_parsed"):
                    published = datetime(
                        *item.published_parsed[:6],
                        tzinfo=timezone.utc
                    ).isoformat()

                elif item.get("updated_parsed"):
                    published = datetime(
                        *item.updated_parsed[:6],
                        tzinfo=timezone.utc
                    ).isoformat()

                # Look for images in common RSS formats
                image = None

                media_thumbnail = item.get("media_thumbnail", [])
                if media_thumbnail:
                    image = media_thumbnail[0].get("url")

                if not image:
                    media_content = item.get("media_content", [])
                    for media in media_content:
                        if media.get("url"):
                            image = media["url"]
                            break

                if not image:
                    for enclosure in item.get("enclosures", []):
                        if enclosure.get("type", "").startswith("image/"):
                            image = enclosure.get("href") or enclosure.get("url")
                            break

                # Sometimes images are embedded in descriptions
                if not image:
                    description = item.get("description", "")
                    match = re.search(
                        r'<img[^>]+src=["\']([^"\']+)',
                        description,
                        re.IGNORECASE
                    )
                    if match:
                        image = match.group(1)

                description = (
                    item.get("summary")
                    or item.get("description")
                    or ""
                )

                article = make_article(
                    title=item.get("title"),
                    description=description,
                    url=item.get("link"),
                    image=image,
                    source=feed_title,
                    provider="RSS",
                    published_at=published
                )

                if article:
                    articles.append(article)

        except requests.RequestException as error:
            logging.warning("RSS request failed: %s", error)

        except Exception as error:
            logging.warning("RSS parsing failed: %s", error)

    logging.info("RSS returned %d articles", len(articles))
    return articles


# ---------------------------------------
# 3. NewsAPI
# ---------------------------------------

# One "top 100 most popular" request per region per day, via `domains`.
# Only outlets NewsAPI's free index actually returned in probes on 2026-11-08: it has almost
# nothing from South America / North Africa and no UK press besides the BBC. Regional variety
# comes from RSS (feeds.txt). Times of India left out: ~1700/day of city news swamped everything.
NEWSAPI_REGIONS = {
    "uk": ["bbc.co.uk"],
    "europe": ["dw.com", "irishtimes.com", "rte.ie", "elpais.com", "politico.eu", "repubblica.it",
               "protothema.gr"],
    "north_america": ["npr.org", "cbsnews.com", "nbcnews.com", "abcnews.com", "apnews.com",
                      "foxnews.com", "nypost.com", "cbc.ca"],
    "middle_east": ["aljazeera.com", "hurriyetdailynews.com", "haaretz.com", "israelnationalnews.com"],
    "asia": ["channelnewsasia.com", "straitstimes.com"],
    "oceania": ["abc.net.au", "nzherald.co.nz", "news.com.au"],
    "africa": ["punchng.com", "timeslive.co.za"],
}
NEWSAPI_MAX = 100   # free plan: 100 results per query in total, page 2 is refused


def newsapi_get(url, params):
    """One API call = one of the 100 daily requests. Raises RuntimeError on API errors."""
    response = requests.get(
        url,
        params=params,
        headers={"X-Api-Key": NEWSAPI_KEY},  # header, not URL, so the key never lands in logs
        timeout=20
    )
    data = response.json()
    if data.get("status") != "ok":
        raise RuntimeError(f"{data.get('code')}: {data.get('message')}")
    return data


def fetch_newsapi(days, budget, only=None):
    """Top 100 most popular articles per region per UTC day, for the `days` days before today
    (today is skipped: the free plan delays articles 24h). Newest day first, so a short
    budget drops the oldest days. Returns (articles, requests_used).
    """
    if not NEWSAPI_KEY:
        logging.warning("NEWSAPI_KEY not configured")
        return [], 0

    regions = [only] if only else list(NEWSAPI_REGIONS)
    articles, used = [], 0

    for days_ago in range(1, days + 1):
        day = (NOW - timedelta(days=days_ago)).strftime("%Y-%m-%d")
        for region in regions:
            if used >= budget:
                logging.warning("NewsAPI budget used up at %s %s", day, region)
                return articles, used
            used += 1
            try:
                data = newsapi_get(NEWSAPI_URL, {
                    "domains": ",".join(NEWSAPI_REGIONS[region]),
                    "from": day,
                    "to": day,
                    "sortBy": "popularity",
                    "pageSize": NEWSAPI_MAX,
                })
            except RuntimeError as error:
                logging.error("NewsAPI stopped: %s", error)  # bad key / quota gone: later calls fail too
                return articles, used
            except (requests.RequestException, ValueError) as error:
                logging.error("NewsAPI %s %s failed: %s", day, region, error)
                continue

            got = [
                article for item in data.get("articles", [])
                if (article := make_article(
                    title=item.get("title"),
                    description=item.get("description"),
                    url=item.get("url"),
                    image=item.get("urlToImage"),
                    source=(item.get("source") or {}).get("name"),
                    provider="NewsAPI",
                    published_at=item.get("publishedAt")
                ))
            ]
            per_source = Counter(a["source"] for a in got).most_common()
            logging.info("NewsAPI %s %-18s %3d of %s: %s", day, region, len(got),
                         data.get("totalResults"), ", ".join(f"{n} {c}" for n, c in per_source))
            articles += got

    logging.info("NewsAPI returned %d articles in %d requests", len(articles), used)
    return articles, used


# ---------------------------------------
# 5. Deduplication
# ---------------------------------------

def deduplicate(articles):
    unique = {}
    seen_titles = set()

    for article in articles:
        url = clean_url(article["url"])

        if not url:
            continue

        # Normalise title for secondary matching
        title = re.sub(
            r"[^a-z0-9]+",
            " ",
            article["title"].lower()
        ).strip()

        if url in unique or title in seen_titles:
            continue

        article["url"] = url

        unique[url] = article
        seen_titles.add(title)

    result = list(unique.values())

    # Newest articles first
    result.sort(
        key=lambda x: x["publishedAt"],
        reverse=True
    )

    return result


# ---------------------------------------
# 6. Save results
# ---------------------------------------

def save_articles(articles):
    """Insert new articles; existing URLs are left untouched. Returns count added."""
    conn = db.connect()
    with conn:
        before = conn.total_changes
        conn.executemany(
            """INSERT OR IGNORE INTO articles
               (url, title, description, image, source, provider, published_at)
               VALUES (:url, :title, :description, :image, :source, :provider, :publishedAt)""",
            articles
        )
        added = conn.total_changes - before
    conn.close()

    logging.info("Saved %d new articles to %s", added, db.DB_PATH)
    return added


# ---------------------------------------
# 7. Main
# ---------------------------------------

def main():
    logging.info("Starting news aggregator...")
    articles = fetch_rss()
    unique = deduplicate(articles)
    added = save_articles(unique)
    print(f"\nRSS: {len(articles)}  after dedup: {len(unique)}  new in DB: {added}\n")


def main_newsapi(days, budget, only):
    articles, used = fetch_newsapi(days, budget, only)
    unique = deduplicate(articles)
    added = save_articles(unique)
    print(f"\nNewsAPI: {len(articles)} in {used} requests  after dedup: {len(unique)}  new in DB: {added}\n")


if __name__ == "__main__":
    import argparse
    cli = argparse.ArgumentParser(description="No command: RSS only (safe hourly, no API quota).")
    sub = cli.add_subparsers(dest="cmd")
    na = sub.add_parser("newsapi", help="top 100 per region per day (1 request each; 100/day quota)")
    na.add_argument("--days", type=int, default=1, help="days before today to fetch (default 1 = yesterday)")
    na.add_argument("--max", type=int, default=60, help="request budget for this run (default 60)")
    na.add_argument("--only", choices=list(NEWSAPI_REGIONS), help="one region instead of all")
    args = cli.parse_args()

    if args.cmd == "newsapi":
        main_newsapi(args.days, args.max, args.only)
    else:
        main()
