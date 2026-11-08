interface Props { onStart: () => void; onDemo: () => void }

export default function Intro({ onStart, onDemo }: Props) {
  return (
    <div className="screen theme-board intro fade">
      <div className="hero">
        <div className="eyebrow">WHACK 2026 · New Worlds</div>
        <h1>What's outside your feed?</h1>
        <p className="premise">
          Sort a handful of headlines, see the shape of your bubble, then find the bridges from what you already know to
          the topics you never see.
        </p>
        <div className="choices">
          <button className="btn primary big" onClick={onStart} autoFocus>Start</button>
          <button className="btn big" onClick={onDemo}>Use demo feed</button>
        </div>
      </div>
    </div>
  );
}
