import { describe, expect, it } from "vitest";
import { CATEGORIES, DEMO_BUBBLE, LINKS, TOPICS } from "../data/taxonomy";
import { bubbleFrom, demoSeen } from "../data/headlines";
import { SPLIT, ballPosition, createSplitBoard, pathDuration, scriptedPath } from "./galton";
import { CX, CY, buildModel, layout, pathTo } from "./layout";

// small seeded RNG so failures are reproducible
const mulberry = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe("galton split board", () => {
  it("every bounce after the gate stays in the chosen half", () => {
    for (let s = 0; s < 500; s++) {
      for (const isSeen of [true, false]) {
        const pts = scriptedPath(isSeen, mulberry(s)).slice(2); // skip funnel + gate
        for (const p of pts) {
          if (isSeen) expect(p.x).toBeLessThan(SPLIT.cx);
          else expect(p.x).toBeGreaterThan(SPLIT.cx);
        }
      }
    }
  });

  it("the ball comes to rest in the chosen bucket, even when buckets fill up", () => {
    const board = createSplitBoard();
    const rng = mulberry(42);
    for (let i = 0; i < 200; i++) {
      const isSeen = rng() < 0.5;
      const end = board.path(isSeen, rng).at(-1)!;
      if (isSeen) expect(end.x).toBeLessThan(SPLIT.cx);
      else expect(end.x).toBeGreaterThan(SPLIT.cx);
    }
  });

  it("ballPosition starts at the funnel and ends at the resting point", () => {
    const pts = createSplitBoard().path(true, mulberry(1));
    expect(ballPosition(pts, 0)).toMatchObject({ x: pts[0].x, y: pts[0].y });
    expect(ballPosition(pts, pathDuration(pts) + 1000)).toEqual(pts.at(-1));
  });
});

describe("radial layout", () => {
  const model = buildModel(CATEGORIES, LINKS);

  it("puts the known topics at ring 0", () => {
    const lay = layout(model, DEMO_BUBBLE, 0.3);
    for (const id of DEMO_BUBBLE) expect(lay.nodes[id].ring).toBe(0);
    expect(Object.values(lay.nodes).filter((n) => n.ring === 0)).toHaveLength(DEMO_BUBBLE.length);
  });

  it("puts unreachable topics in the outer ring", () => {
    const lay = layout(model, DEMO_BUBBLE, 0.75);
    const out = Object.values(lay.nodes).filter((n) => n.ring === Infinity);
    expect(lay.hasOut).toBe(true);
    expect(out.length).toBeGreaterThan(0);
    const outerR = lay.ringRadius[lay.rings];
    for (const n of out) expect(Math.hypot(n.x - CX, n.y - CY)).toBeCloseTo(outerR, 6);
    // every reachable non-bubble topic sits strictly inside the outer ring
    for (const n of Object.values(lay.nodes)) {
      if (n.ring > 0 && n.ring < Infinity) expect(Math.hypot(n.x - CX, n.y - CY)).toBeLessThan(outerR);
    }
  });

  it("with 'All' strength every topic is reachable and paths start in the bubble", () => {
    const lay = layout(model, DEMO_BUBBLE, 0);
    expect(lay.hasOut).toBe(false);
    for (const t of TOPICS) {
      const p = pathTo(lay, t.id);
      expect(lay.nodes[p[0]].ring).toBe(0);
      expect(p).toHaveLength(lay.nodes[t.id].ring + 1);
    }
  });
});

describe("onboarding bubble", () => {
  it("keeps the backend's known topics", () => {
    expect(bubbleFrom(["ai", "chips"], ["ai", "rates", "water"])).toEqual(["ai", "chips"]);
  });

  it("falls back to the demo rule's picks with fewer than 2 known topics", () => {
    const shown = ["ai", "rates", "water", "sport", "cyber"];
    expect(shown.filter((_, i) => demoSeen(i))).toEqual(["ai", "sport"]);
    expect(bubbleFrom(["ai"], shown)).toEqual(["ai", "sport"]);
    expect(bubbleFrom([], [])).toEqual([]);
  });
});
