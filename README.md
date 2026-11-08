# WHACK 2026 — "anti-Instagram" demo

Onboarding (split Galton board) → **news feed** (primary) with the Topic Atlas (radial bubble map) as a
secondary sheet. Desktop web for the demo; the feed is one-card-per-screen snap scroll so it can become a mobile PWA.
Brief and reference prototypes: [`whack-demo/`](whack-demo/PROMPT.md).

```sh
cd backend && .venv/bin/uvicorn app:app --reload   # the API on :8000 (needs backend/data/clusters.json)
npm install
npm run dev      # http://localhost:5173, proxies /api to the backend
npm test         # Vitest: galton paths, radial layout, feed ranking (offline fixture)
npm run build
```

## Data
Everything comes from the backend (`src/data/api.ts`): `GET /map` (groups → categories, topics, links) is loaded
before the app renders; onboarding calls `POST /onboarding/next` on every swipe ("In my feed" = backend `right`);
"Add to my bubble" sends the swipes plus map adds/removes to `POST /bubble`; the feed uses `POST /feed`.
Link weights (cosine) are stretched onto 0.2–0.95 so the map's strength stops keep their meaning; group colours are
generated. Set `VITE_API_URL` to call a backend somewhere other than the dev proxy.

"Use demo feed" sorts every third card into "in my feed". Keyboard: `←` / `→` sort headlines; `j` / `k`
(or `↓` / `↑`) step through stories; `Esc` closes the map.

## Layout
```
src/data/api.ts           backend calls; loadMap() swaps the backend map into taxonomy + model
src/data/taxonomy.ts      live taxonomy (backend map at runtime; hand-built 60-topic fixture for tests)
src/data/headlines.ts     onboarding card type, demo-feed rule, bubble fallback
src/lib/layout.ts         pure: BFS rings, parents, placeArc → target positions
src/lib/galton.ts         pure: scripted split-board paths, bucket heaps, ball timing
src/render/               Canvas 2D drawing for the board
src/screens/              Intro, Onboarding, Home (feed + map sheet), Atlas (React + SVG)
src/feed/                 news feed module: Feed, NewsCard, rank, providers (backend / test mock)
```

## Moving to Three.js
`lib/` has no DOM or React. `layout()` returns `{ ring, parent, x, y }` per topic and `galton.ts`
returns time-stamped path points, so a Three.js scene can consume the same outputs: swap
`render/splitBoardCanvas.ts` and the SVG in `screens/Atlas.tsx` for scene components and keep the
data + lib layers as they are.
