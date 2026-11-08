import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_BY_ID, LINKS, TOPIC_BY_ID, TOPICS, categoryColor } from "../data/taxonomy";
import { MODEL } from "../data/model";
import { CX, CY, MAP_H, MAP_W, OUTER, type Layout } from "../lib/layout";
import { TWEEN_MS, colOf, easeInOut, edgeStyle, nodeStyle, selection } from "../lib/atlasStyle";

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const catName = (id: string) => CATEGORY_BY_ID[TOPIC_BY_ID[id].category].name;

type Pos = Record<string, { x: number; y: number }>;

/** Tween node positions toward the layout's targets (650ms ease-in-out, as in the prototype). */
function useTweenedPositions(targets: Layout["nodes"]): Pos {
  const start = () => Object.fromEntries(TOPICS.map((t) => [t.id, { x: CX, y: CY }]));
  const [pos, setPos] = useState<Pos>(start);
  const cur = useRef<Pos>(pos);
  useEffect(() => {
    const from = cur.current, t0 = performance.now(), D = reduceMotion() ? 0 : TWEEN_MS;
    let raf = 0;
    const step = (now: number) => {
      const k = D ? Math.min(1, (now - t0) / D) : 1;
      const e = easeInOut(k);
      const next: Pos = {};
      for (const id in targets) {
        const f = from[id], t = targets[id];
        next[id] = { x: f.x + (t.x - f.x) * e, y: f.y + (t.y - f.y) * e };
      }
      cur.current = next;
      setPos(next);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [targets]);
  return pos;
}

/** viewBox fitting the given nodes (zoomed in at most 2x), kept inside the map bounds. */
function frame(lay: Layout, ids: string[]) {
  const pts = ids.map((id) => lay.nodes[id]).filter(Boolean);
  if (!pts.length) return null;
  const pad = 150, xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  let w = Math.max(x1 - x0, MAP_W / 2), h = Math.max(y1 - y0, MAP_H / 2);
  if (w / h > MAP_W / MAP_H) h = (w * MAP_H) / MAP_W; else w = (h * MAP_W) / MAP_H;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  return { x: clamp((x0 + x1) / 2 - w / 2, MAP_W - w), y: clamp((y0 + y1) / 2 - h / 2, MAP_H - h), w, h };
}

export interface AtlasViewProps {
  lay: Layout;
  thr: number;
  sel: string | null;
  names: "near" | "all";
  onSelect: (id: string) => void;
}

/** The flat SVG map: the original renderer, kept as the fallback when WebGL is unavailable. */
export default function AtlasSvg({ lay, thr, sel, names, onSelect, viewIds }: AtlasViewProps & { viewIds: string[] | null }) {
  const pos = useTweenedPositions(lay.nodes);
  // framed once, on the layout at the time the view was requested (as the original did)
  const view = useMemo(() => (viewIds?.length ? frame(lay, viewIds) : null), [viewIds]);
  const { onPath, pathEdges } = selection(lay, sel);

  return (
    <svg className="atlas__svg" preserveAspectRatio="xMidYMid meet" viewBox={view ? `${view.x} ${view.y} ${view.w} ${view.h}` : `0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label="Radial map: your known topics in the centre, other topics placed by bridge distance">
      <g>
        {lay.ringRadius.slice(1).map((r, i) => {
          const k = i + 1, out = lay.hasOut && k === lay.rings;
          return (
            <g key={k}>
              <circle cx={CX} cy={CY} r={r} className="ring" />
              <text x={CX} y={CY - r - 8} textAnchor="middle" className="ringlbl">
                {out ? "Out of reach at this strength" : k === 1 ? "Frontier · 1 bridge" : k + " bridges"}
              </text>
            </g>
          );
        })}
      </g>
      <circle cx={CX} cy={CY} r={lay.rb} className="bubble" />
      <g>
        {LINKS.map((l) => {
          const s = edgeStyle(l, lay, thr, sel, pathEdges);
          const pa = pos[l.a], pb = pos[l.b];
          return (
            <line key={l.a + "|" + l.b} className="edge" x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
              style={{ opacity: s.op, strokeWidth: s.w, strokeDasharray: s.dash, stroke: s.col }} />
          );
        })}
      </g>
      <g>
        {TOPICS.map((t) => {
          const p = pos[t.id], s = nodeStyle(lay, t.id, sel, onPath, names);
          const right = p.x >= CX;
          return (
            <g key={t.id} className={"node" + (s.known ? " known" : "") + (t.id === sel ? " sel" : "")}
              tabIndex={0} role="button" aria-label={`${t.name}, ${catName(t.id)}`}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(t.id); } }}>
              <circle cx={p.x} cy={p.y} r={s.r} style={{ fill: colOf(t.id), opacity: s.discOp }} />
              <text x={p.x + (right ? 12 : -12)} y={p.y + 4} textAnchor={right ? "start" : "end"} style={{ opacity: s.nameOp }}>
                {t.name}
              </text>
            </g>
          );
        })}
      </g>
      <g>
        <text x={CX} y={CY - lay.rb - 10} textAnchor="middle" className="bubblelbl">Your bubble</text>
        {CATEGORIES.map((c) => {
          const a = MODEL.sectors[c.id].mid, r = OUTER + 52, cos = Math.cos(a);
          return (
            <text key={c.id} x={CX + cos * r} y={CY + Math.sin(a) * r + 4} className="clabel"
              textAnchor={Math.abs(cos) < 0.25 ? "middle" : cos > 0 ? "start" : "end"} style={{ fill: categoryColor(c.id) }}>
              {c.name}
            </text>
          );
        })}
      </g>
    </svg>
  );
}
