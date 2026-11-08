import { useState } from "react";
import "./redo.css";

/** A small, quiet way to start over from the feed. Two steps, because it clears the bubble. */
export default function RedoOnboarding({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="theme-board redo">
      {asking ? (
        <div className="redo__ask" role="group" aria-label="Redo onboarding">
          <p>Redo onboarding? This clears your bubble.</p>
          <button type="button" className="redo__btn redo__btn--go" onClick={onConfirm}>Confirm</button>
          <button type="button" className="redo__btn" autoFocus onClick={() => setAsking(false)}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="redo__link" onClick={() => setAsking(true)}>Redo onboarding</button>
      )}
    </div>
  );
}
