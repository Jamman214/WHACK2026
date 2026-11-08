import { describe, expect, it } from "vitest";
import { CATEGORIES, DEMO_BUBBLE, LINKS, TOPICS } from "../data/taxonomy";
import { bubbleFrom, demoSeen } from "../data/headlines";
import { BALL_RADIUS, BOARD_W, SPLIT, ballPosition, bucketRect, createSplitBoard, landTime, pathDuration, pathEvents, scriptedPath } from "./galton";
import { CX, CY, buildModel, layout, pathTo } from "./layout";

// small seeded RNG so failures are reproducible
const mulberry = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe("galton split board", () => {
  const R = BALL_RADIUS;

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

  it("the whole path, hopper included, stays in its half and on the board", () => {
    for (let s = 0; s < 200; s++) {
      for (const isSeen of [true, false]) {
        const pts = createSplitBoard().path(isSeen, mulberry(s)).slice(2);
        for (let t = 0; t <= pathDuration(pts); t += 7) {
          const p = ballPosition(pts, t);
          if (isSeen) expect(p.x).toBeLessThan(SPLIT.cx - R + 1e-6);
          else expect(p.x).toBeGreaterThan(SPLIT.cx + R - 1e-6);
          expect(p.x).toBeGreaterThan(0);
          expect(p.x).toBeLessThan(BOARD_W);
          expect(p.y).toBeLessThan(SPLIT.yB + SPLIT.bH);
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

  it("the buckets are narrow but tall enough to stack four rows of balls", () => {
    expect(SPLIT.bW).toBeLessThanOrEqual(0.5 * 220);
    const rowsThatFit = Math.floor((SPLIT.bH - 1 - 2 * R) / 9) + 1; // floor bar, ball diameter, 9 per hex row
    expect(rowsThatFit).toBeGreaterThanOrEqual(4);
  });

  it("the last peg row can't drop a ball outside the hopper rim or onto the inner wall", () => {
    const { cx, half, rows, dx } = SPLIT;
    // raw landing offsets from the centre line before the hopper corrects them: (r - rows/2) * dx
    const widest = (rows / 2) * dx;
    expect(widest).toBeGreaterThan(half - R); // the raw drop really does overflow, so the clamp is exercised
    for (let s = 0; s < 500; s++) {
      for (const isSeen of [true, false]) {
        const pts = createSplitBoard().path(isSeen, mulberry(s));
        const dropped = pts[scriptedPath(isSeen, mulberry(s)).length - 1]; // last peg-row point, after correction
        const off = Math.abs(dropped.x - cx);
        const innerWall = SPLIT.bIn - 1, outerWall = SPLIT.bIn + SPLIT.bW + 1; // wall lines, offsets from centre
        const onInnerSlope = off <= innerWall - 1;
        const inMouth = off >= innerWall + R && off <= outerWall - R;
        const onOuterSlope = off >= outerWall + 1 && off <= half - R - 1 + 1e-6; // never past the rim
        expect(onInnerSlope || inMouth || onOuterSlope).toBe(true);
        // every point of the whole path stays inside the outer rim
        for (const p of pts) expect(Math.abs(p.x - cx)).toBeLessThanOrEqual(half - R + 1e-6);
      }
    }
  });

  it("the ball starts above the slope it lands on (the raised hoppers never trap it)", () => {
    for (let s = 0; s < 500; s++) {
      for (const isSeen of [true, false]) {
        const pts = createSplitBoard().path(isSeen, mulberry(s));
        const hopperStart = pts[scriptedPath(isSeen, mulberry(s)).length]; // first hopper point
        const dropped = pts[scriptedPath(isSeen, mulberry(s)).length - 1];
        expect(hopperStart.y).toBeGreaterThanOrEqual(dropped.y - 1e-6); // it only ever moves downward from the drop
      }
    }
  });

  it("all 18 balls on one side fit inside the bucket without overlapping", () => {
    for (const isSeen of [true, false]) {
      for (let s = 0; s < 40; s++) {
        const board = createSplitBoard();
        const rng = mulberry(s);
        const rect = bucketRect(isSeen);
        const rest: { x: number; y: number }[] = [];
        for (let i = 0; i < 18; i++) rest.push(board.path(isSeen, rng).at(-1)!);
        for (const p of rest) {
          expect(p.x - R).toBeGreaterThanOrEqual(rect.x0);
          expect(p.x + R).toBeLessThanOrEqual(rect.x1);
          expect(p.y - R).toBeGreaterThanOrEqual(rect.y0);
          expect(p.y + R).toBeLessThanOrEqual(rect.y1);
        }
        for (let i = 0; i < rest.length; i++)
          for (let j = i + 1; j < rest.length; j++)
            expect(Math.hypot(rest[i].x - rest[j].x, rest[i].y - rest[j].y)).toBeGreaterThanOrEqual(2 * R - 0.05);
      }
    }
  });

  it("is deterministic for a given rng", () => {
    const run = () => {
      const board = createSplitBoard();
      const rng = mulberry(7);
      return Array.from({ length: 18 }, (_, i) => board.path(i % 3 !== 0, rng));
    };
    expect(run()).toEqual(run());
  });

  it("pegs get hit, and the ball lands then rebounds at least twice with decaying height", () => {
    const pts = createSplitBoard().path(true, mulberry(3));
    const ev = pathEvents(pts);
    expect(ev.filter((e) => e.hit !== undefined).length).toBeGreaterThanOrEqual(SPLIT.rows - 1);
    const landAt = landTime(pts);
    expect(landAt).toBeGreaterThan(0);
    expect(landAt).toBeLessThan(pathDuration(pts));
    const after = pts.slice(pts.findIndex((p) => p.land) + 1);
    expect(after.length).toBeGreaterThanOrEqual(2);
    const arcs = after.map((p) => p.arc!);
    for (let i = 1; i < arcs.length; i++) expect(arcs[i]).toBeLessThan(arcs[i - 1]);
    // the rebound really leaves the floor
    const rest = pts.at(-1)!;
    const peak = Math.min(...Array.from({ length: 60 }, (_, i) => ballPosition(pts, landAt + 8 * i).y));
    expect(peak).toBeLessThan(rest.y - 3);
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
