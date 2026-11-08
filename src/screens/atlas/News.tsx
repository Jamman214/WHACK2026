import { useEffect, useId, useState } from "react";
import { articlesFor, type FeedItem, type NewsProvider } from "../../feed";
import { SOURCE_DEMO, ago, plural, topicName } from "./util";

/**
 * Articles for some topics, newest first. Returns null while loading.
 * A request that is no longer wanted (the topics or provider changed, or the panel went away) is
 * ignored, so a slow response can never overwrite a newer one.
 */
function useArticles(provider: NewsProvider, ids: string[]): FeedItem[] | null {
  const key = ids.join(",");
  const [done, setDone] = useState<{ key: string; items: FeedItem[] } | null>(null);
  useEffect(() => {
    let live = true;
    articlesFor(provider, key ? key.split(",") : [], 2).then(
      (items) => { if (live) setDone({ key, items }); },
      () => { if (live) setDone({ key, items: [] }); },
    );
    return () => { live = false; };
  }, [provider, key]);
  return done && done.key === key ? done.items : null;
}

const SHOWN = 4;

/** A "News" block: skeletons while loading, an empty state, then cards with a link out. */
export default function News({ provider, ids, heading, showTopic }: {
  provider: NewsProvider; ids: string[]; heading: string; showTopic: boolean;
}) {
  const items = useArticles(provider, ids);
  const [all, setAll] = useState(false);
  const hid = useId();
  const shown = items ? (all ? items : items.slice(0, SHOWN)) : [];
  return (
    <section className="sec news" aria-labelledby={hid} aria-busy={!items}>
      <h3 id={hid}>{heading}</h3>
      {!items ? (
        <ul className="news__list" aria-label="Loading stories">
          {[0, 1].map((i) => (
            <li key={i} className="nws nws--skel" aria-hidden="true"><i /><i /><i /></li>
          ))}
        </ul>
      ) : !items.length ? (
        <p className="empty">No stories found for this right now. Try again later.</p>
      ) : (
        <>
          <ul className="news__list">
            {shown.map((a) => (
              <li key={a.id} className="nws">
                {showTopic && <span className="nws__topic">{topicName(a.topicId)}</span>}
                <h4>{a.headline}</h4>
                {a.summary && <p>{a.summary}</p>}
                <div className="nws__foot">
                  <span className="nws__src">
                    {a.source === SOURCE_DEMO ? <b className="nws__demo">{SOURCE_DEMO}</b> : a.source}
                    <span aria-hidden="true"> · </span>{ago(a.publishedAt)}
                  </span>
                  <a className="nws__read" href={a.url} target="_blank" rel="noopener"
                    aria-label={`Read “${a.headline}” (opens in a new tab)`}>
                    Read <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </li>
            ))}
          </ul>
          {items.length > SHOWN && (
            <button type="button" className="at-link" aria-expanded={all} onClick={() => setAll((o) => !o)}>
              {all ? "Show fewer" : `Show ${items.length - SHOWN} more ${plural(items.length - SHOWN, "story", "stories")}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
