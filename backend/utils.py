"""Small text helpers shared by the news providers and the data builder."""
import html
import re
from typing import Optional


def clean_text(text: Optional[str]) -> Optional[str]:
    """Strip HTML tags/entities (Guardian summaries contain <strong> etc.)."""
    if not text:
        return None
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    return " ".join(text.split()) or None


def to_iso(date: Optional[str]) -> Optional[str]:
    """Normalise provider dates to 'YYYY-MM-DDTHH:MM:SSZ'."""
    if not date:
        return None
    m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z", date)  # GDELT: 20261107T190000Z
    if m:
        y, mo, d, h, mi, s = m.groups()
        return f"{y}-{mo}-{d}T{h}:{mi}:{s}Z"
    return re.sub(r"\+0000$|\+00:00$", "Z", date)  # NYT: ...+0000
