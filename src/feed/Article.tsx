import 'flag-icons/css/flag-icons.min.css';
import { countryName, countryOf } from './country';
import type { FeedCardModel } from './types';

/** One story, kept simple: image, title, description, link out. The route lives in the thread above it. */
export function Article({ card, onRead }: { card: FeedCardModel; onRead?: (card: FeedCardModel) => void }) {
  const when = ago(card.publishedAt);
  const country = countryOf(card.url);
  return (
    <article className="ed__article" aria-label={card.headline}>
      {country && (
        <span className={`ed__flag fi fi-${country.toLowerCase()}`} role="img"
          aria-label={`Published in ${countryName(country)}`} title={countryName(country)} />
      )}
      {card.image && (
        <img className="ed__img" src={card.image} alt="" loading="lazy" onError={(e) => { e.currentTarget.hidden = true; }} />
      )}
      <div className="ed__abody">
        <h2 className="ed__headline">{card.headline}</h2>
        {card.summary && <p className="ed__summary">{card.summary}</p>}
      </div>
      <footer className="ed__afoot">
        <span className="ed__source">{[card.source, when].filter(Boolean).join(' · ')}</span>
        <a className="ed__cta" href={card.url} target="_blank" rel="noopener noreferrer" onClick={() => onRead?.(card)}>
          Read the full story <span aria-hidden>↗</span><span className="sr-only"> (opens in a new tab)</span>
        </a>
      </footer>
    </article>
  );
}

export function ago(iso: string) {
  const t = Date.parse(iso);
  if (!iso || Number.isNaN(t)) return '';
  const h = Math.max(0, Math.round((Date.now() - t) / 3.6e6));
  return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
