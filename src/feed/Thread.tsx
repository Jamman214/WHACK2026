import type { FeedCardModel } from './types';

type Props = {
  card: FeedCardModel;
  topicName: (id: string) => string;
  /** Why `b` matters to someone who follows `a`. */
  reason?: (a: string, b: string) => string | undefined;
  onChipClick?: (topicId: string, cardTopicId: string) => void;
  onShowOnMap?: () => void;
};

/** The distance badge: pips filled up to the story's ring, plus the words ("1 step outside your bubble"). */
export function Badge({ hops }: { hops: number }) {
  const ring = Math.min(hops, 3);
  return (
    <span className={`ed__badge ed__badge--r${ring}`}>
      <span className="ed__meter" aria-hidden>
        {hops === 0 ? <i className="home" /> : [1, 2, 3].map((n) => <i key={n} className={n <= ring ? 'on' : undefined} />)}
      </span>
      {hops === 0 ? 'In your bubble' : `${hops} step${hops > 1 ? 's' : ''} outside your bubble`}
    </span>
  );
}

/** The route from what you follow to this story, as a left-to-right thread. */
export function Thread({ card, topicName, reason, onChipClick, onShowOnMap }: Props) {
  const p = card.placement;
  const outside = p.kind === 'bridge';
  const path = outside ? p.path : [];
  const why = outside && path.length >= 2 ? reason?.(path[path.length - 2], path[path.length - 1]) : undefined;

  return (
    <section className={`ed__thread ed__thread--r${outside ? Math.min(p.hops, 3) : 0}`} aria-label="How you’re connected to this story">
      <div className="ed__threadtop">
        <Badge hops={outside ? p.hops : 0} />
        {onShowOnMap && (
          <button type="button" className="ed__link" onClick={onShowOnMap}>Show this thread on the map <span aria-hidden>↗</span></button>
        )}
      </div>

      {outside ? (
        <div className="ed__threadrow">
          <ol className="ed__chain">
            {path.map((id, i) => {
              const last = i === path.length - 1;
              return (
                <li key={id} className={`ed__node ed__node--s${Math.min(i, 3)}`}>
                  {i > 0 && <span className="ed__arrow" aria-hidden />}
                  <div className="ed__nodebody">
                    <button type="button" className={`ed__chip${last ? ' ed__chip--here' : ''}`}
                      title="Show on the map" onClick={() => onChipClick?.(id, card.topicId)}>
                      <span className="ed__pin" aria-hidden>{i > 0 ? i : ''}</span>
                      {topicName(id)}
                    </button>
                    <span className="ed__note">{i === 0 ? 'You follow' : last ? 'This story' : `Step ${i}`}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <p className="ed__why">You already follow {topicName(card.topicId)}, so there is no route to show.</p>
      )}

      {why && <p className="ed__why"><span className="ed__whyl">Why this one</span> {why}</p>}
    </section>
  );
}
