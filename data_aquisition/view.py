"""Write data/topics.html: browse topics -> subtopics -> articles. Re-run after process.py.

    python view.py
"""
import json
import webbrowser

import numpy as np

import db

OUT = db.DB_PATH.parent / "topics.html"


def load(conn):
    rows = conn.execute(
        "SELECT title, description, url, source, published_at, topic_id, subtopic_id, embedding "
        "FROM articles ORDER BY published_at DESC"
    ).fetchall()
    by_sub = {}
    ungrouped = []
    for title, desc, url, source, published, tid, sid, emb in rows:
        art = {"t": title, "d": (desc or "")[:280], "u": url, "s": source, "p": published[:10],
               "v": np.frombuffer(emb, np.float32) if emb else None}
        (by_sub.setdefault(sid, []) if sid else ungrouped).append(art)

    def central(arts):  # headline nearest the group's centre: a hint while names are placeholders
        vs = [a["v"] for a in arts if a["v"] is not None]
        if not vs:
            return ""
        V = np.stack(vs)
        return arts[int(np.argmax(V @ V.mean(axis=0)))]["t"]

    topics = []
    for tid, name, size in conn.execute(
        "SELECT id, name, size FROM topics WHERE parent_id IS NULL ORDER BY size DESC"
    ):
        subs = []
        for sid, sname, ssize in conn.execute(
            "SELECT id, name, size FROM topics WHERE parent_id = ? ORDER BY size DESC", (tid,)
        ):
            arts = by_sub.get(sid, [])
            subs.append({"name": sname, "size": ssize, "hint": central(arts), "arts": arts})
        topics.append({"name": name, "size": size,
                       "hint": central([a for s in subs for a in s["arts"]]), "subs": subs})
    if ungrouped:
        topics.append({"name": "Ungrouped", "size": len(ungrouped), "ungrouped": True,
                       "hint": "Articles that fit no topic (bridge candidates)",
                       "subs": [{"name": "Ungrouped", "size": len(ungrouped), "hint": "", "arts": ungrouped}]})
    for t in topics:
        for s in t["subs"]:
            for a in s["arts"]:
                del a["v"]
    return topics


PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>News Topics</title>
<style>
:root { --bg:#f7f7f5; --panel:#fff; --text:#1d1d1b; --muted:#6b6b66; --line:#e3e3df; --accent:#2f5bea; --sel:#eef2fe; }
@media (prefers-color-scheme: dark) { :root { --bg:#161615; --panel:#1f1f1d; --text:#ececea; --muted:#9a9a94; --line:#33332f; --accent:#7d9bff; --sel:#232a42; } }
* { box-sizing: border-box; }
body { margin:0; font:15px/1.45 system-ui, sans-serif; background:var(--bg); color:var(--text); }
header { padding:14px 16px; border-bottom:1px solid var(--line); display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
header h1 { font-size:17px; margin:0; }
header .stats { color:var(--muted); font-size:13px; }
header input { margin-left:auto; padding:7px 10px; border:1px solid var(--line); border-radius:6px; background:var(--panel); color:var(--text); min-width:220px; font:inherit; }
main { display:grid; grid-template-columns: 340px 1fr; height: calc(100vh - 58px); }
nav { overflow:auto; border-right:1px solid var(--line); background:var(--panel); }
nav button { all:unset; display:block; width:100%; padding:10px 16px; border-bottom:1px solid var(--line); cursor:pointer; box-sizing:border-box; }
nav button:hover, nav button:focus-visible { background:var(--sel); outline:none; }
nav button[aria-current="true"] { background:var(--sel); box-shadow: inset 3px 0 var(--accent); }
.name { font-weight:600; display:flex; justify-content:space-between; gap:8px; }
.count { color:var(--muted); font-weight:400; font-variant-numeric: tabular-nums; }
.hint { color:var(--muted); font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
section { overflow:auto; padding:16px 24px 48px; }
details { background:var(--panel); border:1px solid var(--line); border-radius:8px; margin-bottom:10px; }
summary { padding:10px 14px; cursor:pointer; }
summary .hint { white-space:normal; }
ul { list-style:none; margin:0; padding:0 14px 6px; }
li { padding:8px 0; border-top:1px solid var(--line); }
li a { color:var(--accent); text-decoration:none; font-weight:500; }
li a:hover { text-decoration:underline; }
.meta { color:var(--muted); font-size:12px; }
.desc { font-size:13px; margin-top:2px; }
@media (max-width: 760px) { main { grid-template-columns: 1fr; height:auto; } nav { max-height:40vh; } section { padding:16px; } }
</style></head>
<body>
<header><h1>News Topics</h1><span class="stats" id="stats"></span>
<input id="q" type="search" placeholder="Filter headlines…" aria-label="Filter headlines"></header>
<main><nav id="nav" aria-label="Topics"></nav><section id="view" aria-live="polite"></section></main>
<script id="data" type="application/json">__DATA__</script>
<script>
const topics = JSON.parse(document.getElementById("data").textContent);
const nav = document.getElementById("nav"), view = document.getElementById("view"), q = document.getElementById("q");
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const safe = u => /^https?:\\/\\//i.test(u || "") ? u : null;  // feed data is untrusted
let current = 0;
const total = topics.reduce((n, t) => n + t.size, 0), grouped = topics.filter(t => !t.ungrouped);
document.getElementById("stats").textContent =
  `${grouped.length} topics · ${grouped.reduce((n, t) => n + t.subs.length, 0)} subtopics · ${total} articles`;

function matches(a, term) { return !term || (a.t + " " + a.d + " " + a.s).toLowerCase().includes(term); }

function drawNav() {
  const term = q.value.trim().toLowerCase();
  nav.replaceChildren(...topics.map((t, i) => {
    const n = t.subs.reduce((k, s) => k + s.arts.filter(a => matches(a, term)).length, 0);
    const b = el("button");
    b.setAttribute("aria-current", i === current);
    const name = el("div", "name"); name.append(el("span", null, t.name), el("span", "count", term ? `${n} / ${t.size}` : `${t.size} · ${t.subs.length} sub`));
    b.append(name, el("div", "hint", t.hint));
    if (term && !n) b.style.opacity = .4;
    b.onclick = () => { current = i; drawNav(); drawView(); };
    return b;
  }));
}

function drawView() {
  const t = topics[current], term = q.value.trim().toLowerCase();
  const h = el("h2", null, t.name); h.style.margin = "0 0 12px";
  view.replaceChildren(h, ...t.subs.map(s => {
    const arts = s.arts.filter(a => matches(a, term));
    const d = el("details"); d.open = t.subs.length <= 3 || !!term;
    const sum = el("summary");
    const name = el("span", "name"); name.append(el("span", null, s.name), el("span", "count", term ? `${arts.length} / ${s.size}` : s.size));
    sum.append(name); if (s.hint) sum.append(el("div", "hint", "≈ " + s.hint));
    const ul = el("ul");
    ul.append(...arts.map(a => {
      const li = el("li"), url = safe(a.u);
      const title = url ? el("a", null, a.t) : el("span", null, a.t);
      if (url) { title.href = url; title.target = "_blank"; title.rel = "noopener noreferrer"; }
      li.append(title, el("div", "meta", `${a.s} · ${a.p}`));
      if (a.d) li.append(el("div", "desc", a.d));
      return li;
    }));
    d.append(sum, ul);
    if (term && !arts.length) d.hidden = true;
    return d;
  }));
}
q.oninput = () => { drawNav(); drawView(); };
drawNav(); drawView();
</script></body></html>
"""


def main():
    conn = db.connect()
    topics = load(conn)
    conn.close()
    # "</" inside JSON would close the <script> tag early
    data = json.dumps(topics, ensure_ascii=False).replace("</", "<\\/")
    OUT.write_text(PAGE.replace("__DATA__", data), encoding="utf-8")
    print(f"Wrote {OUT} ({len(topics)} groups)")
    webbrowser.open(OUT.as_uri())


if __name__ == "__main__":
    main()
