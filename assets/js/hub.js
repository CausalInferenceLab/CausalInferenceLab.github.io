(() => {
  "use strict";

  const ORG = "CausalInferenceLab";
  const RIDE_KEY = "cil-hub-ridden";
  const RECENT_KEY = "cil-hub-recent";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const icons = {
    star: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 .8l2.2 4.6 5 .7-3.6 3.5.9 5L8 12.3l-4.5 2.3.9-5L.8 6.1l5-.7z"/></svg>',
    close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3.5 3.5l9 9m0-9l-9 9"/></svg>'
  };
  const statusLabel = { running: "진행 중", active: "최근 업데이트" };
  const statusText = {
    running: "진행 중: 이번 기수에 운영 중인 프로젝트",
    active: "최근 업데이트: 올해 코드나 내용이 갱신된 레포",
    stable: "완결: 내용이 마무리되어 오류 수정 위주로 관리",
    depot: "운영·보관: 허브 운영과 보관용 레포"
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n).toLocaleString("ko-KR");
  const $ = (sel, root = document) => root.querySelector(sel);
  const dot = (d) => esc(String(d ?? "").replace(/-/g, "."));
  /* Data files come from pull requests: links must be http(s) or a site path, ids plain tokens,
     counts whole numbers. scripts/check_data.py enforces the same in CI; this is the second line. */
  const URL_KEYS = new Set(["url", "link", "linkedin", "site", "cover", "href", "builderUrl"]);
  const safeUrl = (u) => {
    if (typeof u !== "string" || !u) return u;
    try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? u : "#"; } catch (e) { return "#"; }
  };
  const TOKEN = /^[A-Za-z0-9_.-]+$/;
  const tok = (v, fb = "none") => (typeof v === "string" && TOKEN.test(v) ? v : fb);
  const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0);
  function cleanUrls(node) {
    if (Array.isArray(node)) node.forEach(cleanUrls);
    else if (node && typeof node === "object") Object.keys(node).forEach((k) => { if (URL_KEYS.has(k)) node[k] = safeUrl(node[k]); else cleanUrls(node[k]); });
    return node;
  }
  function cleanData(d) {
    Object.values(d).forEach(cleanUrls);
    d.levels.forEach((l) => { l.id = tok(l.id); });
    d.lines.forEach((l) => { l.id = tok(l.id); });
    d.repos.forEach((r) => { r.level = r.level ? tok(r.level, "") : r.level; r.lines = (r.lines || []).filter((x) => TOKEN.test(x)); r.cohorts = (r.cohorts || []).map(int); if (r.stars != null) r.stars = int(r.stars); });
    d.projects.forEach((p) => { p.cohort = int(p.cohort); p.runners = p.runners == null ? null : int(p.runners); });
    d.events.forEach((e) => { e.order = int(e.order); e.year = int(e.year); e.participants = e.participants == null ? null : int(e.participants); });
    d.routes.forEach((r) => { r.id = tok(r.id); });
    d.stages.items = (d.stages.items || []).map((x) => ({ ...x, id: tok(x.id), year: int(x.year) }));
    d.builders.forEach((b) => { (b.runnerOf || []).forEach((x) => { x.cohort = int(x.cohort); }); });
    return d;
  }
  const track = (name, params) => { if (window.hubTrack) window.hubTrack(name, params); };
  const stamp = (id) => { if (window.hubStamp) window.hubStamp(id); };
  const shareUrl = (path, medium) => (window.hubShareUrl ? window.hubShareUrl(path, medium) : path);

  const state = {
    repos: new Map(), lines: new Map(), lineList: [], levels: [], map: null, routes: [],
    projects: [], events: [], articles: [], builders: [], growth: null, stats: null,
    ridden: new Set(), recent: [], order: new Map(), route: "all"
  };

  function loadRidden() { try { state.ridden = new Set(JSON.parse(localStorage.getItem(RIDE_KEY) || "[]")); } catch (e) { state.ridden = new Set(); } }
  function loadRecent() { try { state.recent = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").filter((x) => x && x.id); } catch (e) { state.recent = []; } }
  function saveRecent() { try { localStorage.setItem(RECENT_KEY, JSON.stringify(state.recent.slice(0, 6))); } catch (e) { /* storage unavailable */ } }
  function saveRidden() { try { localStorage.setItem(RIDE_KEY, JSON.stringify([...state.ridden])); } catch (e) { /* storage unavailable */ } }

  async function getJSON(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(path + " " + res.status);
    return res.json();
  }

  /* ---------- data ---------- */
  async function load() {
    const names = ["repos", "lines", "levels", "map", "routes", "projects", "events", "articles", "builders", "growth", "stats", "featured", "daily", "stages"];
    const data = await Promise.all(names.map((n) => getJSON(`data/${n}.json`)));
    const d = cleanData(Object.fromEntries(names.map((n, i) => [n, data[i]])));
    d.repos.forEach((r) => {
      const live = d.stats.repos && d.stats.repos[r.repo];
      if (live) { r.stars = int(live.stars); r.pushed = typeof live.pushed === "string" ? live.pushed : null; }
      state.repos.set(r.repo, r);
    });
    state.repos.set(d.map.external.id, { repo: d.map.external.id, kind: "external", status: "external", builders: [], cohorts: [], ...d.map.external });
    (d.map.paid || []).forEach((p) => state.repos.set(p.id, { repo: p.id, kind: "paid", status: "paid", builders: [], cohorts: [], ...p }));
    state.lineList = d.lines;
    d.lines.forEach((l) => state.lines.set(l.id, l));
    Object.assign(state, { levels: d.levels, map: d.map, routes: d.routes, projects: d.projects, events: d.events, articles: d.articles, builders: d.builders, growth: d.growth, stats: d.stats, featured: d.featured, daily: d.daily, stages: d.stages });

    const pos = new Map(d.map.stations.map((s) => [s.id, s]));
    d.lines.forEach((l) => {
      const ids = [...state.repos.values()].filter((r) => r.kind !== "paid" && (r.lines || []).includes(l.id) && pos.has(r.repo)).map((r) => r.repo);
      ids.sort((a, b) => pos.get(a).x - pos.get(b).x || pos.get(a).y - pos.get(b).y);
      state.order.set(l.id, ids);
    });
  }

  async function refreshStars() {
    try {
      const res = await fetch(`https://api.github.com/orgs/${ORG}/repos?per_page=100`, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) return;
      const list = await res.json();
      list.forEach((g) => {
        const r = state.repos.get(g.name);
        if (!r) return;
        if (typeof g.stargazers_count === "number") r.stars = g.stargazers_count;
        if (g.pushed_at) r.pushed = g.pushed_at;
      });
      renderGrowth(false); renderLadder(); renderShelf(true); renderWeek(); renderFeatured();
    } catch (e) { /* offline or rate limited: keep the snapshot */ }
  }

  /* ---------- helpers ---------- */
  const primaryLine = (r) => (r && r.lines && r.lines[0]) || "none";
  const repoUrl = (r) => `https://github.com/${ORG}/${r.repo}`;
  const builderInfo = (name) => state.builders.find((b) => b.name === name) || { name };
  const currentCohort = () => Math.max(...state.projects.map((p) => p.cohort));
  const totalStars = () => [...state.repos.values()].filter((r) => !r.kind).reduce((s, r) => s + (r.stars || 0), 0);

  function avatarHTML(name, size = "") {
    const b = builderInfo(name);
    const initial = esc((name || "?").slice(0, 1));
    const img = b.github ? `<img src="https://github.com/${esc(b.github)}.png?size=128" alt="" loading="lazy" data-fallback="${initial}">` : "";
    return `<span class="avatar${size ? " " + size : ""}" aria-hidden="true">${initial}${img}</span>`;
  }
  function wireAvatars(root) {
    root.querySelectorAll("img[data-fallback]").forEach((img) => img.addEventListener("error", () => img.remove(), { once: true }));
  }
  function nameLink(name) {
    const b = builderInfo(name);
    return b.linkedin ? `<a href="${esc(b.linkedin)}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name);
  }

  /* ---------- Builder medals ----------
     One medal for how many cohorts someone has led, plus two special ones. The same rules
     live in scripts/build_builders.py so the hub, Builder pages and share images agree. */
  const TIERS = [
    { id: "honor", min: 5, name: "명예 Builder", rule: "5개 기수 이상", c: ["#9C95E8", "#33378C"], ink: "#FFFFFF" },
    { id: "gold", min: 3, name: "베테랑 Builder", rule: "3개 기수 이상", c: ["#F8D978", "#B98318"], ink: "#3A2700" },
    { id: "silver", min: 2, name: "다시 온 Builder", rule: "2개 기수", c: ["#E6EBF1", "#8995A6"], ink: "#1B2230" },
    { id: "bronze", min: 1, name: "Builder", rule: "첫 기수", c: ["#E3A36A", "#8E5226"], ink: "#FFFFFF" }
  ];
  const SPECIALS = [
    { id: "mentor", name: "멘토", rule: "러너 20명 이상과 함께", c: ["#63D2B1", "#1B7A61"], ink: "#FFFFFF", has: (p) => p.runners >= 20 },
    { id: "rise", name: "러너에서 Builder로", rule: "러너로 참여한 뒤 Builder가 됨", c: ["#FFAE8C", "#C04F33"], ink: "#FFFFFF", has: (p) => p.runnerOf.some((x) => x.cohort < p.first) }
  ];
  const tierOf = (p) => TIERS.find((t) => p.cohorts.length >= t.min);
  const specialsOf = (p) => SPECIALS.filter((m) => m.has(p));
  let medalUid = 0;
  function medalSVG(m, size, n) {
    const id = `mg${++medalUid}`, h = Math.round(size * (m.min ? 84 / 64 : 1));
    const grad = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.c[0]}"/><stop offset="1" stop-color="${m.c[1]}"/></linearGradient></defs>`;
    if (m.min) {
      return `<svg class="medal" viewBox="0 0 64 84" width="${size}" height="${h}" aria-hidden="true" focusable="false">${grad}
        <path d="M15 0h15l8 32H23z" fill="#2A2E7A"/><path d="M49 0H34l-8 32h15z" fill="#A9A4F5"/>
        <circle cx="32" cy="56" r="26" fill="url(#${id})"/><circle cx="32" cy="56" r="20.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/>
        <ellipse cx="23" cy="44" rx="9" ry="5" fill="#fff" fill-opacity=".28" transform="rotate(-30 23 44)"/>
        <text x="32" y="61" text-anchor="middle" font-size="18" font-weight="800" fill="${m.ink}">${n}</text>
        <text x="32" y="71" text-anchor="middle" font-size="7.5" font-weight="700" fill="${m.ink}" fill-opacity=".85">기수</text></svg>`;
    }
    const glyph = m.id === "mentor"
      ? `<text x="26" y="31" text-anchor="middle" font-size="13" font-weight="800" fill="${m.ink}">20+</text>`
      : `<path d="M26 14l9 10h-6v13h-6V24h-6z" fill="${m.ink}"/>`;
    return `<svg class="medal" viewBox="0 0 52 52" width="${size}" height="${size}" aria-hidden="true" focusable="false">${grad}
      <circle cx="26" cy="26" r="24" fill="url(#${id})"/><circle cx="26" cy="26" r="19" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/>${glyph}</svg>`;
  }
  const tierMedal = (p, size) => medalSVG(tierOf(p), size, p.cohorts.length);

  /* ---------- growth ---------- */
  function growthSeries() {
    const runners = (state.growth.uniqueRunners || []).map((x) => ({ x: `${x.cohort}기`, y: x.cumulative, add: x.new }));

    const byCohort = new Map();
    state.projects.forEach((p) => byCohort.set(p.cohort, (byCohort.get(p.cohort) || 0) + 1));
    let acc = 0;
    const projects = [...byCohort.keys()].sort((a, b) => a - b).map((c) => { acc += byCohort.get(c); return { x: `${c}기`, y: acc, add: byCohort.get(c) }; });

    const stars = (state.stats.starsByMonth || []).map((m) => ({ x: dot(m.month), y: m.cumulative }));

    let ppl = 0;
    const events = state.events.filter((e) => e.participants).sort((a, b) => a.order - b.order)
      .map((e) => { ppl += e.participants; return { x: `${e.order}회`, y: ppl, add: e.participants }; });
    const next = state.events.find((e) => e.upcoming);

    const lastR = runners[runners.length - 1], lastP = projects[projects.length - 1];
    return [
      { key: "runners", label: "함께한 러너", unit: "명", value: lastR ? lastR.y : 0, series: runners, delta: lastR ? `${lastR.x}에 새로 ${lastR.add}명` : "", tip: (p) => `${p.x}까지 ${fmt(p.y)}명` },
      { key: "projects", label: "프로젝트", unit: "개", value: lastP ? lastP.y : 0, series: projects, delta: lastP ? `${lastP.x} +${lastP.add}개` : "", tip: (p) => `${p.x}까지 ${fmt(p.y)}개` },
      { key: "stars", label: "GitHub 스타", unit: "", value: totalStars(), series: stars, delta: `레포 ${[...state.repos.values()].filter((r) => !r.kind && r.status !== "depot").length}개 합계`, plain: true, empty: "월별 추이는 매주 자동으로 쌓입니다.", tip: (p) => `${p.x} ${fmt(p.y)}` },
      { key: "events", label: "행사 참가자", unit: "명", value: ppl, series: events, delta: next ? `다음: ${dot(next.date.slice(5))} 5th Data Forum` : "", plain: true, tip: (p) => `${p.x}까지 ${fmt(p.y)}명` }
    ];
  }

  function sparkSVG(series, w, h) {
    const pad = 6, n = series.length;
    const max = Math.max(...series.map((p) => p.y)) || 1;
    const X = (i) => pad + (n === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (n - 1));
    const Y = (v) => h - pad - (v / max) * (h - 2 * pad);
    const pts = series.map((p, i) => [X(i), Y(p.y)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = `${line} L${pts[n - 1][0].toFixed(1)} ${h - pad} L${pts[0][0].toFixed(1)} ${h - pad} Z`;
    const last = pts[n - 1];
    return { pts, html: `<line class="base" x1="${pad}" x2="${w - pad}" y1="${h - pad}" y2="${h - pad}"/><path class="area" d="${area}"/><path class="ln" d="${line}"/><line class="guide" x1="0" x2="0" y1="${pad}" y2="${h - pad}" visibility="hidden"/><circle class="end" cx="${last[0]}" cy="${last[1]}" r="4.5"/><circle class="hov" r="4.5" visibility="hidden"/>` };
  }

  function drawSpark(tile, t) {
    const box = tile.querySelector(".spark");
    if (!box) return;
    const svgEl = box.querySelector("svg");
    svgEl.removeAttribute("viewBox");
    const w = Math.max(120, box.clientWidth), h = Math.max(48, Math.round(svgEl.getBoundingClientRect().height) || 64);
    svgEl.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const { pts, html } = sparkSVG(t.series, w, h);
    svgEl.innerHTML = html;
    const tip = box.querySelector(".spark-tip");
    const guide = svgEl.querySelector(".guide"), hov = svgEl.querySelector(".hov");
    const show = (i) => {
      const [x, y] = pts[i];
      guide.setAttribute("x1", x); guide.setAttribute("x2", x); guide.setAttribute("visibility", "visible");
      hov.setAttribute("cx", x); hov.setAttribute("cy", y); hov.setAttribute("visibility", "visible");
      tip.hidden = false; tip.textContent = t.tip(t.series[i]);
      tip.style.left = `${Math.min(Math.max(x, 40), w - 40)}px`;
      tip.style.top = `${y + 4}px`;
    };
    const hide = () => { guide.setAttribute("visibility", "hidden"); hov.setAttribute("visibility", "hidden"); tip.hidden = true; };
    svgEl.onpointermove = (e) => {
      const r = svgEl.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * w;
      let best = 0;
      pts.forEach((p, i) => { if (Math.abs(p[0] - x) < Math.abs(pts[best][0] - x)) best = i; });
      show(best);
    };
    svgEl.onpointerleave = hide;
    box.onkeydown = (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      box._i = Math.min(pts.length - 1, Math.max(0, (box._i ?? pts.length - 1) + (e.key === "ArrowRight" ? 1 : -1)));
      show(box._i);
    };
    box.onblur = hide;
  }

  function countUp(el, to, unit) {
    const render = (v) => { el.innerHTML = `${fmt(Math.round(v))}${unit ? `<small>${unit}</small>` : ""}`; };
    if (reduceMotion) { render(to); return; }
    const t0 = performance.now(), dur = 900;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      render(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function topStarsHTML() {
    const top = [...state.repos.values()].filter((r) => !r.kind).sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 3);
    const max = (top[0] && top[0].stars) || 1;
    return `<ul class="mini-bars" aria-label="스타가 많은 레포">${top.map((r) => `<li><span class="nm">${esc(r.title)}</span><span class="v">${fmt(r.stars || 0)}</span><span class="tr" aria-hidden="true"><i style="width:${Math.round(((r.stars || 0) / max) * 100)}%"></i></span></li>`).join("")}</ul>`;
  }

  let growthTiles = [];
  /* the team's numbers, said once, next to the people who made them */
  function renderContribStats() {
    const el = $("#contrib-stats");
    if (!el || !growthTiles.length) return;
    const v = Object.fromEntries(growthTiles.map((t) => [t.key, t]));
    const part = (t, label) => (t ? `<span><b>${fmt(t.value)}</b>${label}</span>` : "");
    el.innerHTML = [part(v.runners, "명이 러너로 참여"), part(v.projects, "개 프로젝트"), part(v.stars, " GitHub 스타"), part(v.events, "명 행사 참가")].join("");
  }
  function renderGrowth(animate = true) {
    growthTiles = growthSeries();
    const box = $("#growth");
    renderContribStats();
    if (!box) return;
    box.innerHTML = growthTiles.map((t) => {
      const has = t.series.length > 1;
      const first = has ? t.series[0] : null, last = has ? t.series[t.series.length - 1] : null;
      const summary = has ? `${t.label}: ${first.x} ${fmt(first.y)}에서 ${last.x} ${fmt(last.y)}로 늘었습니다` : `${t.label}: ${fmt(t.value)}`;
      return `<li class="tile" data-key="${t.key}">
        <span class="tile-label">${t.label}</span>
        <span class="tile-value" data-to="${t.value}" data-unit="${t.unit}">${fmt(t.value)}${t.unit ? `<small>${t.unit}</small>` : ""}</span>
        ${t.delta ? `<span class="tile-delta${t.plain ? " plain" : ""}">${esc(t.delta)}</span>` : ""}
        ${has ? `<div class="spark" tabindex="0" aria-label="${esc(summary)}. 좌우 화살표로 값을 볼 수 있습니다."><svg role="img" aria-label="${esc(summary)}" preserveAspectRatio="none"></svg><span class="spark-tip" hidden></span><div class="spark-axis"><span>${esc(first.x)}</span><span>${esc(last.x)}</span></div></div>`
          : t.key === "stars" ? topStarsHTML() : `<p class="spark-empty">${esc(t.empty || "")}</p>`}
      </li>`;
    }).join("");
    const ev = box.querySelector('.tile[data-key="events"]');
    if (ev) ev.insertAdjacentHTML("beforeend", `<a class="tile-link" href="#events" aria-label="행사 보기"></a>`);
    box.querySelectorAll(".tile").forEach((el, i) => {
      const t = growthTiles[i];
      if (t.series.length > 1) drawSpark(el, t);
      if (animate) { const v = el.querySelector(".tile-value"); countUp(v, t.value, t.unit); }
    });
  }

  /* ---------- curriculum: ladder in the hero ---------- */
  const isLearnable = (r) => r && r.level && (r.kind || (r.lines || []).length);
  function levelItems(levelId) {
    const repos = [...state.repos.values()].filter((r) => !r.kind && r.level === levelId && (r.lines || []).length)
      .sort((a, b) => (b.stars || 0) - (a.stars || 0));
    if (levelId === "L2") {
      const at = repos.findIndex((r) => r.repo === "causal-inference-in-python-code") + 1;
      repos.splice(at, 0, ...[...state.repos.values()].filter((r) => r.kind === "paid"));
    }
    if (levelId === "L4") { const ext = state.repos.get(state.map.external.id); if (ext) repos.push(ext); }
    return repos;
  }
  const topRepos = () => [...state.repos.values()].filter((r) => !r.kind && r.status !== "depot").sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 3).map((r) => r.repo);

  function renderLadder() {
    const rows = state.levels.map((lv, i) => {
      const items = levelItems(lv.id);
      const free = items.filter((r) => !r.kind);
      const picks = free.slice(0, 2).map((r) => `<span class="pick" data-line="${primaryLine(r)}">${esc(r.title)}</span>`).join("");
      const paid = items.some((r) => r.kind === "paid") ? `<span class="pick paid">도서·강의</span>` : "";
      const divider = i === 0 ? `<li class="rung-sep">배우기</li>` : lv.layer === "build" && state.levels[i - 1].layer !== "build" ? `<li class="rung-sep">만들기</li>` : "";
      return `${divider}<li class="rung${lv.layer === "build" ? " build" : ""}" style="--i:${i}">
        <button type="button" data-level="${lv.id}">
          <span class="rl">${lv.id}</span>
          <span class="rt"><b>${esc(lv.name)}</b><span>${esc(lv.question)}</span></span>
          <span class="rp">${picks}${paid}</span>
          <span class="rc"><b>${free.length}</b>레포</span>
        </button></li>`;
    }).join("");
    const box = $("#ladder");
    if (box) box.innerHTML = rows;
  }

  /* ---------- curriculum: chaptered shelf ---------- */
  function shelfOrder() {
    return state.levels.flatMap((lv) => levelItems(lv.id).map((r) => ({ r, level: lv.id })));
  }

  const pad2 = (n) => String(n).padStart(2, "0");
  const DAY = 864e5;
  const ageDays = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY)) : null);
  function ago(iso) {
    const d = ageDays(iso);
    if (d == null) return "";
    if (d < 1) return "오늘";
    if (d < 7) return `${d}일 전`;
    if (d < 31) return `${Math.floor(d / 7)}주 전`;
    if (d < 365) return `${Math.floor(d / 30)}개월 전`;
    return `${Math.floor(d / 365)}년 전`;
  }
  const learnables = () => [...state.repos.values()].filter((r) => !r.kind && (r.lines || []).length && r.status !== "depot");
  const currentRoute = () => state.routes.find((r) => r.id === state.route);

  /* one material: what it is, what it covers, and who made it */
  function episodeHTML(r, level, k, top, step) {
    const id = r.repo;
    const line = primaryLine(r);
    const rank = top.indexOf(id);
    const badges = [
      rank >= 0 ? `<span class="b top">★ ${rank + 1}위</span>` : "",
      r.status === "running" ? `<span class="b live">진행 중</span>` : "",
      r.status !== "running" && ageDays(r.pushed) != null && ageDays(r.pushed) <= 14 ? `<span class="b new">새 업데이트</span>` : "",
      r.kind === "paid" ? `<span class="b paid">${esc(r.type || "")} · 유료</span>` : "",
      r.kind === "external" ? `<span class="b ext">팀 밖 오픈소스</span>` : ""
    ].join("");
    const who = r.builders || [];
    const maker = (n) => { const p = (state.people || []).find((x) => x.name === n); return `${avatarHTML(n, "sm")}<span class="nm">${esc(n)}${p ? `<span class="mini-medal" title="${esc(tierOf(p).name)}">${tierMedal(p, 12)}</span>` : ""}</span>`; };
    const people = who.length ? `<span class="who"><span class="k">만든 사람</span>${who.slice(0, 2).map(maker).join("")}${who.length > 2 ? `<span class="nm">외 ${who.length - 2}명</span>` : ""}</span>`
      : `<span class="who"><span class="k">${r.kind === "paid" ? "출판" : r.kind === "external" ? "커뮤니티" : "만든 사람"}</span><span class="nm">${r.kind === "paid" ? "한빛미디어" : r.kind === "external" ? "PyWhy · CausalML" : "팀 공동"}</span></span>`;
    const tracks = (r.lines || []).map((l) => esc(state.lines.get(l).name)).join(" · ");
    const lv = state.levels.find((x) => x.id === level);
    return `<li class="ep${step ? " on" : ""}${r.kind ? ` ${r.kind}` : ""}" data-line="${line}" data-id="${esc(id)}" data-level="${level}"${step ? ` data-chap="${esc(id)}"` : ""}>
      <button type="button" data-open="${esc(id)}" aria-label="${step ? `${step}번째, ` : ""}${esc(r.title)}${lv ? `, ${lv.id} ${esc(lv.name)}` : ""}">
        <span class="ep-top">${step ? `<span class="ep-step">${pad2(step)}</span>` : ""}<span class="ep-track"><i aria-hidden="true"></i>${step && lv ? `${lv.id} · ` : ""}${tracks || (r.kind === "paid" ? "도서·강의" : "")}</span><span class="ep-badges">${badges}</span></span>
        <span class="ep-main">${r.cover ? `<img class="ep-thumb" src="${esc(r.cover)}" alt="" loading="lazy">` : ""}<span><h4>${esc(r.title)}</h4><span class="sum">${esc(r.summary)}</span></span></span>
        <span class="ep-foot">${people}<span class="ep-end">${r.kind ? "" : `<span class="star">${icons.star}${fmt(r.stars || 0)}</span>`}${state.ridden.has(id) ? `<span class="ep-done" aria-label="학습 완료">✓ 완료</span>` : ""}</span></span>
      </button>
    </li>`;
  }

  function renderPath() {
    const box = $("#path");
    if (!box) return;
    const route = currentRoute();
    const onRoute = route ? new Set(route.stops.map((id) => (state.repos.get(id) || {}).level)) : null;
    box.innerHTML = state.levels.map((lv) => {
      const items = levelItems(lv.id), free = items.filter((r) => !r.kind).length;
      const makers = [...new Set(items.flatMap((r) => r.builders || []))];
      const done = items.filter((r) => state.ridden.has(r.repo)).length;
      const on = route ? onRoute.has(lv.id) : state.level === lv.id;
      return `<li class="step${lv.layer === "build" ? " build" : ""}"><button type="button" data-step="${lv.id}" aria-pressed="${on}">
        <span class="st-id">${lv.id}</span><span class="st-name">${esc(lv.name)}</span><span class="st-q">${esc(lv.question)}</span>
        <span class="st-meta">자료 ${free}개${items.length > free ? " · 책·강의" : ""}${done ? ` · 완료 ${done}` : ""}</span>
        ${makers.length ? `<span class="st-makers">${makers.slice(0, 4).map((n) => avatarHTML(n, "sm")).join("")}</span>` : ""}</button></li>`;
    }).join("");
    wireAvatars(box);
  }
  function renderShelf() {
    const top = topRepos();
    const route = currentRoute();
    const shelf = $("#shelf");
    state.level = state.level || "L0";
    shelf.classList.toggle("routing", !!route);
    if (route) {
      const items = route.stops.map((id) => state.repos.get(id)).filter(Boolean);
      shelf.innerHTML = `<li class="lv route"><ol class="lv-items">${items.map((r, i) => episodeHTML(r, r.level || "", i, top, i + 1)).join("")}</ol></li>`;
      renderRouteNote();
    } else {
      const lv = state.levels.find((x) => x.id === state.level) || state.levels[0];
      const items = levelItems(lv.id);
      const i = state.levels.indexOf(lv), next = state.levels[i + 1];
      shelf.innerHTML = `<li class="lv${lv.layer === "build" ? " build" : ""}" data-chap="${lv.id}">
          <div class="lv-head">
            <span class="lv-id">${lv.id}</span>
            <div class="lv-t"><h3>${esc(lv.name)}<span>${esc(lv.question)}</span></h3><p>${esc(lv.goal)}</p></div>
          </div>
          <ol class="lv-items">${items.map((r, k) => episodeHTML(r, lv.id, k, top)).join("")}</ol>
          ${next ? `<button type="button" class="lv-next" data-step="${next.id}">다음 단계 · ${next.id} ${esc(next.name)} ›</button>` : ""}
        </li>`;
      $("#route-note").textContent = "";
    }
    renderPath();
    wireAvatars(shelf);

    const repos = [...state.repos.values()].filter((r) => !r.kind && r.status !== "depot");
    const depot = [...state.repos.values()].filter((r) => r.status === "depot");
    const learnable = repos.filter((r) => (r.lines || []).length);
    const done = learnable.filter((r) => state.ridden.has(r.repo)).length;
    $("#curriculum-sub").textContent = `인과추론을 어디서 시작해 어디까지 가면 되는지, 팀이 만든 레포 ${repos.length}개를 다섯 단계로 엮었습니다. L0–L2는 무료 자료만으로도 끝까지 갈 수 있습니다.`;
    $("#n-course").textContent = repos.length; $("#n-course").title = `레포 ${repos.length}개`;
    $("#shelf-foot").innerHTML = `${done ? `<span class="done-n">학습 완료 ${done} / ${learnable.length}</span> ` : ""}카드를 누르면 자세한 정보와 링크가 열립니다. 운영·보관 레포: ${depot.map((r) => `<a href="${esc(repoUrl(r))}" target="_blank" rel="noopener">${esc(r.title)}</a>`).join(", ")}`;
  }

  function scrollShelfTo(el, smooth = true) {
    if (!el) return;
    el.scrollIntoView({ behavior: smooth && !reduceMotion ? "smooth" : "auto", block: "start" });
  }

  /* mark the level (or route stop) currently on screen in the level bar */
  function shelfSpy() {
    const marks = [...$("#shelf").querySelectorAll("[data-chap]")];
    if (!marks.length) return;
    const line = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 64) + 80;
    let cur = marks[0].dataset.chap;
    marks.forEach((c) => { if (c.getBoundingClientRect().top <= line) cur = c.dataset.chap; });
    document.querySelectorAll("[data-chapter]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.chapter === cur)));
  }

  /* ---------- goals (routes) ---------- */
  function renderRouteNote() {
    const route = currentRoute();
    if (!route) return;
    const b = state.routeBegin || 0;
    $("#route-note").innerHTML = `<b>${esc(route.label)}</b>: ${esc(route.description)} ${b ? `${pad2(b + 1)}부터 보면 됩니다. 앞의 자료는 필요할 때 보세요.` : "01부터 순서대로 보세요."}`;
  }
  function setRoute(id, source) {
    if (source && id !== state.route) track("select_route", { route: id, source });
    state.routeBegin = 0;
    state.route = id;
    $("#route-chips").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", String(c.dataset.route === id)));
    renderShelf();
    applyRouteMap();
  }

  function renderRouteChips() {
    const box = $("#route-chips");
    const all = [{ id: "all", label: "전체 보기" }, ...state.routes];
    box.innerHTML = all.map((r) => `<button type="button" class="chip" role="radio" data-route="${esc(r.id)}" aria-checked="${r.id === state.route}">${esc(r.label)}</button>`).join("") +
      `<button type="button" class="chip quiz-chip" data-quiz-open>잘 모르겠어요 · 3문항으로 찾기</button>`;
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-route]");
      if (!b) return;
      setRoute(b.dataset.route, "chip");
      /* on short screens bring the route into view, it starts below the chips */
      if ($("#shelf-wrap").getBoundingClientRect().top > innerHeight * 0.6) $("#route-note").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  }

  function commonLine(a, b) {
    const la = state.repos.get(a).lines || [], lb = state.repos.get(b).lines || [];
    return la.find((x) => lb.includes(x)) || lb[0] || la[0];
  }

  function applyRouteMap() {
    const route = currentRoute();
    const root = $("#metro"), marks = $("#route-marks");
    if (!root || !marks) return;
    marks.innerHTML = "";
    root.querySelectorAll(".on").forEach((el) => el.classList.remove("on"));
    document.querySelectorAll(".vline li.dim").forEach((el) => el.classList.remove("dim"));
    if (!route) { root.classList.remove("routing"); return; }
    root.classList.add("routing");
    const used = new Set();
    route.stops.forEach((id, i) => {
      root.querySelector(`[data-st="${CSS.escape(id)}"]`)?.classList.add("on");
      if (i) used.add(commonLine(route.stops[i - 1], id));
    });
    used.forEach((l) => root.querySelectorAll(`[data-track="${l}"]`).forEach((t) => t.classList.add("on")));
    document.querySelectorAll(".vline li").forEach((li) => { if (!route.stops.includes(li.dataset.vst)) li.classList.add("dim"); });
    const pos = new Map(state.map.stations.map((s) => [s.id, s]));
    route.stops.forEach((id, i) => {
      const s = pos.get(id); if (!s) return;
      const g = svg("g", { "aria-hidden": "true" }, marks);
      svg("circle", { cx: s.x + 17, cy: s.y - 17, r: 10, class: "step-b" }, g);
      svg("text", { x: s.x + 17, y: s.y - 16.5, class: "step-n" }, g).textContent = i + 1;
    });
  }

  /* ---------- contribution: Builder stats, top 3, rail, roster ---------- */
  const shortTerm = (t) => (t || "").replace(/^20(\d\d) /, "$1 ").replace("상반기", "상").replace("하반기", "하");
  const span = (list) => (list.length ? (list[0] === list[list.length - 1] ? `${list[0]}기` : `${list[0]}–${list[list.length - 1]}기`) : "");

  /* one way to say how long someone has been a Builder, everywhere */
  const tenure = (p) => (p.cohorts.length === 1 ? `${p.first}기 Builder` : `${p.first}기부터 · ${p.cohorts.length}개 기수 (${p.cohorts.join("·")}기)`);

  function builderStats() {
    const cur = currentCohort();
    const people = new Map();
    const get = (name) => {
      if (!people.has(name)) people.set(name, { name, items: [], runnerOf: [], repos: new Set(), line: null });
      return people.get(name);
    };
    state.projects.forEach((p) => {
      if (!p.builder) return;
      const r = p.repo && state.repos.get(p.repo);
      get(p.builder).items.push({ cohort: p.cohort, term: p.term, name: p.name, runners: p.runners, repo: r ? r.repo : null, title: r ? r.title : null, link: p.link, line: r ? primaryLine(r) : "none", retro: p.retro || null });
    });
    state.repos.forEach((r) => {
      if (r.kind) return;
      (r.builders || []).forEach((b) => get(b).repos.add(r.repo));
      if (r.status !== "running" || state.projects.some((p) => p.repo === r.repo)) return;
      (r.builders || []).forEach((b) => get(b).items.push({ cohort: cur, term: "", name: r.title, runners: null, repo: r.repo, title: r.title, line: primaryLine(r), live: true }));
    });
    state.builders.forEach((b) => { if (people.has(b.name)) people.get(b.name).runnerOf = (b.runnerOf || []).slice(); });
    const list = [...people.values()].map((p) => {
      p.items.sort((x, y) => x.cohort - y.cohort);
      p.cohorts = [...new Set(p.items.map((i) => i.cohort))];
      p.projects = p.items.length;
      p.runners = p.items.reduce((s, i) => s + (i.runners || 0), 0);
      p.first = p.cohorts[0];
      p.line = (p.items.find((i) => i.line !== "none") || {}).line || "main";
      p.byCohort = new Map(p.cohorts.map((c) => [c, p.items.filter((i) => i.cohort === c)]));
      return p;
    });
    list.sort((x, y) => y.projects - x.projects || y.runners - x.runners || x.first - y.first || x.name.localeCompare(y.name, "ko"));
    list.forEach((p, i) => { p.rank = i + 1; });
    return list;
  }

  /* One cell per cohort: filled = Builder that cohort (number = runners), ring = joined as a runner. */
  /* the cohorts someone took part in, oldest first: filled = led as Builder, outlined = joined as a runner */
  function stripHTML(p) {
    const ran = new Set(p.runnerOf.map((x) => x.cohort).filter((c) => !p.byCohort.has(c)));
    const all = [...new Set([...p.cohorts, ...ran])].sort((a, b) => a - b);
    const chips = all.map((c) => {
      const its = p.byCohort.get(c);
      if (!its) return `<li class="cc r" data-line="${p.line}" title="${esc(`${c}기 러너로 참여`)}"><b>${c}기</b>러너</li>`;
      const n = its.reduce((s, i) => s + (i.runners || 0), 0);
      const live = its.some((i) => i.live);
      const label = `${c}기 Builder: ${its.map((i) => i.title || i.name).join(", ")}${n ? `, 러너 ${n}명` : ""}${live ? ", 진행 중" : ""}`;
      return `<li class="cc b${live ? " live" : ""}" data-line="${its[0].line}" title="${esc(label)}"><b>${c}기</b>${live ? "진행 중" : n ? `러너 ${n}` : "Builder"}${its.length > 1 ? `<i>· ${its.length}개</i>` : ""}</li>`;
    }).join("");
    return `<ul class="ro-strip" aria-label="${esc(`참여한 기수: ${all.map((c) => `${c}기`).join(", ")}`)}">${chips}</ul>`;
  }

  /* medal rules and the stage they lead to, with how many people hold each */
  function renderMedalLadder(list) {
    const box = $("#medal-ladder");
    if (!box) return;
    const count = (t) => list.filter((p) => tierOf(p) === t).length;
    const steps = [...TIERS].reverse().map((t) => `<li class="ml-step"><span class="ml-medal">${medalSVG(t, 48, t.min)}</span><b>${esc(t.name)}</b><span>${esc(t.rule)}</span><span class="ml-n">${count(t)}명</span></li>`).join("");
    const sp = SPECIALS.map((m) => `<li>${medalSVG(m, 22)}<b>${esc(m.name)}</b><span>${esc(m.rule)} · ${list.filter((p) => m.has(p)).length}명</span></li>`).join("");
    box.innerHTML = `<div class="ml-head"><h3 class="contrib-head">Builder 메달과 다음 무대</h3><p>Builder로 연 기수가 쌓일수록 메달이 바뀝니다. 오래 함께한 Builder에게는 학회와 Data Forum에서 발표할 기회가 열립니다.</p></div>
      <ol class="ml-steps">${steps}<li class="ml-step stage"><a href="#stage" data-event="click_conference" data-event-params='{"conference":"all","placement":"medal_ladder"}'><span class="ml-medal"><svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="#14162B"/><rect x="15" y="8" width="10" height="16" rx="5" fill="#FFD54A"/><path d="M11 19a9 9 0 0 0 18 0M20 28v5M14 33h12" fill="none" stroke="#FFD54A" stroke-width="2.4" stroke-linecap="round"/></svg></span><b>발표 무대</b><span>비즈니스 실험 심포지엄 · Data Forum</span></a></li></ol>
      <ul class="ml-special"><li class="k">특별 메달</li>${sp}</ul>`;
  }


  function renderContrib() {
    const list = builderStats();
    state.people = list;
    const cohorts = [...new Set(state.projects.map((p) => p.cohort))].sort((a, b) => a - b);
    const terms = new Map(state.projects.map((p) => [p.cohort, p.term]));
    const stripLabel = (p) => tenure(p);

    $("#top3").innerHTML = list.slice(0, 3).map((p) => {
      const recent = [...p.items].reverse().slice(0, 2);
      return `<li class="tcard" data-person-row="${esc(p.name)}"><button type="button" data-person="${esc(p.name)}" aria-label="${esc(`Top ${p.rank} ${p.name}, 이력 보기`)}">
        <span class="t-rank" aria-hidden="true">${p.rank}</span>
        <span class="t-head">${avatarHTML(p.name, "lg")}<span><b class="t-name">${esc(p.name)}</b><span class="t-since">${esc(tenure(p))}</span></span></span>
        <span class="t-medals">${tierMedal(p, 30)}<b>${esc(tierOf(p).name)}</b>${specialsOf(p).map((m) => `<span class="t-sp" title="${esc(`${m.name}: ${m.rule}`)}">${medalSVG(m, 22)}${esc(m.name)}</span>`).join("")}</span>
        <span class="t-stats"><span><b>${p.projects}</b>프로젝트</span><span><b>${fmt(p.runners)}</b>함께한 러너</span><span><b>${p.repos.size}</b>레포</span></span>
        <span class="t-recent">${recent.map((i) => `<span>${i.cohort}기 · ${esc(i.name)}</span>`).join("")}</span>
        <span class="t-more">이력 보기</span>
      </button></li>`;
    }).join("");

    const rest = list.slice(3);
    const card = (p, copy) => {
      const latest = p.items[p.items.length - 1];
      return `<li class="pcard" data-line="${p.line}"${copy ? "" : ` data-person-row="${esc(p.name)}"`}><button type="button" data-person="${esc(p.name)}"${copy ? ' tabindex="-1"' : ""}>${avatarHTML(p.name, "lg")}
        <span class="pc-body"><b class="pc-name">${esc(p.name)}<span class="pc-medal" title="${esc(tierOf(p).name)}">${tierMedal(p, 16)}</span></b><span class="pc-since">${esc(tenure(p))}</span>
          <span class="pc-stats">프로젝트 <b>${p.projects}</b> · 러너 <b>${fmt(p.runners)}</b></span>
          ${latest ? `<span class="pc-latest">최근 · ${esc(latest.name)}</span>` : ""}</span></button></li>`;
    };
    /* everyone else: one row of names, each opening that person's history */
    $("#people-rail").innerHTML = rest.length ? `<span class="crew-k">함께한 Builder ${rest.length}명</span><ul class="crew">${rest.map((p) => `<li data-line="${p.line}" data-person-row="${esc(p.name)}"><button type="button" data-person="${esc(p.name)}" title="${esc(`${tenure(p)} · 프로젝트 ${p.projects}개`)}">${avatarHTML(p.name, "sm")}<span>${esc(p.name)}</span></button></li>`).join("")}</ul>` : "";

    const head = `<div class="ro-head" aria-hidden="true"><span>Builder</span><span>참여한 기수</span><span>최근 프로젝트</span><span class="tot">합계</span></div>`;
    $("#roster").innerHTML = head + `<ol class="ro-list">${list.map((p) => `<li class="ro" data-line="${p.line}" data-person-row="${esc(p.name)}">
      <span class="ro-who"><span class="ro-rank">${p.rank}</span>${avatarHTML(p.name, "sm")}<span><button type="button" class="ro-name" data-person="${esc(p.name)}">${esc(p.name)}<span class="ro-medal" title="${esc(tierOf(p).name)}">${tierMedal(p, 16)}</span></button><span class="ro-span">${esc(tierOf(p).name)}${specialsOf(p).map((m) => ` · ${esc(m.name)}`).join("")}</span></span></span>
      ${stripHTML(p)}
      <ul class="ro-projects">${p.items.slice(-3).reverse().map((i) => `<li><span class="c">${i.cohort}기</span>${i.repo ? `<button type="button" data-open="${esc(i.repo)}" title="${esc(`${i.name} · 레포: ${i.title}`)}">${esc(i.name)}</button>` : i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener" title="${esc(i.name)}">${esc(i.name)}</a>` : `<span title="${esc(i.name)}">${esc(i.name)}</span>`}${i.live ? `<span class="live-dot">진행 중</span>` : ""}</li>`).join("")}${p.items.length > 3 ? `<li><button type="button" class="ro-more" data-person="${esc(p.name)}">이전 프로젝트 ${p.items.length - 3}개 더 보기</button></li>` : ""}</ul>
      <span class="ro-total tot"><b>러너 ${fmt(p.runners)}명</b><span>프로젝트 ${p.projects}개</span></span>
    </li>`).join("")}</ol>`;
    wireAvatars($("#top3")); wireAvatars($("#people-rail")); wireAvatars($("#roster"));

    const contributors = state.stats.totals && state.stats.totals.contributors;
    $("#contrib-sub").textContent = `프로젝트를 연 사람(Builder) ${list.length}명 가운데 연 프로젝트 수, 그다음 함께한 러너 수가 많은 순입니다. 지금까지 ${cohorts.length}개 기수 동안 프로젝트 ${state.projects.length}개가 열렸습니다.`;
    $("#roster-legend").innerHTML = `<li><span class="cc b" data-line="main"><b>8기</b>러너 6</span>Builder로 연 기수와 함께한 러너 수</li><li><span class="cc r" data-line="main"><b>7기</b>러너</span>러너로 참여한 기수</li><li><span class="cc b live" data-line="main"><b>13기</b>진행 중</span>지금 진행 중</li>`;
    renderMedalLadder(list);
  }

  /* Three lines a Builder writes after a project; nothing shows until they do. */
  function retroHTML(r) {
    if (!r || !(r.why || r.learned || r.next)) return "";
    const row = (k, v) => (v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : "");
    return `<details class="tl-retro"><summary>회고</summary><dl>${row("왜 만들었나", r.why)}${row("무엇을 배웠나", r.learned)}${row("다음 사람에게", r.next)}</dl></details>`;
  }

  function awardHTML(p) {
    const t = tierOf(p), sp = specialsOf(p);
    const said = `${p.cohorts.length > 1 ? `${p.cohorts.length}개 기수(${p.cohorts.join("·")}기)` : `${p.first}기`}에서 프로젝트 ${p.projects}개를 열고${p.runners ? ` 러너 ${fmt(p.runners)}명과 함께했습니다.` : " 첫 러너를 기다리고 있습니다."}`;
    return `<section class="p-award" data-tier="${t.id}" aria-label="${esc(`메달: ${t.name}${sp.map((m) => `, ${m.name}`).join("")}`)}">
      <span class="p-award-medal">${tierMedal(p, 84)}</span>
      <div class="p-award-body"><p class="k">Builder 메달</p><b class="t">${esc(t.name)}</b><p class="d">${esc(said)}</p>
        ${sp.length ? `<ul class="p-ribbons">${sp.map((m) => `<li>${medalSVG(m, 26)}<span><b>${esc(m.name)}</b>${esc(m.rule)}</span></li>`).join("")}</ul>` : ""}
        <button type="button" class="btn ghost sm" data-medal-card="${esc(p.name)}">메달 카드 만들기</button></div>
    </section>`;
  }
  /* the person just opened stays marked in the lists behind the dialog */
  function markPerson(name) {
    document.querySelectorAll("[data-person-row].is-picked").forEach((el) => el.classList.remove("is-picked"));
    document.querySelectorAll("[data-person-row]").forEach((el) => { if (el.dataset.personRow === name) el.classList.add("is-picked"); });
  }

  function openPerson(name, source) {
    const p = (state.people || []).find((x) => x.name === name);
    if (!p) return;
    const info = builderInfo(name);
    state.lastPerson = name;
    markPerson(name);
    track("open_builder", { builder: info.slug || name, source: source || "hub" });
    if (window.hubSeen) window.hubSeen("builders", info.slug || name, 3, "builder");
    const runnerItems = p.runnerOf.map((x) => {
      const proj = state.projects.find((q) => q.cohort === x.cohort && q.name === x.project);
      const r = proj && proj.repo && state.repos.get(proj.repo);
      return { cohort: x.cohort, role: "러너", name: x.project, title: r ? r.title : null, repo: r ? r.repo : null, link: proj && proj.link, by: proj && proj.builder, line: r ? primaryLine(r) : "none" };
    });
    const events = [...p.items.map((i) => ({ ...i, role: "Builder" })), ...runnerItems].sort((a, b) => b.cohort - a.cohort || (a.role === "Builder" ? -1 : 1));
    const terms = new Map(state.projects.map((q) => [q.cohort, q.term]));
    const item = (e) => {
      const facts = e.role === "Builder" ? [e.runners ? `러너 ${e.runners}명` : "", e.live ? "진행 중" : ""] : [e.by ? `Builder ${esc(e.by)}` : ""];
      const go = e.repo ? `<button type="button" data-open="${esc(e.repo)}" data-from-person="${esc(p.name)}" title="${esc(e.title)}">자료 열기</button>` : e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">기록 보기</a>` : "";
      const note = [...facts.filter(Boolean), go].filter(Boolean).join('<span class="sep" aria-hidden="true">·</span>');
      return `<li class="${e.role === "Builder" ? "b" : "r"}" data-line="${e.line}"><span class="tl-c"><b>${e.cohort}기</b><span>${esc(terms.get(e.cohort) || "")}</span></span><span class="tl-body"><span class="tl-role">${e.role}</span><span class="tl-name">${esc(e.name)}</span>${note ? `<span class="tl-note">${note}</span>` : ""}${retroHTML(e.retro)}</span></li>`;
    };
    const repos = [...p.repos].map((id) => state.repos.get(id)).filter(Boolean);
    $("#station-body").innerHTML = `
      <div class="station-band" data-line="${p.line}"></div>
      <button type="button" class="station-close" aria-label="닫기" data-close>${icons.close}</button>
      <div class="station-content person" data-line="${p.line}">
        <div class="tags">${p.rank <= 3 ? `<span class="rank-tag">Top ${p.rank}</span>` : ""}<span class="tag-line" data-line="${p.line}"><span class="num" aria-hidden="true"></span>${esc(tenure(p))}</span></div>
        <div class="p-head">${avatarHTML(p.name, "lg")}<div><h2 id="station-title">${esc(p.name)}</h2>${info.linkedin ? `<a href="${esc(info.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ""}</div></div>
        ${awardHTML(p)}
        ${info.slug ? `<div class="p-share"><a class="btn sm" href="builders/${esc(info.slug)}.html">Builder 페이지</a><button type="button" class="btn ghost sm" data-copy="${esc(shareUrl(`/builders/${info.slug}.html`, "builder_page"))}" data-share="builder">링크 복사</button></div>` : ""}
        ${info.intro ? `<p>${esc(info.intro)}</p>` : ""}
        <ul class="p-stats"><li><b>${p.projects}</b>프로젝트</li><li><b>${p.cohorts.length}</b>기수</li><li><b>${fmt(p.runners)}</b>함께한 러너</li><li><b>${repos.length}</b>레포</li></ul>
        <h3 class="p-h">이력</h3>
        <ol class="p-timeline">${events.map(item).join("")}</ol>
        ${repos.length ? `<h3 class="p-h">관련 레포</h3><div class="p-repos">${repos.map((r) => `<button type="button" data-open="${esc(r.repo)}" data-line="${primaryLine(r)}"><span class="num" aria-hidden="true"></span>${esc(r.title)}</button>`).join("")}</div>` : ""}
      </div>`;
    wireAvatars($("#station-body"));
    const d = dialog();
    if (!d.open) { if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", ""); }
    $("#station-body .station-close").focus();
  }

  /* ---------- this week (curriculum tab) ---------- */
  const weekIndex = () => Math.floor((Date.now() - Date.UTC(2026, 0, 5)) / (7 * DAY));
  /* where this visitor is: recent repos to go back to, and how much is marked done */
  function renderWeek() {
    const box = $("#progress");
    if (!box) return;
    const list = learnables();
    const recent = state.recent.map((x) => state.repos.get(x.id)).filter(Boolean).slice(0, 3);
    const done = list.filter((r) => state.ridden.has(r.repo)).length;
    const finished = state.levels.filter((l) => levelDone(l.id));
    const cardChip = finished.length ? `<button type="button" class="cont-chip card" data-card="${finished[finished.length - 1].id}">${finished[finished.length - 1].id} 완주 카드</button>` : "";
    box.innerHTML = recent.length ? `<div class="continue"><span class="cont-label">이어서 보기</span>${recent.map((r) => `<button type="button" class="cont-chip" data-line="${primaryLine(r)}" data-open="${esc(r.repo)}"><i aria-hidden="true"></i>${esc(r.title)}</button>`).join("")}
      ${cardChip}<span class="cont-progress">학습 완료 <b>${done}</b> / ${list.length}<span class="bar" aria-hidden="true"><i style="width:${Math.round((done / list.length) * 100)}%"></i></span></span></div>` : "";
  }


  /* ---------- map legend ---------- */
  function renderVLines() {
    $("#vlines").innerHTML = state.lineList.map((l) => {
      let ids = [...(state.order.get(l.id) || [])];
      if (l.id === "main") {
        const at = ids.indexOf("causal-inference-in-python-code") + 1;
        ids.splice(at, 0, ...(state.map.express.stops || []).map((s) => s.id));
      }
      return `<div class="vline" data-line="${l.id}"><h3><span class="num" aria-hidden="true"></span>${esc(l.name)}</h3><ol>${ids.map((id) => {
        const r = state.repos.get(id);
        const cls = [r.kind === "paid" ? "paid" : "", state.ridden.has(id) ? "on" : ""].filter(Boolean).join(" ");
        return `<li class="${cls}" data-vst="${esc(id)}"><button type="button" data-open="${esc(id)}">${esc(r.mapLabel || r.title)}</button>${r.level ? `<span class="lv">${r.level}</span>` : ""}</li>`;
      }).join("")}</ol></div>`;
    }).join("");
  }

  /* the legend doubles as a filter: pick a track to keep only its line */
  function renderLegend() {
    const count = (id) => [...state.repos.values()].filter((r) => (r.lines || []).includes(id)).length;
    $("#line-legend").innerHTML = state.lineList.map((l) => `<li data-line="${l.id}"><button type="button" class="ll" data-focus-line="${l.id}" aria-pressed="false" title="${esc(l.description || "")}"><span class="num" aria-hidden="true"></span>${esc(l.name)}<span class="ll-n">${count(l.id)}</span></button></li>`).join("") +
      `<li><svg width="28" height="6" aria-hidden="true"><path d="M2 3H26" stroke="var(--l-main)" stroke-width="3" stroke-dasharray="5 6" stroke-linecap="round"/></svg>도서·강의 (유료)</li>`;
    if (!$("#line-desc")) $("#line-legend").insertAdjacentHTML("afterend", `<p class="line-desc" id="line-desc" aria-live="polite"></p>`);
  }
  function focusLine(id) {
    const root = $("#metro"), on = id && state.focusLine !== id ? id : null;
    state.focusLine = on;
    root.classList.toggle("focusing", !!on);
    root.querySelectorAll(".track, .badge").forEach((el) => el.classList.toggle("faded", !!on && el.dataset.line !== on));
    root.querySelectorAll(".st").forEach((el) => el.classList.toggle("faded", !!on && !(el.dataset.lines || "").split(" ").includes(on)));
    document.querySelectorAll("[data-focus-line]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.focusLine === on)));
    document.querySelectorAll(".vline").forEach((v) => v.classList.toggle("faded", !!on && v.dataset.line !== on));
    const l = on && state.lines.get(on);
    $("#line-desc").innerHTML = l ? `<b>${esc(l.name)}</b>: ${esc(l.description || l.tagline || "")} <button type="button" class="link-btn" data-focus-line="${on}">전체 노선 보기</button>` : "";
    if (on) track("select_track", { track: on });
  }

  /* ---------- tabs ---------- */
  function selectTab(id) {
    document.querySelectorAll("#curriculum [role=tab][aria-controls]").forEach((x) => {
      const on = x.id === id;
      x.setAttribute("aria-selected", String(on));
      x.tabIndex = on ? 0 : -1;
      $("#" + x.getAttribute("aria-controls")).hidden = !on;
    });
    if (state.mapScroll) state.mapScroll();
    if (id === "tab-course") shelfSpy();
    paintNav();
  }
  function wireTabs() {
    const tabs = [...document.querySelectorAll("#curriculum [role=tab][aria-controls]")];
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => selectTab(t.id));
      t.addEventListener("keydown", (e) => {
        if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
        const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        n.focus(); selectTab(n.id);
      });
    });
  }

  function gotoLevel(levelId) {
    selectTab("tab-course");
    state.level = levelId;
    if (state.route !== "all") setRoute("all"); else renderShelf();
    $("#path").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  /* Jump to one card on the curriculum shelf and mark it briefly. */
  function gotoItem(id) {
    closeStation();
    selectTab("tab-course");
    if (state.route !== "all") setRoute("all");
    const r = state.repos.get(id);
    if (r && r.level && r.level !== state.level) { state.level = r.level; renderShelf(); }
    const el = $(`#shelf .ep[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    document.querySelectorAll("#shelf .ep.picked").forEach((x) => x.classList.remove("picked", "flash"));
    el.classList.add("picked");
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    /* start the highlight once the page has arrived, so it is seen */
    setTimeout(() => { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }, reduceMotion ? 0 : 550);
  }

  /* ---------- book and lecture (hero) ---------- */
  /* the book the team translated and the lecture built on it: one click to Hanbit */
  function renderPartner() {
    const items = (state.map.paid || []).filter((p) => p.cover);
    $("#partner-list").innerHTML = items.map((p) => {
      const out = (p.links || [])[0];
      const who = p.type === "도서" ? "인과추론팀 옮김" : `강사 ${p.credit || ""}`;
      return `<li class="pt-card">
        <a class="pt-main" href="${esc(out ? out.url : "#curriculum")}" target="_blank" rel="noopener" data-event="click_partner" data-event-params='${esc(JSON.stringify({ item: p.id, action: "out" }))}' aria-label="${esc(`${p.type} ${p.title}, 한빛미디어에서 보기`)}">
          <img class="pt-img ${p.type === "도서" ? "book" : "wide"}" src="${esc(p.cover)}" alt="" width="${p.type === "도서" ? 26 : 48}" height="34">
          <span class="pt-text"><b>${esc(p.shortTitle || p.title)}</b><span class="pt-lv"><span class="pt-type">${esc(p.type)}</span>${esc(who)}</span></span>
          <svg class="pt-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4h6v6M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <button type="button" class="pt-goto" data-goto="${esc(p.id)}">커리큘럼 ${esc(p.level)}</button>
      </li>`;
    }).join("");
  }


  /* ---------- featured sites (hero) ---------- */
  function renderFeatured() {
    $("#featured").innerHTML = (state.featured || []).map((f) => {
      const r = f.repo && state.repos.get(f.repo);
      const stars = r && r.stars >= 10 ? `<span class="st">${icons.star}${fmt(r.stars)}</span>` : "";
      return `<li><a href="${esc(f.url)}" target="_blank" rel="noopener" data-repo="${esc(f.repo || "")}"${r ? ` data-line="${primaryLine(r)}"` : ""}>
        <span class="tag">${esc(f.tag)}</span>
        <span class="tx"><span class="t">${esc(f.title)}</span>${f.desc ? `<span class="d">${esc(f.desc)}</span>` : ""}</span>
        ${stars}
        <svg class="out" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4h6v6M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a></li>`;
    }).join("");
  }

  /* ---------- events ---------- */
  /* academic events the team works on with 한국경영정보학회 */
  function renderStages() {
    const st = state.stages, box = $("#stage");
    if (!st || !box || !st.items.length) return;
    const evp = (x, placement) => esc(JSON.stringify({ conference: x.id, placement }));
    box.innerHTML = `<div class="stage-head"><p class="stage-k">With ${esc(st.host)}</p><h3 id="stage-title">학회와 함께 여는 무대</h3><p>${esc(st.note)}</p></div>
      <ol class="stage-list">${st.items.map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener" data-event="click_conference" data-event-params='${evp(x, "events")}'>
        <span class="sg-year">${x.year}</span><span class="sg-body"><b>${esc(x.name)}</b><span class="sg-en">${esc(x.en)}</span><span class="sg-about">${esc(x.about)}</span><span class="sg-when">${esc(x.when)} · ${esc(x.place)}</span></span><span class="sg-go">행사 사이트</span></a></li>`).join("")}</ol>`;
    const hl = $("#academy");
    if (hl) {
      const years = (re) => st.items.filter((x) => re.test(x.id)).map((x) => x.year).sort().join("·");
      hl.innerHTML = `<a href="#stage" data-event="click_conference" data-event-params='${esc(JSON.stringify({ conference: "all", placement: "banner" }))}'><b>With ${esc(st.host)}</b><span>비즈니스 실험 심포지엄 ${years(/^kbes/)} · 인과추론 여름 워크숍 ${years(/^kswci/)}</span></a>`;
    }
  }

  const daysTo = (iso) => Math.ceil((Date.parse(`${iso}T00:00:00+09:00`) - Date.now()) / DAY);
  function renderNextEvent() {
    const el = $("#next-event"), next = state.events.find((e) => e.upcoming && e.date);
    if (!el || !next) return;
    const d = daysTo(next.date);
    if (d < 0) return;
    el.hidden = false;
    el.innerHTML = `<span class="ne-k">다음 행사</span><span class="ne-d">${d === 0 ? "오늘" : `D-${d}`}</span><span class="ne-t"><b>${dot(next.date)} · ${esc(next.name)}</b><span>${next.link ? "참가 신청을 받고 있습니다" : "신청 링크는 곧 열립니다"} · 지난 ${state.events.filter((e) => !e.upcoming).length}회에 ${fmt(state.events.reduce((s, e) => s + (e.participants || 0), 0))}명이 함께했습니다</span></span><span class="ne-go" aria-hidden="true">›</span>`;
  }
  /* the next Data Forum gets the space; past ones are one line each */
  function renderEvents() {
    const list = [...state.events].sort((a, b) => b.order - a.order);
    const next = list.find((e) => e.upcoming), past = list.filter((e) => !e.upcoming);
    const when = (e) => (e.date ? dot(e.date) : `${e.year}년`);
    const total = past.reduce((s, e) => s + (e.participants || 0), 0);
    const maxP = Math.max(1, ...past.map((e) => e.participants || 0));
    const dd = next && next.date ? daysTo(next.date) : null;
    const nextHTML = next ? `<li class="event next">
        <span class="soon-tag">다음 행사${dd != null && dd >= 0 ? ` · ${dd === 0 ? "오늘" : `D-${dd}`}` : ""}</span>
        <span class="ord">${next.order}회</span>
        <h3>${next.link ? `<a href="${esc(next.link)}" target="_blank" rel="noopener">${esc(next.name)}</a>` : esc(next.name)}</h3>
        <span class="when">${when(next)}</span>
        <p class="ev-about">현업과 학계가 만나 인과추론과 실험, 데이터 의사결정을 이야기하는 자리입니다. 지난 ${past.length}회에 ${fmt(total)}명이 함께했습니다.</p>
        ${next.link ? `<a class="btn sm" href="${esc(next.link)}" target="_blank" rel="noopener">참가 신청하기</a>` : `<span class="ppl">신청 링크는 곧 열립니다.</span>`}
      </li>` : "";
    const pastHTML = past.map((e) => `<li class="event past">
        <span class="ord">${e.order}회</span>
        <span class="ev-name">${e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.name)}</a>` : esc(e.name)}<span class="when">${when(e)}</span></span>
        <span class="ev-n">${e.participants ? `<span class="ev-num"><b>${fmt(e.participants)}</b>명</span><i class="ev-bar" aria-hidden="true"><i style="width:${Math.round((e.participants / maxP) * 100)}%"></i></i>` : ""}</span>
      </li>`).join("");
    $("#event-list").innerHTML = nextHTML + (past.length ? `<li class="event-past"><p class="ev-sum">지난 Data Forum ${past.length}회 · 참가 ${fmt(total)}명</p><ol>${pastHTML}</ol></li>` : "");
  }


  /* ---------- metro map ---------- */
  function svg(tag, attrs = {}, parent) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (parent) parent.appendChild(el);
    return el;
  }

  function stationGroup(parent, id, r, cls) {
    const g = svg("g", { class: "st" + cls, "data-line": primaryLine(r), "data-lines": (r.lines || []).join(" "), "data-st": id, tabindex: 0, role: "button", "aria-label": `${r.title} 열기` }, parent);
    g.addEventListener("click", () => openStation(id, "map"));
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openStation(id, "map"); } });
    return g;
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
      svg("text", { x: z.x + 14, y: 38, class: "zone-l" }, g).textContent = z.level;
      svg("text", { x: z.x + 52, y: 36, class: "zone-n" }, g).textContent = lv.name;
      svg("text", { x: z.x + 14, y: 58, class: "zone-q" }, g).textContent = lv.question;
    });

    const tracks = svg("g", {}, root);
    m.lines.forEach((ln) => {
      const d = ln.points.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join(" ");
      svg("path", { d, class: "track", "data-line": ln.line, "data-track": ln.line }, tracks);
    });
    const ex = m.express;
    svg("path", { d: `M${ex.from[0]} ${ex.from[1]} L${ex.to[0]} ${ex.to[1]}`, class: "express" }, tracks);
    svg("text", { x: ex.from[0], y: ex.from[1] - 12, class: "express-l" }, tracks).textContent = ex.label;
    m.lines.forEach((ln) => {
      const g = svg("g", { class: "badge", "data-line": ln.line, "data-track": ln.line, "aria-hidden": "true" }, tracks);
      svg("circle", { cx: ln.badge[0], cy: ln.badge[1], r: 9 }, g);
    });

    const stations = svg("g", {}, root);
    (ex.stops || []).forEach((s) => {
      const r = state.repos.get(s.id);
      const g = stationGroup(stations, s.id, r, " paid");
      svg("rect", { x: s.x - 16, y: ex.from[1] - 16, width: 32, height: 32, class: "hit" }, g);
      svg("rect", { x: s.x - 8, y: ex.from[1] - 8, width: 16, height: 16, rx: 4, class: "sq" }, g);
      svg("text", { x: s.x, y: ex.from[1] - 16, class: "label", "text-anchor": "middle" }, g).textContent = r.mapLabel || r.title;
    });
    m.stations.forEach((s) => {
      const r = state.repos.get(s.id);
      if (!r) return;
      const g = stationGroup(stations, s.id, r, r.kind === "external" ? " ext" : "");
      if (s.y2) {
        svg("rect", { x: s.x - 22, y: s.y - 22, width: 44, height: s.y2 - s.y + 44, class: "hit" }, g);
        svg("rect", { x: s.x - 13, y: s.y - 13, width: 26, height: s.y2 - s.y + 26, rx: 13, class: "pill" }, g);
      } else {
        svg("circle", { cx: s.x, cy: s.y, r: 20, class: "hit" }, g);
        if (r.kind === "external") svg("circle", { cx: s.x, cy: s.y, r: 15, class: "halo" }, g);
        svg("circle", { cx: s.x, cy: s.y, r: r.kind === "external" ? 9.5 : 10, class: "ring" }, g);
      }
      if (state.ridden.has(s.id)) svg("circle", { cx: s.x, cy: s.y2 ? (s.y + s.y2) / 2 : s.y, r: 4.5, class: "done" }, g);
      const bottom = s.y2 || s.y;
      let lx = s.x, ly, anchor = "middle";
      if (s.label === "above") ly = s.y - (s.y2 ? 40 : 32);
      else if (s.label === "right") { lx = s.x + 20; ly = s.y + 5; anchor = "start"; }
      else ly = bottom + 34;
      svg("text", { x: lx, y: ly, class: "label", "text-anchor": anchor }, g).textContent = r.title;
      if (r.status === "running") {
        const tag = svg("g", { class: "tag" }, g);
        const tx = anchor === "start" ? lx + 34 : lx, ty = ly + 18;
        svg("rect", { x: tx - 30, y: ty - 9, width: 60, height: 18, rx: 9 }, tag);
        svg("text", { x: tx, y: ty + 0.5 }, tag).textContent = "진행 중";
      }
    });
    svg("g", { id: "route-marks" }, root);
    renderVLines();
    applyRouteMap();
  }

  /* ---------- articles ---------- */
  /* ---------- 연재: this week's post and the people who write ---------- */
  const postHref = (a) => a.url || `article.html#${a.slug}`;
  const postLink = (a, placement, inner, cls = "") => `<a${cls ? ` class="${cls}"` : ""} href="${esc(postHref(a))}"${a.url ? ' target="_blank" rel="noopener"' : ""} data-event="read_post" data-event-params='${esc(JSON.stringify({ post: a.slug, placement }))}' data-post>${inner}</a>`;
  function mondayKey(t) {
    const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  /* a post pinned to this week, else one published in the last week, else the next in turn */
  function weeklyPost(list) {
    const pinned = list.find((a) => a.weekOf === mondayKey(Date.now()));
    if (pinned) return pinned;
    const fresh = list.filter((a) => (ageDays(`${a.date}T00:00:00`) ?? 99) <= 7).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (fresh) return fresh;
    const ordered = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    return ordered[((weekIndex() % ordered.length) + ordered.length) % ordered.length];
  }
  function renderArticles() {
    const box = $("#post-box"), list = state.articles;
    if (!box || !list.length) return;
    const pick = weeklyPost(list);
    const series = list.filter((a) => a.series && a.series === pick.series).sort((a, b) => (a.episode || 0) - (b.episode || 0));
    const byAuthor = list.filter((a) => a.author === pick.author);
    const info = builderInfo(pick.author), person = (state.people || []).find((p) => p.name === pick.author);
    const tier = person ? tierOf(person) : null;
    const about = info.intro || (person ? `${tenure(person)}. 프로젝트 ${person.projects}개를 열고 러너 ${fmt(person.runners)}명과 함께했습니다.` : "인과추론팀과 함께 글을 씁니다.");
    /* the series is already listed in the writer card, so the list holds everything else */
    const shown = new Set(series.length > 1 ? series : [pick]);
    const others = list.filter((a) => !shown.has(a)).sort((a, b) => (a.date < b.date ? 1 : -1));
    box.innerHTML = `<div class="post-grid">
      <article class="post-feature">
        <p class="post-k"><b>이번 주 포스트</b><span>${pick.series ? `${esc(pick.series)}${pick.episode ? ` · ${pick.episode}편` : ""}` : ""}</span></p>
        <h3>${postLink(pick, "weekly", esc(pick.title))}</h3>
        <p class="post-sum">${esc(pick.summary)}</p>
        <p class="post-meta">${esc(pick.author)} · ${dot(pick.date)}</p>
        ${postLink(pick, "weekly", "글 읽기", "btn")}
      </article>
      <aside class="author-card" aria-label="${esc(`작가 ${pick.author}`)}">
        <p class="post-k"><b>작가</b><span>연재 ${byAuthor.length}편</span></p>
        <div class="au-head">${avatarHTML(pick.author, "lg")}<div><b class="au-name">${esc(pick.author)}</b>${tier ? `<span class="au-tier">${tierMedal(person, 18)}${esc(tier.name)}</span>` : ""}</div></div>
        <p class="au-about">${esc(about)}</p>
        ${series.length > 1 ? `<ol class="au-series">${series.map((a) => `<li${a === pick ? ' aria-current="true"' : ""}>${postLink(a, "series", `<span class="n">${a.episode || ""}편</span><span class="t">${esc(a.title)}</span>`)}</li>`).join("")}</ol>` : ""}
        <p class="au-links">${person ? `<button type="button" class="btn ghost sm" data-person="${esc(person.name)}">${esc(pick.author)}의 Builder 이력</button>` : ""}</p>
      </aside>
    </div>
    ${others.length ? `<ul class="post-list">${others.map((a) => `<li>${postLink(a, "list", `<span class="pl-t">${esc(a.title)}</span><span class="pl-m">${esc(a.author)}${a.series ? ` · ${esc(a.series)}` : ""} · ${dot(a.date)}</span>`)}</li>`).join("")}</ul>` : ""}
    <p class="post-cta"><b>연재를 써 보세요.</b> 글 한 편을 PR로 올리면 다음 주 포스트가 될 수 있습니다. <a href="https://github.com/${ORG}/CausalInferenceLab.github.io/blob/main/CONTRIBUTING.md#연재-쓰기" target="_blank" rel="noopener">쓰는 방법</a></p>`;
    wireAvatars(box);
  }


  /* ---------- today's question (one a day, streak kept in this browser) ---------- */
  const DAILY_KEY = "cil-hub-daily";
  const dayNum = (d = new Date()) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
  const loadDaily = () => { try { return JSON.parse(localStorage.getItem(DAILY_KEY) || "{}"); } catch (e) { return {}; } };
  const saveDaily = (d) => { try { localStorage.setItem(DAILY_KEY, JSON.stringify(d)); } catch (e) { /* storage unavailable */ } };
  const DAILY_LABEL = { cause: "그렇게 말할 수 있다", corr: "상관까지만 말할 수 있다" };
  function renderDaily() {
    const pool = (state.daily && state.daily.questions) || [];
    const box = $("#daily-card");
    if (!pool.length || !box) return;
    const today = dayNum(), q = pool.at(today % pool.length), rec = loadDaily();
    const ans = rec.answers && rec.answers[today];
    const now = new Date();
    rec.streak = int(rec.streak); rec.best = int(rec.best);
    const streak = rec.last === today || rec.last === today - 1 ? rec.streak : 0;
    const head = `<div class="daily-head"><h2 id="daily-title">오늘의 한 문제</h2><p class="daily-date">${now.getMonth() + 1}월 ${now.getDate()}일 · 매일 바뀝니다</p>
      <p class="daily-warm"><span>2분 몸풀기</span><a href="game.html">상관일까 인과일까 · 10문제</a><a href="lab.html">교란 실험실</a></p>
      ${streak ? `<p class="daily-streak"><b>${streak}일</b> 연속${rec.best > streak ? ` · 최고 ${rec.best}일` : ""}</p>` : ""}</div>`;
    if (!ans) {
      box.innerHTML = `${head}<div class="daily-body">
        <p class="daily-q">${esc(q.text)}</p>
        <p class="daily-claim"><span>이렇게 말해도 될까요?</span>“${esc(q.claim)}”</p>
        <div class="daily-opts"><button type="button" data-daily="cause">${DAILY_LABEL.cause}</button><button type="button" data-daily="corr">${DAILY_LABEL.corr}</button></div></div>`;
      return;
    }
    box.innerHTML = `${head}<div class="daily-body">
      <p class="daily-q">${esc(q.text)}</p>
      <p class="daily-claim"><span>이렇게 말해도 될까요?</span>“${esc(q.claim)}”</p>
      <p class="daily-verdict ${ans.correct ? "ok" : "no"}">${ans.correct ? "맞았습니다" : "아쉽습니다"}<span>내 답: ${DAILY_LABEL[ans.pick] || ""} · 정답: ${DAILY_LABEL[q.answer]}</span></p>
      <p class="daily-why">${esc(q.why)}</p>
      <p class="daily-more"><a href="${esc(q.chapter.url)}" target="_blank" rel="noopener" data-event="read_chapter" data-event-params='${esc(JSON.stringify({ source: "daily", chapter: q.chapter.url.split("/").pop().slice(0, 2) }))}'>${esc(q.chapter.title)} 읽기</a></p>
      <p class="daily-next">자정에 새 문제가 열립니다.</p></div>`;
  }
  function answerDaily(pick) {
    const pool = (state.daily && state.daily.questions) || [];
    const today = dayNum(), q = pool.at(today % pool.length), rec = loadDaily();
    rec.answers = rec.answers || {};
    if (rec.answers[today]) return;
    const correct = pick === q.answer;
    rec.answers[today] = { pick, correct };
    Object.keys(rec.answers).map(Number).filter((k) => k < today - 40).forEach((k) => delete rec.answers[k]);
    rec.streak = rec.last === today - 1 ? (rec.streak || 0) + 1 : 1;
    rec.best = Math.max(rec.best || 0, rec.streak);
    rec.last = today;
    saveDaily(rec);
    track("daily_answer", { q: q.id, correct, streak: rec.streak });
    renderDaily();
  }

  /* ---------- start-point quiz (three questions to one route) ---------- */
  const QUIZ = [
    { key: "experience", q: "인과추론은 어느 정도 해 보셨나요?", opts: [["new", "처음이에요"], ["some", "개념은 들어 봤어요"], ["used", "업무에 써 봤어요"]] },
    { key: "work", q: "지금 하는 일에 가장 가까운 것은?", opts: [["exp", "A/B 테스트와 실험"], ["mkt", "마케팅·정책 효과 분석"], ["ml", "ML과 모델링"], ["research", "연구·헬스케어"], ["tools", "데이터 도구·에이전트 개발"]] },
    { key: "want", q: "허브에서 가장 얻고 싶은 것은?", opts: [["concept", "개념을 제대로 이해하기"], ["apply", "바로 쓸 코드와 사례"], ["build", "직접 만들고 기여하기"]] }
  ];
  const quiz = { step: 0, a: {} };
  const WHY = { exp: "A/B 테스트와 실험", mkt: "마케팅·정책 효과 분석", ml: "ML과 모델링", research: "연구·헬스케어", tools: "데이터 도구·에이전트 개발" };
  function quizReason(a, id) {
    if (id === "build") return a.want === "build" ? "직접 만들고 기여하고 싶다고 하셔서 만드는 쪽 경로를 골랐습니다." : "데이터 도구를 만드신다고 하셔서 에이전트를 만드는 경로를 골랐습니다.";
    if (id === "start" && a.experience === "new") return "처음이라고 하셔서 영상과 웹북으로 기초를 다지는 경로를 골랐습니다.";
    return `${WHY[a.work] || "하시는 일"}을 고르셔서 이 경로를 추천합니다.`;
  }
  /* Where to start inside the route: skip the L0 primer if the basics are known,
     and jump to the first L2 item when someone has used it at work and wants code. */
  function quizBegin(a, stops) {
    if (a.experience === "new") return 0;
    if (a.experience === "used" && a.want === "apply") { const k = stops.findIndex((r) => r.level === "L2"); if (k > 0) return k; }
    return stops.length > 1 && stops[0].level === "L0" ? 1 : 0;
  }
  function quizRoute(a) {
    if (a.want === "build" || a.work === "tools") return "build";
    if (a.work === "research") return "research";
    if (a.work === "exp") return "experiment";
    if (a.work === "ml") return a.experience === "new" ? "start" : "ml";
    if (a.work === "mkt") return "marketing";
    return "start";
  }
  function showDialog() {
    const d = dialog();
    if (!d.open) { if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", ""); }
  }
  function openQuiz(retry) {
    quiz.step = 0; quiz.a = {};
    track("quiz_start", { retry: !!retry });
    renderQuiz(); showDialog();
    const first = $("#station-body .quiz-opts button"); if (first) first.focus();
  }
  function renderQuiz() {
    const shell = (inner) => `<div class="station-band" data-line="main"></div>
      <button type="button" class="station-close" aria-label="닫기" data-close>${icons.close}</button>
      <div class="station-content quiz" data-line="main">${inner}</div>`;
    if (quiz.step < QUIZ.length) {
      const item = QUIZ.at(quiz.step);
      $("#station-body").innerHTML = shell(`
        <p class="quiz-step"><span>${quiz.step + 1} / ${QUIZ.length}</span><span class="quiz-dots" aria-hidden="true">${QUIZ.map((_, i) => `<i class="${i <= quiz.step ? "on" : ""}"></i>`).join("")}</span></p>
        <h2 id="station-title">${esc(item.q)}</h2>
        <div class="quiz-opts" role="group" aria-label="${esc(item.q)}">${item.opts.map(([v, label]) => `<button type="button" data-quiz-pick="${v}" aria-pressed="${quiz.a[item.key] === v}">${esc(label)}</button>`).join("")}</div>
        ${quiz.step ? `<button type="button" class="quiz-back" data-quiz-back>이전 질문</button>` : `<p class="quiz-note">답은 이름 없이 통계로만 집계합니다.</p>`}`);
      $("#station-body .quiz-opts button").focus();
      return;
    }
    const id = quizRoute(quiz.a);
    const route = state.routes.find((r) => r.id === id);
    const stops = route.stops.map((x) => state.repos.get(x)).filter(Boolean);
    const begin = quizBegin(quiz.a, stops);
    $("#station-body").innerHTML = shell(`
      <p class="quiz-step"><span>추천 경로</span></p>
      <h2 id="station-title">${esc(route.label)}</h2>
      <p>${esc(quizReason(quiz.a, id))} ${esc(route.description)}</p>
      <ol class="quiz-stops">${stops.map((r, i) => `<li data-line="${primaryLine(r)}"${i < begin ? ' class="is-optional"' : ""}><span class="n">${pad2(i + 1)}</span><span><b>${esc(r.title)}</b><span>${esc(r.level || "")}${i === begin ? " · 여기서 시작" : i < begin ? " · 필요하면" : ""}</span></span></li>`).join("")}</ol>
      <div class="links"><button type="button" class="btn" data-quiz-go="${id}" data-quiz-begin="${begin}">이 순서로 보기</button><button type="button" class="btn ghost" data-quiz-restart>다시 답하기</button></div>`);
    $("#station-body [data-quiz-go]").focus();
  }
  function quizPick(v) {
    quiz.a[QUIZ.at(quiz.step).key] = v;
    quiz.step += 1;
    if (quiz.step === QUIZ.length) { track("quiz_complete", { route: quizRoute(quiz.a), ...quiz.a }); }
    renderQuiz();
  }
  function quizBack() { quiz.step = Math.max(0, quiz.step - 1); renderQuiz(); }
  function quizGo(id, begin) {
    closeStation();
    selectTab("tab-course");
    setRoute(id, "quiz");
    state.routeBegin = begin;
    const stops = [...document.querySelectorAll("#shelf .ep")];
    const el = stops.at(Math.min(begin, stops.length - 1));
    renderRouteNote();
    $("#route-note").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    if (el) {
      scrollShelfTo(el, false);
      el.classList.add("picked");
      setTimeout(() => { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }, reduceMotion ? 0 : 550);
    }
  }

  /* ---------- finish card (one level fully marked done) ---------- */
  const rideable = (r) => !r.kind || r.kind === "external";
  function levelDone(levelId) {
    const items = levelItems(levelId).filter(rideable);
    return items.length > 0 && items.every((r) => state.ridden.has(r.repo));
  }
  function drawCard(canvas, lv, items, name) {
    const W = 1200, H = 630, c = canvas.getContext("2d");
    canvas.width = W; canvas.height = H;
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#23276A"); g.addColorStop(0.5, "#333689"); g.addColorStop(1, "#6E68BC");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const glow = c.createRadialGradient(W * 0.86, H * 0.18, 0, W * 0.86, H * 0.18, 520);
    glow.addColorStop(0, "rgba(255,255,255,.18)"); glow.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = glow; c.fillRect(0, 0, W, H);
    const font = (w, px) => `${w} ${px}px "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
    c.fillStyle = "rgba(255,255,255,.82)"; c.font = font(600, 28);
    c.fillText("Causal Inference Hub · 가짜연구소 인과추론팀", 80, 110);
    c.fillStyle = "#fff"; c.font = font(800, 92);
    c.fillText(`${lv.id} 완주`, 80, 236);
    c.font = font(700, 44); c.fillText(lv.name, 80, 300);
    c.fillStyle = "rgba(255,255,255,.86)"; c.font = font(500, 30);
    c.fillText(items.length === 1 ? `“${lv.question}”에 답하는 자료를 마쳤습니다.` : `“${lv.question}”에 답하는 자료 ${items.length}개를 모두 마쳤습니다.`, 80, 362);
    c.font = font(500, 26); c.fillStyle = "rgba(255,255,255,.78)";
    items.slice(0, 3).forEach((r, i) => c.fillText(`· ${r.title}`, 80, 420 + i * 38));
    if (items.length > 3) c.fillText(`외 ${items.length - 3}개`, 80, 420 + 3 * 38);
    if (name) { c.fillStyle = "#fff"; c.font = font(700, 34); c.fillText(name, 80, H - 104); }
    c.fillStyle = "rgba(255,255,255,.7)"; c.font = font(500, 24);
    const d = new Date(), date = `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
    c.fillText(`${date} · causalinferencelab.github.io`, 80, H - 60);
    const mark = $(".banner-mark");
    if (mark && mark.complete && mark.naturalWidth) c.drawImage(mark, W - 300, 70, 210, 210);
  }
  function drawMedal(c, cx, cy, r, m, n) {
    const g = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, m.c[0]); g.addColorStop(1, m.c[1]);
    if (m.min) {
      const k = r / 26, top = cy - 56 * k, x = (v) => cx + (v - 32) * k, y = (v) => top + v * k;
      c.fillStyle = "#2A2E7A"; c.beginPath(); c.moveTo(x(15), y(0)); c.lineTo(x(30), y(0)); c.lineTo(x(38), y(32)); c.lineTo(x(23), y(32)); c.fill();
      c.fillStyle = "#A9A4F5"; c.beginPath(); c.moveTo(x(49), y(0)); c.lineTo(x(34), y(0)); c.lineTo(x(26), y(32)); c.lineTo(x(41), y(32)); c.fill();
    }
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = r * 0.06; c.beginPath(); c.arc(cx, cy, r * 0.79, 0, Math.PI * 2); c.stroke();
    c.fillStyle = "rgba(255,255,255,.28)"; c.beginPath(); c.ellipse(cx - r * 0.35, cy - r * 0.45, r * 0.35, r * 0.19, -0.5, 0, Math.PI * 2); c.fill();
    if (!m.min) return;
    c.fillStyle = m.ink; c.textAlign = "center";
    c.font = `800 ${Math.round(r * 0.72)}px "Pretendard Variable", Pretendard, sans-serif`; c.fillText(String(n), cx, cy + r * 0.2);
    c.font = `700 ${Math.round(r * 0.28)}px "Pretendard Variable", Pretendard, sans-serif`; c.fillText("기수", cx, cy + r * 0.6);
    c.textAlign = "left";
  }
  function drawMedalCard(canvas, p) {
    const W = 1200, H = 630, c = canvas.getContext("2d"), t = tierOf(p), sp = specialsOf(p), info = builderInfo(p.name);
    canvas.width = W; canvas.height = H;
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#1C1F57"); g.addColorStop(0.55, "#333689"); g.addColorStop(1, "#6E68BC");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const glow = c.createRadialGradient(930, 300, 0, 930, 300, 360);
    glow.addColorStop(0, "rgba(255,255,255,.22)"); glow.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = glow; c.fillRect(0, 0, W, H);
    const font = (w, px) => `${w} ${px}px "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
    c.fillStyle = "rgba(255,255,255,.82)"; c.font = font(600, 26); c.fillText("Causal Inference Hub Builder · 가짜연구소 인과추론팀", 80, 104);
    c.fillStyle = "#FFD54A"; c.font = font(800, 34); c.fillText(t.name, 80, 186);
    c.fillStyle = "#fff"; c.font = font(800, 96); c.fillText(p.name, 80, 292);
    c.fillStyle = "rgba(255,255,255,.88)"; c.font = font(600, 30);
    c.fillText(`${tenure(p)}`, 80, 352);
    c.fillText(`프로젝트 ${p.projects}개 · 함께한 러너 ${fmt(p.runners)}명`, 80, 398);
    sp.forEach((m, i) => {
      const x = 80 + i * 300, y = 470;
      drawMedal(c, x + 22, y, 22, m);
      c.fillStyle = m.ink; c.font = font(800, 15); c.textAlign = "center"; c.fillText(m.id === "mentor" ? "20+" : "↑", x + 22, y + 6); c.textAlign = "left";
      c.fillStyle = "#fff"; c.font = font(700, 24); c.fillText(m.name, x + 56, y + 9);
    });
    c.fillStyle = "rgba(255,255,255,.7)"; c.font = font(500, 22);
    c.fillText(`causalinferencelab.github.io/builders/${info.slug || ""}`, 80, H - 56);
    drawMedal(c, 930, 330, 150, t, p.cohorts.length);
  }
  async function openMedalCard(name) {
    const p = (state.people || []).find((x) => x.name === name);
    if (!p) return;
    const info = builderInfo(name);
    track("medal_card_open", { builder: info.slug || name, tier: tierOf(p).id });
    $("#station-body").innerHTML = `<div class="station-band" data-line="${p.line}"></div>
      <button type="button" class="station-close" aria-label="닫기" data-close>${icons.close}</button>
      <div class="station-content" data-line="${p.line}">
        <button type="button" class="back-person" data-back-person="${esc(p.name)}">‹ ${esc(p.name)} 이력으로</button>
        <h2 id="station-title">${esc(p.name)} · ${esc(tierOf(p).name)} 메달 카드</h2>
        <canvas class="card-canvas" width="1200" height="630" role="img" aria-label="${esc(`${p.name} ${tierOf(p).name} 메달 카드`)}"></canvas>
        <p class="card-note">링크드인이나 블로그, 발표 자료에 올려 보세요. Builder 페이지 링크를 함께 붙이면 이력이 바로 열립니다.</p>
        <div class="links"><button type="button" class="btn" data-card-save="medal:${esc(info.slug || "builder")}">${navigator.canShare ? "이미지 저장·공유" : "이미지 저장"}</button>${info.slug ? `<button type="button" class="btn ghost" data-copy="${esc(shareUrl(`/builders/${info.slug}.html`, "medal_card"))}" data-share="builder">Builder 페이지 링크 복사</button>` : ""}</div>
      </div>`;
    showDialog();
    try { if (document.fonts) await document.fonts.load('800 96px "Pretendard Variable"'); } catch (e) { /* draw with fallback fonts */ }
    drawMedalCard($("#station-body .card-canvas"), p);
  }
  async function openCard(levelId) {
    const lv = state.levels.find((l) => l.id === levelId);
    if (!lv || !levelDone(levelId)) return;
    const items = levelItems(levelId).filter(rideable);
    const next = state.levels[state.levels.indexOf(lv) + 1];
    track("finish_card_open", { level: levelId });
    $("#station-body").innerHTML = `<div class="station-band" data-line="main"></div>
      <button type="button" class="station-close" aria-label="닫기" data-close>${icons.close}</button>
      <div class="station-content" data-line="main">
        <h2 id="station-title">${lv.id} ${esc(lv.name)} 완주 카드</h2>
        <canvas class="card-canvas" width="1200" height="630" role="img" aria-label="${esc(`${lv.id} ${lv.name} 완주 카드`)}"></canvas>
        <label class="card-name">카드에 넣을 이름 (선택)<input type="text" maxlength="20" autocomplete="nickname" placeholder="예: 진수" data-card-name="${lv.id}"></label>
        <p class="card-note">이미지를 저장해 링크드인이나 블로그에 올려 보세요. 이름은 이 브라우저 밖으로 보내지 않고, 학습 진도는 이름 없이 방문 통계로만 집계합니다.</p>
        <div class="links"><button type="button" class="btn" data-card-save="${lv.id}">${navigator.canShare ? "이미지 저장·공유" : "이미지 저장"}</button><button type="button" class="btn ghost" data-copy="${esc(shareUrl("/", "finish_card"))}" data-share="finish_card">허브 링크 복사</button>${next ? `<button type="button" class="btn ghost" data-next-level="${next.id}">${next.id} 이어서 보기</button>` : ""}</div>
      </div>`;
    showDialog();
    try { if (document.fonts) await document.fonts.load('800 92px "Pretendard Variable"'); } catch (e) { /* draw with fallback fonts */ }
    const canvas = $("#station-body .card-canvas"), input = $("#station-body [data-card-name]");
    drawCard(canvas, lv, items, "");
    input.addEventListener("input", () => drawCard(canvas, lv, items, input.value.trim()));
  }
  function saveCard(levelId) {
    const canvas = $("#station-body .card-canvas");
    if (!canvas) return;
    const medal = levelId.startsWith("medal:"), content = medal ? "medal_card" : "finish_card";
    const name = medal ? `causal-inference-hub-builder-${levelId.slice(6)}.png` : `causal-inference-hub-${levelId}.png`;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = typeof File === "function" ? new File([blob], name, { type: "image/png" }) : null;
      /* phones: hand the image to the share sheet; elsewhere download it */
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: medal ? "Causal Inference Hub Builder 메달" : "Causal Inference Hub 완주 카드" }); track("share", { content, method: "share_sheet" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
      }
      const a = document.createElement("a");
      a.download = name; a.href = URL.createObjectURL(blob);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      track("share", { content, method: "download" });
    }, "image/png");
  }

  /* ---------- station dialog ---------- */
  const dialog = () => $("#station-dialog");

  /* Reading progress from the web book (same origin): finished chapters and the last one opened. */
  function webbookProgress() {
    try {
      const read = JSON.parse(localStorage.getItem("cil-book-read") || "{}");
      const last = JSON.parse(localStorage.getItem("cil-book-last") || "null");
      const done = read && typeof read === "object" ? Object.keys(read).length : 0;
      const ok = last && /^[A-Za-z0-9-]+$/.test(last.slug || "");
      const total = ok && Number(last.total) > 0 ? Number(last.total) : 30;
      return done || ok ? { done: Math.min(done, total), total, last: ok ? { slug: last.slug, label: String(last.label || "") } : null } : null;
    } catch (e) { return null; }
  }

  function openStation(id, source, silent) {
    const r = state.repos.get(id);
    if (!r) return;
    const book = r.repo === "Causal-Inference-with-Python" && r.site ? webbookProgress() : null;
    state.openRepo = r;
    if (!silent) { track("open_repo", { repo: r.repo, level: r.level || "", source: source || "hub" }); if (source !== "deeplink") stamp("first_open"); }
    if (!silent && r.kind !== "paid") {
      state.recent = [{ id, t: Date.now() }, ...state.recent.filter((x) => x.id !== id)].slice(0, 6);
      saveRecent(); renderWeek();
    }
    const line = primaryLine(r);
    const lv = state.levels.find((l) => l.id === r.level);
    const lineTags = (r.lines || []).map((lid) => { const l = state.lines.get(lid); return `<span class="tag-line" data-line="${lid}"><span class="num" aria-hidden="true"></span>${esc(l.name)}</span>`; }).join("");
    const extraTag = r.kind === "paid" ? `<span class="status active">유료</span>` : statusLabel[r.status] ? `<span class="status ${r.status}">${statusLabel[r.status]}</span>` : "";
    const builders = (r.builders || []).map(nameLink).join(", ");
    const rows = [
      lv ? `<dt>단계</dt><dd>${lv.id} ${esc(lv.name)}: ${esc(lv.question)}</dd>` : "",
      r.kind === "paid" && r.type ? `<dt>형태</dt><dd>${esc(r.type)} · ${esc(r.meta || "")} · 한빛미디어</dd>` : "",
      r.kind === "paid" && r.credit ? `<dt>${r.type === "강의" ? "강사" : "만든 사람"}</dt><dd>${esc(r.credit)}</dd>` : "",
      builders ? `<dt>Builder</dt><dd>${builders}</dd>` : "",
      r.cohorts && r.cohorts.length ? `<dt>기수</dt><dd>${r.cohorts.join("·")}기</dd>` : "",
      statusText[r.status] ? `<dt>상태</dt><dd title="${esc(statusText[r.status].split(": ")[1] || "")}">${esc(statusText[r.status].split(": ")[0])}</dd>` : "",
      book ? `<dt>내 진도</dt><dd>${book.total}편 중 ${book.done}편 읽음</dd>` : "",
      r.kind ? "" : `<dt>스타</dt><dd>${fmt(r.stars || 0)}</dd>`,
      r.pushed ? `<dt>마지막 커밋</dt><dd>${dot(r.pushed.slice(0, 10))}</dd>` : ""
    ].join("");
    const links = r.kind
      ? r.links.map((l, i) => `<a class="btn${i ? " ghost" : ""}" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")
      : book && book.last
        ? `<a class="btn" href="${esc(r.site.replace(/\/?$/, "/") + book.last.slug + ".html")}">이어 읽기${book.last.label ? ` · ${esc(book.last.label)}` : ""}</a><a class="btn ghost" href="${esc(repoUrl(r))}" target="_blank" rel="noopener">GitHub에서 보기</a>`
      : r.site && r.siteLabel
        ? `<a class="btn" href="${esc(r.site)}" target="_blank" rel="noopener">${esc(r.siteLabel)}</a><a class="btn ghost" href="${esc(repoUrl(r))}" target="_blank" rel="noopener">GitHub에서 보기</a>`
        : `<a class="btn" href="${esc(repoUrl(r))}" target="_blank" rel="noopener">GitHub에서 보기</a>${r.site ? `<a class="btn ghost" href="${esc(r.site)}" target="_blank" rel="noopener">사이트 열기</a>` : ""}`;
    const adjacent = r.kind === "paid" ? "" : (r.lines || []).map((lid) => {
      const ids = state.order.get(lid) || [];
      const i = ids.indexOf(r.repo);
      if (i < 0) return "";
      const prev = ids[i - 1] && state.repos.get(ids[i - 1]);
      const next = ids[i + 1] && state.repos.get(ids[i + 1]);
      const l = state.lines.get(lid);
      return `<div class="adjacent" data-line="${lid}">${prev ? `<button type="button" data-open="${esc(prev.repo)}">${esc(l.name)} 트랙 이전<b>${esc(prev.title)}</b></button>` : `<span></span>`}${next ? `<button type="button" class="next" data-open="${esc(next.repo)}">${esc(l.name)} 트랙 다음<b>${esc(next.title)}</b></button>` : `<span></span>`}</div>`;
    }).join("");
    const canRide = !r.kind || r.kind === "external";
    const ridden = state.ridden.has(r.repo);
    $("#station-body").innerHTML = `
      <div class="station-band" data-line="${line}"></div>
      <button type="button" class="station-close" aria-label="닫기" data-close>${icons.close}</button>
      <div class="station-content" data-line="${line}">
        ${state.backTo ? `<button type="button" class="back-person" data-back-person="${esc(state.backTo)}">‹ ${esc(state.backTo)} 이력으로</button>` : ""}
        <div class="tags">${lineTags}${extraTag}</div>
        ${r.cover ? `<img class="station-art ${r.type === "도서" ? "book" : "wide"}" src="${esc(r.cover)}" alt="">` : ""}
        <h2 id="station-title">${esc(r.title)}</h2>
        ${r.kind ? "" : `<span class="repo">${ORG}/${esc(r.repo)}</span>`}
        <p>${esc(r.summary)}</p>
        ${rows ? `<dl>${rows}</dl>` : ""}
        <div class="links">${links}${r.kind === "paid" ? `<button type="button" class="btn ghost" data-goto="${esc(r.repo)}">커리큘럼에서 위치 보기</button>` : ""}</div>
        ${adjacent}
        ${canRide ? `<button type="button" class="ride" aria-pressed="${ridden}" data-ride="${esc(r.repo)}">${ridden ? "학습 완료" : "학습 완료로 표시"}</button>` : ""}
        ${ridden && lv && levelDone(lv.id) ? `<div class="done-banner"><span><b>${lv.id} ${esc(lv.name)}</b> 자료를 모두 마쳤습니다.</span><button type="button" class="btn sm" data-card="${lv.id}">완주 카드 만들기</button></div>` : ""}
      </div>`;
    const d = dialog();
    if (!d.open) { if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", ""); }
    $("#station-body .station-close").focus();
  }

  /* tell people the map continues to the right when it is wider than the screen */
  function watchMapScroll() {
    const box = $("#map-scroll"), hint = $("#map-hint");
    if (!box) return;
    const update = () => {
      const more = box.scrollWidth - box.clientWidth > 4;
      hint.hidden = !more;
      box.classList.toggle("more", more && box.scrollLeft + box.clientWidth < box.scrollWidth - 4);
    };
    box.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    state.mapScroll = update;
    update();
  }
  function closeStation() { const d = dialog(); if (d.open) d.close(); }

  /* Deep links: #station=<repo> opens that entry, so other team sites (the web book, for one) can link straight to it. */
  const stationFromHash = () => {
    const m = location.hash.match(/^#station=(.+)$/);
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return null; }
  };
  function openFromHash() {
    const id = stationFromHash();
    if (!id || !state.repos.has(id)) return;
    const r = state.repos.get(id);
    const lv = r.level && r.kind !== "paid" ? r.level : null;
    $("#curriculum").scrollIntoView({ behavior: "auto" });
    openStation(id, "deeplink");
    if (lv) dialog().addEventListener("close", () => gotoItem(id), { once: true });
  }

  function toggleRide(id) {
    if (state.ridden.has(id)) state.ridden.delete(id); else state.ridden.add(id);
    const rr = state.repos.get(id);
    track("mark_done", { repo: id, level: (rr && rr.level) || "", done: state.ridden.has(id) });
    saveRidden();
    renderMap(); renderShelf(true); renderWeek();
    openStation(id, "dialog", true);
  }

  const sourceOf = (el) => (el.closest("#shelf") ? "shelf" : el.closest(".continue") ? "continue" : el.closest(".spot") ? "spotlight" : el.closest(".fresh") ? "fresh" : el.closest("#vlines") ? "map_list" : el.closest(".p-timeline, .p-repos") ? "builder_dialog" : el.closest("#station-body") ? "dialog" : el.closest("#roster, #top3") ? "contrib" : "hub");
  const joinTarget = (href) => (/discord/.test(href) ? "discord" : /Project-template/.test(href) ? "template" : /is%3Aissue|is:issue/.test(href) ? "issue" : /pseudo-lab\.com/.test(href) ? "runner" : "other");

  function wire() {
    document.addEventListener("click", (e) => {
      const fa = e.target.closest("#featured a");
      if (fa) track("click_featured", { repo: fa.dataset.repo || "" });
      const out = e.target.closest(".pt-out");
      if (out) track("click_partner", { item: out.closest(".pt-card").querySelector("[data-goto]").dataset.goto, action: "out" });
      const ja = e.target.closest("#join a, .footer-links a[href*='discord']");
      if (ja) track("click_join", { target: joinTarget(ja.getAttribute("href") || ""), source: ja.closest("#join") ? "join_section" : "footer" });
      const sa = e.target.closest("#station-body .links a");
      if (sa && state.openRepo) track("click_outbound", { repo: state.openRepo.repo, kind: state.openRepo.kind === "paid" ? "paid" : /github\.com/.test(sa.href) ? "github" : "site" });
      const dpick = e.target.closest("[data-daily]");
      if (dpick) { answerDaily(dpick.dataset.daily); return; }
      if (e.target.closest("[data-quiz-open]")) { openQuiz(); return; }
      const pick = e.target.closest("[data-quiz-pick]");
      if (pick) { quizPick(pick.dataset.quizPick); return; }
      if (e.target.closest("[data-quiz-back]")) { quizBack(); return; }
      if (e.target.closest("[data-quiz-restart]")) { openQuiz(true); return; }
      const qgo = e.target.closest("[data-quiz-go]");
      if (qgo) { quizGo(qgo.dataset.quizGo, Number(qgo.dataset.quizBegin) || 0); return; }
      const card = e.target.closest("[data-card]");
      if (card) { openCard(card.dataset.card); return; }
      const nl = e.target.closest("[data-next-level]");
      if (nl) { closeStation(); gotoLevel(nl.dataset.nextLevel); return; }
      const ext = e.target.closest("a[data-post][target=_blank]");
      if (ext) stamp("post");
      const fl = e.target.closest("[data-focus-line]");
      if (fl) { focusLine(fl.dataset.focusLine); return; }
      const tg = e.target.closest("[data-tab-go]");
      if (tg) { selectTab(tg.dataset.tabGo); $("#tab-map").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); track("open_map", { source: "tab_note" }); return; }
      const stepBtn = e.target.closest("[data-step]");
      if (stepBtn) {
        state.level = stepBtn.dataset.step;
        track("select_level", { level: state.level, source: stepBtn.classList.contains("lv-next") ? "next" : "path" });
        if (state.route !== "all") setRoute("all"); else renderShelf();
        if (stepBtn.classList.contains("lv-next") || $("#shelf").getBoundingClientRect().top > innerHeight * 0.7) $("#path").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        return;
      }
      const mc = e.target.closest("[data-medal-card]");
      if (mc) { openMedalCard(mc.dataset.medalCard); return; }
      const dl = e.target.closest("[data-card-save]");
      if (dl) { saveCard(dl.dataset.cardSave); return; }
      const ride = e.target.closest("[data-ride]");
      if (ride) { toggleRide(ride.dataset.ride); return; }
      if (e.target.closest("[data-close]")) { closeStation(); return; }
      const person = e.target.closest("[data-person]");
      if (person) { openPerson(person.dataset.person, person.closest("#top3") ? "top3" : person.closest("#people-rail") ? "rail" : person.closest("#roster") ? "roster" : "hub"); return; }
      const go = e.target.closest("[data-goto]");
      if (go) { if (go.closest("#partner-list")) track("click_partner", { item: go.dataset.goto, action: "goto" }); gotoItem(go.dataset.goto); return; }
      const lv = e.target.closest("[data-level]:not(.ep):not(.chap)");
      if (lv && lv.tagName === "BUTTON") { gotoLevel(lv.dataset.level); return; }
      const ch = e.target.closest("[data-chapter]");
      if (ch) { scrollShelfTo($(`#shelf [data-chap="${CSS.escape(ch.dataset.chapter)}"]`)); return; }
      const open = e.target.closest("[data-open]");
      if (open) { e.preventDefault(); state.backTo = open.dataset.fromPerson || (open.closest(".p-repos") ? (state.lastPerson || null) : null); openStation(open.dataset.open, sourceOf(open)); }
      const back = e.target.closest("[data-back-person]");
      if (back) { openPerson(back.dataset.backPerson, "back"); return; }
    });
    dialog().addEventListener("click", (e) => { if (e.target === dialog()) closeStation(); });
    dialog().addEventListener("close", () => {
      state.backTo = null;
      if (stationFromHash()) history.replaceState(null, "", location.pathname + location.search);
    });
    window.addEventListener("hashchange", openFromHash);
    let t;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        shelfSpy();
        document.querySelectorAll("#growth .tile").forEach((el, i) => { if (growthTiles[i] && growthTiles[i].series.length > 1) drawSpark(el, growthTiles[i]); });
      }, 120);
    });
  }

  /* Highlight the nav item for the section in view. */
  let navCur = null;
  function paintNav() {
    document.querySelectorAll(".site-nav a[href^='#']").forEach((a) => {
      const href = a.getAttribute("href");
      const on = href === "#" + navCur;
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
  }
  function navSpy() {
    if (!("IntersectionObserver" in window)) return;
    const ids = ["curriculum", "contrib", "events", "reading", "join"];
    const seen = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => seen.set(e.target.id, e.isIntersecting));
      navCur = ids.find((id) => seen.get(id)) || null;
      paintNav();
    }, { rootMargin: "-45% 0px -50% 0px" });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  function fail(err) {
    console.error(err);
    $("#curriculum .wrap").insertAdjacentHTML("afterbegin", `<p class="notice">데이터를 불러오지 못했습니다. 로컬에서 볼 때는 <code>python3 -m http.server</code>로 띄운 뒤 접속해 주세요.</p>`);
  }

  async function init() {
    loadRidden(); loadRecent();
    wire();
    try { await load(); } catch (err) { fail(err); return; }
    renderGrowth(); renderLadder();
    renderContrib();
    renderRouteChips(); renderShelf(); renderWeek();
    let spyQueued = false;
    window.addEventListener("scroll", () => { if (spyQueued) return; spyQueued = true; requestAnimationFrame(() => { spyQueued = false; shelfSpy(); }); }, { passive: true });
    const header = $(".site-header");
    const setHeader = () => { if (header) document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`); };
    setHeader(); window.addEventListener("resize", setHeader);
    renderLegend(); renderMap(); wireTabs();
    renderFeatured(); renderPartner(); renderEvents(); renderNextEvent(); renderStages(); renderArticles(); renderDaily(); watchMapScroll();
    /* sections fill in after the data loads, so jump again once they have their height */
    if (/^#(contrib|events|reading|join)$/.test(location.hash)) requestAnimationFrame(() => { const el = $(location.hash); if (el) el.scrollIntoView(); });
    openFromHash();
    if (location.hash === "#start" || new URLSearchParams(location.search).has("quiz")) openQuiz();
    navSpy();
    refreshStars();
  }

  init();
})();
