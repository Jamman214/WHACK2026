import { MODEL } from "../data/model";
import { TOPIC_BY_ID, TOPICS } from "../data/taxonomy";
import type { FeedCardModel } from "../feed";
import { CX, CY, type Layout } from "../lib/layout";

interface Props {
  lay: Layout;
  thr: number;
  /** card in view (null: none) */
  card: FeedCardModel | null;
  /** distance slider reach: 1, 2 or Infinity rings */
  reach: number;
  reachLabel: string;
  pulseId: string | null;
  onOpen: () => void;
}

const ringClass = (ring: number) => (ring === 0 ? "mm--r0" : `mm--r${Math.min(ring, 3)}`);

/** Compact radial map: bubble, the path to the card in view, its 1-hop neighbours; everything else faded. */
export default function MiniMap({ lay, thr, card, reach, reachLabel, pulseId, onOpen }: Props) {
  const target = card?.topicId ?? null;
  const path = card ? (card.placement.kind === "bridge" ? card.placement.path : [card.topicId]) : [];
  const onPath = new Set(path);
  const neighbours = new Set(target ? MODEL.adj[target].filter((e) => e.w >= thr).map((e) => e.o) : []);
  const N = lay.nodes;

  const last = lay.rings;
  const regionR = reach >= last ? lay.ringRadius[last] + 26 : (lay.ringRadius[reach] + lay.ringRadius[reach + 1]) / 2;
  const hops = card?.placement.kind === "bridge" ? card.placement.hops : 0;

  const label = (id: string) => {
    const n = N[id], far = Math.abs(n.x - CX) > 260, right = far ? n.x < CX : n.x >= CX;
    return (
      <text key={"t" + id} x={n.x + (right ? 22 : -22)} y={n.y + 11} textAnchor={right ? "start" : "end"} className="mm__lbl">
        {TOPIC_BY_ID[id].name}
      </text>
    );
  };

  return (
    <div className="mm">
      <div className="mm__head">
        <span className="eyebrow">Where this story sits</span>
        <strong>{target ? TOPIC_BY_ID[target].name : "Your bubble"}</strong>
        <span className="mm__sub">
          {target ? (hops ? `${hops} step${hops > 1 ? "s" : ""} outside your bubble` : "Inside your bubble") : "Scroll to a story"}
          {" · "}highlighting {reachLabel.toLowerCase()}
        </span>
      </div>
      <button className="mm__btn" onClick={onOpen} aria-label="Open the full map at this story">
        <svg viewBox={`${CX - 530} ${CY - 500} 1060 1000`} role="img" aria-hidden>
          <circle cx={CX} cy={CY} r={regionR} className="mm__region" />
          {lay.ringRadius.slice(1).map((r, i) => <circle key={i} cx={CX} cy={CY} r={r} className="mm__ring" />)}
          <circle cx={CX} cy={CY} r={lay.rb} className="mm__bubble" />
          {target && [...neighbours].map((o) => (
            <line key={"n" + o} x1={N[target].x} y1={N[target].y} x2={N[o].x} y2={N[o].y} className="mm__nedge" />
          ))}
          {path.slice(1).map((id, i) => (
            <line key={"p" + id} x1={N[path[i]].x} y1={N[path[i]].y} x2={N[id].x} y2={N[id].y} className={"mm__pedge " + ringClass(N[id].ring)} />
          ))}
          {TOPICS.map((t) => {
            const n = N[t.id];
            const role = onPath.has(t.id) ? "path" : n.ring === 0 ? "bubble" : neighbours.has(t.id) ? "near" : "fade";
            return <circle key={t.id} cx={n.x} cy={n.y} r={role === "path" ? 17 : role === "fade" ? 9 : 12}
              className={`mm__node mm__node--${role} ${ringClass(n.ring)}`} />;
          })}
          {pulseId && N[pulseId] && <circle cx={N[pulseId].x} cy={N[pulseId].y} r={22} className="mm__pulse" />}
          {(path.length ? path : Object.values(N).filter((n) => n.ring === 0).map((n) => n.id)).map(label)}
        </svg>
        <span className="mm__hint">Open the full map ↗</span>
      </button>
    </div>
  );
}
