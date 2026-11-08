# WHACK 2026 — "anti-Instagram" demo

Onboarding (split Galton board) → **news feed** (primary) with the Topic Atlas (radial bubble map) as a
secondary sheet. Desktop web for the demo; the feed is one-card-per-screen snap scroll so it can become a mobile PWA.
Brief and reference prototypes: [`whack-demo/`](whack-demo/PROMPT.md).

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest: galton paths, radial layout, deck, feed wiring + data
npm run build
```

## Demo script
1. Intro → **Use demo feed** → balls drop by themselves (deterministic: Cybersecurity, Sport, Misinformation, Critical minerals are "in my feed").
2. **Open your feed →** → first story is from inside the bubble (on-ramp), then two from outside, repeating.
   Each outside card says *Because you follow X → Y* and how many steps away it is.
3. **◎ Map** → the Atlas fills the screen as a solar system. **You** (your known topics) are the sun; the 14 subject areas are planets on orbit rings,
   one ring per step away from what you know. The panel opens on **Where to next**: the three planets one step out, each with the topic that links it to you and why.
   Click a card (or a planet) → the planet view: what it covers, **how this connects to you** (the route home, step by step), its topics with
   distance badges (*In your bubble / 1 step / 2 steps / Out of reach*) and the latest stories. Pick a topic → **Add to my bubble**.
4. **⌂ Home** (or the **Map** crumb) returns to the whole map; **← Back to your feed** (or `Esc`) goes back to the feed, which is re-ranked around the bigger bubble.
   One bridge strength ("Related") is used everywhere; there are no map settings to fiddle with.

Three levels, always shown as a breadcrumb: **Map › Planet › Topic** (for example *Map › Close to a tech bubble › Semiconductors*; on phones it collapses to "‹ parent").

Keyboard: `←` / `→` sort headlines; `j` / `k` (or `↓` / `↑`) step through stories. In the map, `/` focuses *Find a topic*
(arrow keys + `Enter` pick a topic from the list, grouped by planet, and open its planet with the topic selected), and `Esc` steps back one
level: close the list, then the open topic, then the planet (back to the map), then leave the map. Focus moves into the map when it opens, stays inside it, and
returns to **◎ Map** on close. Without WebGL the same panels work over a flat SVG map.

## Live news (optional)
The demo never needs the network: with no key it uses `src/feed/mock.ts` (every card labelled *Demo summary*,
links go to a Guardian search, never an invented article). To pull real headlines, put a
[Guardian Open Platform](https://open-platform.theguardian.com/access/) key in `.env.local`:

```sh
VITE_GUARDIAN_KEY=your-key
```

Search terms per topic live in `src/feed/queries.ts`; empty results fall back to mock.
**`VITE_` variables are bundled into the client JS**, so the key is visible to anyone with the page. Fine for a
local demo; don't deploy a public build with it — proxy the Guardian call through a server function instead.

## Layout
```
src/data/taxonomy.ts      60 topics / 14 categories + weighted links (verbatim from the prototype)
src/data/headlines.ts     18-headline deck with topicIds, demo-feed rule, bubble fallback
src/lib/layout.ts         pure: BFS rings, parents, placeArc → target positions
src/lib/galton.ts         pure: scripted split-board paths, bucket heaps, ball timing
src/render/               Canvas 2D drawing for the board
src/screens/              Intro, Onboarding, Home (feed + map sheet), Atlas (overlay shell + navigation state) + AtlasScene (three.js) / AtlasSvg (fallback)
src/screens/atlas/        Atlas panels: Overview (where to next), HomePanel, PlanetPanel (route, topics, news), Search, News
src/screens/atlas.css     Atlas overlay styles (breadcrumb, panels, topic accordion, news cards, legend)
src/feed/                 news feed module: Feed, NewsCard, rank, providers (mock / Guardian), queries
```

## Moving to Three.js
`lib/` has no DOM or React. `layout()` returns `{ ring, parent, x, y }` per topic and `galton.ts`
returns time-stamped path points, so a Three.js scene can consume the same outputs: swap
`render/splitBoardCanvas.ts` and the SVG in `screens/Atlas.tsx` for scene components and keep the
data + lib layers as they are.
