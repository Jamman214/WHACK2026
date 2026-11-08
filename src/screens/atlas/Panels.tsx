import { useState, type CSSProperties, type ReactNode } from "react";
import { CATEGORIES, CATEGORY_BY_ID, type CategoryId } from "../../data/taxonomy";
import { MODEL, DEFAULT_STRENGTH } from "../../data/model";
import { planetInfo } from "../../data/planets";
import { edgeReason } from "../../data/reasons";
import type { NewsProvider } from "../../feed";
import { pathTo, type Layout } from "../../lib/layout";
import { colOf } from "../../lib/atlasStyle";
import { routeTo, whereNext, type SolarModel, type SolarPlanet } from "../../lib/solar";
import News from "./News";
import Dist from "./Dist";
import { catName, plural, planetColor, planetName, stepsOut, strengthWord, topicName, type PlanetKey } from "./util";

/** Everything the panels need from Atlas: data in, intents out. */
export interface PanelCtx {
  lay: Layout;
  sm: SolarModel;
  known: Set<string>;
  provider: NewsProvider;
  /** Open a planet (or the home planet) with nothing selected. */
  openPlanet: (id: PlanetKey) => void;
  /** Open the planet a topic lives on with the topic selected. */
  openTopic: (id: string) => void;
  /** Select / deselect a topic inside the open planet. */
  toggleTopic: (id: string) => void;
  add: (id: string) => void;
  remove: (id: string) => void;
  goMap: () => void;
  reset: () => void;
  /** Topic just added (briefly highlighted), or null. */
  fresh: string | null;
}

const canRemove = (c: PanelCtx) => c.known.size > 1;
const LAST_NOTE = "Your bubble needs at least one topic.";
const isOut = (p: SolarPlanet) => !Number.isFinite(p.orbit);

/** Planets with nothing known on them that sit one step from the bubble. */
const frontierCount = (sm: SolarModel) =>
  Object.values(sm.planets).filter((p) => p.orbit === 1 && p.explored.length === 0).length;

function Sec({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={"sec" + (className ? " " + className : "")}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** A topic that links somewhere: dot, name, small second line, optional strength. */
function Row({ id, sub, w, onClick }: { id: string; sub?: string; w?: number; onClick: () => void }) {
  return (
    <li>
      <button type="button" className={"row" + (w ? "" : " row--plain")} onClick={onClick}>
        <span className="row__dot" style={{ background: colOf(id) }} aria-hidden="true" />
        <span className="nm">{topicName(id)}{(sub || !!w) && <small>{sub}{sub && !!w && " · "}{!!w && strengthWord(w)}</small>}</span>
        {!!w && (
          <>
            <span className="bar" aria-hidden="true"><b style={{ width: w * 100 + "%", background: colOf(id) }} /></span>
          </>
        )}
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// Level 1: the whole map
// ---------------------------------------------------------------------------------------------
export function Overview(c: PanelCtx) {
  const { sm, known } = c;
  const next = whereNext(sm, 3);
  const bubble = [...known];
  return (
    <>
      <h2 tabIndex={-1} data-focus>Where to next</h2>
      {next.length ? (
        <ul className="wn-list">
          {next.map((id) => {
            const p = sm.planets[id], via = p.via, why = via ? edgeReason(via.from, via.to) : undefined;
            return (
              <li key={id}>
                <button type="button" className="wn" onClick={() => { const t = p.nearest[0] ?? via?.to; t ? c.openTopic(t) : c.openPlanet(id); }}>
                  <span className="wn__dot" style={{ background: planetColor(id) }} aria-hidden="true" />
                  <span className="wn__body">
                    <span className="wn__name">{planetName(id)}</span>
                    <span className="wn__meta"><Dist ring={p.orbit} />{via && <span className="wn__via">via {topicName(via.from)}</span>}</span>
                    {why && <span className="wn__why">{why}</span>}
                  </span>
                  <span className="wn__go" aria-hidden="true">→</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty">No planet is within reach of your bubble yet. Add a topic from the search to open a route.</p>
      )}

      <Sec title={`Your bubble · ${bubble.length} ${plural(bubble.length, "topic", "topics")}`}>
        <ul className="chips">
          {bubble.map((id) => (
            <li key={id}>
              <button type="button" className="tchip" onClick={() => c.openTopic(id)}>
                <i style={{ background: colOf(id) }} aria-hidden="true" />{topicName(id)}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="at-link" onClick={() => c.openPlanet("home")}>Open your knowledge →</button>
      </Sec>

      <div className="btnrow"><button type="button" className="at-btn" onClick={c.reset}>Reset to starting bubble</button></div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Level 2a: the "Your knowledge" planet
// ---------------------------------------------------------------------------------------------
export function HomePanel(c: PanelCtx) {
  const { sm, known } = c;
  const groups = CATEGORIES.map((cat) => ({ cat, ids: cat.topics.filter((t) => known.has(t.id)).map((t) => t.id) })).filter((g) => g.ids.length);
  const n = frontierCount(sm);
  const [editing, setEditing] = useState(false);
  return (
    <>
      <div className="phead">
        <span className="chip"><i style={{ background: "var(--sun)" }} aria-hidden="true" /><span>The centre of the map</span></span>
        <h2 tabIndex={-1} data-focus>Your knowledge</h2>
        <p className="tag">Everything else is measured in steps from here.</p>
      </div>
      <p className="frontier">
        <strong>{n}</strong> {plural(n, "planet is", "planets are")} one step out. Open one to see how it connects to what you know.
      </p>
      <div className="btnrow btnrow--edit">
        <button type="button" className="at-btn" aria-pressed={editing} onClick={() => setEditing((e) => !e)}>Edit bubble</button>
        {editing && !canRemove(c) && <p className="note">{LAST_NOTE}</p>}
      </div>
      {groups.map(({ cat, ids }) => (
        <section className="sec" key={cat.id}>
          <h3>
            <button type="button" className="gh" onClick={() => c.openPlanet(cat.id)}>
              <i style={{ background: planetColor(cat.id) }} aria-hidden="true" />{cat.name}
              <span className="gh__n">{ids.length} of {cat.topics.length}</span>
            </button>
          </h3>
          <ul>
            {ids.map((id) => (
              <li key={id} className="krow" data-fresh={c.fresh === id || undefined}>
                <button type="button" className="row row--plain" onClick={() => c.openTopic(id)}>
                  <span className="row__dot" style={{ background: colOf(id) }} aria-hidden="true" />
                  <span className="nm">{topicName(id)}</span>
                </button>
                {editing && canRemove(c) && (
                  <button type="button" className="at-mini" aria-label={`Remove ${topicName(id)} from my bubble`} onClick={() => c.remove(id)}>Remove</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Level 2b: a category planet (and level 3: one topic expanded inside it)
// ---------------------------------------------------------------------------------------------
export function PlanetPanel({ id, sel, ...c }: PanelCtx & { id: CategoryId; sel: string | null }) {
  const { sm, lay } = c;
  const p = sm.planets[id], info = planetInfo(id), cat = CATEGORY_BY_ID[id];
  const total = cat.topics.length, done = p.explored.length;
  const out = isOut(p);
  // nearest topics first, so the way in reads top-down
  const topics = [...p.topics].sort((a, b) => lay.nodes[a].ring - lay.nodes[b].ring);
  return (
    <>
      <div className="phead" style={{ "--pc": planetColor(id) } as CSSProperties}>
        <span className="chip"><i style={{ background: planetColor(id) }} aria-hidden="true" /><span>Planet</span></span>
        <h2 tabIndex={-1} data-focus>{cat.name}</h2>
        <p className="tag">{info.tagline}</p>
      </div>
      {info.blurb && <p className="blurb">{info.blurb}</p>}

      <div className="prog" style={{ "--pc": planetColor(id) } as CSSProperties}>
        <div className="prog__top">
          <strong>{done} of {total} explored</strong>
          <span className="prog__far">{out ? "Out of reach" : p.complete ? "Fully explored" : stepsOut(p.orbit)}</span>
        </div>
        <div className="track" role="progressbar" aria-label={`${cat.name}: topics explored`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <b style={{ width: (done / total) * 100 + "%", background: planetColor(id) }} />
        </div>
      </div>

      <Connect id={id} p={p} out={out} {...c} />

      <Sec title="Topics">
        <ul className="topics">
          {topics.map((tid) => {
            const ring = lay.nodes[tid].ring, isSel = tid === sel, inB = c.known.has(tid);
            return (
              <li key={tid} className="topic" data-sel={isSel || undefined} data-fresh={c.fresh === tid || undefined}>
                <div className="trow">
                  <button type="button" className="trow__main" aria-expanded={isSel} onClick={() => c.toggleTopic(tid)}>
                    <span className="row__dot" style={{ background: colOf(tid) }} aria-hidden="true" />
                    <span className="nm">{topicName(tid)}</span>
                    {!isSel && <Dist ring={ring} />}
                  </button>
                  {!isSel && (inB
                    ? canRemove(c)
                      ? <button type="button" className="at-mini" aria-label={`Remove ${topicName(tid)} from my bubble`} onClick={() => c.remove(tid)}>Remove</button>
                      : <span className="at-mini at-mini--note" title={LAST_NOTE}>Last topic</span>
                    : <button type="button" className="at-mini at-mini--add" aria-label={`Add ${topicName(tid)} to my bubble`} onClick={() => c.add(tid)}>Add</button>)}
                </div>
                {isSel && <TopicDetail id={tid} {...c} />}
              </li>
            );
          })}
        </ul>
      </Sec>

      {!sel && <News key={id} provider={c.provider} lay={lay} ids={p.topics} heading={`News from ${cat.name}`} showTopic />}

    </>
  );
}

/** How this planet links back to you: the single strongest route, one sentence per step. */
function Connect({ id, p, out, lay, ...c }: PanelCtx & { id: CategoryId; p: SolarPlanet; out: boolean }) {
  const target = p.nearest[0];
  const steps = !p.complete && target ? routeTo(lay, target) : [];
  const knownHere = p.explored.map(topicName);
  let body: ReactNode;
  if (p.complete) {
    body = <p className="empty">You know every topic here. This planet is fully part of your bubble.</p>;
  } else if (out) {
    body = <p className="empty">No chain of related links reaches this planet from your bubble yet. Add a topic on a nearer planet to open a route.</p>;
  } else if (!steps.length) {
    body = (
      <p className="empty">
        You already know {knownHere.join(", ")} here, so this planet is already part of your bubble. The topics below show how far each of the others is.
      </p>
    );
  } else {
    body = (
      <>
        {p.orbit === 1 && <p className="empty">This planet is right next to what you know: one link away.</p>}
        <ol className="route">
          {steps.map((s, i) => {
            const why = s.reason ?? edgeReason(s.from, s.to);
            return (
              <li key={i}>
                <button type="button" className="step" onClick={() => c.openTopic(s.to)}>
                  <span className="step__n" aria-hidden="true">{i + 1}</span>
                  <span className="step__body">
                    <span className="step__ft">{topicName(s.from)} <span aria-hidden="true">→</span><span className="sr-only"> to </span> {topicName(s.to)}</span>
                    {why && <span className="step__why">{why}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </>
    );
  }
  return <Sec title="How this connects to you">{body}</Sec>;
}

/** The expanded topic: where it sits, how you get here, add/remove, and its own stories. */
function TopicDetail({ id, lay, known, ...c }: PanelCtx & { id: string }) {
  const ring = lay.nodes[id].ring;
  let body: ReactNode;
  if (ring === 0) {
    const out = MODEL.adj[id].filter((e) => e.w >= DEFAULT_STRENGTH && lay.nodes[e.o].ring === 1).sort((a, b) => b.w - a.w);
    body = (
      <Sec title={`Topics that connect to ${topicName(id)}`}>
        {out.length ? (
          <ul>{out.map((e) => <Row key={e.o} id={e.o} sub={catName(e.o)} w={e.w} onClick={() => c.openTopic(e.o)} />)}</ul>
        ) : <p className="empty">No topics connect outward from here yet.</p>}
      </Sec>
    );
  } else if (!Number.isFinite(ring)) {
    body = <p className="empty">No chain of related links reaches this topic from your bubble yet. Add a nearby topic to open up a route.</p>;
  } else {
    const path = pathTo(lay, id);
    body = (
      <Sec title="How you get here">
        <ol className="path">
          {path.map((s, i) => {
            const why = i ? edgeReason(path[i - 1], s) : undefined;
            return (
              <li key={s}>
                <button type="button" className="row" onClick={() => c.openTopic(s)}>
                  <span className="p-dot" style={{ background: colOf(s) }} aria-hidden="true" />
                  <span className="nm">{topicName(s)}<small>{i === 0 ? "You know this" : <>{catName(s)} · {strengthWord(lay.nodes[s].pw)}</>}</small>{why && <small className="why">{why}</small>}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </Sec>
    );
  }
  return (
    <div className="tdetail" id={"topic-" + id}>
      <span className="kicker"><Dist ring={ring} /></span>
      {body}
      <div className="btnrow">
        {ring !== 0 ? (
          <button type="button" className="at-btn primary" onClick={() => c.add(id)}>Add to my bubble</button>
        ) : known.size > 1 ? (
          <button type="button" className="at-btn" onClick={() => c.remove(id)}>Remove from bubble</button>
        ) : <p className="note">{LAST_NOTE}</p>}
      </div>
      <News key={id} provider={c.provider} lay={lay} ids={[id]} heading={`News on ${topicName(id)}`} showTopic={false} />
    </div>
  );
}

