import type { FeedCardModel } from './types';

type Props = {
  card: FeedCardModel;
  topicName: (id: string) => string;
  index: number;
  total: number;
  /** Why `b` matters to someone who follows `a`. Not shown for now: the card lists the links only. */
  reason?: (a: string, b: string) => string | undefined;
  onChipHover?: (topicId: string | null) => void;
  onChipClick?: (topicId: string, cardTopicId: string) => void;
};

export function NewsCard({ card, topicName, index, total, onChipHover, onChipClick }: Props) {
  const p = card.placement;
  const outside = p.kind === 'bridge';
  const ring = outside ? Math.min(p.hops, 3) : 0;
  const path = outside ? p.path : [];
  // The route already ends on this story's topic, so a separate topic pill would say it twice.
  const showTopic = !outside || path[path.length - 1] !== card.topicId;

  const chip = (id: string, i: number) => (
    <button type="button" className={`nc__chip${id === card.topicId ? ' nc__chip--here' : ''}`}
      aria-label={`Show ${topicName(id)} on the map`} title="Show on the map"
      onMouseEnter={() => onChipHover?.(id)} onMouseLeave={() => onChipHover?.(null)}
      onFocus={() => onChipHover?.(id)} onBlur={() => onChipHover?.(null)}
      onClick={() => onChipClick?.(id, card.topicId)}>
      <span className="nc__pin" aria-hidden>{i > 0 ? i : ''}</span>
      {topicName(id)}
    </button>
  );

  return (
    <article className={`nc nc--story ${outside ? `nc--r${ring}` : 'nc--in'}`} aria-roledescription="story"
      aria-label={`${index + 1} of ${total}: ${card.headline}`}>
      {card.image && (
        <img className="nc__img" src={card.image} alt="" loading="lazy"
          onError={(e) => { e.currentTarget.hidden = true; }} />
      )}

      <div className="nc__body">
        <header className="nc__meta">
          <span className="nc__badge">
            <span className="nc__meter" aria-hidden>
              {outside
                ? [1, 2, 3].map((n) => <i key={n} className={n <= ring ? 'on' : undefined} />)
                : <i className="home" />}
            </span>
            {outside ? `${p.hops} step${p.hops > 1 ? 's' : ''} outside your bubble` : 'In your bubble'}
          </span>
          {showTopic && <span className="nc__topic">{topicName(card.topicId)}</span>}
        </header>

        <h2 className="nc__headline">{card.headline}</h2>
        <p className="nc__summary">{card.summary}</p>

        {outside && (
          <section className="nc__route" aria-labelledby={`nc-route-${card.id}`}>
            <h3 className="nc__routeh" id={`nc-route-${card.id}`}>How you&rsquo;re connected</h3>
            <ol className="nc__rail" aria-label="Your route">
              {path.map((id, i) => (
                <li key={id} className={`nc__stop nc__stop--s${Math.min(i, 3)}`}>
                  {i > 0 && <span className="nc__link" aria-hidden />}
                  {chip(id, i)}
                  {i === 0 && <span className="nc__note">You follow</span>}
                  {i > 0 && i === path.length - 1 && <span className="nc__note">This story</span>}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <footer className="nc__foot">
        <span className="nc__source">{card.source} · {ago(card.publishedAt)}</span>
        <a className="nc__cta" href={card.url} target="_blank" rel="noopener noreferrer">
          Read the full story <span aria-hidden>↗</span><span className="sr-only"> (opens in a new tab)</span>
        </a>
      </footer>
    </article>
  );
}

function ago(iso: string) {
  const h = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3.6e6));
  return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
