"""Data shapes shared between the API, the cluster store and the frontend."""
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ---------- Articles ----------

class Article(BaseModel):
    """The one article shape the frontend receives, whichever provider it came from."""
    title: str
    description: Optional[str] = None  # plain text, HTML stripped
    url: str
    image: Optional[str] = None
    source: Optional[str] = None  # publication, e.g. "The Guardian", "bbc.co.uk"
    provider: str  # which API we got it from, e.g. "Guardian", "GDELT"
    publishedAt: Optional[str] = None  # ISO 8601 UTC, e.g. "2026-11-07T12:00:00Z"

    @field_validator("title")
    @classmethod
    def tidy_title(cls, v: str) -> str:
        return " ".join(v.split())  # providers sometimes add stray spaces


class Card(Article):
    """An article placed on the topic map. This is what swipe cards send to the frontend."""
    id: str  # stable article id; the frontend sends it back with each swipe
    groupId: str  # layer 1 cluster (broad area)
    topicId: str  # layer 2 cluster (specific thread inside the group)


class StoredArticle(Card):
    """How the clustering pipeline stores an article. Never sent to the frontend as-is."""
    centrality: float = 0.0  # 0..1, how typical of its topic (1 = closest to the topic's centre)


# ---------- Topic map (output of clustering + AI labelling) ----------

class Group(BaseModel):
    id: str
    label: str
    description: Optional[str] = None


class Topic(BaseModel):
    id: str
    groupId: str
    label: str
    description: Optional[str] = None
    related: list[str] = []  # ids of nearby topics (used later for bridges)


class Link(BaseModel):
    a: str  # topic id
    b: str  # topic id
    w: float  # cosine similarity of the two topics' centres (higher = closer)


class TopicMap(BaseModel):
    version: str
    groups: list[Group]
    topics: list[Topic]
    links: list[Link] = []


# ---------- Swipes, bubble, onboarding ----------

class Swipe(BaseModel):
    articleId: str
    swipe: Literal["left", "right"]  # right = "I know this", left = "I don't know this"


class Bubble(BaseModel):
    topicScores: dict[str, float]  # topicId -> 0..1 familiarity (only topics we have evidence for)
    groupScores: dict[str, float]  # groupId -> average of its topic scores
    knownTopics: list[str]  # score >= 0.5: inside the bubble
    unknownTopics: list[str]  # score < 0.5: outside the bubble, candidates to explore


class OnboardingRequest(BaseModel):
    history: list[Swipe] = Field(default=[], max_length=200)  # every swipe so far, oldest first


class Progress(BaseModel):
    shown: int  # cards swiped so far
    max: int  # onboarding ends at this many cards (or earlier if we run out)


class OnboardingStep(BaseModel):
    done: bool
    card: Optional[Card] = None  # next card to show; null when done
    reason: Optional[Literal["group", "topic"]] = None  # group = probing a new area, topic = drilling into a known one
    progress: Progress
    bubble: Bubble  # bubble so far, so the frontend can update the map live
    mapVersion: str
