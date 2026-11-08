import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CATEGORIES, CATEGORY_BY_ID, LINKS, TOPIC_BY_ID, TOPICS, categoryColor } from "../data/taxonomy";
import { DEFAULT_STRENGTH, MODEL } from "../data/model";
import { CX, CY, MAP_H, MAP_W, OUTER, layout, pathTo, type Layout } from "../lib/layout";

const STRENGTHS: [string, number][] = [["Strong", 0.75], ["Related", 0.5], ["Loose", 0.3], ["All", 0]];
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const edgeKey = (a: string, b: string) => (a < b ? a + "|" + b : b + "|" + a);
const colOf = (id: string) => categoryColor(TOPIC_BY_ID[id].category);
const catName = (id: string) => CATEGORY_BY_ID[TOPIC_BY_ID[id].category].name;

type Pos = Record<string, { x: number; y: number }>;

/** Tween node positions toward the layout's targets (650ms ease-in-out, as in the prototype). */
function useTweenedPositions(targets: Layout["nodes"]): Pos {
  const start = () => Object.fromEntries(TOPICS.map((t) => [t.id, { x: CX, y: CY }]));
  const [pos, setPos] = useState<Pos>(start);
  const cur = useRef<Pos>(pos);
  useEffect(() => {
    const from = cur.current, t0 = performance.now(), D = reduceMotion() ? 0 : 650;
    let raf = 0;
    const step = (now: number) => {
      const k = D ? Math.min(1, (now - t0) / D) : 1;
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
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

/** Open the map with `sel` selected (path highlighted) and the view framed on `center`. */
export interface AtlasFocus { sel: string | null; center: string[] }

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

interface Props {
  focus?: AtlasFocus;
  /** The bubble. Owned by the parent so the feed and the map stay in sync. */
  bubble: string[];
  onBubbleChange: (bubble: string[]) => void;
  /** What "Reset to starting bubble" returns to (the onboarding result). */
  initialBubble: string[];
  onRedo: () => void;
}

export default function Atlas({ focus, bubble, onBubbleChange, initialBubble, onRedo }: Props) {
  const known = useMemo(() => new Set(bubble), [bubble]);
  const setKnown = (k: Set<string>) => onBubbleChange([...k]);
  const [thr, setThr] = useState(DEFAULT_STRENGTH);
  const [sel, setSel] = useState<string | null>(focus?.sel ?? null);
  const [names, setNames] = useState<"near" | "all">("near");

  const lay = useMemo(() => layout(MODEL, known, thr), [known, thr]);
  const pos = useTweenedPositions(lay.nodes);
  const [view, setView] = useState(() => (focus?.center.length ? frame(lay, focus.center) : null));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(null); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const selPath = sel ? pathTo(lay, sel) : [];
  const onPath = new Set(selPath);
  const pathEdges = new Set(selPath.slice(1).map((id, i) => edgeKey(selPath[i], id)));

  const add = (id: string) => setKnown(new Set([...known, id]));
  const remove = (id: string) => { const k = new Set(known); k.delete(id); setKnown(k); };
  const reset = () => { setKnown(new Set(initialBubble)); setSel(null); };

  return (
    <div className="screen theme-atlas fade">
      <div className="wrap">
        <header>
          <div>
            <h1>Topic Atlas</h1>
            <p className="sub">
              Your bubble sits in the middle. Every other topic is placed by how many bridges it takes to reach it from
              what you already know. Add a topic to your bubble and the map redraws around you.
            </p>
          </div>
          <div className="controls">
            <Seg label="Bridges allowed" options={STRENGTHS} value={thr} onChange={setThr} />
            <Seg label="Topic names" options={[["Nearby", "near"], ["All", "all"]] as const} value={names} onChange={setNames} />
            <button className="link" onClick={onRedo}>Redo onboarding</button>
          </div>
        </header>

        <div className="main">
          <div className="map">
            {view && <button className="btn mapzoom" onClick={() => setView(null)}>Show whole map</button>}
            <svg viewBox={view ? `${view.x} ${view.y} ${view.w} ${view.h}` : `0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label="Radial map: your known topics in the centre, other topics placed by bridge distance">
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
                  const pa = pos[l.a], pb = pos[l.b];
                  return (
                    <line key={l.a + "|" + l.b} className="edge" x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                      style={{ opacity: op, strokeWidth: w, strokeDasharray: dash, stroke: col }} />
                  );
                })}
              </g>
              <g>
                {TOPICS.map((t) => {
                  const n = lay.nodes[t.id], p = pos[t.id];
                  const out = n.ring === Infinity;
                  const fog = n.ring === 0 ? 1 : out ? 0.22 : Math.max(0.3, 1 - (n.ring - 1) * 0.22);
                  const focus = onPath.has(t.id) || t.id === sel;
                  const showName = names === "all" || n.ring <= 1 || focus;
                  const right = p.x >= CX;
                  return (
                    <g key={t.id} className={"node" + (n.ring === 0 ? " known" : "") + (t.id === sel ? " sel" : "")}
                      tabIndex={0} role="button" aria-label={`${t.name}, ${catName(t.id)}`}
                      onClick={() => setSel(t.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(t.id); } }}>
                      <circle cx={p.x} cy={p.y} r={n.ring === 0 ? 9 : 7} style={{ fill: colOf(t.id), opacity: focus ? 1 : fog }} />
                      <text x={p.x + (right ? 12 : -12)} y={p.y + 4} textAnchor={right ? "start" : "end"}
                        style={{ opacity: showName ? (focus ? 1 : Math.max(fog, 0.55)) : 0 }}>
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
          </div>
          <aside>
            <div className="panel">
              <Meter known={known.size} />
              {sel ? (
                <Detail id={sel} lay={lay} thr={thr} known={known} select={setSel} add={add} remove={remove} />
              ) : (
                <Overview lay={lay} known={known} select={setSel} reset={reset} />
              )}
            </div>
            <p className="note">
              Distance is the fewest bridges from your bubble using links at or above the chosen strength. Each topic hangs
              off its strongest link one ring closer in. Weights are hand-estimated placeholders for embedding similarity.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Seg<T extends string | number>({ label, options, value, onChange }: {
  label: string; options: readonly (readonly [string, T])[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="seg-wrap">
      <span className="seg-label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map(([name, v]) => (
          <button key={name} aria-pressed={v === value} onClick={() => onChange(v)}>{name}</button>
        ))}
      </div>
    </div>
  );
}

function Meter({ known }: { known: number }) {
  const pct = Math.round((known / TOPICS.length) * 100);
  return (
    <div className="meter">
      <div className="top"><span>World explored</span><span><strong>{pct}%</strong></span></div>
      <div className="track"><b style={{ width: pct + "%" }} /></div>
      <span className="note">{known} of {TOPICS.length} topics in your bubble</span>
    </div>
  );
}

function Row({ name, sub, w, col, onClick }: { name: string; sub?: string; w: number; col: string; onClick?: () => void }) {
  return (
    <li onClick={onClick}>
      <span className="nm">{name}{sub && <small>{sub}</small>}</span>
      <span className="bar"><b style={{ width: w * 100 + "%", background: col }} /></span>
      <span className="val">{w ? w.toFixed(2) : ""}</span>
    </li>
  );
}

function Sec({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <div className="sec">
      <h3>{title}</h3>
      <ul>{children.length ? children : <li className="empty plain">{empty}</li>}</ul>
    </div>
  );
}

function Overview({ lay, known, select, reset }: { lay: Layout; known: Set<string>; select: (id: string) => void; reset: () => void }) {
  const frontier = Object.values(lay.nodes).filter((n) => n.ring === 1).sort((a, b) => b.pw - a.pw).slice(0, 8);
  return (
    <>
      <h2>Your bubble</h2>
      <Sec title="What you know" empty="">
        {[...known].map((id) => <Row key={id} name={TOPIC_BY_ID[id].name} sub={catName(id)} w={0} col={colOf(id)} onClick={() => select(id)} />)}
      </Sec>
      <Sec title="Frontier: one bridge away" empty="Nothing reachable at this strength. Allow looser bridges.">
        {frontier.map((n) => (
          <Row key={n.id} name={TOPIC_BY_ID[n.id].name} sub={"from " + TOPIC_BY_ID[n.parent!].name} w={n.pw} col={colOf(n.id)} onClick={() => select(n.id)} />
        ))}
      </Sec>
      <div className="btnrow"><button className="btn" onClick={reset}>Reset to starting bubble</button></div>
    </>
  );
}

function Detail({ id, lay, thr, known, select, add, remove }: {
  id: string; lay: Layout; thr: number; known: Set<string>;
  select: (id: string | null) => void; add: (id: string) => void; remove: (id: string) => void;
}) {
  const t = TOPIC_BY_ID[id], n = lay.nodes[id];
  let body: ReactNode;
  if (n.ring === 0) {
    const out = MODEL.adj[id].filter((e) => e.w >= thr && lay.nodes[e.o].ring === 1).sort((a, b) => b.w - a.w);
    body = (
      <>
        <span className="kicker">In your bubble</span>
        <Sec title="Bridges out from here" empty="No bridges out at this strength.">
          {out.map((e) => <Row key={e.o} name={TOPIC_BY_ID[e.o].name} sub={catName(e.o)} w={e.w} col={colOf(e.o)} onClick={() => select(e.o)} />)}
        </Sec>
      </>
    );
  } else if (n.ring === Infinity) {
    body = (
      <>
        <span className="kicker">Out of reach</span>
        <p className="empty">No chain of bridges reaches this topic at the current strength. Allow looser bridges to find a route.</p>
      </>
    );
  } else {
    body = (
      <>
        <span className="kicker">{n.ring === 1 ? "Frontier · 1 bridge away" : n.ring + " bridges away"}</span>
        <div className="sec">
          <h3>How you get here</h3>
          <ol className="path">
            {pathTo(lay, id).map((s, i) => (
              <li key={s} onClick={() => select(s)}>
                <span className="dot" style={{ background: colOf(s) }} />
                <span className="nm">{TOPIC_BY_ID[s].name}<small>{i === 0 ? "You know this" : catName(s)}</small></span>
                <span className="val">{i ? lay.nodes[s].pw.toFixed(2) : ""}</span>
              </li>
            ))}
          </ol>
        </div>
      </>
    );
  }
  return (
    <>
      <span className="chip"><i style={{ background: colOf(id) }} /><span>{catName(id)}</span></span>
      <h2>{t.name}</h2>
      {body}
      <div className="btnrow">
        {n.ring !== 0 ? (
          <button className="btn primary" onClick={() => add(id)}>Add to my bubble</button>
        ) : known.size > 1 ? (
          <button className="btn" onClick={() => remove(id)}>Remove from bubble</button>
        ) : null}
        <button className="btn" onClick={() => select(null)}>Back to overview</button>
      </div>
    </>
  );
}
