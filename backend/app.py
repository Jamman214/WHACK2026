"""FastAPI entry point.

Run from the backend folder:
    uvicorn app:app --reload
Then open http://127.0.0.1:8000/docs to try the endpoints in the browser.
"""
from dotenv import load_dotenv

load_dotenv()  # before importing store, so CLUSTERS_PATH from .env is picked up

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from onboarding import router as onboarding_router  # noqa: E402
from store import get_store  # noqa: E402

app = FastAPI(title="WHACK2026 backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # hackathon: let any local frontend call the API
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(onboarding_router)


@app.get("/")
def health():
    """Quick check that the server is up and the topic map loaded."""
    store = get_store()
    return {
        "status": "ok",
        "mapVersion": store.version,
        "groups": len(store.groups),
        "topics": len(store.topics),
        "articles": len(store.articles),
    }
