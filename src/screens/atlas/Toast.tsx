import { useEffect, useRef, useState, type FocusEvent } from "react";

const LIFETIME = 8000;

/** Dismisses after `lifetime`, paused while hovered, focused or the tab is hidden (fresh full timer afterwards).
 *  `returns` counts how many times the reader has come back to the tab. */
export function useToastLife(onDismiss: () => void, lifetime = LIFETIME) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  // Reading a story opens a new tab: don't spend the toast's lifetime while the reader is away.
  const [away, setAway] = useState(() => document.hidden);
  const [returns, setReturns] = useState(0);
  useEffect(() => {
    const f = () => {
      setAway(document.hidden);
      if (!document.hidden) setReturns((r) => r + 1);
    };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  const paused = hover || focus || away;
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => dismiss.current(), lifetime);
    return () => clearTimeout(t);
  }, [paused, lifetime]);
  const handlers = {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    onFocus: () => setFocus(true),
    onBlur: (e: FocusEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false); },
  };
  return { handlers, returns };
}

/** A calm, dismissible confirmation with Undo. Lives ~8s, paused while hovered or focused (fresh full timer on leave).
 *  Mount with a fresh `key` per message. This is the single live region announcing a bubble change. */
export default function Toast({ message, onUndo, onDismiss }: { message: string; onUndo: () => void; onDismiss: () => void }) {
  const { handlers } = useToastLife(onDismiss);
  return (
    <div className="at-toastwrap">
      <div className="ov at-toast" role="status" {...handlers}>
        <p>{message}</p>
        <button type="button" className="at-btn at-toast__undo" onClick={onUndo}>Undo</button>
        <button type="button" className="at-toast__x" aria-label="Dismiss" onClick={onDismiss}><span aria-hidden="true">×</span></button>
      </div>
    </div>
  );
}
