// Pure "solar system" model for the Topic Atlas: no DOM, no three.js.
//
// The user's bubble is the sun ("home"). Every category is a planet that orbits it at a distance equal to the
// number of bridges the user would have to cross to reach its nearest not-yet-known topic. Each planet hangs off
// exactly one parent (the planet one orbit closer it is most strongly linked to), which gives a tree that reads
// outward from home. solarPositions() lays that tree out flat on one plane.
import { CATEGORIES, type CategoryId } from "../data/taxonomy";
import { edgeReason } from "../data/reasons";
import { pathTo, type Layout, type Model } from "./layout";

export interface SolarPlanet {
  id: CategoryId;
  /** 1..n steps out from home; Infinity = out of reach. */
  orbit: number;
  /** The planet one orbit closer it hangs off ("home" for orbit 1); null only when out of reach. */
  parent: CategoryId | "home" | null;
  /** Strongest topic link realising the route: `from` is in the parent planet (or a known topic for "home"), `to` is in this planet. */
  via: { from: string; to: string; w: number } | null;
  /** This planet's topic ids that are in the bubble. */
  explored: string[];
  /** All its topic ids. */
  topics: string[];
  /** Its unknown topics at ring === orbit, sorted by pw desc. */
  nearest: string[];
  /** Every topic known. */
  complete: boolean;
}

export interface SolarModel {
  /** Bubble topic ids. */
  home: string[];
  planets: Record<CategoryId, SolarPlanet>;
  /** Highest finite orbit. */
  orbits: number;
  hasOut: boolean;
  /** Planets sorted home-outward (orbit, then via.w desc). */
  order: CategoryId[];
}

const CAT_INDEX = Object.fromEntries(CATEGORIES.map((c, i) => [c.id, i])) as Record<CategoryId, number>;

export function solarModel(lay: Layout, model: Model): SolarModel {
  const catOf = (id: string) => model.byId[id].category;
  const ring = (id: string) => lay.nodes[id].ring;

  const topicsOf = {} as Record<CategoryId, string[]>;
  for (const c of CATEGORIES) topicsOf[c.id] = [];
  for (const t of model.topics) topicsOf[t.category].push(t.id);

  // pass 1: orbit = nearest unknown topic; a fully known planet sits on orbit 1; nothing reachable = out of reach
  const orbitOf = {} as Record<CategoryId, number>;
  for (const c of CATEGORIES) {
    const unknown = topicsOf[c.id].filter((id) => ring(id) > 0);
    orbitOf[c.id] = unknown.length ? Math.min(...unknown.map(ring)) : 1;
  }

  const planets = {} as Record<CategoryId, SolarPlanet>;
  for (const c of CATEGORIES) {
    const topics = topicsOf[c.id];
    const orbit = orbitOf[c.id];
    const explored = topics.filter((id) => ring(id) === 0);
    const nearest = Number.isFinite(orbit)
      ? topics
        .filter((id) => ring(id) > 0 && ring(id) === orbit)
        .sort((a, b) => lay.nodes[b].pw - lay.nodes[a].pw || a.localeCompare(b))
      : [];

    let parent: SolarPlanet["parent"] = null;
    let via: SolarPlanet["via"] = null;
    if (Number.isFinite(orbit)) {
      if (orbit === 1) {
        parent = "home";
        via = bestVia(nearest.map((id) => [id, lay.nodes[id]] as const), (p) => ring(p) === 0);
        if (!via && !nearest.length) {
          // fully explored: the strongest link from a known topic outside the planet
          for (const t of topics) {
            for (const e of model.adj[t]) {
              if (ring(e.o) !== 0 || catOf(e.o) === c.id) continue;
              if (!via || e.w > via.w || (e.w === via.w && (e.o + t < via.from + via.to))) via = { from: e.o, to: t, w: e.w };
            }
          }
        }
      } else {
        // 1) the nearest topics' strongest links into a planet exactly one orbit closer
        // 2) any of the planet's topics linking into such a planet
        // 3) any nearer planet (can only happen when an intermediate orbit is empty)
        const tries: ((p: string) => boolean)[] = [
          (p) => catOf(p) !== c.id && orbitOf[catOf(p)] === orbit - 1,
          (p) => catOf(p) !== c.id && orbitOf[catOf(p)] < orbit,
        ];
        const pools = [
          nearest.map((id) => [id, lay.nodes[id]] as const),
          topics.filter((id) => ring(id) > 0 && Number.isFinite(ring(id))).map((id) => [id, lay.nodes[id]] as const),
        ];
        search: for (const ok of tries) {
          for (const pool of pools) {
            const v = bestVia(pool, ok);
            if (v) { via = v; break search; }
          }
        }
        parent = via ? catOf(via.from) : "home";
      }
    }
    planets[c.id] = { id: c.id, orbit, parent, via, explored, topics, nearest, complete: explored.length === topics.length };
  }

  // the unreachable planets: orbit is Infinity (their unknown topics have no ring)
  const finite = CATEGORIES.map((c) => planets[c.id].orbit).filter(Number.isFinite);
  const order = CATEGORIES.map((c) => c.id).sort((a, b) => {
    const A = planets[a], B = planets[b];
    if (A.orbit !== B.orbit) return A.orbit < B.orbit ? -1 : 1;
    return (B.via?.w ?? -1) - (A.via?.w ?? -1) || CAT_INDEX[a] - CAT_INDEX[b];
  });
  return {
    home: model.topics.filter((t) => ring(t.id) === 0).map((t) => t.id),
    planets,
    orbits: finite.length ? Math.max(...finite) : 0,
    hasOut: CATEGORIES.some((c) => !Number.isFinite(planets[c.id].orbit)),
    order,
  };
}

/** Strongest layout-parent link among `pool` whose parent topic passes `ok`. Ties break on ids so results are stable. */
function bestVia(
  pool: readonly (readonly [string, { parent: string | null; pw: number }])[],
  ok: (parentTopic: string) => boolean,
): SolarPlanet["via"] {
  let best: SolarPlanet["via"] = null;
  for (const [id, n] of pool) {
    if (!n.parent || !ok(n.parent)) continue;
    if (!best || n.pw > best.w || (n.pw === best.w && n.parent + id < best.from + best.to)) best = { from: n.parent, to: id, w: n.pw };
  }
  return best;
}

/** Up to n orbit-1 planets ranked by via.w desc, then fewest explored. Fully explored planets have nothing left to offer. */
export function whereNext(sm: SolarModel, n = 3): CategoryId[] {
  return sm.order
    .map((id) => sm.planets[id])
    .filter((p) => p.orbit === 1 && !p.complete)
    .sort((a, b) => (b.via?.w ?? 0) - (a.via?.w ?? 0) || a.explored.length - b.explored.length || CAT_INDEX[a.id] - CAT_INDEX[b.id])
    .slice(0, n)
    .map((p) => p.id);
}

/** Hops from home to a topic: pathTo(lay, id) as pairs with edgeReason text (reason may be undefined). [] if known or unreachable. */
export function routeTo(lay: Layout, id: string): { from: string; to: string; w: number; reason?: string }[] {
  const n = lay.nodes[id];
  if (!n || n.ring === 0 || n.ring === Infinity) return [];
  const path = pathTo(lay, id);
  return path.slice(1).map((to, i) => ({ from: path[i], to, w: lay.nodes[to].pw, reason: edgeReason(path[i], to) }));
}

// ---------- flat positions ----------

export interface SolarPositions {
  home: { r: number };
  planets: Record<CategoryId, { x: number; z: number; r: number; orbitR: number; angle: number }>;
  /** orbitRadii[k - 1] is the radius of orbit k (k = 1..orbits); with hasOut one more entry follows for "out of reach". */
  orbitRadii: number[];
}

const TAU = Math.PI * 2;
/** Visual size of a planet: more topics, bigger; further orbits shrink so distance reads at a glance. */
export const planetRadius = (topics: number, orbit: number) => {
  const shrink = !Number.isFinite(orbit) ? 0.62 : [1, 1, 0.9, 0.8, 0.72][Math.min(4, orbit)] ?? 0.72;
  return (0.62 + 0.085 * topics) * shrink;
};
export const homeRadius = (known: number) => Math.min(2.5, 1.5 + 0.12 * Math.sqrt(Math.max(1, known)));

const RING_GAP = 2.1; // clear space between two orbits' planets
const SIDE_PAD = 0.55; // minimum clear space between neighbours on one orbit
const homeAngle = (id: CategoryId) => -Math.PI / 2 + (TAU * (CAT_INDEX[id] + 0.5)) / CATEGORIES.length;
const angDiff = (a: number, b: number) => Math.abs(((((a - b) % TAU) + 3 * Math.PI) % TAU) - Math.PI);

interface Item { id: CategoryId; want: number; width: number }

/**
 * Place items around a circle as near their wanted angles as the minimum widths allow: unroll the circle at its
 * widest empty arc, then the least-squares monotone fit (pool adjacent violators) of want - cumulative spacing.
 */
function spread(items: Item[]): Map<CategoryId, number> {
  const out = new Map<CategoryId, number>();
  const n = items.length;
  if (!n) return out;
  const norm = (a: number) => ((a % TAU) + TAU) % TAU;
  const s = items
    .map((i) => ({ ...i, want: norm(i.want) }))
    .sort((a, b) => a.want - b.want || CAT_INDEX[a.id] - CAT_INDEX[b.id]);
  if (n === 1) { out.set(s[0].id, s[0].want); return out; }
  let bi = 0, bg = -1;
  for (let i = 0; i < n; i++) {
    const g = i === n - 1 ? s[0].want + TAU - s[i].want : s[i + 1].want - s[i].want;
    if (g > bg) { bg = g; bi = (i + 1) % n; }
  }
  const q = s.slice(bi).concat(s.slice(0, bi));
  const base = q[0].want;
  const want = q.map((it) => (it.want < base ? it.want + TAU : it.want));
  const off = [0];
  for (let i = 1; i < n; i++) off.push(off[i - 1] + (q[i - 1].width + q[i].width) / 2);
  // PAV on y_i = want_i - off_i (must be non-decreasing)
  const blocks: { sum: number; cnt: number }[] = [];
  for (let i = 0; i < n; i++) {
    blocks.push({ sum: want[i] - off[i], cnt: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
      if (a.sum / a.cnt <= b.sum / b.cnt) break;
      blocks.splice(blocks.length - 2, 2, { sum: a.sum + b.sum, cnt: a.cnt + b.cnt });
    }
  }
  const ang: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.cnt; k++) ang.push(b.sum / b.cnt + off[ang.length]);
  const total = TAU - (q[0].width + q[n - 1].width) / 2;
  if (ang[n - 1] - ang[0] > total) {
    // the wrap-around seam would collide: space everything evenly by width instead
    const sumW = q.reduce((t, it) => t + it.width, 0), slack = (TAU - sumW) / n;
    let c = base - q[0].width / 2 - slack / 2;
    q.forEach((it, i) => { c += slack / 2 + it.width / 2; ang[i] = c; c += it.width / 2 + slack / 2; });
  }
  q.forEach((it, i) => out.set(it.id, norm(ang[i])));
  return out;
}

export function solarPositions(sm: SolarModel): SolarPositions {
  const home = { r: homeRadius(sm.home.length) };
  const rOf = (id: CategoryId) => planetRadius(sm.planets[id].topics.length, sm.planets[id].orbit);
  const OUT = sm.orbits + 1; // slot index of the "out of reach" orbit
  const slot = (id: CategoryId) => (Number.isFinite(sm.planets[id].orbit) ? sm.planets[id].orbit : OUT);
  const bySlot = new Map<number, CategoryId[]>();
  for (const id of sm.order) {
    const k = slot(id);
    bySlot.set(k, [...(bySlot.get(k) ?? []), id]);
  }

  const last = sm.hasOut ? OUT : sm.orbits;
  const orbitRadii: number[] = [];
  const planets = {} as SolarPositions["planets"];
  const angleOf = new Map<CategoryId, number>();
  let prevOuter = home.r; // outer edge of the previous row of planets (home's surface for the first orbit)
  for (let k = 1; k <= last; k++) {
    const ids = bySlot.get(k) ?? [];
    const maxR = ids.length ? Math.max(...ids.map(rOf)) : 0;
    let R = prevOuter + (ids.length ? RING_GAP + maxR : 1.2);
    // enough circumference for every planet's width
    const need = ids.reduce((t, id) => t + 2 * (rOf(id) + SIDE_PAD), 0);
    R = Math.max(R, need / (TAU * 0.94));
    orbitRadii.push(R);
    const items: Item[] = ids.map((id) => {
      const p = sm.planets[id];
      const parentAngle = p.parent && p.parent !== "home" ? angleOf.get(p.parent) : undefined;
      return { id, want: parentAngle ?? homeAngle(id), width: 2 * Math.asin(Math.min(0.99, (rOf(id) + SIDE_PAD) / R)) };
    });
    const ang = spread(items);
    for (const id of ids) {
      const a = ang.get(id)!;
      angleOf.set(id, a);
      planets[id] = { x: Math.cos(a) * R, z: Math.sin(a) * R, r: rOf(id), orbitR: R, angle: a };
    }
    prevOuter = R + maxR;
  }
  return { home, planets, orbitRadii };
}

export { angDiff as angularDistance };

/** Moon radius as a fraction of its planet's radius. */
export const MOON_R = 0.16;
/** Outer-ring radius (planet radii) used by moonLayout for large counts; the single ring sits at MOON_RING. */
export const MOON_RING = 2.0;
export const MOON_RING_IN = 1.85;
export const MOON_RING_OUT = 2.45;
const MOON_SPLIT = 10;

/**
 * Static moon offsets in units of the planet radius, in a frame where the ring plane is xy (normal +z).
 * Up to 10 moons share one ring; more alternate between an inner and an outer ring.
 */
export function moonLayout(count: number): { x: number; y: number; z: number; ring: number; radius: number }[] {
  const out: { x: number; y: number; z: number; ring: number; radius: number }[] = [];
  if (count <= 0) return out;
  const two = count > MOON_SPLIT;
  const n0 = two ? Math.ceil(count / 2) : count, n1 = count - n0;
  for (let i = 0; i < count; i++) {
    const ring = two ? i % 2 : 0, k = two ? Math.floor(i / 2) : i, n = ring === 0 ? n0 : n1;
    const R = two ? (ring === 0 ? MOON_RING_IN : MOON_RING_OUT) : MOON_RING;
    const a = -Math.PI / 2 + (k + (ring === 1 ? 0.5 : 0)) * (TAU / n);
    out.push({ x: R * Math.cos(a), y: R * Math.sin(a), z: 0, ring, radius: R });
  }
  return out;
}
