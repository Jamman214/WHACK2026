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
3. **◎ Map** → the Atlas, bubble in the centre. Click a topic → **Add to my bubble** → `Esc` → the feed is re-ranked.

Keyboard: `←` / `→` sort headlines; `j` / `k` (or `↓` / `↑`) step through stories; `Esc` closes the map.

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
src/screens/              Intro, Onboarding, Home (feed + map sheet), Atlas (React + SVG)
src/feed/                 news feed module: Feed, NewsCard, rank, providers (mock / Guardian), queries
```

## Moving to Three.js
`lib/` has no DOM or React. `layout()` returns `{ ring, parent, x, y }` per topic and `galton.ts`
returns time-stamped path points, so a Three.js scene can consume the same outputs: swap
`render/splitBoardCanvas.ts` and the SVG in `screens/Atlas.tsx` for scene components and keep the
data + lib layers as they are.
