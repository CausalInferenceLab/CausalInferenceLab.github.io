(() => {
  "use strict";

  const ORG = "CausalInferenceLab";
  const RIDE_KEY = "cil-hub-ridden";
  const SVG_NS = "http://www.w3.org/2000/svg";

  const icons = {
    star: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 .8l2.2 4.6 5 .7-3.6 3.5.9 5L8 12.3l-4.5 2.3.9-5L.8 6.1l5-.7z"/></svg>',
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M3 8.5l3.2 3L13 4.5"/></svg>',
    close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3.5 3.5l9 9m0-9l-9 9"/></svg>',
    left: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M10 3L5 8l5 5"/></svg>',
    right: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M6 3l5 5-5 5"/></svg>'
  };

  const statusLabel = { running: "운행 중", active: "최근 업데이트" };
  const statusText = {
    running: "운행 중: 이번 기수에 진행 중인 프로젝트",
    active: "최근 업데이트: 올해 코드나 내용이 갱신된 레포",
    stable: "완결: 내용이 마무리되어 오류 수정 위주로 관리",
    depot: "차량기지: 허브 운영과 보관용 레포"
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n).toLocaleString("ko-KR");
  const $ = (sel, root = document) => root.querySelector(sel);

  const state = {
    repos: new Map(), lines: new Map(), lineList: [], levels: [], map: null, routes: [],
    projects: [], events: [], articles: [], ridden: new Set(), order: new Map(), route: "start"
  };

  /* ---------- storage (per-viewer convenience only) ---------- */
  function loadRidden() {
    try { state.ridden = new Set(JSON.parse(localStorage.getItem(RIDE_KEY) || "[]")); } catch (e) { state.ridden = new Set(); }
  }
  function saveRidden() {
    try { localStorage.setItem(RIDE_KEY, JSON.stringify([...state.ridden])); } catch (e) { /* storage unavailable */ }
  }

  async function getJSON(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(path + " " + res.status);
    return res.json();
  }

  /* ---------- data ---------- */
  async function load() {
    const [repos, lines, levels, map, routes, projects, events, articles] = await Promise.all([
      "data/repos.json", "data/lines.json", "data/levels.json", "data/map.json", "data/routes.json",
      "data/projects.json", "data/events.json", "data/articles.json"
    ].map(getJSON));
    repos.forEach((r) => state.repos.set(r.repo, r));
    state.repos.set(map.external.id, { repo: map.external.id, external: true, status: "external", builders: [], cohorts: [], ...map.external });
    state.lineList = lines;
    lines.forEach((l) => state.lines.set(l.id, l));
    Object.assign(state, { levels, map, routes, projects, events, articles });

    // Station order on each line follows the map: left to right, then top to bottom.
    const pos = new Map(map.stations.map((s) => [s.id, s]));
    lines.forEach((l) => {
      const ids = [...state.repos.values()].filter((r) => (r.lines || []).includes(l.id) && pos.has(r.repo)).map((r) => r.repo);
      ids.sort((a, b) => pos.get(a).x - pos.get(b).x || pos.get(a).y - pos.get(b).y);
      state.order.set(l.id, ids);
    });
  }

  async function refreshStars() {
    try {
      const res = await fetch(`https://api.github.com/orgs/${ORG}/repos?per_page=100`, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) return;
      const list = await res.json();
      let changed = false;
      list.forEach((g) => {
        const r = state.repos.get(g.name);
        if (r && g.pushed_at) r.pushed = g.pushed_at;
        if (r && typeof g.stargazers_count === "number" && r.stars !== g.stargazers_count) { r.stars = g.stargazers_count; changed = true; }
      });
      if (changed) { renderStats(); renderTop5(); updateStars(); }
    } catch (e) { /* offline or rate limited: keep the snapshot */ }
  }

  /* ---------- helpers ---------- */
  const primaryLine = (r) => (r.lines && r.lines[0]) || "none";
  const repoUrl = (r) => (r.external ? (r.links && r.links[0].url) : `https://github.com/${ORG}/${r.repo}`);
  const cohortText = (cs) => (cs && cs.length ? cs.join("·") + "기" : "");
  const builderUrl = (name) => {
    const p = state.projects.find((x) => x.builder === name && x.builderUrl);
    return p ? p.builderUrl : null;
  };

  function cardHTML(r, opts = {}) {
    const line = primaryLine(r);
    const who = r.builders && r.builders.length ? r.builders.join(", ") : (r.external ? "팀 밖 오픈소스" : "");
    const status = statusLabel[r.status] ? `<span class="status ${r.status}">${statusLabel[r.status]}</span>` : "";
    const lv = r.level ? `<span class="lv">${r.level}</span>` : "";
    const nums = (r.lines || []).map((id) => `<span class="num" data-line="${id}" aria-label="${esc(state.lines.get(id).number)}호선 ${esc(state.lines.get(id).name)}">${state.lines.get(id).number}</span>`).join("");
    const done = state.ridden.has(r.repo) ? `<span class="ridden" title="탑승 완료">${icons.check}</span>` : "";
    const star = r.external ? "" : `<span class="star" data-star="${esc(r.repo)}">${icons.star}<span>${fmt(r.stars || 0)}</span></span>`;
    return `<button type="button" class="card" data-line="${line}" data-open="${esc(r.repo)}"${opts.tabindex ? ` tabindex="${opts.tabindex}"` : ""}>
      ${done}
      <span class="card-top">${nums}${lv}${status}</span>
      <h3>${esc(r.title)}</h3>
      ${r.external ? "" : `<span class="repo">${esc(r.repo)}</span>`}
      <span class="sum">${esc(r.summary)}</span>
      <span class="card-foot"><span class="who">${esc(who)}</span>${star}</span>
    </button>`;
  }

  function updateStars() {
    document.querySelectorAll("[data-star]").forEach((el) => {
      const r = state.repos.get(el.dataset.star);
      if (r) el.querySelector("span").textContent = fmt(r.stars || 0);
    });
  }

  function enhanceShelf(shelf) {
    if (!shelf || shelf.parentElement.classList.contains("shelf-wrap")) return;
    const wrap = document.createElement("div");
    wrap.className = "shelf-wrap";
    shelf.parentNode.insertBefore(wrap, shelf);
    wrap.appendChild(shelf);
    const nav = document.createElement("div");
    nav.className = "shelf-nav";
    nav.innerHTML = `<button type="button" aria-label="이전 항목">${icons.left}</button><button type="button" aria-label="다음 항목">${icons.right}</button>`;
    const [prev, next] = nav.querySelectorAll("button");
    const step = () => Math.max(260, shelf.clientWidth * 0.8);
    prev.addEventListener("click", () => shelf.scrollBy({ left: -step(), behavior: "smooth" }));
    next.addEventListener("click", () => shelf.scrollBy({ left: step(), behavior: "smooth" }));
    const sync = () => {
      const max = shelf.scrollWidth - shelf.clientWidth - 2;
      nav.hidden = max <= 0;
      prev.disabled = shelf.scrollLeft <= 2;
      next.disabled = shelf.scrollLeft >= max;
    };
    shelf.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    wrap.appendChild(nav);
    requestAnimationFrame(sync);
  }

  /* ---------- stats ---------- */
  function renderStats() {
    const visible = [...state.repos.values()].filter((r) => !r.external);
    const builders = new Set(state.projects.map((p) => p.builder).filter(Boolean));
    const values = {
      repos: visible.length,
      cohorts: new Set(state.projects.map((p) => p.cohort)).size,
      projects: state.projects.length,
      builders: builders.size,
      runnerSeats: state.projects.reduce((s, p) => s + (p.runners || 0), 0),
      forum: state.events.reduce((s, e) => s + (e.participants || 0), 0),
      stars: visible.reduce((s, r) => s + (r.stars || 0), 0)
    };
    document.querySelectorAll("[data-stat]").forEach((el) => {
      const v = values[el.dataset.stat];
      if (v !== undefined) el.textContent = fmt(v);
    });
  }

  /* ---------- metro map ---------- */
  function svg(tag, attrs = {}, parent) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (parent) parent.appendChild(el);
    return el;
  }

  function renderMap() {
    const m = state.map;
    const root = $("#metro");
    const title = root.querySelector("title");
    root.innerHTML = "";
    root.appendChild(title);
    root.setAttribute("viewBox", `0 0 ${m.viewBox[0]} ${m.viewBox[1]}`);

    const levelById = new Map(state.levels.map((l) => [l.id, l]));
    const zones = svg("g", { "aria-hidden": "true" }, root);
    m.zones.forEach((z) => {
      const lv = levelById.get(z.level);
      const g = svg("g", { class: "zone" + (lv.layer === "build" ? " build" : "") }, zones);
      svg("rect", { x: z.x, y: 8, width: z.w, height: m.viewBox[1] - 16, rx: 14 }, g);
      const t = svg("text", { x: z.x + 14, y: 38, class: "zone-l" }, g); t.textContent = z.level;
      const n = svg("text", { x: z.x + 14 + (z.level.length * 15) + 8, y: 36, class: "zone-n" }, g); n.textContent = lv.name;
      const q = svg("text", { x: z.x + 14, y: 58, class: "zone-q" }, g); q.textContent = lv.question;
    });

    const tracks = svg("g", {}, root);
    m.lines.forEach((ln) => {
      const d = ln.points.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join(" ");
      svg("path", { d, class: "track", "data-line": ln.line, "data-track": ln.line }, tracks);
    });
    const ex = m.express;
    svg("path", { d: `M${ex.from[0]} ${ex.from[1]} L${ex.to[0]} ${ex.to[1]}`, class: "express" }, tracks);
    const exl = svg("text", { x: ex.from[0], y: ex.from[1] - 10, class: "express-l" }, tracks); exl.textContent = ex.label;

    m.lines.forEach((ln) => {
      const line = state.lines.get(ln.line);
      const g = svg("g", { class: "badge", "data-line": ln.line, "data-track": ln.line, "aria-hidden": "true" }, tracks);
      svg("circle", { cx: ln.badge[0], cy: ln.badge[1], r: 15 }, g);
      const t = svg("text", { x: ln.badge[0], y: ln.badge[1] + 1 }, g); t.textContent = line.number;
    });

    const stations = svg("g", {}, root);
    m.stations.forEach((s) => {
      const r = state.repos.get(s.id);
      if (!r) return;
      const line = primaryLine(r);
      const g = svg("g", { class: "st" + (r.external ? " ext" : ""), "data-line": line, "data-st": s.id, tabindex: 0, role: "button", "aria-label": `${r.title} 역 열기` }, stations);
      if (s.y2) {
        svg("rect", { x: s.x - 22, y: s.y - 22, width: 44, height: s.y2 - s.y + 44, class: "hit" }, g);
        svg("rect", { x: s.x - 13, y: s.y - 13, width: 26, height: s.y2 - s.y + 26, rx: 13, class: "pill" }, g);
      } else {
        svg("circle", { cx: s.x, cy: s.y, r: 20, class: "hit" }, g);
        if (r.external) svg("circle", { cx: s.x, cy: s.y, r: 15, class: "halo" }, g);
        svg("circle", { cx: s.x, cy: s.y, r: r.external ? 9.5 : 10, class: "ring" }, g);
      }
      if (state.ridden.has(s.id)) svg("circle", { cx: s.x, cy: s.y2 ? (s.y + s.y2) / 2 : s.y, r: 4.5, class: "done" }, g);

      const bottom = s.y2 || s.y;
      let lx = s.x, ly, anchor = "middle";
      if (s.label === "above") ly = s.y - (s.y2 ? 40 : 32);
      else if (s.label === "right") { lx = s.x + 20; ly = s.y + 5; anchor = "start"; }
      else ly = bottom + 34;
      const label = svg("text", { x: lx, y: ly, class: "label", "text-anchor": anchor }, g);
      label.textContent = r.title;
      if (r.status === "running") {
        const tag = svg("g", { class: "tag" }, g);
        const tx = anchor === "start" ? lx + 34 : lx, ty = ly + 18;
        svg("rect", { x: tx - 30, y: ty - 9, width: 60, height: 18, rx: 9 }, tag);
        const tt = svg("text", { x: tx, y: ty + 0.5 }, tag); tt.textContent = "운행 중";
      }
      g.addEventListener("click", () => openStation(s.id));
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openStation(s.id); } });
    });
    svg("g", { id: "route-marks" }, root);
    applyRoute();
  }

  function renderLegend() {
    $("#line-legend").innerHTML = state.lineList.map((l) =>
      `<li data-line="${l.id}"><span class="num">${l.number}</span>${esc(l.name)}: ${esc(l.tagline)}</li>`).join("") +
      `<li><svg width="28" height="6" aria-hidden="true"><path d="M2 3H26" stroke="var(--l-main)" stroke-width="3" stroke-dasharray="5 6" stroke-linecap="round"/></svg>급행: 유료 가속 옵션</li>`;
  }

  /* ---------- route planner ---------- */
  function renderRouteChips() {
    const box = $("#route-chips");
    const all = [{ id: "all", label: "전체 노선 보기" }, ...state.routes];
    box.innerHTML = all.map((r) => `<button type="button" class="chip" role="radio" data-route="${r.id}" aria-checked="${r.id === state.route}">${esc(r.label)}</button>`).join("");
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-route]");
      if (!b) return;
      state.route = b.dataset.route;
      box.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", String(c === b)));
      applyRoute();
    });
    box.addEventListener("keydown", (e) => {
      if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
      const chips = [...box.querySelectorAll(".chip")];
      const i = chips.indexOf(document.activeElement);
      if (i < 0) return;
      const n = chips[(i + (e.key === "ArrowRight" ? 1 : chips.length - 1)) % chips.length];
      n.focus(); n.click();
    });
  }

  function commonLine(a, b) {
    const la = state.repos.get(a).lines || [], lb = state.repos.get(b).lines || [];
    return la.find((x) => lb.includes(x)) || lb[0] || la[0];
  }

  function applyRoute() {
    const root = $("#metro");
    const steps = $("#route-steps"), note = $("#route-note");
    const marks = $("#route-marks");
    if (marks) marks.innerHTML = "";
    root.querySelectorAll(".on").forEach((el) => el.classList.remove("on"));
    const route = state.routes.find((r) => r.id === state.route);
    if (!route) {
      root.classList.remove("routing");
      steps.innerHTML = "";
      note.textContent = "여섯 개 노선, 역 " + state.map.stations.length + "곳을 모두 보여 줍니다. 위에서 하고 싶은 일을 고르면 경로가 표시됩니다.";
      return;
    }
    root.classList.add("routing");
    const usedLines = new Set();
    route.stops.forEach((id, i) => {
      root.querySelector(`[data-st="${CSS.escape(id)}"]`)?.classList.add("on");
      if (i) usedLines.add(commonLine(route.stops[i - 1], id));
    });
    usedLines.forEach((l) => root.querySelectorAll(`[data-track="${l}"]`).forEach((t) => t.classList.add("on")));
    const pos = new Map(state.map.stations.map((s) => [s.id, s]));
    route.stops.forEach((id, i) => {
      const s = pos.get(id); if (!s || !marks) return;
      const g = svg("g", { "aria-hidden": "true" }, marks);
      const cx = s.x + 17, cy = s.y - 17;
      svg("circle", { cx, cy, r: 10, class: "step-b" }, g);
      const t = svg("text", { x: cx, y: cy + 0.5, class: "step-n" }, g); t.textContent = i + 1;
    });
    steps.innerHTML = route.stops.map((id, i) => {
      const r = state.repos.get(id);
      const line = i ? commonLine(route.stops[i - 1], id) : primaryLine(r);
      return `<li data-line="${line}"><span class="dot">${i + 1}</span><button type="button" data-open="${esc(id)}"><span class="t">${esc(r.title)}</span><span class="s">${r.level ? r.level + " · " : ""}${esc(r.external ? "팀 밖 오픈소스" : r.repo)}</span></button></li>`;
    }).join("");
    note.textContent = route.description;
  }

  /* ---------- shelves ---------- */
  function renderRunning() {
    const rank = { running: 0, active: 1 };
    const list = [...state.repos.values()].filter((r) => rank[r.status] !== undefined)
      .sort((a, b) => rank[a.status] - rank[b.status] || Math.max(0, ...(b.cohorts || [])) - Math.max(0, ...(a.cohorts || [])));
    const shelf = $('[data-shelf="running"]');
    shelf.innerHTML = list.map((r) => cardHTML(r)).join("");
    enhanceShelf(shelf);
  }

  function renderContinue() {
    const picks = [];
    state.order.forEach((ids) => {
      let last = -1;
      ids.forEach((id, i) => { if (state.ridden.has(id)) last = i; });
      if (last < 0) return;
      const next = ids.slice(last + 1).find((id) => !state.ridden.has(id));
      if (next && !picks.includes(next)) picks.push(next);
    });
    const section = $("#continue");
    section.hidden = picks.length === 0;
    const shelf = $('[data-shelf="continue"]');
    shelf.innerHTML = picks.map((id) => cardHTML(state.repos.get(id))).join("");
    if (picks.length) enhanceShelf(shelf);
  }

  function renderTop5() {
    const list = [...state.repos.values()].filter((r) => !r.external && r.status !== "depot")
      .sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 5);
    const shelf = $('[data-shelf="top5"]');
    shelf.innerHTML = list.map((r, i) => `<li><span class="rank" aria-hidden="true">${i + 1}</span>${cardHTML(r)}</li>`).join("");
    enhanceShelf(shelf);
  }

  function renderLineShelves() {
    const box = $("#line-shelves");
    box.innerHTML = state.lineList.map((l) => `
      <div class="line-row" data-line="${l.id}">
        <div class="line-row-head"><span class="num" aria-hidden="true">${l.number}</span><div><h3>${l.number}호선 ${esc(l.name)}</h3><p>${esc(l.description)}</p></div></div>
        <div class="shelf">${(state.order.get(l.id) || []).map((id) => cardHTML(state.repos.get(id))).join("")}</div>
      </div>`).join("");
    box.querySelectorAll(".shelf").forEach(enhanceShelf);
  }

  /* ---------- curriculum zones ---------- */
  function renderZones() {
    $("#zones").innerHTML = state.levels.map((lv) => {
      const repos = [...state.repos.values()].filter((r) => r.level === lv.id && (r.lines || []).length);
      const ridden = repos.filter((r) => state.ridden.has(r.repo)).length;
      const pct = repos.length ? Math.round((ridden / repos.length) * 100) : 0;
      return `<li class="zone-card${lv.layer === "build" ? " build" : ""}">
        <span class="zl">${lv.id}</span>
        <span class="zn">${esc(lv.name)}</span>
        <span class="zq">${esc(lv.question)}</span>
        <p class="zg">${esc(lv.goal)}</p>
        <ul>${repos.map((r) => `<li><button type="button" data-open="${esc(r.repo)}" data-line="${primaryLine(r)}"><i class="mini${state.ridden.has(r.repo) ? " on" : ""}" aria-hidden="true"></i><span>${esc(r.title)}</span></button></li>`).join("")}</ul>
        <div class="meter"><span>탑승 ${ridden} / ${repos.length}</span><div class="meter-bar" role="progressbar" aria-label="${lv.id} 탑승 기록" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div></div>
      </li>`;
    }).join("");
  }

  /* ---------- builders ---------- */
  function renderBuilders() {
    const people = new Map();
    const add = (name, item) => {
      if (!name) return;
      if (!people.has(name)) people.set(name, { name, url: builderUrl(name), items: [] });
      people.get(name).items.push(item);
    };
    state.projects.forEach((p) => add(p.builder, { cohort: p.cohort, name: p.name, repo: p.repo && state.repos.has(p.repo) ? p.repo : null, link: p.link }));
    state.repos.forEach((r) => (r.builders || []).forEach((b) => {
      const p = people.get(b);
      if (!p || !p.items.some((it) => it.repo === r.repo)) add(b, { cohort: null, name: r.title, repo: r.repo });
    }));
    const list = [...people.values()].map((p) => {
      p.items.sort((a, b) => (b.cohort ?? 99) - (a.cohort ?? 99));
      const cohorts = p.items.map((i) => i.cohort).filter((c) => c != null);
      p.first = cohorts.length ? Math.min(...cohorts) : 99;
      const withRepo = p.items.find((i) => i.repo);
      p.line = withRepo ? primaryLine(state.repos.get(withRepo.repo)) : "main";
      return p;
    }).sort((a, b) => a.first - b.first || b.items.length - a.items.length || a.name.localeCompare(b.name, "ko"));

    $("#builder-list").innerHTML = list.map((p) => `
      <li class="builder" data-line="${p.line}">
        <div class="builder-top">
          <span class="avatar" aria-hidden="true">${esc(p.name.slice(0, 1))}</span>
          <div><h3>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name)}</h3>
          <span class="since">${p.first < 99 ? p.first + "기부터" : "운행 중"} · 프로젝트 ${p.items.length}개</span></div>
        </div>
        <ul>${p.items.map((it) => `<li><span class="co">${it.cohort ? it.cohort + "기" : "현재"}</span><span>${
          it.repo ? `<button type="button" data-open="${esc(it.repo)}">${esc(it.name)}</button>`
          : it.link ? `<a href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.name)}</a>` : esc(it.name)}</span></li>`).join("")}</ul>
      </li>`).join("");
  }

  /* ---------- journey ---------- */
  function renderJourney() {
    const byCohort = new Map();
    state.projects.forEach((p) => {
      if (!byCohort.has(p.cohort)) byCohort.set(p.cohort, { cohort: p.cohort, term: p.term, items: [] });
      byCohort.get(p.cohort).items.push(p);
    });
    const latest = Math.max(...byCohort.keys());
    const halfOf = (d) => `${d.slice(0, 4)} ${Number(d.slice(5, 7)) <= 6 ? "상반기" : "하반기"}`;
    const seasons = [...byCohort.values()].sort((a, b) => a.cohort - b.cohort);
    const eventsByTerm = new Map();
    const undated = [];
    state.events.forEach((e) => {
      if (e.date) { const t = halfOf(e.date); if (!eventsByTerm.has(t)) eventsByTerm.set(t, []); eventsByTerm.get(t).push(e); }
      else undated.push(e);
    });
    const evHTML = (e) => `<li class="ep event"><div class="n">${e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.name)}</a>` : esc(e.name)}</div><div class="m">${e.upcoming ? e.date.replace(/-/g, ".") + " 예정" : (e.date ? e.date.replace(/-/g, ".") : e.year + "년")}${e.participants ? ` · ${fmt(e.participants)}명 참가` : ""}</div></li>`;

    const rail = $("#season-rail");
    rail.innerHTML = seasons.map((s) => {
      const items = s.items.map((p) => {
        const name = p.repo && state.repos.has(p.repo) ? `<button type="button" data-open="${esc(p.repo)}">${esc(p.name)}</button>`
          : p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name);
        const meta = [p.builder ? `Builder ${p.builder}` : "", p.runners ? `러너 ${p.runners}명` : ""].filter(Boolean).join(" · ");
        return `<li class="ep"><div class="n">${name}</div>${meta ? `<div class="m">${esc(meta)}</div>` : ""}</li>`;
      }).join("");
      const evs = (eventsByTerm.get(s.term) || []).map(evHTML).join("");
      return `<div class="season${s.cohort === latest ? " current" : ""}"><div class="season-head"><b>${s.cohort}기</b><span>${esc(s.term)}${s.cohort === latest ? " · 운행 중" : ""}</span></div><ul>${items}${evs}</ul></div>`;
    }).join("");
    if (undated.length) {
      const target = [...rail.querySelectorAll(".season")].find((el) => el.textContent.includes("2025 상반기"));
      if (target) target.querySelector("ul").insertAdjacentHTML("beforeend", undated.map(evHTML).join(""));
    }
    requestAnimationFrame(() => { rail.scrollLeft = rail.scrollWidth; });
  }

  /* ---------- articles ---------- */
  function renderArticles() {
    $("#article-list").innerHTML = state.articles.map((a) => `
      <li><a class="article-card" href="article.html#${esc(a.slug)}">
        <h3>${esc(a.title)}</h3><p>${esc(a.summary)}</p><time datetime="${esc(a.date)}">${a.date.replace(/-/g, ".")}</time>
      </a></li>`).join("");
  }

  /* ---------- station dialog ---------- */
  const dialog = () => $("#station-dialog");

  function openStation(id) {
    const r = state.repos.get(id);
    if (!r) return;
    const line = primaryLine(r);
    const lv = state.levels.find((l) => l.id === r.level);
    const lineTags = (r.lines || []).map((lid) => {
      const l = state.lines.get(lid);
      return `<span class="tag-line" data-line="${lid}"><span class="num">${l.number}</span>${esc(l.name)}</span>`;
    }).join("");
    const builders = (r.builders || []).map((b) => { const u = builderUrl(b); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(b)}</a>` : esc(b); }).join(", ");
    const rows = [
      lv ? `<dt>구역</dt><dd>${lv.id} ${esc(lv.name)}: ${esc(lv.question)}</dd>` : "",
      builders ? `<dt>Builder</dt><dd>${builders}</dd>` : "",
      r.cohorts && r.cohorts.length ? `<dt>기수</dt><dd>${cohortText(r.cohorts)}</dd>` : "",
      statusText[r.status] ? `<dt>상태</dt><dd>${statusText[r.status]}</dd>` : "",
      r.external ? "" : `<dt>스타</dt><dd>${fmt(r.stars || 0)}</dd>`,
      r.pushed ? `<dt>마지막 커밋</dt><dd>${r.pushed.slice(0, 10).replace(/-/g, ".")}</dd>` : ""
    ].join("");
    const links = r.external
      ? r.links.map((l, i) => `<a class="btn${i ? " ghost" : ""}" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")
      : `<a class="btn" href="${esc(repoUrl(r))}" target="_blank" rel="noopener">GitHub에서 보기</a>${r.site ? `<a class="btn ghost" href="${esc(r.site)}" target="_blank" rel="noopener">사이트 열기</a>` : ""}`;
    const adjacent = (r.lines || []).map((lid) => {
      const ids = state.order.get(lid) || [];
      const i = ids.indexOf(r.repo);
      if (i < 0) return "";
      const prev = ids[i - 1] && state.repos.get(ids[i - 1]);
      const next = ids[i + 1] && state.repos.get(ids[i + 1]);
      const l = state.lines.get(lid);
      return `<div class="adjacent" data-line="${lid}">
        ${prev ? `<button type="button" data-open="${esc(prev.repo)}">${l.number}호선 이전 역<b>${esc(prev.title)}</b></button>` : `<span></span>`}
        ${next ? `<button type="button" class="next" data-open="${esc(next.repo)}">${l.number}호선 다음 역<b>${esc(next.title)}</b></button>` : `<span></span>`}
      </div>`;
    }).join("");
    const ridden = state.ridden.has(r.repo);
    const status = statusLabel[r.status] ? `<span class="status ${r.status}">${statusLabel[r.status]}</span>` : "";

    $("#station-body").innerHTML = `
      <div class="station-band" data-line="${line}"></div>
      <button type="button" class="station-close" aria-label="닫기" data-close>${icons.close}</button>
      <div class="station-content" data-line="${line}">
        <div class="tags">${lineTags}${status}</div>
        <h2 id="station-title">${esc(r.title)}</h2>
        ${r.external ? "" : `<span class="repo">${esc(ORG)}/${esc(r.repo)}</span>`}
        <p>${esc(r.summary)}</p>
        ${rows ? `<dl>${rows}</dl>` : ""}
        <div class="links">${links}</div>
        ${adjacent}
        ${(r.lines || []).length ? `<button type="button" class="ride" aria-pressed="${ridden}" data-ride="${esc(r.repo)}">${ridden ? "탑승 완료" : "탑승 완료로 표시"}</button>` : ""}
      </div>`;
    const d = dialog();
    if (!d.open) { if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", ""); }
    $("#station-body .station-close").focus();
  }

  function closeStation() { const d = dialog(); if (d.open) d.close(); }

  function toggleRide(id) {
    if (state.ridden.has(id)) state.ridden.delete(id); else state.ridden.add(id);
    saveRidden();
    renderMap(); renderZones(); renderContinue(); renderRunning(); renderTop5(); renderLineShelves();
    openStation(id);
  }

  /* ---------- wiring ---------- */
  function wire() {
    document.addEventListener("click", (e) => {
      const ride = e.target.closest("[data-ride]");
      if (ride) { toggleRide(ride.dataset.ride); return; }
      if (e.target.closest("[data-close]")) { closeStation(); return; }
      const open = e.target.closest("[data-open]");
      if (open) { e.preventDefault(); openStation(open.dataset.open); }
    });
    dialog().addEventListener("click", (e) => { if (e.target === dialog()) closeStation(); });
  }

  function fail(err) {
    console.error(err);
    const main = $("#running .wrap");
    if (main) main.insertAdjacentHTML("afterbegin", `<p class="notice">데이터를 불러오지 못했습니다. 로컬에서 볼 때는 <code>python -m http.server</code>로 띄운 뒤 접속해 주세요.</p>`);
  }

  async function init() {
    loadRidden();
    wire();
    try { await load(); } catch (err) { fail(err); return; }
    renderStats(); renderLegend(); renderRouteChips(); renderMap();
    renderRunning(); renderContinue(); renderTop5(); renderZones(); renderLineShelves();
    renderBuilders(); renderJourney(); renderArticles();
    refreshStars();
  }

  init();
})();
