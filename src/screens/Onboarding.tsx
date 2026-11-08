import { useCallback, useEffect, useRef, useState } from "react";
import { nextOnboarding, type Swipe } from "../data/api";
import { type Headline, bubbleFrom, demoSeen } from "../data/headlines";
import { TOPIC_BY_ID } from "../data/taxonomy";
import { BOARD_W, createSplitBoard, landTime } from "../lib/galton";
import { type Ball, drawSplitBoard, readTokens, sizeCanvas } from "../render/splitBoardCanvas";
import { type SplitBoardScene, createSplitBoardScene } from "../render/splitBoardThree";

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Props {
  /** start the deterministic demo feed as soon as the board is on screen */
  autoDemo?: boolean;
  onDone: (bubble: string[], history: Swipe[]) => void;
}

export default function Onboarding({ autoDemo = false, onDone }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SplitBoardScene | null>(null);
  const fallbackRef = useRef<HTMLCanvasElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const mapBtnRef = useRef<HTMLButtonElement>(null);

  // board engine state lives in refs: it changes every frame and React doesn't need to know
  const board = useRef(createSplitBoard());
  const balls = useRef<Ball[]>([]);
  const gate = useRef({ flip: 0, target: 0 });
  // counts shown on the board and in the summary: a ball counts when it lands, not when it spawns
  const landed = useRef({ seen: 0, unseen: 0 });
  const timers = useRef<number[]>([]);
  const morphs = useRef(new Set<{ anim: Animation; el: HTMLElement }>());
  const idxRef = useRef(0);
  // Onboarding is two-way: every swipe goes to the backend, which picks the next card and rebuilds the bubble.
  const deck = useRef<Headline[]>([]); // cards served so far
  const history = useRef<Swipe[]>([]);
  const known = useRef<string[]>([]);
  const run = useRef(0); // bumped on reset/unmount so stale replies are dropped
  const demo = useRef(false);

  const [idx, setIdx] = useState(0);
  const [counts, setCounts] = useState({ seen: 0, unseen: 0 });
  const [served, setServed] = useState(0);
  const [max, setMax] = useState(0);
  const [finished, setFinished] = useState(false);

  const done = finished && idx >= served;

  const advance = (to: number) => { idxRef.current = to; setIdx(to); };

  const spawn = useCallback((isSeen: boolean) => {
    gate.current.target = isSeen ? -1 : 1;
    balls.current.push({ pts: board.current.path(isSeen), seen: isSeen, t0: performance.now() });
  }, []);

  // These only touch refs and stable setters, so any render's copy is safe to call.
  function fetchNext() {
    const r = run.current;
    nextOnboarding(history.current).then((step) => {
      if (r !== run.current) return;
      known.current = step.bubble.knownTopics;
      setMax(step.progress.max);
      if (!step.card) { setFinished(true); return; }
      deck.current.push({ id: step.card.id, topicId: step.card.topicId, headline: step.card.title });
      setServed(deck.current.length);
      if (demo.current) timers.current.push(window.setTimeout(demoStep, 140));
    }, (e) => console.error("onboarding", e));
  }

  /** Record a swipe on the card in view; null while the next card is still loading. */
  function record(isSeen: boolean): Headline | null {
    const i = idxRef.current, h = deck.current[i];
    if (!h) return null;
    history.current.push({ articleId: h.id, swipe: isSeen ? "right" : "left" }); // "In my feed" = backend "right" (I know this)
    advance(i + 1);
    fetchNext();
    return h;
  }

  function demoStep() {
    const isSeen = demoSeen(idxRef.current);
    if (record(isSeen)) spawn(isSeen);
  }

  const choose = useCallback((isSeen: boolean) => {
    const h = record(isSeen);
    if (!h) return;

    const card = cardRef.current, bd = boardRef.current, root = rootRef.current;
    if (reduceMotion() || !card || !bd || !root) { spawn(isSeen); return; }

    // card morphs into a ball and drops into the funnel
    const r = card.getBoundingClientRect();
    const tk = readTokens(root);
    const m = document.createElement("div");
    m.className = "morph";
    m.textContent = h.headline;
    Object.assign(m.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", borderRadius: "14px" });
    root.appendChild(m);
    // funnel mouth in viewport px: projected through the 3D camera, or scaled from the 2D canvas
    const mouth = sceneRef.current?.boardToClient(BOARD_W / 2, 6) ?? (() => {
      const cr = (fallbackRef.current ?? bd).getBoundingClientRect(), s = cr.width / BOARD_W;
      return { x: cr.left + (BOARD_W / 2) * s, y: cr.top + 6 * s };
    })();
    const tx = mouth.x - 7, ty = mouth.y - 7;
    const ballBg = isSeen ? tk.accent : getComputedStyle(root).getPropertyValue("--surface");
    const anim = m.animate(
      [
        { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", borderRadius: "14px", color: tk.ink, padding: "18px 22px" },
        { offset: 0.55, left: r.left + r.width / 2 - 30 + "px", top: r.top + r.height / 2 - 30 + "px", width: "60px", height: "60px", borderRadius: "50%", color: "transparent", background: ballBg, padding: "0" },
        { left: tx + "px", top: ty + "px", width: "14px", height: "14px", borderRadius: "50%", color: "transparent", background: ballBg, padding: "0" },
      ],
      { duration: 520, easing: "cubic-bezier(.5,0,.3,1)" },
    );
    const entry = { anim, el: m };
    morphs.current.add(entry);
    anim.onfinish = () => { morphs.current.delete(entry); m.remove(); spawn(isSeen); };
  }, [spawn]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    morphs.current.forEach(({ anim, el }) => { anim.cancel(); el.remove(); });
    morphs.current.clear();
  };

  const playDemo = useCallback(() => {
    demo.current = true;
    demoStep(); // no-op if the card is still loading: fetchNext carries on when it lands
  }, [spawn]);

  const reset = () => {
    clearTimers();
    balls.current = [];
    board.current.reset();
    landed.current = { seen: 0, unseen: 0 };
    gate.current.target = 0;
    run.current++;
    demo.current = false;
    deck.current = [];
    history.current = [];
    known.current = [];
    setCounts({ seen: 0, unseen: 0 });
    setServed(0);
    setFinished(false);
    advance(0);
    fetchNext();
  };

  // first card; the cleanup drops the reply if StrictMode remounts or the screen closes
  useEffect(() => { reset(); return () => { run.current++; }; }, []);

  // render loop: Three.js scene, with the Canvas 2D renderer as a fallback when WebGL is unavailable
  useEffect(() => {
    const bd = boardRef.current!, root = rootRef.current!;
    let tk = readTokens(root);
    const scene = createSplitBoardScene(bd, tk);
    sceneRef.current = scene;
    let cv: HTMLCanvasElement | null = null;
    if (!scene) {
      cv = document.createElement("canvas");
      bd.appendChild(cv);
      fallbackRef.current = cv;
      sizeCanvas(cv);
    }
    const onResize = () => { if (cv) sizeCanvas(cv); };
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => { tk = readTokens(root); scene?.setTokens(tk); };
    addEventListener("resize", onResize);
    mq.addEventListener("change", onScheme);
    let raf = 0;
    const frame = (now: number) => {
      const g = gate.current;
      g.flip += (g.target - g.flip) * 0.18;
      // a ball counts the moment it first touches its bucket floor
      const L = landed.current;
      let bumped = false;
      for (const b of balls.current)
        if (!b.landed && now - b.t0 >= landTime(b.pts)) {
          b.landed = true;
          L[b.seen ? "seen" : "unseen"]++;
          bumped = true;
        }
      if (bumped) setCounts({ ...L });
      const st = { flip: g.flip, counts: L, balls: balls.current, now };
      if (scene) scene.render(st);
      else drawSplitBoard(cv!.getContext("2d")!, tk, st);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", onResize);
      mq.removeEventListener("change", onScheme);
      scene?.dispose();
      cv?.remove();
      sceneRef.current = null;
      fallbackRef.current = null;
    };
  }, []);

  // keyboard: ← in my feed, → not in my feed
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); choose(true); }
      if (e.key === "ArrowRight") { e.preventDefault(); choose(false); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [choose]);

  // intro's "Use demo feed" lands here and plays straight away
  useEffect(() => {
    if (!autoDemo) return;
    const t = window.setTimeout(playDemo, 450);
    return () => clearTimeout(t);
  }, [autoDemo, playDemo]);

  useEffect(() => clearTimers, []);
  useEffect(() => { if (done) mapBtnRef.current?.focus(); }, [done]);

  const summary = (() => {
    const { seen: s, unseen: u } = counts;
    return <><b>{s}</b> in your feed · <b>{u}</b> outside it · {Math.round((100 * u) / (s + u))}% of the sample is a blind spot</>;
  })();

  const h = deck.current[idx];
  return (
    <div className="screen theme-board fade" ref={rootRef}>
      <div className="wrap">
        <header>
          <div>
            <h1>Let's test your knowledge</h1>
          </div>
        </header>

        <p className="blurb">
          <b>Is this in your feed?</b> Your answer tips the gate at the top, so the ball can only fall into that half.
          From there every bounce is random, and it lands in one of two buckets: in my feed or not.
        </p>

        <div className="deck">
          <div className={"card" + (idx > 0 && !reduceMotion() ? " enter" : "") + (done ? " gone" : "")} ref={cardRef} key={idx} aria-hidden={done || undefined}>
            {done || !h ? null : (
              <>
                <div className="cat">{TOPIC_BY_ID[h.topicId].name}</div>
                <div className="hl">{h.headline}</div>
                <div className="meta">Sample headline · {idx + 1} of {max}</div>
              </>
            )}
          </div>
          <div className="choices">
            {done ? (
              <button className="btn primary big" ref={mapBtnRef} onClick={() => onDone(bubbleFrom(known.current, deck.current.filter((_, i) => history.current[i]?.swipe === "right").map((c) => c.topicId)), history.current)}>
                Open your feed →
              </button>
            ) : (
              <>
                <button className="btn primary" onClick={() => choose(true)}><kbd>←</kbd> In my feed</button>
                <button className="btn" onClick={() => choose(false)}>Not in my feed <kbd>→</kbd></button>
              </>
            )}
          </div>
        </div>

        <div className="board" ref={boardRef} />

        <div className="foot">
          <div className="summary" aria-live="polite">{summary}</div>
          <div className="choices">
            <button className="btn ghost" onClick={playDemo} disabled={done}>Play demo feed</button>
            <button className="btn ghost" onClick={reset}>Reset</button>
          </div>
        </div>
      </div>
    </div>
  );
}
