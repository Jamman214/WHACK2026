import { describe, expect, it } from "vitest";
import { CATEGORIES, DEMO_BUBBLE, TOPICS, type CategoryId } from "../data/taxonomy";
import { MODEL } from "../data/model";
import { layout, pathTo } from "./layout";
import { angularDistance, solarModel, solarPositions, whereNext, routeTo } from "./solar";

const mulberry = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** A spread of bubbles and strengths: the demo bubble, single topics, a whole category, and 40 random ones. */
function cases() {
  const rnd = mulberry(7);
  const out: { name: string; bubble: string[]; thr: number }[] = [
    { name: "demo", bubble: DEMO_BUBBLE, thr: 0.5 },
    { name: "one topic", bubble: ["ai"], thr: 0.5 },
    { name: "whole category", bubble: CATEGORIES[0].topics.map((t) => t.id), thr: 0.5 },
    { name: "strict", bubble: DEMO_BUBBLE, thr: 0.9 },
    { name: "empty", bubble: [], thr: 0.5 },
  ];
  for (let i = 0; i < 40; i++) {
    const n = 1 + Math.floor(rnd() * 12);
    const ids = TOPICS.map((t) => t.id).sort(() => rnd() - 0.5).slice(0, n);
    out.push({ name: `random ${i}`, bubble: ids, thr: [0.5, 0.7, 0.9][i % 3] });
  }
  return out;
}
const build = (bubble: string[], thr: number) => {
  const lay = layout(MODEL, bubble, thr);
  return { lay, sm: solarModel(lay, MODEL) };
};
const CAT = Object.fromEntries(TOPICS.map((t) => [t.id, t.category])) as Record<string, CategoryId>;

describe("solarModel", () => {
  it("puts each planet on the minimum ring of its unknown topics", () => {
    for (const { bubble, thr } of cases()) {
      const { lay, sm } = build(bubble, thr);
      for (const c of CATEGORIES) {
        const p = sm.planets[c.id];
        const unknown = c.topics.filter((t) => lay.nodes[t.id].ring > 0);
        const want = unknown.length ? Math.min(...unknown.map((t) => lay.nodes[t.id].ring)) : 1;
        expect(p.orbit).toBe(want);
        expect(p.complete).toBe(unknown.length === 0);
        expect(p.explored.length + unknown.length).toBe(c.topics.length);
        if (Number.isFinite(p.orbit)) expect(p.nearest.every((id) => lay.nodes[id].ring === p.orbit)).toBe(true);
        else expect(p.nearest).toEqual([]);
      }
      expect(sm.hasOut).toBe(Object.values(sm.planets).some((p) => p.orbit === Infinity));
      expect(sm.home.length).toBe(new Set(bubble).size);
    }
  });

  it("hangs every planet off a planet one orbit closer, or off home for orbit 1", () => {
    for (const { name, bubble, thr } of cases()) {
      const { sm } = build(bubble, thr);
      for (const p of Object.values(sm.planets)) {
        if (p.orbit === Infinity) { expect(p.parent, name).toBeNull(); expect(p.via).toBeNull(); continue; }
        if (p.orbit === 1) { expect(p.parent).toBe("home"); continue; }
        expect(p.parent, name).not.toBe("home");
        // one orbit closer when a link allows it; otherwise (the strongest bridge crosses from a planet whose
        // nearest topic is nearer) the parent is still strictly closer to home, so the tree never loops
        const po = sm.planets[p.parent as CategoryId].orbit;
        expect(po, `${name} ${p.id}`).toBeLessThan(p.orbit);
        const direct = Object.values(sm.planets).filter((q) => q.orbit === p.orbit - 1).length;
        if (direct === 0) expect(po).toBeLessThan(p.orbit - 1);
      }
    }
  });

  it("realises each route with a link from the parent into the child", () => {
    for (const { lay, sm } of cases().map((c) => build(c.bubble, c.thr))) {
      for (const p of Object.values(sm.planets)) {
        if (!p.via) continue;
        expect(CAT[p.via.to]).toBe(p.id);
        if (p.parent === "home") expect(lay.nodes[p.via.from].ring).toBe(0);
        else expect(CAT[p.via.from]).toBe(p.parent);
        expect(p.via.w).toBeGreaterThan(0);
      }
      // everything reachable except fully-known planets with no outside link has a route
      for (const p of Object.values(sm.planets)) if (Number.isFinite(p.orbit) && !p.complete) expect(p.via).not.toBeNull();
    }
  });

  it("orders planets home-outward", () => {
    const { sm } = build(DEMO_BUBBLE, 0.5);
    expect(new Set(sm.order).size).toBe(CATEGORIES.length);
    const orbits = sm.order.map((id) => sm.planets[id].orbit);
    expect([...orbits].sort((a, b) => a - b)).toEqual(orbits);
    expect(sm.orbits).toBe(Math.max(...orbits.filter(Number.isFinite)));
  });

  it("whereNext only returns orbit-1 planets that still have something to explore", () => {
    for (const { bubble, thr } of cases()) {
      const { sm } = build(bubble, thr);
      for (const n of [1, 3, 5]) {
        const ids = whereNext(sm, n);
        expect(ids.length).toBeLessThanOrEqual(n);
        for (const id of ids) { expect(sm.planets[id].orbit).toBe(1); expect(sm.planets[id].complete).toBe(false); }
        const ws = ids.map((id) => sm.planets[id].via?.w ?? 0);
        expect([...ws].sort((a, b) => b - a)).toEqual(ws);
      }
    }
    expect(whereNext(build(DEMO_BUBBLE, 0.5).sm).length).toBe(3);
  });
});

describe("routeTo", () => {
  it("follows pathTo as pairs, and is empty for known or unreachable topics", () => {
    const { lay } = build(DEMO_BUBBLE, 0.5);
    for (const t of TOPICS) {
      const r = routeTo(lay, t.id), path = pathTo(lay, t.id);
      if (lay.nodes[t.id].ring === 0 || lay.nodes[t.id].ring === Infinity) { expect(r).toEqual([]); continue; }
      expect(r.length).toBe(path.length - 1);
      r.forEach((hop, i) => {
        expect(hop.from).toBe(path[i]);
        expect(hop.to).toBe(path[i + 1]);
        expect(hop.w).toBe(lay.nodes[path[i + 1]].pw);
      });
      expect(r[0].from && lay.nodes[r[0].from].ring).toBe(0);
      expect(r.at(-1)!.to).toBe(t.id);
    }
    expect(routeTo(lay, "ai").length).toBeGreaterThan(0);
    expect(routeTo(lay, "ai").every((h) => h.reason === undefined || typeof h.reason === "string")).toBe(true);
  });

  it("is empty when nothing is reachable", () => {
    const { lay } = build(["ai"], 0.99);
    expect(routeTo(lay, "farm")).toEqual([]);
  });
});

describe("solarPositions", () => {
  it("is deterministic", () => {
    for (const { bubble, thr } of cases().slice(0, 12)) {
      const a = solarPositions(build(bubble, thr).sm), b = solarPositions(build([...bubble].reverse(), thr).sm);
      expect(a).toEqual(b);
    }
  });

  it("never overlaps planets or the home planet and keeps every orbit on its own circle", () => {
    for (const { name, bubble, thr } of cases()) {
      const { sm } = build(bubble, thr), pos = solarPositions(sm);
      const ids = CATEGORIES.map((c) => c.id);
      for (const id of ids) {
        const p = pos.planets[id];
        expect(Number.isFinite(p.x + p.z + p.r + p.angle), name).toBe(true);
        expect(Math.hypot(p.x, p.z)).toBeCloseTo(p.orbitR, 6);
        expect(Math.hypot(p.x, p.z) - p.r, name).toBeGreaterThan(pos.home.r + 0.5);
        for (const o of ids) {
          if (o <= id) continue;
          const q = pos.planets[o];
          expect(Math.hypot(p.x - q.x, p.z - q.z) - p.r - q.r, `${name} ${id}/${o}`).toBeGreaterThan(0.3);
        }
      }
      expect(pos.orbitRadii.length).toBe(sm.orbits + (sm.hasOut ? 1 : 0));
      expect([...pos.orbitRadii].sort((a, b) => a - b)).toEqual(pos.orbitRadii);
    }
  });

  it("keeps a child near its parent's angle", () => {
    let worst = 0, total = 0, n = 0;
    for (const { bubble, thr } of cases()) {
      const { sm } = build(bubble, thr), pos = solarPositions(sm);
      for (const p of Object.values(sm.planets)) {
        if (!p.parent || p.parent === "home") continue;
        const d = angularDistance(pos.planets[p.id].angle, pos.planets[p.parent].angle);
        worst = Math.max(worst, d); total += d; n++;
      }
    }
    expect(n).toBeGreaterThan(20);
    expect(total / n).toBeLessThan(0.6); // typically a sibling fan around the parent
    expect(worst).toBeLessThan(Math.PI * 0.75);
  });

  it("never moves another planet outward when a topic joins the bubble", () => {
    const rnd = mulberry(99);
    for (let i = 0; i < 60; i++) {
      const n = 1 + Math.floor(rnd() * 8), thr = [0.5, 0.7][i % 2];
      const ids = TOPICS.map((t) => t.id).sort(() => rnd() - 0.5);
      const bubble = ids.slice(0, n), add = ids[n];
      const before = build(bubble, thr).sm, after = build([...bubble, add], thr).sm;
      for (const c of CATEGORIES) {
        if (c.id === CAT[add]) continue;
        expect(after.planets[c.id].orbit, `${c.id} +${add}`).toBeLessThanOrEqual(before.planets[c.id].orbit);
      }
    }
  });

  it("gives the home planet a size that grows (slowly) with the bubble", () => {
    const small = solarPositions(build(["ai"], 0.5).sm).home.r, big = solarPositions(build(TOPICS.slice(0, 30).map((t) => t.id), 0.5).sm).home.r;
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThan(small * 2);
  });
});
