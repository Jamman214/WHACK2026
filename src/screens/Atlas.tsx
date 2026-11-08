import {
  useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties,
} from "react";
import { CATEGORY_BY_ID, TOPIC_BY_ID, TOPICS } from "../data/taxonomy";
import { DEFAULT_STRENGTH, MODEL } from "../data/model";
import { PLANET_INFO } from "../data/planets";
import type { NewsProvider } from "../feed";
import { layout, pathTo } from "../lib/layout";
import { solarModel } from "../lib/solar";
import AtlasScene, { webglAvailable } from "./AtlasScene";
import AtlasSvg from "./AtlasSvg";
import Search from "./atlas/Search";
import Toast from "./atlas/Toast";
import { loadStart, saveBubble } from "../lib/bubbleStore";
import { HomePanel, Overview, PlanetPanel, type PanelCtx } from "./atlas/Panels";
import {
  HOME_NAME, SAME_INSETS, catOf, planetName, plural, stepsOut, topicName, type Insets, type PlanetKey,
} from "./atlas/util";
import "./atlas.css";

/** The one bridge strength ("Related") shared by the map, the mini-map and the feed. */
const THR = DEFAULT_STRENGTH;
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Open the map on the planet `sel` lives on, with `sel` selected. */
export interface AtlasFocus { sel: string | null; center: string[] }

interface Props {
  focus?: AtlasFocus;
  /** The bubble. Owned by the parent so the feed and the map stay in sync. */
  bubble: string[];
  onBubbleChange: (bubble: string[]) => void;
  /** What "Reset to starting bubble" returns to (the onboarding result). */
  initialBubble: string[];
  /** Kept for the parent; "Redo onboarding" now lives on the feed. */
  onRedo?: () => void;
  /** Same news source as the feed, so a planet's stories match what the feed would show. */
  provider: NewsProvider;
  /** Leave the map and go back to the feed. When given, the map shows its own "Back to feed" button. */
  onClose?: () => void;
}

function useMedia(query: string) {
  const [m, setM] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [query]);
  return m;
}

/** The flat fallback map is small at full panel clearance, so on wide screens let it run half-way under the panels. */
const svgInset = (i: Insets, mobile: boolean): CSSProperties => {
  const k = mobile ? 1 : 0.5;
  return { inset: `${i.top}px ${i.right * k}px ${i.bottom}px ${i.left * k}px` };
};

/*
 * Navigation state: three levels, two variables.
 *   planet = null            Map      (overview: where to next)
 *   planet = "home" | cat    Planet   (your knowledge, or one category)
 *   planet + sel             Topic    (one topic expanded inside its planet; `sel` always belongs to `planet`)
 */
export default function Atlas({ focus, bubble, onBubbleChange, initialBubble, provider, onClose }: Props) {
  const known = useMemo(() => new Set(bubble), [bubble]);
  const setKnown = (k: Set<string>) => onBubbleChange([...k]);
  const lay = useMemo(() => layout(MODEL, known, THR), [known]);
  const sm = useMemo(() => solarModel(lay, MODEL), [lay]);

  const focusSel = focus?.sel && TOPIC_BY_ID[focus.sel] ? focus.sel : null;
  const [planet, setPlanet] = useState<PlanetKey | null>(() => (focusSel ? catOf(focusSel) : null));
  const [sel, setSel] = useState<string | null>(focusSel);
  // What the camera frames: topic ids (a fresh object re-triggers the fly-to), or null for the whole map.
  const [view, setView] = useState<{ ids: string[] | null }>(() => ({
    ids: focus?.center.length ? focus.center : focusSel ? [focusSel, ...pathTo(lay, focusSel)] : null,
  }));
  const [moved, setMoved] = useState(false);
  // Bumped by Map: the 3D scene flies back to its default overview framing.
  const [recenter, setRecenter] = useState(0);

  // WebGL scene by default; the flat SVG when WebGL is missing or fails to start.
  const [gl, setGl] = useState(webglAvailable);
  const mobile = useMedia("(max-width: 767px)");
  const [panelOpen, setPanelOpen] = useState(() => !matchMedia("(max-width: 767px)").matches || !!focusSel);
  const [searchOpen, setSearchOpen] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [toast, setToast] = useState<{ id: number; message: string; prev: string[] } | null>(null);
  const toastId = useRef(0);
  const dismissToast = useCallback(() => setToast(null), []);
  const [fresh, setFresh] = useState<string | null>(null); // topic just added: briefly highlighted

  const rootRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // --- navigation ---
  const openPlanet = useCallback((id: PlanetKey) => {
    setPlanet(id); setSel(null); setMoved(false); setPanelOpen(true);
    setView({ ids: id === "home" ? [...known] : CATEGORY_BY_ID[id].topics.map((t) => t.id) });
    if (id === "home") setAnnounce("Your knowledge, the centre of the map. Details are in the side panel.");
    else {
      const p = sm.planets[id];
      const far = !Number.isFinite(p.orbit) ? "Out of reach" : p.complete ? "Fully explored" : stepsOut(p.orbit);
      setAnnounce(`${planetName(id)} planet. ${PLANET_INFO[id].tagline}. ${far}. ${p.explored.length} of ${p.topics.length} explored. Details are in the side panel.`);
    }
  }, [sm, known]);
  const openTopic = useCallback((id: string) => {
    setPlanet(catOf(id)); setSel(id); setMoved(false); setPanelOpen(true);
    setView({ ids: [id, ...pathTo(lay, id)] });
    const ring = lay.nodes[id].ring;
    setAnnounce(`${topicName(id)}, ${planetName(catOf(id))} planet, ${ring === 0 ? "in your bubble" : Number.isFinite(ring) ? stepsOut(ring) : "out of reach"}. Details are in the side panel.`);
  }, [lay]);
  const toggleTopic = useCallback((id: string) => {
    if (sel === id) { setSel(null); setAnnounce(`${topicName(id)} closed.`); } else openTopic(id);
  }, [sel, openTopic]);
  const goMap = useCallback(() => {
    setPlanet(null); setSel(null); setMoved(false); setView({ ids: null }); setRecenter((n) => n + 1);
    setAnnounce("Back to the whole map.");
  }, []);

  // Panel actions re-render the panel under the pointer. If that dropped focus on <body>, bring it back
  // to the panel's heading so keyboard and screen-reader users aren't stranded.
  const [focusTick, setFocusTick] = useState(0);
  const toPanel = useCallback(() => setFocusTick((t) => t + 1), []);
  useEffect(() => {
    if (!focusTick) return;
    const a = document.activeElement;
    if (!a || a === document.body || !a.isConnected) bodyRef.current?.querySelector<HTMLElement>("[data-focus]")?.focus({ preventScroll: true });
  }, [focusTick]);

  useEffect(() => { saveBubble(bubble); }, [bubble]);

  // --- browser history: one entry per level (Map 1, Planet 2, Topic 3) so Back climbs the same ladder as Esc ---
  const depth = sel ? 3 : planet ? 2 : 1;
  const hd = useRef(0);   // how many history entries this map has pushed
  const skip = useRef(0); // popstate events we caused ourselves
  const hasClose = !!onClose;
  useEffect(() => {
    if (!hasClose) return;
    try {
      if (depth > hd.current) {
        for (let n = hd.current + 1; n <= depth; n++) history.pushState({ atlas: n }, "");
        hd.current = depth;
      } else if (depth < hd.current) {
        skip.current++; const d = depth - hd.current; hd.current = depth; history.go(d);
      }
    } catch { /* history unavailable: Esc and the buttons still work */ }
  }, [depth, hasClose]);

  // New level: start at the top. New topic: scroll it into view inside the panel.
  // Only the panel body scrolls: scrollIntoView would also scroll the clipped .ov-side and hide the meter.
  const lastPlanet = useRef(planet);
  useEffect(() => {
    const body = bodyRef.current;
    if (body && (!sel || lastPlanet.current !== planet)) body.scrollTop = 0;
    lastPlanet.current = planet;
  }, [planet, sel]);
  useEffect(() => {
    const body = bodyRef.current, el = body?.querySelector<HTMLElement>(".topic[data-sel]");
    if (!body || !el) return;
    const top = body.scrollTop + el.getBoundingClientRect().top - body.getBoundingClientRect().top - 8;
    body.scrollTo({ top: Math.max(0, top), behavior: reduceMotion() ? "auto" : "smooth" });
  }, [sel, planet]);

  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), 2600);
    return () => clearTimeout(t);
  }, [fresh]);
  const add = useCallback((id: string) => {
    if (known.has(id)) return;
    const next = new Set([...known, id]);
    const after = layout(MODEL, next, THR);
    const n = TOPICS.filter((t) => after.nodes[t.id].ring === 1 && lay.nodes[t.id].ring !== 1).length;
    const tail = n === 0 ? "" : n === 1 ? " · 1 topic is now one step away" : ` · ${n} topics now one step away`;
    setKnown(next); setFresh(id);
    setToast({ id: ++toastId.current, message: `Added ${topicName(id)}${tail}`, prev: bubble });
    toPanel();
  }, [known, bubble, lay]); // eslint-disable-line react-hooks/exhaustive-deps
  const remove = useCallback((id: string) => {
    const next = new Set(known); next.delete(id);
    const after = layout(MODEL, next, THR);
    const n = TOPICS.filter((t) => t.id !== id && after.nodes[t.id].ring > lay.nodes[t.id].ring).length;
    const tail = n === 0 ? "" : ` · ${n} ${plural(n, "topic", "topics")} moved further away`;
    setKnown(next);
    setToast({ id: ++toastId.current, message: `Removed ${topicName(id)}${tail}`, prev: bubble });
    toPanel();
  }, [known, bubble, lay]); // eslint-disable-line react-hooks/exhaustive-deps
  const reset = () => {
    setToast({ id: ++toastId.current, message: "Bubble reset to where you started.", prev: bubble });
    onBubbleChange(loadStart() ?? initialBubble); setSel(null); setFresh(null); toPanel();
  };
  const undo = () => {
    if (toast) { onBubbleChange(toast.prev); setFresh(null); setAnnounce("Undone. Your bubble is back as it was."); }
    setToast(null); toPanel();
  };

  // From the panels: navigate, then rescue focus if the clicked control went away.
  const ctx: PanelCtx = {
    lay, sm, known, provider,
    openPlanet: (id) => { openPlanet(id); toPanel(); },
    openTopic: (id) => { openTopic(id); toPanel(); },
    toggleTopic,
    add, remove,
    goMap: () => { goMap(); toPanel(); },
    reset, fresh,
  };
  const close = useCallback(() => {
    try {
      if (hd.current > 0) { const n = hd.current; hd.current = 0; skip.current++; history.go(-n); }
    } catch { /* ignore */ }
    onClose?.();
  }, [onClose]);
  const leaveTopic = () => { setSel(null); setAnnounce("Topic closed."); toPanel(); };

  // --- Esc: close search, clear the topic, leave the planet, and only then leave the map ---------------
  // Capture phase + stopPropagation so Feed's own Esc handler doesn't also close the sheet.
  const st = useRef({ sel, planet, searchOpen, onClose: onClose ? close : undefined, depth });
  st.current = { sel, planet, searchOpen, onClose: onClose ? close : undefined, depth };
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "Escape") {
        const s = st.current;
        if (s.searchOpen) setSearchOpen(false);
        else if (s.sel) { setSel(null); setAnnounce("Topic closed."); toPanel(); }
        else if (s.planet) { goMap(); toPanel(); }
        else if (s.onClose) s.onClose();
        else return;
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !t?.closest("input,textarea,select,[contenteditable]")) {
        e.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      }
    };
    addEventListener("keydown", onKey, true);
    return () => removeEventListener("keydown", onKey, true);
  }, [goMap, toPanel]);

  // Browser Back / Forward: land on the level the entry stands for.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (skip.current > 0) { skip.current--; return; }
      const target: number = e.state?.atlas ?? 0;
      const cur = st.current.depth;
      hd.current = target;
      if (target === 0) { st.current.onClose?.(); return; }
      if (target < cur) {
        if (target === 1) { goMap(); } else { setSel(null); setAnnounce("Topic closed."); }
        toPanel();
      } else if (target > cur) {
        // Forward to a level we can't rebuild: stay put and drop the extra entry.
        skip.current++; hd.current = cur; history.go(cur - target);
      }
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [goMap, toPanel]);

  // --- tell the scene how much of the canvas the overlays cover -------------------------------------
  const [insets, setInsets] = useState<Insets>({ top: 0, right: 0, bottom: 0, left: 0 });
  useLayoutEffect(() => {
    const root = rootRef.current, tl = tlRef.current, side = sideRef.current;
    if (!root || !tl || !side) return;
    const G = 12;
    const measure = () => {
      const r = root.getBoundingClientRect(), a = tl.getBoundingClientRect(), s = side.getBoundingClientRect();
      const next: Insets = mobile
        ? { top: Math.round(a.bottom - r.top + G), right: 0, bottom: Math.round(r.bottom - s.top + G), left: 0 }
        : { top: 0, right: Math.round(r.right - s.left + G), bottom: 0, left: Math.round(a.right - r.left + G) };
      setInsets((p) => (SAME_INSETS(p, next) ? p : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    [root, tl, side].forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [mobile]);

  const vars = {
    "--in-t": insets.top + "px", "--in-r": insets.right + "px", "--in-b": insets.bottom + "px", "--in-l": insets.left + "px",
  } as CSSProperties;
  const bodyId = useId();
  const pct = Math.round((known.size / TOPICS.length) * 100);
  const panelLabel = planet === null ? "Map" : planetName(planet);

  return (
    <div ref={rootRef} className="screen theme-atlas atlas fade" style={vars}>
      <div className="atlas__ui">
        {/* top-left, in reading order: the way out (feed), the way up (crumbs), then the topic finder */}
        <div className="ov-tl" ref={tlRef}>
          <section className="ov ov-head" aria-labelledby="atlas-title">
            {onClose && (
              <button type="button" className="at-back" data-autofocus onClick={close}>
                <span aria-hidden="true" className="at-back__arrow">←</span>
                <span>Back to your feed</span>
                <kbd aria-hidden="true">Esc</kbd>
              </button>
            )}
            <div className="ov-head__text">
              <h1 id="atlas-title">Topic Atlas</h1>
              <p className="sub">You are the sun. The further out a planet orbits, the further it is from what you know.</p>
            </div>
          </section>

          <div className="ov ov-crumb">
            <button type="button" className="at-home" data-moved={moved || undefined} onClick={ctx.goMap}
              title="Show the whole map">
              <span aria-hidden="true">⌂</span> Home<span className="sr-only">: show the whole map</span>
            </button>
            <Crumbs planet={planet} sel={sel} mobile={mobile} goMap={ctx.goMap} leaveTopic={leaveTopic} />
          </div>

          <Search lay={lay} open={searchOpen} setOpen={setSearchOpen} inputRef={searchRef} onPick={openTopic} onAdd={add} />
        </div>

        {/* right (desktop) / bottom sheet (mobile): progress + the panel for the current level */}
        <aside ref={sideRef} className="ov ov-side" aria-label={`${panelLabel}: your bubble and details`} data-open={panelOpen}>
          <div className="side__bar">
            <div className="meter">
              <div className="top"><span>World explored</span><strong>{pct}%</strong></div>
              <div className="track" role="progressbar" aria-label="World explored" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><b style={{ width: pct + "%" }} /></div>
              <span className="note">{known.size} of {TOPICS.length} topics in your bubble</span>
            </div>
            <button type="button" className="at-btn at-toggle" aria-expanded={panelOpen} aria-controls={bodyId} onClick={() => setPanelOpen((o) => !o)}>
              <span aria-hidden="true">{panelOpen ? "▾" : "▴"}</span>
              <span>{panelOpen ? "Hide" : "Details"}</span>
              <span className="sr-only">{panelOpen ? " panel" : " panel: where to next and planet details"}</span>
            </button>
          </div>
          <div id={bodyId} ref={bodyRef} className="side__body" hidden={!panelOpen}>
            {planet === null ? <Overview {...ctx} />
              : planet === "home" ? <HomePanel {...ctx} />
              : <PlanetPanel {...ctx} id={planet} sel={sel} />}
            <div className="side__foot">
              <Legend />
              <p className="note">
                Distance is the fewest “Related” links between a topic and your bubble. Each planet shows only its strongest route
                back to you. Links are estimated by hand for now, so treat distances as a guide.
              </p>
            </div>
          </div>
        </aside>

        {/* bottom-left (desktop): legend + gesture hint */}
        <div className="ov ov-legend">
          <Legend />
          <p className="hint" aria-hidden="true">Drag to orbit · scroll to zoom · click a planet</p>
        </div>

        <p id="atlas-kbd" className="sr-only">
          Keyboard: press slash to find a topic. In the topic list use the arrow keys and Enter to open its planet.
          Escape closes the list, then the open topic, then the planet back to the map, and from the map it takes you back to your feed.
        </p>
        <div className="sr-only" role="status" aria-live="polite">{announce}</div>
        {toast && <Toast key={toast.id} message={toast.message} onUndo={undo} onDismiss={dismissToast} />}
      </div>

      {/* the map fills the whole screen; everything above floats over it */}
      <div className="atlas__stage">
        {gl ? (
          <AtlasScene lay={lay} thr={THR} planet={planet} sel={planet === "home" ? null : sel} recenter={recenter} insets={insets}
            onPlanet={openPlanet} onSelect={openTopic}
            onUserMove={() => setMoved(true)} onUnsupported={() => setGl(false)} />
        ) : (
          <div className="atlas__svgbox" style={svgInset(insets, mobile)}>
            <AtlasSvg lay={lay} thr={THR} sel={sel} names="all" viewIds={view.ids} onSelect={openTopic} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Map › Planet › Topic. Every earlier crumb is a button; the last is the page you are on. On phones: one "‹ parent" button. */
function Crumbs({ planet, sel, mobile, goMap, leaveTopic }: {
  planet: PlanetKey | null; sel: string | null; mobile: boolean; goMap: () => void; leaveTopic: () => void;
}) {
  const crumbs: { label: string; go?: () => void }[] = [{ label: "Map", go: goMap }];
  if (planet) crumbs.push({ label: planet === "home" ? HOME_NAME : planetName(planet), go: leaveTopic });
  if (sel) crumbs.push({ label: topicName(sel) });
  crumbs[crumbs.length - 1] = { label: crumbs[crumbs.length - 1].label };
  // Up from the planet means "clear the topic", but with no topic the planet crumb is already last.
  if (mobile) {
    const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
    const here = crumbs[crumbs.length - 1].label;
    return (
      <nav className="crumbs crumbs--m" aria-label="Breadcrumb">
        {parent ? (
          <button type="button" className="crumb" onClick={parent.go}>
            <span aria-hidden="true">‹</span> <span className="sr-only">Up to </span>{parent.label}
          </button>
        ) : (
          <span className="crumb crumb--here" aria-current="page">{here}</span>
        )}
      </nav>
    );
  }
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol>
        {crumbs.map((c, i) => (
          <li key={i}>
            {c.go ? <button type="button" className="crumb" onClick={c.go}>{c.label}</button>
              : <span className="crumb crumb--here" aria-current="page">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Legend() {
  return (
    <ul className="at-legend" aria-label="Map key">
      <li><i className="sw sw--sun" aria-hidden="true" />Your knowledge, at the centre</li>
      <li><i className="sw sw--ring" aria-hidden="true" />Orbit ring: steps from your bubble</li>
      <li><i className="sw sw--link" aria-hidden="true" />Route: strongest link back to your bubble</li>
      <li><i className="sw sw--lit" aria-hidden="true" />Lit dot: explored</li>
    </ul>
  );
}
