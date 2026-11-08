# WHACK 2026: Project Uncovered

## Aims

Social feeds keep people inside what they already like. This app shows readers where their knowledge stops, how far away new topics are, and an explained route for getting there, so they can grow their bubble one step at a time.

## User flows

1. **Onboarding:** sort headlines into "in my feed" or "not in my feed" on a Galton board. This defines your bubble.
2. **Today's edition:** read a daily set of stories, grouped by distance from your bubble. Stories from outside it explain the connection ("Because you follow X → Y").
3. **Topic Atlas:** explore a solar-system map with you at the centre and subject areas orbiting by distance. Open a planet to see its topics, stories and route back to you.
4. **Grow your bubble:** reading a story from outside your bubble adds its topic, and the feed re-ranks around it. You can undo this, or remove a topic from the map.

## Running it

You need Node.js and Python 3.

**Backend** (runs on port 8000):

```sh
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app:app --reload
```

The backend needs `backend/data/clusters.json`, which isn't in git. To generate it, run the pipeline in `data_aquisition/`, then `python export_clusters.py` in `backend/`.

**Frontend** (in a second terminal, from the repo root):

```sh
npm install
npm run dev
```

Then open http://localhost:5173.
