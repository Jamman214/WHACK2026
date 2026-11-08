import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { CATEGORIES } from "../../data/taxonomy";
import type { Layout } from "../../lib/layout";
import { stepsText } from "./util";

/** Find a topic: an editable combobox with a listbox grouped by planet. Doubles as the non-3D way to navigate. */
export default function Search({ lay, open, setOpen, inputRef, onPick }: {
  lay: Layout; open: boolean; setOpen: (o: boolean) => void; inputRef: RefObject<HTMLInputElement | null>; onPick: (id: string) => void;
}) {
  const uid = useId();
  const listId = uid + "-list";
  const optId = (id: string) => uid + "-o-" + id;
  const [q, setQ] = useState("");
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    const n = q.trim().toLowerCase();
    return CATEGORIES
      .map((c) => ({ cat: c, items: c.topics.filter((t) => !n || t.name.toLowerCase().includes(n) || c.name.toLowerCase().includes(n)) }))
      .filter((g) => g.items.length);
  }, [q]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const activeId = open && active >= 0 && flat[active] ? optId(flat[active].id) : undefined;

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const pick = (id: string) => { onPick(id); setQ(""); setActive(-1); setOpen(false); inputRef.current?.focus(); };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = flat.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); setActive(e.key === "ArrowDown" ? 0 : n - 1); return; }
      if (!n) return;
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a <= 0 ? n - 1 : a - 1)));
    } else if (e.key === "Enter" && open && n) {
      e.preventDefault();
      pick(flat[active >= 0 ? active : 0].id);
    }
    // Escape is handled in Atlas (capture phase) so closing the list wins over clearing the selection.
  };

  let i = -1;
  const status = !open ? "" : flat.length ? `${flat.length} ${flat.length === 1 ? "topic" : "topics"} found` : "No topics found";
  return (
    <div className="ov ov-search" ref={wrap}
      onBlur={(e) => { if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <label className="sr-only" htmlFor={uid + "-in"}>Find a topic</label>
      <span className="srch__icon" aria-hidden="true">⌕</span>
      <input
        id={uid + "-in"} ref={inputRef} className="srch__input" type="text" autoComplete="off" spellCheck={false}
        placeholder="Find a topic…" value={q}
        role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-haspopup="listbox"
        aria-activedescendant={activeId} aria-describedby="atlas-kbd"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(e.target.value.trim() ? 0 : -1); }}
        onFocus={() => setActive(-1)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <span className="sr-only" role="status" aria-live="polite">{status}</span>
      {open && !flat.length && <div className="srch__none">No topic matches “{q}”.</div>}
      <div id={listId} className="srch__list" role="listbox" aria-label="Topics by planet" hidden={!open || !flat.length}>
        {groups.map((g) => (
          <div key={g.cat.id} role="group" aria-labelledby={uid + "-g-" + g.cat.id}>
            <div role="presentation" id={uid + "-g-" + g.cat.id} className="srch__cat">
              <i style={{ background: `var(--c-${g.cat.id})` }} aria-hidden="true" />{g.cat.name}
            </div>
            {g.items.map((t) => {
              const idx = ++i, ring = lay.nodes[t.id].ring;
              return (
                <div key={t.id} id={optId(t.id)} role="option" aria-selected={idx === active} className="srch__opt" data-active={idx === active}
                  onMouseDown={(e) => e.preventDefault()} onMouseMove={() => active !== idx && setActive(idx)} onClick={() => pick(t.id)}>
                  <span className="srch__name">{t.name}</span>
                  <span className="srch__dist" data-ring={ring === 0 ? "in" : undefined}>{stepsText(ring)}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
