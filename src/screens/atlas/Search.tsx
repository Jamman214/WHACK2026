import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { CATEGORIES, type Topic } from "../../data/taxonomy";
import { SEARCH_ALIASES } from "../../data/searchAliases";
import type { Layout } from "../../lib/layout";
import { stepsText, catName, catOf } from "./util";

import { norm, bestTier } from "./searchRank";

const ALL: { t: Topic; fields: string[] }[] = CATEGORIES.flatMap((c) =>
  c.topics.map((t) => ({ t, fields: [t.name, c.name, ...(SEARCH_ALIASES[t.id] ?? [])].map(norm) })));
const byName = (a: string, b: string) => a.localeCompare(b);

/** Find a topic: an editable combobox with a listbox grouped by planet. Doubles as the non-3D way to navigate.
 *  `onAdd` (optional) adds a topic to the bubble; without it no Add control is drawn. */
export default function Search({ lay, open, setOpen, inputRef, onPick, onAdd }: {
  lay: Layout; open: boolean; setOpen: (o: boolean) => void; inputRef: RefObject<HTMLInputElement | null>;
  onPick: (id: string) => void; onAdd?: (topicId: string) => void;
}) {
  const uid = useId();
  const listId = uid + "-list";
  const optId = (id: string) => uid + "-o-" + id;
  const [q, setQ] = useState("");
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [note, setNote] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const ringOf = (id: string) => lay.nodes[id].ring;

  const searching = !!norm(q);
  /** Ranked flat list when searching (tier, then nearest ring, then name); planet order when empty. */
  const flat = useMemo<Topic[]>(() => {
    const n = norm(q);
    if (!n) return CATEGORIES.flatMap((c) => c.topics);
    return ALL.map(({ t, fields }) => ({ t, tier: bestTier(fields, n) }))
      .filter((x) => x.tier < 3)
      .sort((a, b) => a.tier - b.tier || lay.nodes[a.t.id].ring - lay.nodes[b.t.id].ring || byName(a.t.name, b.t.name))
      .map((x) => x.t);
  }, [q, lay]);
  const groups = useMemo(() => CATEGORIES.map((c) => ({ cat: c, items: c.topics })), []);
  /** Three nearest topics outside the bubble, for the no-results fallback. */
  const nearest = useMemo(() =>
    CATEGORIES.flatMap((c) => c.topics)
      .filter((t) => { const r = lay.nodes[t.id].ring; return r > 0 && Number.isFinite(r); })
      .sort((a, b) => lay.nodes[a.id].ring - lay.nodes[b.id].ring || byName(a.name, b.name)).slice(0, 3),
  [lay]);

  const showList = open && flat.length > 0;
  const activeId = showList && active >= 0 && flat[active] ? optId(flat[active].id) : undefined;
  const listKey = flat.map((t) => t.id).join();

  // Whenever the list opens or its contents change, option 0 is highlighted so Enter is never silent.
  useEffect(() => { setActive(open && flat.length ? 0 : -1); setNote(""); }, [open, listKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const pick = (id: string) => { onPick(id); setQ(""); setActive(-1); setOpen(false); inputRef.current?.focus(); };
  const add = (id: string) => { setNote(""); onAdd?.(id); inputRef.current?.focus(); };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = flat.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      if (!n) return;
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a <= 0 ? n - 1 : a - 1)));
    } else if (e.key === "Enter" && showList) {
      e.preventDefault();
      const t = flat[active >= 0 ? active : 0];
      if (e.shiftKey) {
        if (!onAdd) return;
        if (ringOf(t.id) === 0) setNote(`${t.name} is already in your bubble`); else add(t.id);
      } else pick(t.id);
    }
    // Escape is handled in Atlas (capture phase) so closing the list wins over clearing the selection.
  };

  const row = (t: Topic, idx: number) => {
    const ring = ringOf(t.id);
    return (
      <div key={t.id} role="presentation" className="srch__row" onMouseMove={() => active !== idx && setActive(idx)}>
        <div id={optId(t.id)} role="option" aria-selected={idx === active} className="srch__opt" data-active={idx === active}
          onMouseDown={(e) => e.preventDefault()} onClick={() => pick(t.id)}>
          <span className="srch__name">
            {t.name}
            {searching && <small className="srch__sub"><i style={{ background: `var(--c-${catOf(t.id)})` }} aria-hidden="true" />{catName(t.id)}</small>}
          </span>
          <span className="srch__dist" data-ring={ring === 0 ? "in" : undefined}>{stepsText(ring)}</span>
        </div>
        {onAdd && ring !== 0 && (
          <button type="button" className="srch__add" tabIndex={-1} aria-label={`Add ${t.name} to your bubble`}
            onMouseDown={(e) => e.preventDefault()} onClick={() => add(t.id)}>+ Add</button>
        )}
      </div>
    );
  };

  const status = note || (showList ? `${flat.length} ${flat.length === 1 ? "topic" : "topics"} found` : open ? "No topics found" : "");
  const clear = () => { setQ(""); setOpen(true); inputRef.current?.focus(); };
  let i = -1;
  return (
    <div className="ov ov-search" ref={wrap}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { if (!wrap.current?.contains(e.relatedTarget as Node | null)) { setOpen(false); setFocused(false); } }}>
      <label className="sr-only" htmlFor={uid + "-in"}>Find a topic</label>
      <span className="srch__icon" aria-hidden="true">⌕</span>
      <input
        id={uid + "-in"} ref={inputRef} className="srch__input" type="text" autoComplete="off" spellCheck={false}
        placeholder="Find a topic…" value={q}
        role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list" aria-haspopup="listbox"
        aria-activedescendant={activeId} aria-keyshortcuts={onAdd ? "Shift+Enter" : undefined} aria-describedby={uid + "-help"}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {!focused && !q && <kbd className="srch__key" aria-hidden="true">/</kbd>}
      <p id={uid + "-help"} className="sr-only">
        Type to filter. Arrow keys move, Enter opens the topic{onAdd ? ", Shift+Enter adds it to your bubble; it says so if it is already there" : ""}. Escape closes.
      </p>
      <span className="sr-only" role="status" aria-live="polite">{status}</span>
      {open && !flat.length && (
        <div className="srch__none">
          <p>No topic matches “{q}”. <button type="button" className="srch__clear" onClick={clear}>Clear</button></p>
          {nearest.length > 0 && (
            <>
              <p className="srch__try">Nearest to your bubble</p>
              {nearest.map((t) => (
                <button key={t.id} type="button" className="srch__opt srch__fallback" onClick={() => pick(t.id)}>
                  <span className="srch__name">{t.name}</span>
                  <span className="srch__dist">{stepsText(ringOf(t.id))}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
      <div id={listId} className="srch__list" role="listbox" aria-label={searching ? "Matching topics" : "Topics by planet"} hidden={!showList}>
        {searching ? flat.map((t) => row(t, ++i)) : groups.map((g) => (
          <div key={g.cat.id} role="group" aria-labelledby={uid + "-g-" + g.cat.id}>
            <div role="presentation" id={uid + "-g-" + g.cat.id} className="srch__cat">
              <i style={{ background: `var(--c-${g.cat.id})` }} aria-hidden="true" />{g.cat.name}
            </div>
            {g.items.map((t) => row(t, ++i))}
          </div>
        ))}
        {onAdd && <div role="presentation" className="srch__hint" aria-hidden="true"><kbd>Enter</kbd> open · <kbd>Shift</kbd>+<kbd>Enter</kbd> add to bubble</div>}
      </div>
    </div>
  );
}
