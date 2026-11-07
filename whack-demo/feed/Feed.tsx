import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NewsCard } from './NewsCard';
import { rankFeed } from './rank';
import type { FeedItem, NewsProvider } from './types';
import './feed.css';

type Props = {
  known: string[];                              // bubble from onboarding
  candidates: string[];                         // topic ids to fetch (bubble + reachable)
  provider: NewsProvider;
  pathTo: (id: string) => string[] | null;
  topicName: (id: string) => string;
  map?: ReactNode;                              // the Atlas, shown as a secondary sheet
  perTopic?: number;
};

export function Feed({ known, candidates, provider, pathTo, topicName, map, perTopic = 2 }: Props) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setItems(null);
    provider.fetch(candidates, perTopic).then(r => live && setItems(r));
    return () => { live = false; };
  }, [provider, candidates.join(), perTopic]);

  const knownSet = useMemo(() => new Set(known), [known.join()]);
  const cards = useMemo(() => (items ? rankFeed(items, knownSet, pathTo) : []), [items, knownSet, pathTo]);

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
  }, [mapOpen]);

  return (
    <div className="feed">
      <div className="feed__scroller" ref={scroller}>
        {!items && <div className="feed__slide"><div className="nc nc--skeleton" aria-busy /></div>}
        {cards.map((c, i) => (
          <div className="feed__slide" key={c.id}>
            <NewsCard card={c} index={i} total={cards.length} topicName={topicName} />
          </div>
        ))}
        {items && (
          <div className="feed__slide">
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
