
import os
import html
import re
import hashlib
import logging
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
FREENEWSAPI_KEY = os.getenv("FREENEWSAPI_KEY")
DAYS_BACK = int(os.getenv("DAYS_BACK", "7"))
NEWSAPI_QUERY = os.getenv("NEWSAPI_QUERY", "technology")

NEWSAPI_URL = "https://newsapi.org/v2/everything"
FREENEWSAPI_URL = "https://api.freenewsapi.io/v1/news"

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


def get_value(article, *keys):
    """Return the first non-empty matching field."""
    for key in keys:
        value = article.get(key)
        if value:
            return value
    return None


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

def fetch_newsapi():
    logging.info("Fetching NewsAPI articles...")

    if not NEWSAPI_KEY:
        logging.warning("NEWSAPI_KEY not configured")
        return []

    params = {
        "from": CUTOFF.strftime("%Y-%m-%d"),
        "to": NOW.strftime("%Y-%m-%d"),
        "sortBy": "publishedAt",
        "pageSize": 100,
        "language": "en"
    }

    if NEWSAPI_QUERY:
        params["q"] = NEWSAPI_QUERY

    try:
        response = requests.get(
            NEWSAPI_URL,
            params=params,
            headers={"X-Api-Key": NEWSAPI_KEY},  # header, not URL, so the key never lands in logs
            timeout=20
        )
        response.raise_for_status()

        data = response.json()

        if data.get("status") != "ok":
            logging.warning("NewsAPI error: %s", data.get("message"))
            return []

        articles = []

        for item in data.get("articles", []):
            article = make_article(
                title=item.get("title"),
                description=item.get("description"),
                url=item.get("url"),
                image=item.get("urlToImage"),
                source=(item.get("source") or {}).get("name"),
                provider="NewsAPI",
                published_at=item.get("publishedAt")
            )

            if article:
                articles.append(article)

        logging.info("NewsAPI returned %d articles", len(articles))
        return articles

    except requests.RequestException as error:
        logging.error("NewsAPI request failed: %s", error)
        return []


# ---------------------------------------
# 4. FreeNewsAPI
# ---------------------------------------

def fetch_freenewsapi():
    logging.info("Fetching FreeNewsAPI articles...")

    if not FREENEWSAPI_KEY:
        logging.warning("FREENEWSAPI_KEY not configured")
        return []

    params = {
        "language": "en",
        "order_by": "recent",
        "published_after": CUTOFF.isoformat(),
        "published_before": NOW.isoformat(),
        "offset": 0
    }

    headers = {
        "x-api-key": FREENEWSAPI_KEY
    }

    try:
        response = requests.get(
            FREENEWSAPI_URL,
            params=params,
            headers=headers,
            timeout=20
        )
        response.raise_for_status()

        data = response.json()

        # FreeNewsAPI uses a data array in its documented response
        items = data.get("data", [])

        articles = []

        for item in items:
            publisher = item.get("publisher", "Unknown")

            if isinstance(publisher, dict):
                publisher = publisher.get("name", "Unknown")

            article = make_article(
                title=item.get("title"),
                description=get_value(
                    item, "description", "subtitle", "summary"
                ),
                url=get_value(
                    item, "url", "link", "article_url"
                ),
                image=get_value(
                    item, "image", "image_url", "thumbnail"
                ),
                source=publisher,
                provider="FreeNewsAPI",
                published_at=get_value(
                    item, "published_at", "publishedAt"
                )
            )

            if article:
                articles.append(article)

        logging.info(
            "FreeNewsAPI returned %d articles",
            len(articles)
        )
        return articles

    except requests.RequestException as error:
        logging.error("FreeNewsAPI request failed: %s", error)
        return []


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

    rss_articles = fetch_rss()
    newsapi_articles = fetch_newsapi()
    freenewsapi_articles = fetch_freenewsapi()

    all_articles = (
        rss_articles
        + newsapi_articles
        + freenewsapi_articles
    )

    unique_articles = deduplicate(all_articles)

    added = save_articles(unique_articles)

    print("\n========== NEWS SUMMARY ==========")
    print(f"RSS:          {len(rss_articles)}")
    print(f"NewsAPI:      {len(newsapi_articles)}")
    print(f"FreeNewsAPI:  {len(freenewsapi_articles)}")
    print(f"Before dedup: {len(all_articles)}")
    print(f"After dedup:  {len(unique_articles)}")
    print(f"New in DB:    {added}")
    print("==================================\n")


if __name__ == "__main__":
    main()
