// Styling rules for the Topic Atlas, shared by the Three.js scene and the SVG fallback so the
// two renderers can never drift apart. Pure: colours come back as CSS `var(--token)` strings
// which the SVG uses directly and the 3D scene resolves against the page's computed style.
import { TOPIC_BY_ID, categoryColor, type Link } from "../data/taxonomy";
import { pathTo, type Layout } from "./layout";

export const edgeKey = (a: string, b: string) => (a < b ? a + "|" + b : b + "|" + a);
export const colOf = (id: string) => categoryColor(TOPIC_BY_ID[id].category);

/** 650ms ease-in-out, as in the prototype. */
export const TWEEN_MS = 650;
export const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export interface Selection { onPath: Set<string>; pathEdges: Set<string> }

export function selection(lay: Layout, sel: string | null): Selection {
  const path = sel ? pathTo(lay, sel) : [];
  return { onPath: new Set(path), pathEdges: new Set(path.slice(1).map((id, i) => edgeKey(path[i], id))) };
}

export interface EdgeStyle {
  /** 0 = hidden (below the strength threshold) */
  op: number;
  /** stroke width in map units */
  w: number;
  /** SVG dash array ("" = solid) */
  dash: string;
  /** a CSS colour or var(--token) */
  col: string;
}

export function edgeStyle(l: Link, lay: Layout, thr: number, sel: string | null, pathEdges: Set<string>): EdgeStyle {
  const A = lay.nodes[l.a], B = lay.nodes[l.b];
  const tree = A.parent === l.b || B.parent === l.a, inside = A.ring === 0 && B.ring === 0;
  const hot = pathEdges.has(edgeKey(l.a, l.b)), touchSel = sel && (l.a === sel || l.b === sel);
  const child = A.parent === l.b ? A : B;
  let op = 0, w = 1, dash = "", col = "var(--edge)";
  if (l.w >= thr) {
    if (hot) { op = 0.95; w = 2 + l.w * 4; col = colOf(child.id); }
    else if (tree) { op = 0.25 + l.w * 0.45; w = 1 + l.w * 2.6; col = colOf(child.id); }
    else if (inside) { op = 0.35; w = 1 + l.w * 2; col = "var(--accent)"; }
    else if (touchSel) { op = 0.35; w = 1 + l.w * 1.5; dash = "3 4"; }
    else { op = 0.05; w = 0.6; }
  }
  return { op, w, dash, col };
}

export interface NodeStyle {
  /** radius in map units */
  r: number;
  known: boolean;
  /** highlighted: on the selected path or the selection itself */
  focus: boolean;
  /** opacity of the disc when not highlighted */
  fog: number;
  /** disc opacity */
  discOp: number;
  showName: boolean;
  /** label opacity (0 when the name is hidden) */
  nameOp: number;
}

export function nodeStyle(lay: Layout, id: string, sel: string | null, onPath: Set<string>, names: "near" | "all"): NodeStyle {
  const n = lay.nodes[id];
  const out = n.ring === Infinity;
  const fog = n.ring === 0 ? 1 : out ? 0.22 : Math.max(0.3, 1 - (n.ring - 1) * 0.22);
  const focus = onPath.has(id) || id === sel;
  const showName = names === "all" || n.ring <= 1 || focus;
  return {
    r: n.ring === 0 ? 9 : 7,
    known: n.ring === 0,
    focus,
    fog,
    discOp: focus ? 1 : fog,
    showName,
    nameOp: showName ? (focus ? 1 : Math.max(fog, 0.55)) : 0,
  };
}

// ---------- 3D planet map (additive; the 2D exports above are unchanged) ----------

/** How loudly a link is drawn: the path from your bubble to the selection > links touching the
 *  selected/hovered topic > the strongest-parent "tree" links > everything else. */
export type EdgeTier = "path" | "focus" | "tree" | "bg" | "hidden";

export interface EdgeStyle3d {
  tier: EdgeTier;
  /** 0..1 */
  op: number;
  /** line width in CSS px at the reference viewing distance */
  px: number;
  /** draw order, higher on top */
  order: number;
}

/** Link weights in the data run from about 0.2 to 0.95; this maps them to 0..1 for width and opacity. */
const wNorm = (w: number) => Math.max(0, Math.min(1, (w - 0.2) / 0.75));

export function edgeStyle3d(
  l: Link, lay: Layout, thr: number, sel: string | null, pathEdges: Set<string>, hover: string | null,
): EdgeStyle3d {
  if (l.w < thr) return { tier: "hidden", op: 0, px: 0, order: 0 };
  const A = lay.nodes[l.a], B = lay.nodes[l.b], k = wNorm(l.w);
  if (pathEdges.has(edgeKey(l.a, l.b))) return { tier: "path", op: 0.96, px: 3.4 + k * 2.2, order: 4 };
  const touches = (id: string | null) => !!id && (l.a === id || l.b === id);
  if (touches(sel) || touches(hover)) return { tier: "focus", op: 0.6 + k * 0.25, px: 1.9 + k * 1.5, order: 3 };
  if (A.parent === l.b || B.parent === l.a) return { tier: "tree", op: 0.3 + k * 0.2, px: 1.15 + k * 0.9, order: 2 };
  return { tier: "bg", op: 0.1 + k * 0.08, px: 0.9 + k * 0.3, order: 1 };
}

/** Screen-reader wording for how far a topic is from the bubble. */
export function ringPhrase(ring: number): string {
  if (ring === 0) return "in your bubble";
  if (ring === Infinity) return "out of reach at this strength";
  return ring === 1 ? "1 bridge from your bubble" : `${ring} bridges from your bubble`;
}

// ---------- solar-system Atlas (additive) ----------

/** "1 step out" / "3 steps out" / "Out of reach": the label of an orbit. */
export function orbitLabel(orbit: number): string {
  if (!Number.isFinite(orbit)) return "Out of reach";
  return orbit === 1 ? "1 step out" : `${orbit} steps out`;
}

/** Screen-reader wording for how far a topic is from your bubble, in the Atlas' "steps out" language. */
export function stepsPhrase(ring: number): string {
  if (ring === 0) return "in your bubble";
  if (ring === Infinity) return "out of reach at this strength";
  return ring === 1 ? "1 step out from your bubble" : `${ring} steps out from your bubble`;
}
