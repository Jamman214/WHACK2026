import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NewsCard } from './NewsCard';
import { rankFeed, type Mix } from './rank';
import type { FeedCardModel, FeedItem, NewsProvider } from './types';
import './feed.css';

type Props = {
  known: string[];                              // bubble from onboarding
  candidates: string[];                         // topic ids to fetch (bubble + reachable)
  provider: NewsProvider;
  pathTo: (id: string) => string[] | null;
  topicName: (id: string) => string;
  map?: ReactNode;                              // the Atlas, shown as a secondary sheet
  perTopic?: number;
  mix?: Mix;                                    // bridge weighting by hop distance (distance slider)
  reason?: (a: string, b: string) => string | undefined;
  onActiveChange?: (card: FeedCardModel | null) => void;  // card currently in view (null: loading/end)
  onChipHover?: (topicId: string | null) => void;
  onChipClick?: (topicId: string, cardTopicId: string) => void;
  mapOpen?: boolean;                            // controlled map sheet (optional)
  onMapOpenChange?: (open: boolean) => void;
};

export function Feed({
  known, candidates, provider, pathTo, topicName, map, perTopic = 2,
  mix, reason, onActiveChange, onChipHover, onChipClick, mapOpen: mapOpenProp, onMapOpenChange,
}: Props) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [ownMapOpen, setOwnMapOpen] = useState(false);
  const mapOpen = mapOpenProp ?? ownMapOpen;
  const setMapOpen = useCallback((o: boolean) => (onMapOpenChange ? onMapOpenChange(o) : setOwnMapOpen(o)), [onMapOpenChange]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setItems(null);
    provider.fetch(candidates, perTopic).then(r => live && setItems(r));
    return () => { live = false; };
  }, [provider, candidates.join(), perTopic]);

  const knownSet = useMemo(() => new Set(known), [known.join()]);
  const cards = useMemo(() => (items ? rankFeed(items, knownSet, pathTo, mix) : []), [items, knownSet, pathTo, mix]);

  // Report the slide in view. Works with any number of slides (skeleton/end slides report null).
  useEffect(() => {
    const root = scroller.current;
    if (!root || !onActiveChange) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) onActiveChange(cards[Number((e.target as HTMLElement).dataset.index)] ?? null);
      }
    }, { root, threshold: 0.6 });
    root.querySelectorAll('.feed__slide').forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [cards, items, onActiveChange]);

  // j/k or arrow keys step one card (desktop demo); native scroll-snap does the rest.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mapOpen) { if (e.key === 'Escape') setMapOpen(false); return; }
      const el = scroller.current;
      if (!el || (e.target as HTMLElement).closest('input,textarea')) return;
      const dir = ['j', 'ArrowDown'].includes(e.key) ? 1 : ['k', 'ArrowUp'].includes(e.key) ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      el.scrollBy({ top: dir * el.clientHeight, behavior: 'smooth' });
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [mapOpen, setMapOpen]);

  return (
    <div className="feed">
      <div className="feed__scroller" ref={scroller}>
        {!items && <div className="feed__slide" data-index={-1}><div className="nc nc--skeleton" aria-busy /></div>}
        {cards.map((c, i) => (
          <div className="feed__slide" key={c.id} data-index={i}>
            <NewsCard card={c} index={i} total={cards.length} topicName={topicName}
              reason={reason} onChipHover={onChipHover} onChipClick={onChipClick} />
          </div>
        ))}
        {items && (
          <div className="feed__slide" data-index={-1}>
            <div className="nc nc--end">
              <h2 className="nc__headline">That's the edge of today's map.</h2>
              <p className="nc__summary">See where these stories sit, and add new topics to your bubble.</p>
              {map && <button className="nc__cta" onClick={() => setMapOpen(true)}>Open your map</button>}
            </div>
          </div>
        )}
      </div>

      {map && (
        <>
          <button className="feed__mapbtn" onClick={() => setMapOpen(true)} aria-label="Open your map">
            ◎ Map
          </button>
          {mapOpen && (
            <div className="feed__sheet" role="dialog" aria-modal="true" aria-label="Your map">
              <button className="feed__close" onClick={() => setMapOpen(false)} aria-label="Close map">✕</button>
              {map}
            </div>
          )}
        </>
      )}
    </div>
  );
}
