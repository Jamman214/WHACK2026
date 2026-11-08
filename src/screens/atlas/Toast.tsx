import { useEffect, useRef, useState } from "react";

const LIFETIME = 8000;

/** A calm, dismissible confirmation with Undo. Lives ~8s, paused while hovered or focused (fresh full timer on leave).
 *  Mount with a fresh `key` per message. This is the single live region announcing a bubble change. */
export default function Toast({ message, onUndo, onDismiss }: { message: string; onUndo: () => void; onDismiss: () => void }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  // Reading a story opens a new tab: don't spend the toast's lifetime while the reader is away.
  const [away, setAway] = useState(() => document.hidden);
  useEffect(() => {
    const f = () => setAway(document.hidden);
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  const paused = hover || focus || away;
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => dismiss.current(), LIFETIME);
    return () => clearTimeout(t);
  }, [paused]);
  return (
    <div className="at-toastwrap">
      <div className="ov at-toast" role="status"
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false); }}>
        <p>{message}</p>
        <button type="button" className="at-btn at-toast__undo" onClick={onUndo}>Undo</button>
        <button type="button" className="at-toast__x" aria-label="Dismiss" onClick={onDismiss}><span aria-hidden="true">×</span></button>
      </div>
    </div>
  );
}
