import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Article, ago } from './Article';
import { DISTANCES, pickEdition, rankFeed, ringOf } from './rank';
import { Reach } from './Reach';
import { Thread } from './Thread';
import type { FeedCardModel, NewsProvider } from './types';
import './edition.css';

/** Where to open the map: the topic to select and the route to frame. */
export type MapFocus = { sel: string; center: string[] };

type Props = {
  known: string[];                                  // the bubble
  candidates: string[];                             // topic ids to fetch (bubble + reachable)
  provider: NewsProvider;
  pathTo: (id: string) => string[] | null;
  topicName: (id: string) => string;
  reason?: (a: string, b: string) => string | undefined;
  perTopic?: number;
  map?: ReactNode;                                  // the Atlas, shown as a full-screen sheet
  mapOpen: boolean;
  onOpenMap: (focus?: MapFocus) => void;
  onCloseMap: () => void;
  onRead?: (card: FeedCardModel) => void;          // the reader opened a story's full text (this is how its topic joins the bubble)
};

/** Keys typed into these belong to them, not to the list. */
const TYPING = 'input,textarea,select,[contenteditable]:not([contenteditable="false"])';
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
const LIMIT = 3;   // rows shown per group before "Show N more"
const RING_LABEL = ['In your bubble', '1 step out', '2 steps out', '3+ steps out'] as const;

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

function today() {
  const d = new Date();
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', o).format(d);
  return `${part({ weekday: 'short' })} ${part({ day: 'numeric' })} ${part({ month: 'short' })}`;
}

/** Today's edition: a date + grouped story list on the left, the thread and the story on the right. */
export function Edition({
  known, candidates, provider, pathTo, topicName, reason, perTopic = 2,
  map, mapOpen, onOpenMap, onCloseMap, onRead,
}: Props) {
  const [items, setItems] = useState<Awaited<ReturnType<NewsProvider['fetch']>> | null>(null);
  const [dist, setDist] = useState(1);                                   // Wider
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const sheet = useRef<HTMLDivElement>(null);
  const mapBtn = useRef<HTMLButtonElement>(null);
  const reader = useRef<HTMLElement>(null);
  const rows = useRef<Record<string, HTMLButtonElement | null>>({});
  const pendingFocus = useRef<string | null>(null);
  const wasOpen = useRef(false);
  const d = DISTANCES[dist];

  useEffect(() => {
    let live = true;
    setItems(null);
    provider.fetch(candidates, perTopic).then((r) => live && setItems(r));
    return () => { live = false; };
  }, [provider, candidates.join(), perTopic]);

  const knownSet = useMemo(() => new Set(known), [known.join()]);
  const ranked = useMemo(() => (items ? rankFeed(items, knownSet, pathTo, d.mix) : []), [items, knownSet, pathTo, d]);
  const edition = useMemo(() => pickEdition(ranked), [ranked]);
  const groups = useMemo(
    () => [0, 1, 2, 3].map((ring) => ({ ring, cards: edition.filter((c) => ringOf(c) === ring) })),
    [edition],
  );

  // The story on the right: the one picked, else the first story from outside the bubble.
  const sel: FeedCardModel | null =
    edition.find((c) => c.id === selectedId) ?? edition.find((c) => c.placement.kind === 'bridge') ?? edition[0] ?? null;

  // Rows on screen: the first few per group (all when expanded, or when the picked story is further down).
  const shown = (ring: number, cards: FeedCardModel[]) => {
    const at = cards.findIndex((c) => c.id === sel?.id);
    if (ring === 0) return expanded[0] || at >= 0 ? cards : [];
    return expanded[ring] || at >= LIMIT ? cards : cards.slice(0, LIMIT);
  };
  const visible = groups.flatMap((g) => shown(g.ring, g.cards));

  const focusFor = (c: FeedCardModel): MapFocus => ({
    sel: c.topicId, center: c.placement.kind === 'bridge' ? c.placement.path : [c.topicId],
  });
  const openMapAtSel = () => onOpenMap(sel ? focusFor(sel) : undefined);

  // Reading a new story starts at its top.
  useEffect(() => { reader.current?.scrollTo({ top: 0 }); }, [sel?.id]);

  // Keyboard: pick a story → move focus to its row so Tab continues from there.
  useLayoutEffect(() => {
    if (sel && pendingFocus.current === sel.id) {
      const el = rows.current[sel.id];
      el?.focus();
      el?.scrollIntoView({ block: 'nearest' });
      pendingFocus.current = null;
    }
  }, [sel?.id, visible.length]);

  // Focus: into the sheet when it opens (its own back button), back to ◎ Map when it closes.
  useEffect(() => {
    if (mapOpen) {
      const el = sheet.current;
      (el?.querySelector<HTMLElement>('[data-autofocus]') ?? el)?.focus();
    } else if (wasOpen.current) {
      mapBtn.current?.focus();
    }
    wasOpen.current = mapOpen;
  }, [mapOpen]);

  // j/k or ↑/↓ step through the list, m opens the map (desktop).
  const step = useCallback((dir: 1 | -1) => {
    const at = visible.findIndex((c) => c.id === sel?.id);
    const next = visible[Math.max(0, Math.min(visible.length - 1, at + dir))];
    if (!next || next.id === sel?.id) return;
    pendingFocus.current = next.id;
    setSelectedId(next.id);
  }, [visible, sel?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mapOpen) {
        // The map may have handled Escape itself (clearing a selection) and stopped it before it got here.
        if (e.key === 'Escape') onCloseMap();
        else if (e.key === 'Tab') trapTab(e, sheet.current);
        return;
      }
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(TYPING) || t?.isContentEditable) return;
      if (e.key === 'm') { e.preventDefault(); openMapAtSel(); return; }
      const dir = ['j', 'ArrowDown'].includes(e.key) ? 1 : ['k', 'ArrowUp'].includes(e.key) ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      step(dir);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const n = edition.length;

  return (
    <div className="ed">
      <div className="ed__main" inert={mapOpen ? true : undefined}>
        <nav className="ed__nav" aria-label="Today’s stories">
          <header className="ed__date">
            <div>
              <span className="eyebrow">Today’s edition</span>
              <h1 className="ed__title">{today()}</h1>
            </div>
            {map && (
              <button ref={mapBtn} type="button" className="ed__map" onClick={openMapAtSel} aria-haspopup="dialog">
                <span aria-hidden>◎</span> Map
              </button>
            )}
          </header>

          <section className="ed__dist" aria-label="Distance">
            <div className="ed__sliderrow">
              <label className="ed__eyebrow" htmlFor="ed-dist">How far out</label>
              <div className="ed__slider">
                <input id="ed-dist" type="range" min={0} max={DISTANCES.length - 1} step={1} value={dist}
                  onChange={(e) => setDist(+e.target.value)} aria-valuetext={d.label} />
                <div className="ed__stops">
                  {DISTANCES.map((s, i) => (
                    <button key={s.label} type="button" className={i === dist ? 'on' : undefined} onClick={() => setDist(i)}>{s.label}</button>
                  ))}
                </div>
              </div>
            </div>
            <hr />
            <Reach groups={groups} selectedId={sel?.id} loading={!items} />
          </section>

          {!items && <div className="ed__skel" role="status" aria-label="Loading stories" aria-busy="true" />}

          {items && groups.map((g) => {
            if (g.ring === 0 && !g.cards.length) return null;
            const list = shown(g.ring, g.cards);
            const hidden = g.cards.length - list.length;
            const collapsed = g.ring === 0 && !list.length;
            return (
              <section key={g.ring} className={`ed__group ed__group--r${g.ring}`} aria-label={RING_LABEL[g.ring]}>
                <div className="ed__grouphead">
                  <span className="ed__badge">
                    <span className="ed__meter" aria-hidden>
                      {g.ring === 0 ? <i className="home" /> : [1, 2, 3].map((k) => <i key={k} className={k <= g.ring ? 'on' : undefined} />)}
                    </span>
                    {RING_LABEL[g.ring]}
                  </span>
                  {collapsed
                    ? <button type="button" className="ed__showall" onClick={() => setExpanded({ ...expanded, 0: true })}>Show {g.cards.length} <span aria-hidden>▾</span></button>
                    : <span className="ed__count">{g.cards.length} {g.cards.length === 1 ? 'story' : 'stories'}</span>}
                </div>
                {g.cards.length === 0 && (
                  <p className="ed__quiet">
                    Nothing {g.ring === 1 ? 'one step out' : RING_LABEL[g.ring]} today.{g.ring > 1 && dist < 2 ? ' Slide towards Far to look further.' : ''}
                  </p>
                )}
                <ul className="ed__rows">
                  {list.map((c) => {
                    const on = c.id === sel?.id;
                    return (
                      <li key={c.id}>
                        <button type="button" ref={(el) => { rows.current[c.id] = el; }} className={`ed__row${on ? ' is-on' : ''}`}
                          aria-current={on ? 'true' : undefined} onClick={() => setSelectedId(c.id)}>
                          <span className="ed__bar4" aria-hidden />
                          <span className="ed__rowtext">
                            <span className="ed__rowtitle">{c.headline}</span>
                            <span className="ed__rowmeta">{[topicName(c.topicId), c.source, ago(c.publishedAt)].filter(Boolean).join(' · ')}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {hidden > 0 && g.ring > 0 && (
                  <button type="button" className="ed__more" onClick={() => setExpanded({ ...expanded, [g.ring]: true })}>
                    Show {hidden} more <span aria-hidden>▾</span>
                  </button>
                )}
              </section>
            );
          })}

          {items && n > 0 && (
            <footer className="ed__foot">
              <p>That’s today’s {n}.{ranked.length > n ? ` The other ${ranked.length - n} are in the map, by topic.` : ''}</p>
              <p className="ed__keys" aria-hidden>↑ ↓ or j k  move  ·  m  map</p>
            </footer>
          )}
        </nav>

        <main className="ed__reader" ref={reader} tabIndex={-1} aria-label="Story">
          {!items && <div className="ed__skel ed__skel--big" role="status" aria-label="Loading story" aria-busy="true" />}
          {items && !sel && <p className="ed__empty">No stories to show right now.</p>}
          {sel && (
            <>
              <p className="sr-only" aria-live="polite">Story {Math.max(1, visible.findIndex((c) => c.id === sel.id) + 1)} of {visible.length}: {sel.headline}</p>
              <Thread card={sel} topicName={topicName} reason={reason}
                onChipClick={(id, cardTopic) => onOpenMap({ sel: cardTopic, center: [id] })}
                onShowOnMap={map ? openMapAtSel : undefined} />
              <Article key={sel.id} card={sel} onRead={onRead} />
            </>
          )}
        </main>
      </div>

      {map && mapOpen && (
        <div className="ed__sheet" ref={sheet} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Your map">
          {map}
        </div>
      )}
    </div>
  );
}
