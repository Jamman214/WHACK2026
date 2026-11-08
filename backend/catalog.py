"""Read-only access to the topic map and its news: the backend is the source of truth for both.

    GET /map                         groups, topics and weighted topic links
    GET /groups/{groupId}/articles   a group's articles, most typical first
    GET /topics/{topicId}/articles   a topic's articles, most typical first
    GET /articles/{articleId}        one article
    POST /feed                       the top articles of many topics in one call
"""
from fastapi import APIRouter, HTTPException, Query

from schemas import Card, FeedRequest, TopicMap
from store import get_store

router = APIRouter(tags=["catalog"])

Limit = Query(20, ge=1, le=200)
Offset = Query(0, ge=0)


@router.get("/map", response_model=TopicMap)
def topic_map():
    store = get_store()
    return TopicMap(version=store.version, groups=list(store.groups.values()),
                    topics=list(store.topics.values()), links=store.links)


@router.get("/groups/{group_id}/articles", response_model=list[Card])
def group_articles(group_id: str, limit: int = Limit, offset: int = Offset):
    store = get_store()
    if group_id not in store.groups:
        raise HTTPException(404, f"unknown group {group_id}")
    return store.by_group[group_id][offset:offset + limit]


@router.get("/topics/{topic_id}/articles", response_model=list[Card])
def topic_articles(topic_id: str, limit: int = Limit, offset: int = Offset):
    store = get_store()
    if topic_id not in store.topics:
        raise HTTPException(404, f"unknown topic {topic_id}")
    return store.by_topic[topic_id][offset:offset + limit]


@router.get("/articles/{article_id}", response_model=Card)
def article(article_id: str):
    store = get_store()
    if article_id not in store.articles:
        raise HTTPException(404, f"unknown article {article_id}")
    return store.articles[article_id]


@router.post("/feed", response_model=list[Card])
def feed(req: FeedRequest):
    """The `perTopic` most typical articles of each requested topic, in request order (unknown ids skipped)."""
    store = get_store()
    return [a for t in dict.fromkeys(req.topics) for a in store.by_topic.get(t, [])[:req.perTopic]]
