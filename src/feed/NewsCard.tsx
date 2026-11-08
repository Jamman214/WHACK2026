import { Fragment } from 'react';
import type { FeedCardModel } from './types';

type Props = {
  card: FeedCardModel;
  topicName: (id: string) => string;
  index: number;
  total: number;
  /** Why `b` matters to someone who follows `a` (one sentence), if known. */
  reason?: (a: string, b: string) => string | undefined;
  onChipHover?: (topicId: string | null) => void;
  onChipClick?: (topicId: string, cardTopicId: string) => void;
};

export function NewsCard({ card, topicName, index, total, reason, onChipHover, onChipClick }: Props) {
  const p = card.placement;
  const outside = p.kind === 'bridge';
  const ring = outside ? Math.min(p.hops, 3) : 0;
  const steps = outside ? p.path.slice(1).map((to, i) => ({ from: p.path[i], to, why: reason?.(p.path[i], to) })) : [];
  const last = steps[steps.length - 1];

  const chip = (id: string) => (
    <button type="button" className={`nc__chip${id === card.topicId ? ' nc__chip--here' : ''}`}
      onMouseEnter={() => onChipHover?.(id)} onMouseLeave={() => onChipHover?.(null)}
      onFocus={() => onChipHover?.(id)} onBlur={() => onChipHover?.(null)}
      onClick={() => onChipClick?.(id, card.topicId)} title="Show on the map">
      {topicName(id)}
    </button>
  );

  return (
    <article className={`nc ${outside ? `nc--out nc--r${ring}` : 'nc--in'}`} aria-roledescription="story"
      aria-label={`${index + 1} of ${total}: ${card.headline}`}>
      {card.image && <img className="nc__img" src={card.image} alt="" loading="lazy" />}

      <header className="nc__meta">
        <span className="nc__topic">{topicName(card.topicId)}</span>
        <span className={`nc__badge nc__badge--r${ring}`}>
          {outside ? `${p.hops} step${p.hops > 1 ? 's' : ''} outside your bubble` : 'In your bubble'}
        </span>
      </header>

      {outside && (
        <>
          <p className="nc__bridge">
            Because you follow{' '}
            {p.path.map((id, i) => (
              <Fragment key={id}>{i > 0 && <span className="nc__arrow" aria-hidden>→</span>}{chip(id)}</Fragment>
            ))}
          </p>
          {last?.why && (steps.length === 1 ? (
            <p className="nc__why">{last.why}</p>
          ) : (
            <details className="nc__why">
              <summary>{last.why} <span className="nc__more">All {steps.length} steps</span></summary>
              <ol className="nc__steps">
                {steps.map((s) => (
                  <li key={s.to}><b>{topicName(s.from)} → {topicName(s.to)}.</b> {s.why}</li>
                ))}
              </ol>
            </details>
          ))}
        </>
      )}

      <h2 className="nc__headline">{card.headline}</h2>
      <p className="nc__summary">{card.summary}</p>

      <footer className="nc__foot">
        <span className="nc__source">{card.source} · {ago(card.publishedAt)}</span>
        <a className="nc__cta" href={card.url} target="_blank" rel="noopener noreferrer">
          Read the full story <span aria-hidden>↗</span>
        </a>
      </footer>
    </article>
  );
}

function ago(iso: string) {
  const h = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3.6e6));
  return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
