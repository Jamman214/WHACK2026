# Build: "anti-Instagram" demo — onboarding → Topic Atlas

WHACK hackathon, Marshall Wace brief ("New Worlds: open a door to the unexplored"). The app shows a user what sits outside their feed bubble and how to bridge to it from what they already know. Demo is projected for judges on Sunday 8 Nov, 11am. Desktop web only. 100% mock data, no backend, no APIs.

## Source of truth
Two working single-file prototypes are in `reference/`. **Read both fully before writing code.** Port their behaviour and data faithfully; don't redesign.
- `reference/onboarding-feed-board.html` — Galton-board onboarding. Use the **"Split board"** tab only (drop "Groups as buckets").
- `reference/topic-atlas.html` — radial map. Port it as-is: the 60-topic/14-category taxonomy (`CL`), weighted links (`L`), BFS ring layout, sector placement, strength toggle, Nearby/All labels, detail panel, path-to-topic, "Add to my bubble", world-explored meter.

## Stack
Vite + React + TypeScript. Plain CSS with the prototypes' CSS variables (light + dark). Canvas for the board, SVG for the map, no physics or graph libraries. `npm run dev` must work from a clean clone.

## Structure
```
src/data/taxonomy.ts    // CL + L from topic-atlas, typed
src/data/headlines.ts   // deck: { id, topicId, headline }
src/screens/Onboarding.tsx
src/screens/Atlas.tsx
src/lib/layout.ts       // pure BFS + placeArc from topic-atlas
src/lib/galton.ts       // pure scripted-path + heap from the board
```

## Flow
1. **Intro** — one screen: title, one-line premise, "Start" and "Use demo feed".
2. **Onboarding (split board)** — one headline card at a time; "In my feed" (←) / "Not in my feed" (→). Card morphs into a ball; the gate tips; the ball falls only into the chosen half via the scripted path (not real physics). Next card shows instantly; several balls can be in flight. Summary line + "Play demo feed" + Reset, as in the prototype.
3. **Hand-off** — after the last card, a "See your map" button. Simple fade to the Atlas (stacks-to-nodes animation is a stretch goal, skip it).
4. **Atlas** — seed `known` from onboarding (below). Everything else as in the prototype. Add a "Redo onboarding" link.

## Data change (the one real gap)
The board's headlines are tagged by category only; the Atlas needs topic ids. Rewrite the deck as ~18 mock headlines, each with a `topicId` from the taxonomy, spread across all 14 categories, balanced (not politics-heavy). The bubble = topics of headlines marked "In my feed". If fewer than 2, fall back to the demo bubble.

The demo feed must produce exactly the demo bubble: **Cybersecurity & privacy, Sport, Misinformation, Critical minerals & rare earths** (ids `cyber`, `sport`, `misinfo`, `minerals`). Include one headline for each; "Play demo feed" marks those four as in-feed and the rest as not — deterministically, no randomness.

## Done when
- Click-through from intro → board → map works with keyboard and mouse.
- Demo feed lands on the map with the four-topic bubble in the centre.
- Pure logic in `lib/` has a few Vitest tests: galton path always ends in the chosen half; layout puts `known` at ring 0 and unreachable topics in the outer ring.
- Readable on a 1440×900 projector, respects `prefers-reduced-motion`.

Work in small commits. Ask me before changing the taxonomy, link weights, or visual design.
