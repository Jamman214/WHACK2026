import { useEffect, useId, useRef, useState } from "react";
import { articlesFor, type FeedItem, type NewsProvider } from "../../feed";
import { pathTo, type Layout } from "../../lib/layout";
import Dist from "./Dist";
import { SOURCE_DEMO, ago, plural, topicName } from "./util";

/**
 * Articles for some topics, newest first. `items` is null while loading; `failed` is a fetch that errored
 * (distinct from genuinely no stories). A request that is no longer wanted (the topics or provider changed,
 * or the panel went away) is ignored, so a slow response can never overwrite a newer one.
 */
function useArticles(provider: NewsProvider, ids: string[]) {
  const key = ids.join(",");
  const [tries, setTries] = useState(0);
  const [done, setDone] = useState<{ key: string; tries: number; items: FeedItem[]; failed: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    articlesFor(provider, key ? key.split(",") : [], 6).then(
      (items) => { if (live) setDone({ key, tries, items, failed: false }); },
      () => { if (live) setDone({ key, tries, items: [], failed: true }); },
    );
    return () => { live = false; };
  }, [provider, key, tries]);
  const cur = done && done.key === key && done.tries === tries ? done : null;
  return { items: cur ? cur.items : null, failed: !!cur?.failed, retry: () => setTries((t) => t + 1) };
}

/** Why this story is here: the same route the map draws, in one line. */
function reason(lay: Layout, topicId: string): string {
  const ring = lay.nodes[topicId]?.ring;
  if (ring === 0) return "In your bubble";
  if (ring === undefined || !Number.isFinite(ring)) return "No route from your bubble yet";
  const path = pathTo(lay, topicId);
  return `Because you follow ${topicName(path[0])} → ${topicName(topicId)}`;
}

const SHOWN = 4;

/** One story: the same card in the panel and in the "all stories" modal. */
function NewsCard({ a, lay, showTopic, onRead }: { a: FeedItem; lay: Layout; showTopic: boolean; onRead?: (topicId: string) => void }) {
  return (
    <li className="nws">
      <div className="nws__top">
        {showTopic && <span className="nws__topic">{topicName(a.topicId)}</span>}
        <Dist ring={lay.nodes[a.topicId]?.ring ?? Infinity} />
      </div>
      <h4>{a.headline}</h4>
      <p className="nws__why">{reason(lay, a.topicId)}</p>
      {a.summary && <p>{a.summary}</p>}
      <div className="nws__foot">
        <span className="nws__src">
          {a.source === SOURCE_DEMO ? <b className="nws__demo">{SOURCE_DEMO}</b> : a.source}
          <span aria-hidden="true"> · </span>{ago(a.publishedAt)}
        </span>
        <a className="nws__read" href={a.url} target="_blank" rel="noopener" onClick={() => onRead?.(a.topicId)}
          aria-label={`Read “${a.headline}” (opens in a new tab)`}>
          Read <span aria-hidden="true">↗</span>
        </a>
      </div>
    </li>
  );
}

/** Every story in a wide modal grid. Native <dialog> gives the focus trap and inert background; Esc and a backdrop click close it. */
function NewsDialog({ items, lay, heading, showTopic, onRead, onClose }: {
  items: FeedItem[]; lay: Layout; heading: string; showTopic: boolean; onRead?: (topicId: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    d?.showModal();
    return () => { d?.close(); opener?.focus?.(); };
  }, []);
  return (
    <dialog ref={ref} className="at-modal at-modal--news" aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="at-modal__card at-modal__card--news">
        <header className="at-modal__head">
          <h2 id={titleId}>{heading}</h2>
          <button type="button" className="at-btn at-modal__x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <ul className="news__grid">
          {items.map((a) => <NewsCard key={a.id} a={a} lay={lay} showTopic={showTopic} onRead={onRead} />)}
        </ul>
      </div>
    </dialog>
  );
}

/** A "News" block: skeletons while loading, an empty state, then cards with a link out. */
export default function News({ provider, lay, ids, heading, showTopic, hideHeading, onRead }: {
  provider: NewsProvider; lay: Layout; ids: string[]; heading: string; showTopic: boolean;
  /** The surrounding panel already shows the heading, so keep it for screen readers only. */
  hideHeading?: boolean;
  /** A story was opened: its topic is what the reader just read about. */
  onRead?: (topicId: string) => void;
}) {
  const { items, failed, retry } = useArticles(provider, ids);
  const [open, setOpen] = useState(false);
  const hid = useId();
  const shown = items ? items.slice(0, SHOWN) : [];
  return (
    <section className="sec news" aria-labelledby={hid} aria-busy={!items}>
      <h3 id={hid} className={hideHeading ? "sr-only" : undefined}>{heading}</h3>
      {!items ? (
        <ul className="news__list" aria-label="Loading stories">
          {[0, 1].map((i) => (
            <li key={i} className="nws nws--skel" aria-hidden="true"><i /><i /><i /></li>
          ))}
        </ul>
      ) : failed ? (
        <div className="news__fail" role="alert">
          <p className="empty">Couldn't load stories just now.</p>
          <button type="button" className="at-btn" onClick={retry}>Retry</button>
        </div>
      ) : !items.length ? (
        <p className="empty">No stories on this yet. Read about a nearby topic to see more.</p>
      ) : (
        <>
          <ul className="news__list">
            {shown.map((a) => <NewsCard key={a.id} a={a} lay={lay} showTopic={showTopic} onRead={onRead} />)}
          </ul>
          {items.length > SHOWN && (
            <button type="button" className="at-link" aria-haspopup="dialog" onClick={() => setOpen(true)}>
              {`Show ${items.length - SHOWN} more ${plural(items.length - SHOWN, "story", "stories")}`}
            </button>
          )}
          {open && <NewsDialog items={items} lay={lay} heading={heading} showTopic={showTopic} onRead={onRead} onClose={() => setOpen(false)} />}
        </>
      )}
    </section>
  );
}
