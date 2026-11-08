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
  mapHasOwnClose?: boolean;                     // the map content renders its own close/back button; skip the generic ✕
};

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

/** Keep Tab / Shift+Tab inside the open sheet (the page behind it is inert as well). */
function trapTab(e: KeyboardEvent, root: HTMLElement | null) {
  if (!root) return;
  const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
  const active = document.activeElement;
  if (!items.length) { e.preventDefault(); root.focus(); return; }
  const first = items[0], last = items[items.length - 1];
  if (!root.contains(active) || active === root) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
}

export function Feed({
  known, candidates, provider, pathTo, topicName, map, perTopic = 2,
  mix, reason, onActiveChange, onChipHover, onChipClick, mapOpen: mapOpenProp, onMapOpenChange, mapHasOwnClose,
}: Props) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [ownMapOpen, setOwnMapOpen] = useState(false);
  const mapOpen = mapOpenProp ?? ownMapOpen;
  const setMapOpen = useCallback((o: boolean) => (onMapOpenChange ? onMapOpenChange(o) : setOwnMapOpen(o)), [onMapOpenChange]);
  const scroller = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const mapBtn = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

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

  // Focus: into the sheet when it opens (its own back button if it has one), back to ◎ Map when it closes.
  useEffect(() => {
    if (mapOpen) {
      const el = sheet.current;
      (el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('.feed__close') ?? el)?.focus();
    } else if (wasOpen.current) {
      mapBtn.current?.focus();
    }
    wasOpen.current = mapOpen;
  }, [mapOpen]);

  // j/k or arrow keys step one card (desktop demo); native scroll-snap does the rest.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mapOpen) {
        // The map may have handled Escape itself (clearing a selection) and stopped it before it got here.
        if (e.key === 'Escape') setMapOpen(false);
        else if (e.key === 'Tab') trapTab(e, sheet.current);
        return;
      }
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
      <div className="feed__scroller" ref={scroller} inert={map && mapOpen ? true : undefined}>
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
          <button ref={mapBtn} className="feed__mapbtn" onClick={() => setMapOpen(true)} aria-label="Open your map" inert={mapOpen ? true : undefined}>
            ◎ Map
          </button>
          {mapOpen && (
            <div className="feed__sheet" ref={sheet} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Your map">
              {!mapHasOwnClose && <button className="feed__close" onClick={() => setMapOpen(false)} aria-label="Close map">✕</button>}
              {map}
            </div>
          )}
        </>
      )}
    </div>
  );
}
