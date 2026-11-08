# Merging `frontend-demo` into `backend`

Notes from the 2026-11-08 group meeting. Git conflict: only `.gitignore` (keep both sides' entries).

## 1. Data shape mismatches — agreed as listed

| Frontend (`FeedItem` / `Topic` / `Category`) | Backend (`Card` / `Topic` / `Group`) | Action |
|---|---|---|
| `headline` | `title` | rename on one side |
| `summary: string` (required) | `description?` | rename, fall back to `""` |
| `source`, `publishedAt` required | optional in schema (always filled in practice) | make optional on frontend |
| `Topic { id, name, category }` | `Topic { id, groupId, label, related }` | `name`→`label`, `category`→`groupId` |
| fixed `CategoryId` union + `--c-${category}` CSS colours | 130 dynamic groups (`g-659`) | drop the union, generate colours |
| `Link.w` hand-tuned 0.2–0.95, threshold 0.3 | cosine 0.696–0.972 | rescale on one side (slider is a no-op otherwise) |
| `edgeReasons.json` per link | nothing | generate (LLM) or drop the "why" line — undecided |
| bubble = `string[]` | `Bubble.knownTopics` etc. | use `knownTopics` |
| `queries.ts` / Guardian provider | n/a | delete; backend is the news source |

## 2. Decisions

- **Onboarding is bidirectional**: frontend calls `POST /onboarding/next` on every swipe, uses `progress.max` and `done`
  instead of the fixed 18-card `DECK`.
- **"In my feed" == "I know this"**. Map frontend `←` ("In my feed") to backend `"right"` explicitly.
- **Backend owns the bubble.** "Add to my bubble" in the Atlas must be sent to the backend (needs an endpoint / a way
  to record it alongside swipe history).
- **Add a batch feed endpoint** (e.g. `POST /feed {topics, perTopic}`) — avoids one request per topic (~500).

## 3. Graph

- Scale (650 topics / 130 groups on the Atlas): known, untested — revisit once wired up.
- **Add more links between topics** to reduce sparseness (median degree 2, 33 components, only 23% of links cross groups).
- Onboarding coverage (15 cards vs 130 groups): **raise again later**.

## 4. Other issues

- `bubble.py` inferred-score boundary (one right swipe marks the whole group known): fine for now; onboarding fixed later.
- `clusters.json` distribution to teammates: fine as is.
- **Remove `description` from topics** (null for all 650).
- Generic topic labels: fine for now.
- Map version / topic-id stability across re-clusters: **undecided — raise again after this merge.**
- Times of India (~19% of articles): may cull later, not yet.
- **Fix `source` to be the real outlet** (currently the RSS feed title, e.g. `"Just In"` for ABC AU).
- **Remove unnecessary backend files**: provider keys in `backend/.env.example`, unused provider helpers in
  `backend/utils.py` (GDELT/NYT date handling) if nothing else uses them.
- Frontend cleanup at merge: `whack-demo/feed/` duplicate, `VITE_GUARDIAN_KEY` client-side key path, add an API base
  URL / Vite proxy.

## TODO
- [x] Frontend API adapter (`/map`, `/onboarding/next`, batch feed) replacing `src/data/*` mocks
- [x] Batch feed endpoint (`POST /feed`)
- [x] Endpoint for "Add to my bubble" (`POST /bubble`)
- [x] Rescale link weights (frontend, `src/data/api.ts`)
- [ ] Denser topic links
- [ ] Drop topic `description`
- [ ] Correct `source` outlet names
- [ ] Remove unused backend files
- [ ] Revisit: map version, onboarding coverage, Atlas scale, edge reasons
