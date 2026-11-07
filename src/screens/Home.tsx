import { useCallback, useMemo, useState } from "react";
import { DEFAULT_STRENGTH, MODEL } from "../data/model";
import { TOPIC_BY_ID } from "../data/taxonomy";
import { Feed, defaultProvider } from "../feed";
import { QUERIES } from "../feed/queries";
import { layout, nearbyTopics, reachablePath } from "../lib/layout";
import Atlas from "./Atlas";

// Module-level so their identity is stable: Feed refetches when `provider` changes.
const provider = defaultProvider(QUERIES);
const topicName = (id: string) => TOPIC_BY_ID[id]?.name ?? id;

/** Fetch stories for the bubble and topics up to this many bridges out. */
const CANDIDATE_RINGS = 2;

interface Props { initialBubble: string[]; onRedo: () => void }

/** Primary screen: the news feed. The Atlas is a secondary sheet behind the Map button. */
export default function Home({ initialBubble, onRedo }: Props) {
  // Lifted here (not in Atlas) so "Add to my bubble" on the map reshapes the feed.
  const [bubble, setBubble] = useState(initialBubble);

  const lay = useMemo(() => layout(MODEL, bubble, DEFAULT_STRENGTH), [bubble]);
  const candidates = useMemo(() => nearbyTopics(lay, CANDIDATE_RINGS), [lay]);
  const pathTo = useCallback((id: string) => reachablePath(lay, id), [lay]);

  return (
    <div className="screen theme-board fade">
      <Feed
        known={bubble}
        candidates={candidates}
        provider={provider}
        pathTo={pathTo}
        topicName={topicName}
        map={
          <div className="home__map">
            <Atlas bubble={bubble} onBubbleChange={setBubble} initialBubble={initialBubble} onRedo={onRedo} />
          </div>
        }
      />
    </div>
  );
}
