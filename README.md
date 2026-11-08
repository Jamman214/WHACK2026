# WHACK 2026 — "anti-Instagram" demo

Onboarding (split Galton board) → **today's edition** (primary: a date + stories grouped by distance on the left, the thread and the
story on the right) with the Topic Atlas (radial bubble map) as a secondary sheet. Desktop web for the demo.
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
Reading a story (or "Remove from bubble" on the map) sends the swipes plus those adds/removes to `POST /bubble`; the feed uses `POST /feed`.
Link weights (cosine) are stretched onto 0.2–0.95 so the map's strength stops keep their meaning; group colours are
generated. Set `VITE_API_URL` to call a backend somewhere other than the dev proxy.

"Use demo feed" sorts every third card into "in my feed". Keyboard: `←` / `→` sort headlines; `j` / `k`
(or `↓` / `↑`) step through stories; `Esc` closes the map.

## Demo script
1. Intro → **Use demo feed** → balls drop by themselves (deterministic: Cybersecurity, Sport, Misinformation, Critical minerals are "in my feed").
2. **Open your feed →** → first story is from inside the bubble (on-ramp), then two from outside, repeating.
   Each outside card says *Because you follow X → Y* and how many steps away it is.
3. **◎ Map** → the Atlas fills the screen as a solar system. **You** (your known topics) are the sun; the 14 subject areas are planets on orbit rings,
   one ring per step away from what you know. The panel opens on **Where to next**: the three planets one step out, each with the topic that links it to you and why.
   Click a card (or a planet) → the planet view: what it covers, **how this connects to you** (the route home, step by step), its topics with
   distance badges (*In your bubble / 1 step / 2 steps / Out of reach*) and the latest stories. Pick a topic and read one of its stories → it joins your bubble (Undo in the toast).
4. **⌂ Home** (or the **Map** crumb) returns to the whole map; **← Back to your feed** (or `Esc`) goes back to the feed, which is re-ranked around the bigger bubble.
   One bridge strength ("Related") is used everywhere; there are no map settings to fiddle with.

Three levels, always shown as a breadcrumb: **Map › Planet › Topic** (for example *Map › Close to a tech bubble › Semiconductors*; on phones it collapses to "‹ parent").

Keyboard: `←` / `→` sort headlines; `j` / `k` (or `↓` / `↑`) step through stories. In the map, `/` focuses *Find a topic*
(arrow keys + `Enter` pick a topic from the list, grouped by planet, and open its planet with the topic selected), and `Esc` steps back one
level: close the list, then the open topic, then the planet (back to the map), then leave the map. Focus moves into the map when it opens, stays inside it, and
returns to **◎ Map** on close. Without WebGL the same panels work over a flat SVG map.

## Layout
```
src/data/api.ts           backend calls; loadMap() swaps the backend map into taxonomy + model
src/data/taxonomy.ts      live taxonomy (backend map at runtime; hand-built 60-topic fixture for tests)
src/data/headlines.ts     onboarding card type, demo-feed rule, bubble fallback
src/lib/layout.ts         pure: BFS rings, parents, placeArc → target positions
src/lib/galton.ts         pure: scripted split-board paths, bucket heaps, ball timing
src/render/               Canvas 2D drawing for the board
src/screens/              Intro, Onboarding, Home (edition + map sheet), Atlas (overlay shell + navigation state) + AtlasScene (three.js) / AtlasSvg (fallback)
src/screens/atlas/        Atlas panels: Overview (where to next), HomePanel, PlanetPanel (route, topics, news), Search, News
src/screens/atlas.css     Atlas overlay styles (breadcrumb, panels, topic accordion, news cards, legend)
src/feed/                 today's edition module: Edition, Thread, Article, rank (mix + daily cap), providers (backend / test mock)
```

## Moving to Three.js
`lib/` has no DOM or React. `layout()` returns `{ ring, parent, x, y }` per topic and `galton.ts`
returns time-stamped path points, so a Three.js scene can consume the same outputs: swap
`render/splitBoardCanvas.ts` and the SVG in `screens/Atlas.tsx` for scene components and keep the
data + lib layers as they are.
