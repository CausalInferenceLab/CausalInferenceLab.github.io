(() => {
  "use strict";

  const ORG = "CausalInferenceLab";
  const RIDE_KEY = "cil-hub-ridden";
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
  const dot = (d) => d.replace(/-/g, ".");

  const state = {
    repos: new Map(), lines: new Map(), lineList: [], levels: [], map: null, routes: [],
    projects: [], events: [], articles: [], builders: [], growth: null, stats: null,
    ridden: new Set(), order: new Map(), route: "start", filter: "all", showAll: false
  };

  function loadRidden() { try { state.ridden = new Set(JSON.parse(localStorage.getItem(RIDE_KEY) || "[]")); } catch (e) { state.ridden = new Set(); } }
  function saveRidden() { try { localStorage.setItem(RIDE_KEY, JSON.stringify([...state.ridden])); } catch (e) { /* storage unavailable */ } }

  async function getJSON(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(path + " " + res.status);
    return res.json();
  }

  /* ---------- data ---------- */
  async function load() {
    const names = ["repos", "lines", "levels", "map", "routes", "projects", "events", "articles", "builders", "growth", "stats"];
    const data = await Promise.all(names.map((n) => getJSON(`data/${n}.json`)));
    const d = Object.fromEntries(names.map((n, i) => [n, data[i]]));
    d.repos.forEach((r) => {
      const live = d.stats.repos && d.stats.repos[r.repo];
      if (live) { r.stars = live.stars; r.pushed = live.pushed; }
      state.repos.set(r.repo, r);
    });
    state.repos.set(d.map.external.id, { repo: d.map.external.id, kind: "external", status: "external", builders: [], cohorts: [], ...d.map.external });
    (d.map.paid || []).forEach((p) => state.repos.set(p.id, { repo: p.id, kind: "paid", status: "paid", builders: [], cohorts: [], ...p }));
    state.lineList = d.lines;
    d.lines.forEach((l) => state.lines.set(l.id, l));
    Object.assign(state, { levels: d.levels, map: d.map, routes: d.routes, projects: d.projects, events: d.events, articles: d.articles, builders: d.builders, growth: d.growth, stats: d.stats });

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
      renderGrowth(false); renderRepos();
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
    const img = b.github ? `<img src="https://github.com/${esc(b.github)}.png?size=128" alt="" loading="lazy" data-fallback="${initial}">` : initial;
    return `<span class="avatar${size ? " " + size : ""}" aria-hidden="true">${img}</span>`;
  }
  function wireAvatars(root) {
    root.querySelectorAll("img[data-fallback]").forEach((img) => img.addEventListener("error", () => { img.parentElement.textContent = img.dataset.fallback; }, { once: true }));
  }
  function nameLink(name) {
    const b = builderInfo(name);
    return b.linkedin ? `<a href="${esc(b.linkedin)}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name);
  }

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
      { key: "stars", label: "GitHub 스타", unit: "", value: totalStars(), series: stars, delta: "", empty: "월별 추이는 매주 자동으로 쌓입니다.", tip: (p) => `${p.x} ${fmt(p.y)}` },
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
    const w = Math.max(120, box.clientWidth), h = 64;
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
  function renderGrowth(animate = true) {
    growthTiles = growthSeries();
    const box = $("#growth");
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
    box.querySelectorAll(".tile").forEach((el, i) => {
      const t = growthTiles[i];
      if (t.series.length > 1) drawSpark(el, t);
      if (animate) { const v = el.querySelector(".tile-value"); countUp(v, t.value, t.unit); }
    });
    const builders = new Set(state.projects.map((p) => p.builder).filter(Boolean)).size;
    const repos = [...state.repos.values()].filter((r) => !r.kind && r.status !== "depot").length;
    const contributors = state.stats.totals && state.stats.totals.contributors;
    $("#growth-note").textContent = `Builder ${builders}명, 기수 ${new Set(state.projects.map((p) => p.cohort)).size}개, 레포 ${repos}개${contributors ? `, GitHub 기여자 ${fmt(contributors)}명` : ""}. 러너는 같은 사람을 한 번만 셉니다.`;
  }

  /* ---------- now + current cohort ---------- */
  function cohortItems(cohort) {
    const items = state.projects.filter((p) => p.cohort === cohort).map((p) => {
      const r = p.repo && state.repos.get(p.repo);
      return { title: r ? r.title : p.name, name: p.name, builder: p.builder, runners: p.runners, repo: r ? r.repo : null, link: p.link, summary: r ? r.summary : "", line: primaryLine(r) };
    });
    return items;
  }

  function projectCard(it, live) {
    const title = it.repo ? `<button type="button" data-open="${esc(it.repo)}">${esc(it.title)}</button>` : it.link ? `<a href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.title)}</a>` : esc(it.title);
    const person = it.builder ? `<div class="person" data-line="${it.line}">${avatarHTML(it.builder)}<div><div class="nm">${nameLink(it.builder)}</div><div class="rl">Builder</div></div></div>` : `<div class="person"><div class="rl">Builder 정보는 곧 추가됩니다</div></div>`;
    const count = it.runners ? `<span class="count">러너 <b>${it.runners}</b>명</span>` : "";
    const sub = it.title !== it.name ? `<span>${esc(it.name)}</span>` : "";
    return `<li class="proj${live ? " live" : ""}" data-line="${it.line}">
      <div class="proj-top">${live ? `<span class="live-tag">진행 중</span>` : ""}${sub}</div>
      <h3>${title}</h3>
      ${it.summary ? `<p class="sum">${esc(it.summary)}</p>` : ""}
      <div class="proj-foot">${person}${count}</div>
    </li>`;
  }

  function renderCohort() {
    const cur = currentCohort();
    const curProjects = state.projects.filter((p) => p.cohort === cur);
    const term = curProjects[0] ? curProjects[0].term : "";
    const items = cohortItems(cur);
    [...state.repos.values()].filter((r) => r.status === "running" && !items.some((i) => i.repo === r.repo)).forEach((r) => {
      items.push({ title: r.title, name: r.title, builder: r.builders[0], runners: null, repo: r.repo, summary: r.summary, line: primaryLine(r) });
    });
    const prev = cohortItems(cur - 1);
    $("#cohort-title").textContent = `이번 기수: ${cur}기`;
    $("#cohort-sub").textContent = `${term}에 진행 중인 프로젝트와, 직전 기수가 마친 프로젝트입니다.`;
    $("#cohort-body").innerHTML = `<ul class="proj-grid">${items.map((i) => projectCard(i, true)).join("")}</ul>` +
      (prev.length ? `<h3 class="sub-head">${cur - 1}기에 마친 프로젝트</h3><ul class="proj-grid">${prev.map((i) => projectCard(i, false)).join("")}</ul>` : "");
    wireAvatars($("#cohort-body"));

    const next = state.events.find((e) => e.upcoming);
    $("#now").innerHTML = `<li><a href="#cohort"><span class="dot" aria-hidden="true"></span>${cur}기 진행 중: 프로젝트 ${items.length}개</a></li>` +
      (next ? `<li><a href="#events"><span class="soon" aria-hidden="true"></span>${Number(next.date.slice(5, 7))}월 ${Number(next.date.slice(8))}일 5th Data Forum</a></li>` : "");
  }

  /* ---------- builders ---------- */
  function renderBuilders() {
    const people = new Map();
    const add = (name, item) => {
      if (!name) return;
      if (!people.has(name)) people.set(name, { name, items: [] });
      people.get(name).items.push(item);
    };
    state.projects.forEach((p) => add(p.builder, { cohort: p.cohort, name: p.name, runners: p.runners || 0, repo: p.repo && state.repos.has(p.repo) ? p.repo : null, link: p.link }));
    state.repos.forEach((r) => (r.builders || []).forEach((b) => {
      const p = people.get(b);
      if (!p || !p.items.some((it) => it.repo === r.repo)) add(b, { cohort: null, name: r.title, runners: 0, repo: r.repo });
    }));
    const list = [...people.values()].map((p) => {
      p.items.sort((a, b) => (b.cohort ?? 99) - (a.cohort ?? 99));
      const cs = p.items.map((i) => i.cohort).filter((c) => c != null);
      p.first = cs.length ? Math.min(...cs) : 99;
      p.runners = p.items.reduce((s, i) => s + i.runners, 0);
      const withRepo = p.items.find((i) => i.repo);
      p.line = withRepo ? primaryLine(state.repos.get(withRepo.repo)) : "main";
      return p;
    }).sort((a, b) => a.first - b.first || b.items.length - a.items.length || a.name.localeCompare(b.name, "ko"));

    $("#builder-list").innerHTML = list.map((p) => {
      const info = builderInfo(p.name);
      return `<li class="builder" data-line="${p.line}">
        <div class="builder-top">${avatarHTML(p.name, "lg")}
          <div><h3>${nameLink(p.name)}</h3><span class="since">${p.first < 99 ? p.first + "기부터 Builder" : "Builder"}</span></div>
        </div>
        ${info.intro ? `<p class="intro">${esc(info.intro)}</p>` : ""}
        <dl class="builder-stats">
          <div><dt>프로젝트</dt><dd>${p.items.length}</dd></div>
          <div><dt>함께한 러너</dt><dd>${fmt(p.runners)}</dd></div>
          <div><dt>첫 기수</dt><dd>${p.first < 99 ? p.first + "기" : "-"}</dd></div>
        </dl>
        <ul>${p.items.map((it, k) => `<li${k >= 4 ? " class=\"extra\" hidden" : ""}><span class="co">${it.cohort ? it.cohort + "기" : "현재"}</span><span>${
          it.repo ? `<button type="button" class="linkish" data-open="${esc(it.repo)}">${esc(it.name)}</button>`
          : it.link ? `<a href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.name)}</a>` : esc(it.name)}</span></li>`).join("")}</ul>
        ${p.items.length > 4 ? `<button type="button" class="linkish more" data-expand aria-expanded="false">프로젝트 ${p.items.length - 4}개 더 보기</button>` : ""}
      </li>`;
    }).join("");
    wireAvatars($("#builder-list"));
  }

  /* ---------- seasons ---------- */
  function renderSeasons() {
    const by = new Map();
    state.projects.forEach((p) => {
      if (!by.has(p.cohort)) by.set(p.cohort, { cohort: p.cohort, term: p.term, items: [], runners: 0 });
      const s = by.get(p.cohort);
      s.items.push(p); s.runners += p.runners || 0;
    });
    const seasons = [...by.values()].sort((a, b) => a.cohort - b.cohort);
    const max = Math.max(...seasons.map((s) => s.runners)) || 1;
    const latest = currentCohort();
    const rail = $("#season-rail");
    rail.innerHTML = seasons.map((s) => {
      const pct = Math.round((s.runners / max) * 100);
      const items = s.items.map((p) => {
        const name = p.repo && state.repos.has(p.repo) ? `<button type="button" class="linkish" data-open="${esc(p.repo)}">${esc(p.name)}</button>`
          : p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name);
        const meta = [p.builder ? `Builder ${p.builder}` : "", p.runners ? `러너 ${p.runners}명` : ""].filter(Boolean).join(", ");
        return `<li class="ep"><div class="n">${name}</div>${meta ? `<div class="m">${esc(meta)}</div>` : ""}</li>`;
      }).join("");
      const runnersText = s.runners ? `러너 <b>${s.runners}</b>명` : "러너 집계 중";
      return `<div class="season${s.cohort === latest ? " current" : ""}">
        <div class="season-bar"><i style="height:${Math.max(4, pct)}%; --w:${Math.max(4, pct)}%" aria-hidden="true"></i><span>${runnersText}<br>프로젝트 ${s.items.length}개</span></div>
        <div class="season-head"><b>${s.cohort}기</b><span>${esc(s.term)}${s.cohort === latest ? ", 진행 중" : ""}</span></div>
        <ul>${items}</ul></div>`;
    }).join("");
    rail.addEventListener("scroll", railEdges, { passive: true });
    requestAnimationFrame(() => { fitRail(); rail.scrollLeft = rail.scrollWidth; railEdges(); });
  }

  /* Size season columns so a whole number fits the rail: no half-cut column at the edge. */
  function fitRail() {
    const rail = $("#season-rail");
    if (getComputedStyle(rail).gridAutoFlow.indexOf("column") < 0) { rail.style.gridAutoColumns = ""; return; }
    const cols = Math.max(1, Math.floor(rail.clientWidth / 236));
    rail.style.gridAutoColumns = `${rail.clientWidth / cols}px`;
  }
  function railEdges() {
    const rail = $("#season-rail");
    const [prev, next] = document.querySelectorAll("[data-rail]");
    prev.disabled = rail.scrollLeft <= 4;
    next.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4;
  }

  /* ---------- events ---------- */
  function renderEvents() {
    const list = [...state.events].sort((a, b) => a.order - b.order);
    const max = Math.max(...list.map((e) => e.participants || 0)) || 1;
    $("#event-list").innerHTML = list.map((e) => {
      const when = e.date ? dot(e.date) : `${e.year}년`;
      const title = e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.name)}</a>` : esc(e.name);
      return `<li class="event${e.upcoming ? " upcoming" : ""}">
        <span class="ord">${e.order}회</span>
        ${e.upcoming ? `<span class="soon-tag">예정</span>` : ""}
        <h3>${title}</h3>
        <span class="when">${when}</span>
        ${e.participants ? `<div class="ppl"><b>${fmt(e.participants)}</b>명 참가<div class="bar" aria-hidden="true"><i style="width:${Math.round((e.participants / max) * 100)}%"></i></div></div>` : `<div class="ppl">참가 신청을 받고 있습니다.</div>`}
      </li>`;
    }).join("");
  }

  /* ---------- metro map ---------- */
  function svg(tag, attrs = {}, parent) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (parent) parent.appendChild(el);
    return el;
  }

  function stationGroup(parent, id, r, cls) {
    const g = svg("g", { class: "st" + cls, "data-line": primaryLine(r), "data-st": id, tabindex: 0, role: "button", "aria-label": `${r.title} 열기` }, parent);
    g.addEventListener("click", () => openStation(id));
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openStation(id); } });
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
    applyRoute();
  }

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

  function renderLegend() {
    $("#line-legend").innerHTML = state.lineList.map((l) => `<li data-line="${l.id}"><span class="num" aria-hidden="true"></span>${esc(l.name)}</li>`).join("") +
      `<li><svg width="28" height="6" aria-hidden="true"><path d="M2 3H26" stroke="var(--l-main)" stroke-width="3" stroke-dasharray="5 6" stroke-linecap="round"/></svg>책·강의 (유료)</li>`;
  }

  /* ---------- route planner ---------- */
  function renderRouteChips() {
    const box = $("#route-chips");
    const all = [...state.routes, { id: "all", label: "전체 보기" }];
    box.innerHTML = all.map((r) => `<button type="button" class="chip" role="radio" data-route="${r.id}" aria-checked="${r.id === state.route}">${esc(r.label)}</button>`).join("");
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-route]");
      if (!b) return;
      state.route = b.dataset.route;
      box.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", String(c === b)));
      applyRoute();
    });
  }

  function commonLine(a, b) {
    const la = state.repos.get(a).lines || [], lb = state.repos.get(b).lines || [];
    return la.find((x) => lb.includes(x)) || lb[0] || la[0];
  }

  function applyRoute() {
    const root = $("#metro"), steps = $("#route-steps"), note = $("#route-note"), marks = $("#route-marks");
    if (marks) marks.innerHTML = "";
    root.querySelectorAll(".on").forEach((el) => el.classList.remove("on"));
    document.querySelectorAll(".vline li.dim").forEach((el) => el.classList.remove("dim"));
    const route = state.routes.find((r) => r.id === state.route);
    if (!route) {
      root.classList.remove("routing");
      steps.innerHTML = "";
      note.textContent = `여섯 개 트랙의 레포와 자료 ${state.map.stations.length}개를 모두 보여 줍니다.`;
      return;
    }
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
      const s = pos.get(id); if (!s || !marks) return;
      const g = svg("g", { "aria-hidden": "true" }, marks);
      svg("circle", { cx: s.x + 17, cy: s.y - 17, r: 10, class: "step-b" }, g);
      svg("text", { x: s.x + 17, y: s.y - 16.5, class: "step-n" }, g).textContent = i + 1;
    });
    steps.innerHTML = route.stops.map((id, i) => {
      const r = state.repos.get(id);
      const line = i ? commonLine(route.stops[i - 1], id) : primaryLine(r);
      return `<li data-line="${line}"><span class="dot">${i + 1}</span><button type="button" data-open="${esc(id)}"><span class="t">${esc(r.title)}</span><span class="s">${r.level ? r.level + ", " : ""}${esc(r.kind ? "팀 밖 오픈소스" : r.repo)}</span></button></li>`;
    }).join("");
    note.textContent = route.description;
  }

  function wireTabs() {
    const tabs = [$("#tab-map"), $("#tab-zones")];
    const select = (t) => {
      tabs.forEach((x) => {
        const on = x === t;
        x.setAttribute("aria-selected", String(on));
        x.tabIndex = on ? 0 : -1;
        $("#" + x.getAttribute("aria-controls")).hidden = !on;
      });
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(t));
      t.addEventListener("keydown", (e) => {
        if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
        const n = tabs[(i + 1) % 2]; n.focus(); select(n);
      });
    });
  }

  /* ---------- zones ---------- */
  function renderZones() {
    const paid = [...state.repos.values()].filter((r) => r.kind === "paid");
    $("#zones").innerHTML = state.levels.map((lv) => {
      const repos = [...state.repos.values()].filter((r) => r.level === lv.id && !r.kind && (r.lines || []).length);
      const ridden = repos.filter((r) => state.ridden.has(r.repo)).length;
      const extra = lv.id === "L2" ? paid.map((p) => `<li><button type="button" data-open="${esc(p.repo)}"><i class="mini paid" aria-hidden="true"></i><span>${esc(p.title)}</span> <em class="paid-tag">유료</em></button></li>`).join("") : "";
      return `<li class="zone-card${lv.layer === "build" ? " build" : ""}">
        <span class="zl">${lv.id}</span><span class="zn">${esc(lv.name)}</span><span class="zq">${esc(lv.question)}</span>
        <p class="zg">${esc(lv.goal)}</p>
        <ul>${repos.map((r) => `<li><button type="button" data-open="${esc(r.repo)}" data-line="${primaryLine(r)}"><i class="mini${state.ridden.has(r.repo) ? " on" : ""}" aria-hidden="true"></i><span>${esc(r.title)}</span></button></li>`).join("")}${extra}</ul>
        <span class="zq">학습 완료 ${ridden} / ${repos.length}</span>
      </li>`;
    }).join("");
  }

  /* ---------- repos ---------- */
  function cardHTML(r) {
    const line = primaryLine(r);
    const who = r.builders && r.builders.length ? r.builders.join(", ") : "";
    const status = statusLabel[r.status] ? `<span class="status ${r.status}">${statusLabel[r.status]}</span>` : "";
    const nums = (r.lines || []).map((id) => `<span class="num" data-line="${id}" title="${esc(state.lines.get(id).name)} 트랙"></span>`).join("");
    return `<button type="button" class="card" data-line="${line}" data-open="${esc(r.repo)}">
      <span class="card-top">${nums}${r.level ? `<span class="lv">${r.level}</span>` : ""}${status}</span>
      <h3>${esc(r.title)}</h3><span class="repo">${esc(r.repo)}</span>
      <span class="sum">${esc(r.summary)}</span>
      <span class="card-foot"><span class="who">${esc(who)}</span><span class="star">${icons.star}<span>${fmt(r.stars || 0)}</span></span></span>
    </button>`;
  }

  function renderFilter() {
    const box = $("#repo-filter");
    const opts = [{ id: "all", label: "전체" }, ...state.lineList.map((l) => ({ id: l.id, label: l.name, line: l })), { id: "depot", label: "운영·보관" }];
    box.innerHTML = opts.map((o) => `<button type="button" class="chip" role="radio" data-filter="${o.id}" aria-checked="${o.id === state.filter}">${o.line ? `<span class="num" data-line="${o.id}" aria-hidden="true"></span>${esc(o.line.name)}` : esc(o.label)}</button>`).join("");
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-filter]");
      if (!b) return;
      state.filter = b.dataset.filter;
      state.showAll = false;
      box.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", String(c === b)));
      renderRepos();
    });
  }

  function renderRepos() {
    const f = state.filter;
    const list = [...state.repos.values()].filter((r) => !r.kind)
      .filter((r) => (f === "all" ? r.status !== "depot" : f === "depot" ? r.status === "depot" : (r.lines || []).includes(f)))
      .sort((a, b) => (b.stars || 0) - (a.stars || 0));
    const LIMIT = 8;
    const cut = f === "all" && !state.showAll && list.length > LIMIT;
    $("#repo-grid").innerHTML = (cut ? list.slice(0, LIMIT) : list).map((r) => `<li>${cardHTML(r)}</li>`).join("");
    const more = $("#repo-more");
    more.hidden = !cut;
    more.textContent = `레포 ${list.length}개 모두 보기`;
    const all = [...state.repos.values()].filter((r) => !r.kind && r.status !== "depot");
    $("#repos-sub").textContent = `팀이 만든 레포 ${all.length}개, GitHub 스타 ${fmt(totalStars())}개. 스타 순으로 보여 줍니다.`;
  }

  /* ---------- articles ---------- */
  function renderArticles() {
    $("#article-list").innerHTML = state.articles.map((a) => `
      <li><a class="article-card" href="article.html#${esc(a.slug)}"><h3>${esc(a.title)}</h3><p>${esc(a.summary)}</p><time datetime="${esc(a.date)}">${dot(a.date)}</time></a></li>`).join("");
  }

  /* ---------- station dialog ---------- */
  const dialog = () => $("#station-dialog");

  function openStation(id) {
    const r = state.repos.get(id);
    if (!r) return;
    const line = primaryLine(r);
    const lv = state.levels.find((l) => l.id === r.level);
    const lineTags = (r.lines || []).map((lid) => { const l = state.lines.get(lid); return `<span class="tag-line" data-line="${lid}"><span class="num" aria-hidden="true"></span>${esc(l.name)}</span>`; }).join("");
    const extraTag = r.kind === "paid" ? `<span class="status active">유료</span>` : statusLabel[r.status] ? `<span class="status ${r.status}">${statusLabel[r.status]}</span>` : "";
    const builders = (r.builders || []).map(nameLink).join(", ");
    const rows = [
      lv ? `<dt>단계</dt><dd>${lv.id} ${esc(lv.name)}: ${esc(lv.question)}</dd>` : "",
      builders ? `<dt>Builder</dt><dd>${builders}</dd>` : "",
      r.cohorts && r.cohorts.length ? `<dt>기수</dt><dd>${r.cohorts.join("·")}기</dd>` : "",
      statusText[r.status] ? `<dt>상태</dt><dd>${statusText[r.status]}</dd>` : "",
      r.kind ? "" : `<dt>스타</dt><dd>${fmt(r.stars || 0)}</dd>`,
      r.pushed ? `<dt>마지막 커밋</dt><dd>${dot(r.pushed.slice(0, 10))}</dd>` : ""
    ].join("");
    const links = r.kind
      ? r.links.map((l, i) => `<a class="btn${i ? " ghost" : ""}" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")
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
        <div class="tags">${lineTags}${extraTag}</div>
        <h2 id="station-title">${esc(r.title)}</h2>
        ${r.kind ? "" : `<span class="repo">${ORG}/${esc(r.repo)}</span>`}
        <p>${esc(r.summary)}</p>
        ${rows ? `<dl>${rows}</dl>` : ""}
        <div class="links">${links}</div>
        ${adjacent}
        ${canRide ? `<button type="button" class="ride" aria-pressed="${ridden}" data-ride="${esc(r.repo)}">${ridden ? "학습 완료" : "학습 완료로 표시"}</button>` : ""}
      </div>`;
    const d = dialog();
    if (!d.open) { if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", ""); }
    $("#station-body .station-close").focus();
  }

  function closeStation() { const d = dialog(); if (d.open) d.close(); }

  function toggleRide(id) {
    if (state.ridden.has(id)) state.ridden.delete(id); else state.ridden.add(id);
    saveRidden();
    renderMap(); renderZones();
    openStation(id);
  }

  function wire() {
    document.addEventListener("click", (e) => {
      const expand = e.target.closest("[data-expand]");
      if (expand) {
        const open = expand.getAttribute("aria-expanded") !== "true";
        expand.closest(".builder").querySelectorAll("li.extra").forEach((li) => { li.hidden = !open; });
        expand.setAttribute("aria-expanded", String(open));
        expand.textContent = open ? "접기" : `프로젝트 ${expand.closest(".builder").querySelectorAll("li.extra").length}개 더 보기`;
        return;
      }
      if (e.target.closest("#repo-more")) { state.showAll = true; renderRepos(); return; }
      const step = e.target.closest("[data-rail]");
      if (step) {
        const rail = $("#season-rail"), col = rail.firstElementChild ? rail.firstElementChild.getBoundingClientRect().width : 240;
        rail.scrollBy({ left: Number(step.dataset.rail) * col, behavior: reduceMotion ? "auto" : "smooth" });
        return;
      }
      const ride = e.target.closest("[data-ride]");
      if (ride) { toggleRide(ride.dataset.ride); return; }
      if (e.target.closest("[data-close]")) { closeStation(); return; }
      const open = e.target.closest("[data-open]");
      if (open) { e.preventDefault(); openStation(open.dataset.open); }
    });
    dialog().addEventListener("click", (e) => { if (e.target === dialog()) closeStation(); });
    let t;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(() => { fitRail(); railEdges(); }, 120);
      setTimeout(() => document.querySelectorAll("#growth .tile").forEach((el, i) => { if (growthTiles[i] && growthTiles[i].series.length > 1) drawSpark(el, growthTiles[i]); }), 120);
    });
  }

  function fail(err) {
    console.error(err);
    $("#cohort .wrap").insertAdjacentHTML("afterbegin", `<p class="notice">데이터를 불러오지 못했습니다. 로컬에서 볼 때는 <code>python3 -m http.server</code>로 띄운 뒤 접속해 주세요.</p>`);
  }

  async function init() {
    loadRidden();
    wire();
    try { await load(); } catch (err) { fail(err); return; }
    renderGrowth(); renderCohort(); renderBuilders(); renderSeasons(); renderEvents();
    renderLegend(); renderRouteChips(); renderMap(); wireTabs(); renderZones();
    renderFilter(); renderRepos(); renderArticles();
    refreshStars();
  }

  init();
})();
