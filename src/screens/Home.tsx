import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchBubble, type Swipe } from "../data/api";
import { DEFAULT_STRENGTH, MODEL } from "../data/model";
import { edgeReason } from "../data/reasons";
import { TOPICS, TOPIC_BY_ID } from "../data/taxonomy";
import { Edition, backendProvider as provider, type FeedCardModel } from "../feed";
import { saveBubble } from "../lib/bubbleStore";
import { layout, nearbyTopics, reachablePath } from "../lib/layout";
import { bubbleAfterRead } from "../lib/reading";
import Atlas, { type AtlasFocus } from "./Atlas";
import Toast from "./atlas/Toast";
import { plural } from "./atlas/util";

const topicName = (id: string) => TOPIC_BY_ID[id]?.name ?? id;

interface Props { initialBubble: string[]; history: Swipe[]; onRedo: () => void }

/** Primary screen: today's edition (date, grouped stories, the thread and the story), with the full Atlas as a sheet. */
export default function Home({ initialBubble, history, onRedo }: Props) {
  // Lifted here (not in Atlas) so reading a story (edition or map) reshapes the edition.
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
  // The Atlas is only mounted while the map is open, so the edition saves the bubble itself.
  useEffect(() => { saveBubble(bubble); }, [bubble]);
  const [toast, setToast] = useState<{ id: number; message: string; prev: string[] } | null>(null);
  const toastId = useRef(0);
  const dismissToast = useCallback(() => setToast(null), []);
  const [map, setMap] = useState<{ open: boolean; focus?: AtlasFocus }>({ open: false });

  const lay = useMemo(() => layout(MODEL, bubble, DEFAULT_STRENGTH), [bubble]);
  // every reachable topic, so the Wider/Far mixes have 2- and 3+-hop stories to draw on
  const candidates = useMemo(() => nearbyTopics(lay, lay.rings), [lay]);
  const pathTo = useCallback((id: string) => reachablePath(lay, id), [lay]);

  // Reading a story from outside the bubble is how its topic joins it (undoable from the toast).
  const onRead = (card: FeedCardModel) => {
    const next = bubbleAfterRead(bubble, card.topicId);
    if (!next) return;
    const after = layout(MODEL, next, DEFAULT_STRENGTH);
    const n = TOPICS.filter((t) => after.nodes[t.id].ring === 1 && lay.nodes[t.id].ring !== 1).length;
    const tail = n === 0 ? "" : ` · ${n} ${plural(n, "topic is", "topics are")} now one step away`;
    setToast({ id: ++toastId.current, message: `Added ${topicName(card.topicId)} to your bubble${tail}`, prev: bubble });
    changeBubble(next);
  };
  const undoRead = () => { if (toast) changeBubble(toast.prev); setToast(null); };

  const onOpenMap = useCallback((focus?: AtlasFocus) => setMap({ open: true, focus }), []);
  const onCloseMap = useCallback(() => setMap({ open: false }), []);

  return (
    <div className="screen theme-board fade home">
      <Edition
        known={bubble}
        candidates={candidates}
        provider={provider}
        pathTo={pathTo}
        topicName={topicName}
        reason={edgeReason}
        onRead={onRead}
        mapOpen={map.open}
        onOpenMap={onOpenMap}
        onCloseMap={onCloseMap}
        map={
          <div className="home__map">
            <Atlas bubble={bubble} onBubbleChange={changeBubble} initialBubble={initialBubble} onRedo={onRedo} focus={map.focus}
              provider={provider} onClose={onCloseMap} />
          </div>
        }
      />
      {toast && !map.open && (
        <div className="theme-atlas atlas home__toast">
          <Toast key={toast.id} message={toast.message} onUndo={undoRead} onDismiss={dismissToast} />
        </div>
      )}
    </div>
  );
}
