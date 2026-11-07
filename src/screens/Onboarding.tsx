import { useCallback, useEffect, useRef, useState } from "react";
import { DECK, bubbleFrom, demoSeen } from "../data/headlines";
import { TOPIC_BY_ID } from "../data/taxonomy";
import { BOARD_W, createSplitBoard } from "../lib/galton";
import { type Ball, drawSplitBoard, readTokens, sizeCanvas } from "../render/splitBoardCanvas";

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Props {
  /** start the deterministic demo feed as soon as the board is on screen */
  autoDemo?: boolean;
  onDone: (bubble: string[]) => void;
}

export default function Onboarding({ autoDemo = false, onDone }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const mapBtnRef = useRef<HTMLButtonElement>(null);

  // board engine state lives in refs: it changes every frame and React doesn't need to know
  const board = useRef(createSplitBoard());
  const balls = useRef<Ball[]>([]);
  const gate = useRef({ flip: 0, target: 0 });
  const timers = useRef<number[]>([]);
  const morphs = useRef(new Set<{ anim: Animation; el: HTMLElement }>());
  const idxRef = useRef(0);
  const seenTopics = useRef<string[]>([]);

  const [idx, setIdx] = useState(0);
  const [counts, setCounts] = useState({ seen: 0, unseen: 0 });

  const done = idx >= DECK.length;

  const advance = (to: number) => { idxRef.current = to; setIdx(to); };

  const spawn = useCallback((isSeen: boolean) => {
    gate.current.target = isSeen ? -1 : 1;
    balls.current.push({ pts: board.current.path(isSeen), seen: isSeen, t0: performance.now() });
    setCounts({ ...board.current.counts });
  }, []);

  const choose = useCallback((isSeen: boolean) => {
    const i = idxRef.current;
    if (i >= DECK.length) return;
    const h = DECK[i];
    if (isSeen) seenTopics.current.push(h.topicId);
    advance(i + 1);

    const card = cardRef.current, cv = canvasRef.current, root = rootRef.current;
    if (reduceMotion() || !card || !cv || !root) { spawn(isSeen); return; }

    // card morphs into a ball and drops into the funnel
    const r = card.getBoundingClientRect(), cr = cv.getBoundingClientRect(), s = cr.width / BOARD_W;
    const tk = readTokens(root);
    const m = document.createElement("div");
    m.className = "morph";
    m.textContent = h.headline;
    Object.assign(m.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", borderRadius: "14px" });
    root.appendChild(m);
    const tx = cr.left + (BOARD_W / 2) * s - 7, ty = cr.top + 6 * s - 7;
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
    const start = idxRef.current;
    for (let i = start; i < DECK.length; i++) {
      const h = DECK[i], isSeen = demoSeen(h);
      if (isSeen) seenTopics.current.push(h.topicId);
      timers.current.push(window.setTimeout(() => spawn(isSeen), (i - start) * 140));
    }
    advance(DECK.length);
  }, [spawn]);

  const reset = () => {
    clearTimers();
    balls.current = [];
    board.current.reset();
    gate.current.target = 0;
    seenTopics.current = [];
    setCounts({ seen: 0, unseen: 0 });
    advance(0);
  };

  // render loop + canvas sizing
  useEffect(() => {
    const cv = canvasRef.current!, root = rootRef.current!;
    sizeCanvas(cv);
    let tk = readTokens(root);
    const onResize = () => sizeCanvas(cv);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => { tk = readTokens(root); };
    addEventListener("resize", onResize);
    mq.addEventListener("change", onScheme);
    let raf = 0;
    const frame = (now: number) => {
      const g = gate.current;
      g.flip += (g.target - g.flip) * 0.18;
      drawSplitBoard(cv.getContext("2d")!, tk, { flip: g.flip, counts: board.current.counts, balls: balls.current, now });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", onResize); mq.removeEventListener("change", onScheme); };
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
    if (!s && !u) return <>Sort a headline to tip the gate.</>;
    return <><b>{s}</b> in your feed · <b>{u}</b> outside it · {Math.round((100 * u) / (s + u))}% of the sample is a blind spot</>;
  })();

  const h = DECK[idx];
  return (
    <div className="screen theme-board fade" ref={rootRef}>
      <div className="wrap">
        <header>
          <div>
            <div className="eyebrow">WHACK · step 1 of 2</div>
            <h1>Drop the headlines</h1>
          </div>
        </header>

        <p className="blurb">
          <b>Is this in your feed?</b> Your answer tips the gate at the top, so the ball can only fall into that half.
          From there every bounce is random, and it lands in one of two buckets: in my feed or not.
        </p>

        <div className="deck">
          <div className={"card" + (idx > 0 && !reduceMotion() ? " enter" : "")} ref={cardRef} key={idx}>
            {done ? (
              <>
                <div className="cat">All {DECK.length} sorted</div>
                <div className="hl">That's your feed, mapped. Next stop: the Topic Atlas.</div>
                <div className="meta">Press Reset to run it again</div>
              </>
            ) : (
              <>
                <div className="cat">{TOPIC_BY_ID[h.topicId].name}</div>
                <div className="hl">{h.headline}</div>
                <div className="meta">Sample headline · {idx + 1} of {DECK.length}</div>
              </>
            )}
          </div>
          <div className="choices">
            {done ? (
              <button className="btn primary big" ref={mapBtnRef} onClick={() => onDone(bubbleFrom(seenTopics.current))}>
                See your map →
              </button>
            ) : (
              <>
                <button className="btn primary" onClick={() => choose(true)}><kbd>←</kbd> In my feed</button>
                <button className="btn" onClick={() => choose(false)}>Not in my feed <kbd>→</kbd></button>
              </>
            )}
          </div>
        </div>

        <div className="board"><canvas ref={canvasRef} /></div>

        <div className="foot">
          <div className="legend">
            <span><span className="dot s" />In my feed</span>
            <span><span className="dot u" />Not in my feed</span>
          </div>
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
