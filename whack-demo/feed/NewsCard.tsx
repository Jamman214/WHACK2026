import type { FeedCardModel } from './types';

type Props = {
  card: FeedCardModel;
  topicName: (id: string) => string;
  index: number;
  total: number;
};

export function NewsCard({ card, topicName, index, total }: Props) {
  const p = card.placement;
  const outside = p.kind === 'bridge';
  return (
    <article className={`nc ${outside ? 'nc--out' : 'nc--in'}`} aria-roledescription="story"
      aria-label={`${index + 1} of ${total}: ${card.headline}`}>
      {card.image && <img className="nc__img" src={card.image} alt="" loading="lazy" />}

      <header className="nc__meta">
        <span className="nc__topic">{topicName(card.topicId)}</span>
        <span className="nc__where">
          {outside ? `Outside your bubble · ${p.hops} step${p.hops > 1 ? 's' : ''} away` : 'In your bubble'}
        </span>
      </header>

      {outside && (
        <p className="nc__bridge">
          Because you follow <b>{topicName(p.from)}</b> → <b>{topicName(p.to)}</b>
        </p>
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
