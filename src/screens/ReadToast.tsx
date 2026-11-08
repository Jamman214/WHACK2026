import type { CSSProperties } from "react";
import { useToastLife } from "./atlas/Toast";
import "./readtoast.css";

const LIFETIME = 12000;
const RADIUS = [0, 16, 24, 32];
const ANGLE = (-40 * Math.PI) / 180;

export interface ReadProgress {
  topic: string;
  hops: number;     // how far out the story was, 1 to 3 (3 means "3 or more")
  before: number;   // topics in the bubble before this read
  after: number;
  total: number;    // every topic on the map
  unlocked: number; // topics that have just become one step away
}

/** Confirms that reading a story grew the bubble, and shows by how much. Sits at the top of the reader, not the screen's edge. */
export default function ReadToast({ progress, onUndo, onDismiss }: { progress: ReadProgress; onUndo: () => void; onDismiss: () => void }) {
  const { topic, hops, before, after, total, unlocked } = progress;
  const { handlers, returns } = useToastLife(onDismiss, LIFETIME);
  const r = RADIUS[hops];
  const from = { "--from-x": `${r * Math.cos(ANGLE)}px`, "--from-y": `${r * Math.sin(ANGLE)}px` } as CSSProperties;
  const steps = hops >= 3 ? "3+ steps" : hops === 1 ? "1 step" : `${hops} steps`;
  const next = unlocked === 0 ? "" : ` ${unlocked} ${unlocked === 1 ? "topic is" : "topics are"} now one step away.`;
  return (
    <div className="rt-wrap">
      <div className={`rt rt--r${hops}`} role="status" {...handlers}>
        {/* Remounted on return: the story opens a new tab, so the first run plays while nobody is looking. */}
        <svg key={`glyph-${returns}`} className="rt__glyph" viewBox="-40 -40 80 80" aria-hidden>
          {[3, 2, 1].map((k) => <circle key={k} r={RADIUS[k]} className={k <= hops ? "rt__ring is-on" : "rt__ring"} />)}
          <circle r={11} className="rt__core" />
          <circle r={4} className="rt__dot" style={from} />
        </svg>
        <div className="rt__body">
          <p className="rt__eyebrow">Your bubble grew</p>
          <p className="rt__title">{topic} is now in your bubble</p>
          <div className="rt__bar" aria-hidden>
            <span className="rt__fill" style={{ width: `${(before / total) * 100}%` }} />
            <span key={`gain-${returns}`} className="rt__gain" style={{ width: `${((after - before) / total) * 100}%` }} />
          </div>
          <p className="rt__count"><b>{before} → {after}</b> of {total} topics</p>
          <p className="rt__detail">You went {steps} out to read this.{next}</p>
        </div>
        <div className="rt__actions">
          <button type="button" className="rt__x" aria-label="Dismiss" onClick={onDismiss}><span aria-hidden>×</span></button>
          <button type="button" className="rt__undo" onClick={onUndo}>Undo</button>
        </div>
      </div>
    </div>
  );
}
