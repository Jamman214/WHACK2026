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
  onRead?: (card: FeedCardModel) => void;       // the reader opened a story's full text
  mapOpen?: boolean;                           // controlled map sheet (optional)
  onMapOpenChange?: (open: boolean) => void;
  mapHasOwnClose?: boolean;                     // the map content renders its own close/back button; skip the generic ✕
};

/** Keys typed into these belong to them, not to the feed. */
const TYPING = 'input,textarea,select,[contenteditable]:not([contenteditable="false"])';

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
  mix, reason, onActiveChange, onChipHover, onChipClick, onRead, mapOpen: mapOpenProp, onMapOpenChange, mapHasOwnClose,
}: Props) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [ownMapOpen, setOwnMapOpen] = useState(false);
  const mapOpen = mapOpenProp ?? ownMapOpen;
  const setMapOpen = useCallback((o: boolean) => (onMapOpenChange ? onMapOpenChange(o) : setOwnMapOpen(o)), [onMapOpenChange]);
  const scroller = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const mapBtn = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const activeRef = useRef(0);                                  // slide (DOM order) currently in view, updated immediately
  const stepRef = useRef<{ idx: number; at: number } | null>(null);  // slide a keyboard step is heading to
  const [settled, setSettled] = useState(0);                    // same, but only after scrolling pauses (drives the readout)

  useEffect(() => {
    let live = true;
    setItems(null);
    provider.fetch(candidates, perTopic).then(r => live && setItems(r));
    return () => { live = false; };
  }, [provider, candidates.join(), perTopic]);

  const knownSet = useMemo(() => new Set(known), [known.join()]);
  const cards = useMemo(() => (items ? rankFeed(items, knownSet, pathTo, mix) : []), [items, knownSet, pathTo, mix]);

  // Report the slide in view. Works with any number of slides (skeleton/end slides report null).
  // The position readout only updates once scrolling settles, so it (and its live region) isn't chatty.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const slides = [...root.querySelectorAll<HTMLElement>('.feed__slide')];
    let timer: number | undefined;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        activeRef.current = slides.indexOf(e.target as HTMLElement);
        onActiveChange?.(cards[Number((e.target as HTMLElement).dataset.index)] ?? null);
      }
      clearTimeout(timer);
      timer = window.setTimeout(() => setSettled(activeRef.current), 250);
    }, { root, threshold: 0.6 });
    slides.forEach((s) => io.observe(s));
    return () => { io.disconnect(); clearTimeout(timer); };
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
      if (!el || e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(TYPING) || t?.isContentEditable) return;
      const dir = ['j', 'ArrowDown'].includes(e.key) ? 1 : ['k', 'ArrowUp'].includes(e.key) ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      if (!items) return;
      const slides = el.querySelectorAll<HTMLElement>('.feed__slide');
      // Rapid presses build on where the last step was heading, not on the mid-scroll position.
      const step = stepRef.current;
      const from = step && performance.now() - step.at < 700 ? step.idx : activeRef.current;
      const next = Math.max(0, Math.min(slides.length - 1, from + dir));
      if (next === from) return;
      stepRef.current = { idx: next, at: performance.now() };
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ top: next * el.clientHeight, behavior: reduce ? 'auto' : 'smooth' });
      // Move keyboard focus with the view so Tab continues from the card you're reading.
      const target = slides[next].firstElementChild as HTMLElement | null;
      if (target) {
        if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [mapOpen, setMapOpen, items]);

  return (
    <div className="feed">
      <div className="feed__scroller" ref={scroller} inert={map && mapOpen ? true : undefined}>
        {!items && <div className="feed__slide" data-index={-1}><div className="nc nc--skeleton" role="status" aria-label="Loading stories" aria-busy="true" /></div>}
        {cards.map((c, i) => (
          <div className="feed__slide" key={c.id} data-index={i}>
            <NewsCard card={c} index={i} total={cards.length} topicName={topicName}
              reason={reason} onChipHover={onChipHover} onChipClick={onChipClick} onRead={onRead} />
          </div>
        ))}
        {items && (
          <div className="feed__slide" data-index={-1}>
            <section className="nc nc--end" aria-labelledby="feed-end-title">
              <h2 className="nc__headline" id="feed-end-title">That's the edge of today's map.</h2>
              <p className="nc__summary">See where these stories sit, and add new topics to your bubble.</p>
              {map && <button className="nc__cta" onClick={() => setMapOpen(true)}>Open your map</button>}
            </section>
          </div>
        )}
      </div>

      {map && (
        <>
          <button ref={mapBtn} className="feed__mapbtn" onClick={() => setMapOpen(true)} aria-label="Open your map" aria-haspopup="dialog" inert={mapOpen ? true : undefined}>
            <span aria-hidden>◎</span> Map
          </button>
          {mapOpen && (
            <div className="feed__sheet" ref={sheet} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Your map">
              {!mapHasOwnClose && <button className="feed__close" onClick={() => setMapOpen(false)} aria-label="Close map">✕</button>}
              {map}
            </div>
          )}
        </>
      )}

      {cards.length > 0 && (
        <p className="feed__pos" aria-live="polite" aria-atomic="true" inert={mapOpen ? true : undefined}>
          {settled < cards.length ? (
            <>
              <span aria-hidden>{settled + 1} / {cards.length}</span>
              <span className="sr-only">Story {settled + 1} of {cards.length}</span>
            </>
          ) : (
            <span>End of today's stories</span>
          )}
        </p>
      )}
    </div>
  );
}
