import type { FeedCardModel } from './types';

const LABEL = ['In your bubble', '1 step out', '2 steps out', '3+ steps out'] as const;
const CENTRE = 70;
const BUBBLE_R = 22;
const RADIUS = [15, 36, 50, 64];  // where each group's dots sit: 0 is inside the bubble
const TURN = [-90, -72, -48, -20]; // start angle per ring, so the rings' dots don't line up

/** Plain words for how far the day's mix goes, from the average distance of its stories. */
export function reachTitle(counts: number[]): string {
  const n = counts.reduce((a, b) => a + b, 0);
  if (!n) return 'No stories to place yet';
  const mean = counts.reduce((sum, c, ring) => sum + c * ring, 0) / n;
  if (mean < 0.5) return 'Close to home today';
  if (mean < 0.85) return 'Just outside your comfort zone';
  if (mean < 1.2) return 'Well outside your comfort zone';
  return 'Far outside your comfort zone';
}

function at(ring: number, i: number, count: number) {
  const a = ((TURN[ring] + (i * 360) / count) * Math.PI) / 180;
  return { x: CENTRE + RADIUS[ring] * Math.cos(a), y: CENTRE + RADIUS[ring] * Math.sin(a) };
}

/** Today's stories as dots on rings around the reader: the further out, the further from what they already follow. */
export function Reach({ groups, selectedId, loading }: {
  groups: { ring: number; cards: FeedCardModel[] }[];
  selectedId?: string;
  loading: boolean;
}) {
  const counts = groups.map((g) => g.cards.length);
  const n = counts.reduce((a, b) => a + b, 0);
  return (
    <div className="ed__reach">
      <div className="ed__reachhead">
        <span className="ed__eyebrow">Today’s reach{loading ? '' : ` · ${n} ${n === 1 ? 'story' : 'stories'}`}</span>
        <p className="ed__reachtitle">{loading ? 'Finding today’s stories' : reachTitle(counts)}</p>
      </div>
      <div className="ed__reachbody">
        <svg className="ed__rings" viewBox="0 0 140 140" aria-hidden>
          {[3, 2, 1].map((ring) => (
            <circle key={ring} cx={CENTRE} cy={CENTRE} r={RADIUS[ring] + 6}
              className={`ed__band ed__band--r${ring}${counts[ring] ? ' is-on' : ''}`} />
          ))}
          <circle cx={CENTRE} cy={CENTRE} r={BUBBLE_R} className="ed__core" />
          <text x={CENTRE} y={CENTRE} className="ed__you" textAnchor="middle" dominantBaseline="central">You</text>
          {groups.flatMap((g) => g.cards.map((c, i) => {
            const p = at(g.ring, i, g.cards.length);
            return (
              <circle key={c.id} r={c.id === selectedId ? 5 : 3.2}
                className={`ed__dot ed__dot--r${g.ring}${c.id === selectedId ? ' is-on' : ''}`}
                style={{ transform: `translate(${p.x}px, ${p.y}px)` }} />
            );
          }))}
        </svg>
        <ul className="ed__legend">
          {LABEL.map((label, ring) => (
            <li key={label} className={counts[ring] ? undefined : 'is-empty'}>
              <i className={`ed__key ed__key--r${ring}`} aria-hidden />
              <span>{label}</span>
              <b>{counts[ring]}</b>
            </li>
          ))}
        </ul>
      </div>
      <p className="ed__fine">Each dot is a story. Each ring is one more step from the topics you know. The outlined dot is the one you’re reading.</p>
    </div>
  );
}
