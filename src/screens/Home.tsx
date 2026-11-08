import { useCallback, useMemo, useRef, useState } from "react";
import { fetchBubble, type Swipe } from "../data/api";
import { DEFAULT_STRENGTH, MODEL } from "../data/model";
import { edgeReason } from "../data/reasons";
import { TOPIC_BY_ID } from "../data/taxonomy";
import { DISTANCES, Feed, backendProvider as provider, type FeedCardModel } from "../feed";
import { layout, nearbyTopics, reachablePath } from "../lib/layout";
import Atlas, { type AtlasFocus } from "./Atlas";
import MiniMap from "./MiniMap";

const topicName = (id: string) => TOPIC_BY_ID[id]?.name ?? id;

interface Props { initialBubble: string[]; history: Swipe[]; onRedo: () => void }

/** Primary screen: the news feed, with a mini-map beside it (desktop) and the full Atlas as a sheet. */
export default function Home({ initialBubble, history, onRedo }: Props) {
  // Lifted here (not in Atlas) so "Add to my bubble" on the map reshapes the feed.
  const [bubble, setBubble] = useState(initialBubble);
  // The backend owns the bubble: map adds/removes are sent with the onboarding swipes and its answer wins.
  // The starting bubble is pinned too, so an onboarding fallback bubble survives the round trip.
  const pinned = useRef<Record<string, boolean>>(Object.fromEntries(initialBubble.map((t) => [t, true])));
  const latest = useRef(0);
  const changeBubble = (next: string[]) => {
    const keep = new Set(next);
    bubble.forEach((t) => { if (!keep.has(t)) pinned.current[t] = false; });
    next.forEach((t) => { pinned.current[t] = true; });
    setBubble(next); // optimistic, so the map redraws straight away
    const call = ++latest.current;
    fetchBubble(history, pinned.current).then(
      (b) => { if (call === latest.current) setBubble(b.knownTopics); },
      (e) => console.error("bubble", e),
    );
  };
  const [dist, setDist] = useState(0);
  const [active, setActive] = useState<FeedCardModel | null>(null);
  const [pulse, setPulse] = useState<string | null>(null);
  const [map, setMap] = useState<{ open: boolean; focus?: AtlasFocus }>({ open: false });

  const lay = useMemo(() => layout(MODEL, bubble, DEFAULT_STRENGTH), [bubble]);
  // every reachable topic, so the Wider/Far mixes have 2- and 3+-hop stories to draw on
  const candidates = useMemo(() => nearbyTopics(lay, lay.rings), [lay]);
  const pathTo = useCallback((id: string) => reachablePath(lay, id), [lay]);

  const openAtActive = () => {
    const path = active?.placement.kind === "bridge" ? active.placement.path : active ? [active.topicId] : [];
    setMap({ open: true, focus: active ? { sel: active.topicId, center: path } : undefined });
  };
  const onChipClick = useCallback((id: string, cardTopic: string) => setMap({ open: true, focus: { sel: cardTopic, center: [id] } }), []);
  const onMapOpenChange = useCallback((open: boolean) => setMap({ open }), []);
  const d = DISTANCES[dist];

  return (
    <div className="screen theme-board fade home">
      <div className="home__feed">
        <div className="dist">
          <label className="dist__label" htmlFor="dist">How far out</label>
          <input id="dist" type="range" min={0} max={DISTANCES.length - 1} step={1} value={dist}
            onChange={(e) => setDist(+e.target.value)} aria-valuetext={d.label} />
          <div className="dist__stops">
            {DISTANCES.map((s, i) => (
              <span key={s.label} className={i === dist ? "on" : ""} onClick={() => setDist(i)}>{s.label}</span>
            ))}
          </div>
        </div>
        <Feed
          known={bubble}
          candidates={candidates}
          provider={provider}
          pathTo={pathTo}
          topicName={topicName}
          mix={d.mix}
          reason={edgeReason}
          onActiveChange={setActive}
          onChipHover={setPulse}
          onChipClick={onChipClick}
          mapOpen={map.open}
          onMapOpenChange={onMapOpenChange}
          mapHasOwnClose
          map={
            <div className="home__map">
              <Atlas bubble={bubble} onBubbleChange={changeBubble} initialBubble={initialBubble} onRedo={onRedo} focus={map.focus}
                provider={provider} onClose={() => setMap({ open: false })} />
            </div>
          }
        />
      </div>
      <aside className="home__mini">
        <MiniMap lay={lay} thr={DEFAULT_STRENGTH} card={active} reach={d.ring} reachLabel={d.label}
          pulseId={pulse} onOpen={openAtActive} />
      </aside>
    </div>
  );
}
