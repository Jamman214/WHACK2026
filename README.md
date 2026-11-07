# WHACK 2026 — "anti-Instagram" demo

Onboarding (split Galton board) → Topic Atlas (radial bubble map). Desktop web, 100% mock data.
Brief and reference prototypes: [`whack-demo/`](whack-demo/PROMPT.md).

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest: galton paths + radial layout + deck
npm run build
```

## Demo script
1. Intro → **Use demo feed** → balls drop by themselves (deterministic: Cybersecurity, Sport, Misinformation, Critical minerals are "in my feed").
2. **See your map →** → the four-topic bubble sits in the centre.
3. Click a frontier topic → path panel → **Add to my bubble**. Try *Strong* to show the out-of-reach ring.

Keyboard: `←` / `→` sort headlines, `Enter` on focused buttons/nodes, `Esc` deselects on the map.

## Layout
```
src/data/taxonomy.ts      60 topics / 14 categories + weighted links (verbatim from the prototype)
src/data/headlines.ts     18-headline deck with topicIds, demo-feed rule, bubble fallback
src/lib/layout.ts         pure: BFS rings, parents, placeArc → target positions
src/lib/galton.ts         pure: scripted split-board paths, bucket heaps, ball timing
src/render/               Canvas 2D drawing for the board
src/screens/              Intro, Onboarding, Atlas (React + SVG)
```

## Moving to Three.js
`lib/` has no DOM or React. `layout()` returns `{ ring, parent, x, y }` per topic and `galton.ts`
returns time-stamped path points, so a Three.js scene can consume the same outputs: swap
`render/splitBoardCanvas.ts` and the SVG in `screens/Atlas.tsx` for scene components and keep the
data + lib layers as they are.
