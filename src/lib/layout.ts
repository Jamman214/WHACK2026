// Pure radial layout ported from whack-demo/reference/topic-atlas.html.
// No DOM, no rendering: takes the graph + bubble + strength threshold and returns
// rings, parents and target positions. Any renderer (SVG now, Three.js later) consumes this.
import type { Category, CategoryId, Link, Topic } from "../data/taxonomy";

export const MAP_W = 1400;
export const MAP_H = 1120;
export const CX = MAP_W / 2;
export const CY = MAP_H / 2 + 10;
export const OUTER = 470;
const TAU = Math.PI * 2;

export interface Edge { o: string; w: number; link: Link }
export interface Sector { a0: number; a1: number; mid: number }

export interface Model {
  topics: Topic[];
  links: Link[];
  byId: Record<string, Topic>;
  adj: Record<string, Edge[]>;
  sectors: Record<CategoryId, Sector>;
}

export interface PlacedTopic {
  id: string;
  /** 0 = in bubble, n = bridges away, Infinity = out of reach at this strength */
  ring: number;
  /** strongest link one ring closer in */
  parent: string | null;
  pw: number;
  x: number;
  y: number;
}

export interface Layout {
  nodes: Record<string, PlacedTopic>;
  /** bubble radius */
  rb: number;
  /** number of drawn rings (includes the out-of-reach ring when hasOut) */
  rings: number;
  hasOut: boolean;
  /** ringRadius[k] for k = 1..rings (index 0 unused) */
  ringRadius: number[];
}

export function buildModel(categories: Category[], links: Link[]): Model {
  const topics = categories.flatMap((c) => c.topics);
  const byId = Object.fromEntries(topics.map((t) => [t.id, t]));
  const adj: Record<string, Edge[]> = {};
  topics.forEach((t) => (adj[t.id] = []));
  links.forEach((l) => {
    adj[l.a].push({ o: l.b, w: l.w, link: l });
    adj[l.b].push({ o: l.a, w: l.w, link: l });
  });
  // Each cluster owns an angular sector sized by its topic count,
  // so a topic's direction always says which cluster it belongs to.
  const sectors = {} as Record<CategoryId, Sector>;
  let acc = -Math.PI / 2;
  categories.forEach((c) => {
    const span = (c.topics.length / topics.length) * TAU;
    sectors[c.id] = { a0: acc, a1: acc + span, mid: acc + span / 2 };
    acc += span;
  });
  return { topics, links, byId, adj, sectors };
}

export const norm = (a: number) => ((a % TAU) + TAU) % TAU;
export function blend(a: number, b: number, t: number) {
  const d = ((((b - a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return a + d * t;
}

interface ArcItem { id: string; want: number }

/** Spread items around a circle of radius r near their wanted angle, keeping a minimum gap. */
export function placeArc(items: ArcItem[], r: number, inner: boolean): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  if (!items.length) return out;
  if (r === 0) {
    items.forEach(({ id }) => (out[id] = { x: CX, y: CY }));
    return out;
  }
  const n = items.length;
  const gap = Math.min((inner ? 40 : 52) / r, TAU / n);
  const its = items.map((it) => ({ id: it.id, w: norm(it.want), a: 0 }));
  its.sort((x, y) => x.w - y.w);
  // start the sweep after the widest empty arc so wrap-around rarely collides
  let best = 0, bi = 0;
  for (let i = 0; i < n; i++) {
    const g = norm(its[(i + 1) % n].w - its[i].w) || TAU;
    if (g > best) { best = g; bi = (i + 1) % n; }
  }
  const seq = its.slice(bi).concat(its.slice(0, bi));
  const base = seq[0].w;
  seq.forEach((it, i) => {
    let w = it.w;
    if (w < base) w += TAU;
    it.a = i ? Math.max(w, seq[i - 1].a + gap) : w;
  });
  if (n > 1 && seq[n - 1].a - seq[0].a > TAU - gap) {
    seq.forEach((it, i) => (it.a = seq[0].a + (i * TAU) / n));
  } else {
    const shift = seq.reduce((s, it) => s + ((it.w < base ? it.w + TAU : it.w) - it.a), 0) / n;
    const room = TAU - gap - (seq[n - 1].a - seq[0].a);
    seq.forEach((it) => (it.a += Math.max(-room / 2, Math.min(room / 2, shift))));
  }
  its.forEach(({ id, a }) => (out[id] = { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r }));
  return out;
}

/** BFS from the bubble over links >= thr; parent = strongest link one ring closer in. */
export function layout(model: Model, knownIds: Iterable<string>, thr: number): Layout {
  const { topics, adj, byId, sectors } = model;
  const known = new Set([...knownIds].filter((id) => byId[id]));
  const nodes: Record<string, PlacedTopic> = {};
  topics.forEach((t) => (nodes[t.id] = { id: t.id, ring: Infinity, parent: null, pw: 0, x: CX, y: CY }));

  let q = [...known];
  q.forEach((id) => (nodes[id].ring = 0));
  while (q.length) {
    const nx: string[] = [];
    q.forEach((id) =>
      adj[id].forEach((e) => {
        if (e.w < thr) return;
        const o = nodes[e.o];
        if (o.ring === Infinity) { o.ring = nodes[id].ring + 1; nx.push(o.id); }
      }),
    );
    q = nx;
  }
  topics.forEach((t) => {
    const n = nodes[t.id];
    if (n.ring > 0 && n.ring < Infinity) {
      adj[t.id].forEach((e) => {
        const o = nodes[e.o];
        if (e.w >= thr && o.ring === n.ring - 1 && e.w > n.pw) { n.parent = o.id; n.pw = e.w; }
      });
    }
  });

  const all = Object.values(nodes);
  const maxR = Math.max(1, ...all.filter((n) => n.ring < Infinity).map((n) => n.ring));
  const hasOut = all.some((n) => n.ring === Infinity);
  const rings = maxR + (hasOut ? 1 : 0);
  const rb = 46 + 16 * Math.sqrt(known.size);
  const step = (OUTER - rb) / rings;
  const ringRadius = [0];
  for (let k = 1; k <= rings; k++) ringRadius.push(rb + step * (k - 0.35));

  const apply = (pos: Record<string, { x: number; y: number }>) =>
    Object.entries(pos).forEach(([id, p]) => Object.assign(nodes[id], p));

  // bubble members at their own cluster's angle
  const inBubble = topics.filter((t) => nodes[t.id].ring === 0);
  apply(placeArc(inBubble.map((t) => ({ id: t.id, want: sectors[t.category].mid })), known.size === 1 ? 0 : rb * 0.58, true));

  for (let k = 1; k <= rings; k++) {
    const inRing = topics.filter((t) => {
      const r = nodes[t.id].ring;
      return r === k || (hasOut && k === rings && r === Infinity);
    });
    const items = inRing.map((t) => {
      const sec = sectors[t.category].mid;
      const parent = nodes[t.id].parent;
      let want = sec;
      if (parent) {
        const p = nodes[parent];
        want = blend(sec, Math.atan2(p.y - CY, p.x - CX), 0.45);
      }
      return { id: t.id, want };
    });
    apply(placeArc(items, ringRadius[k], false));
  }

  return { nodes, rb, rings, hasOut, ringRadius };
}

/** Chain of topic ids from the bubble out to `id` (inclusive), following parents. */
export function pathTo(lay: Layout, id: string): string[] {
  const p: string[] = [];
  let cur: PlacedTopic | undefined = lay.nodes[id];
  while (cur) {
    p.unshift(cur.id);
    cur = cur.parent ? lay.nodes[cur.parent] : undefined;
  }
  return p;
}

/** Bubble topics first, then everything within `maxRing` bridges, nearest ring first. */
export function nearbyTopics(lay: Layout, maxRing: number): string[] {
  return Object.values(lay.nodes)
    .filter((n) => n.ring <= maxRing)
    .sort((a, b) => a.ring - b.ring)
    .map((n) => n.id);
}

/** Like pathTo, but null when the topic is out of reach at this strength. */
export function reachablePath(lay: Layout, id: string): string[] | null {
  const n = lay.nodes[id];
  return n && n.ring < Infinity ? pathTo(lay, id) : null;
}
