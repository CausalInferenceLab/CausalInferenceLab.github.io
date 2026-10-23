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
  const dot = (d) => d.replace(/-/g, ".");

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
    const names = ["repos", "lines", "levels", "map", "routes", "projects", "events", "articles", "builders", "growth", "stats", "featured"];
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
    Object.assign(state, { levels: d.levels, map: d.map, routes: d.routes, projects: d.projects, events: d.events, articles: d.articles, builders: d.builders, growth: d.growth, stats: d.stats, featured: d.featured });

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
      renderGrowth(false); renderLadder(); renderShelf(true); renderWeek();
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
      const paid = items.some((r) => r.kind === "paid") ? `<span class="pick paid">책·강의</span>` : "";
      const divider = i === 0 ? `<li class="rung-sep">배우기</li>` : lv.layer === "build" && state.levels[i - 1].layer !== "build" ? `<li class="rung-sep">만들기</li>` : "";
      return `${divider}<li class="rung${lv.layer === "build" ? " build" : ""}" style="--i:${i}">
        <button type="button" data-level="${lv.id}">
          <span class="rl">${lv.id}</span>
          <span class="rt"><b>${esc(lv.name)}</b><span>${esc(lv.question)}</span></span>
          <span class="rp">${picks}${paid}</span>
          <span class="rc"><b>${free.length}</b>레포</span>
        </button></li>`;
    }).join("");
    $("#ladder").innerHTML = rows;
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

  function episodeHTML(r, level, k, top, step) {
    const id = r.repo;
    const line = primaryLine(r);
    const rank = top.indexOf(id);
    const badges = [
      rank >= 0 ? `<span class="b top">TOP ${rank + 1}</span>` : "",
      r.status === "running" ? `<span class="b live">진행 중</span>` : "",
      r.status !== "running" && ageDays(r.pushed) != null && ageDays(r.pushed) <= 14 ? `<span class="b new">새 업데이트</span>` : "",
      r.kind === "paid" ? `<span class="b paid">유료</span>` : "",
      r.kind === "external" ? `<span class="b ext">팀 밖 오픈소스</span>` : ""
    ].join("");
    const who = (r.builders || []);
    const people = who.length ? `<span class="who">${who.slice(0, 2).map((n) => avatarHTML(n, "sm")).join("")}<span class="nm">${esc(who.join(", "))}</span></span>` : `<span class="who"><span class="nm">${r.kind === "paid" ? "한빛미디어" : r.kind === "external" ? "PyWhy · CausalML" : "팀 공동"}</span></span>`;
    const tracks = (r.lines || []).map((l) => esc(state.lines.get(l).name)).join(" · ");
    const lv = state.levels.find((x) => x.id === level);
    return `<li class="ep${step ? " on" : ""}" data-line="${line}" data-id="${esc(id)}" data-level="${level}"${step ? ` data-chap="${esc(id)}"` : ""}>
      <button type="button" data-open="${esc(id)}" aria-label="${step ? `${step}번째, ` : ""}${esc(r.title)}${lv ? `, ${lv.id} ${esc(lv.name)}` : ""}">
        <span class="ep-cover${r.cover ? " has-art" : ""}">
          ${r.cover ? `<img class="ep-art ${r.type === "도서" ? "book" : "wide"}" src="${esc(r.cover)}" alt="" loading="lazy">` : ""}
          <span class="ep-no">${step ? `${level} ${lv ? esc(lv.name) : ""}` : `${level} · ${pad2(k + 1)}`}</span>
          <span class="ep-step" aria-hidden="true">${step ? pad2(step) : ""}</span>
          <span class="ep-badges">${badges}</span>
          <span class="ep-repo">${r.kind === "paid" ? esc(r.meta || "") : r.kind ? esc(r.title) : esc(id)}</span>
          ${state.ridden.has(id) ? `<span class="ep-done" aria-label="학습 완료">✓</span>` : ""}
        </span>
        <span class="ep-body">
          <span class="ep-track">${tracks}${r.pushed && !r.kind ? `<span class="age"> · ${ago(r.pushed)} 업데이트</span>` : ""}</span>
          <h3>${esc(r.title)}</h3>
          <span class="sum">${esc(r.summary)}</span>
          <span class="ep-foot">${people}${r.kind ? "" : `<span class="star">${icons.star}${fmt(r.stars || 0)}</span>`}</span>
        </span>
      </button>
    </li>`;
  }

  function renderShelf(keepScroll = false) {
    const top = topRepos();
    const route = currentRoute();
    const shelf = $("#shelf");
    const prevLeft = shelf.scrollLeft;
    shelf.classList.toggle("routing", !!route);
    if (route) {
      const items = route.stops.map((id) => state.repos.get(id)).filter(Boolean);
      shelf.innerHTML = items.map((r, i) => episodeHTML(r, r.level || "", i, top, i + 1)).join("");
      $("#chapters").innerHTML = items.map((r, i) => `<button type="button" data-chapter="${esc(r.repo)}" aria-current="false"><span class="bar" aria-hidden="true"></span><b>${pad2(i + 1)}</b> <span class="nm">${esc(r.title)}</span></button>`).join("");
      $("#route-note").innerHTML = `<b>${esc(route.label)}</b>: ${esc(route.description)} 01부터 순서대로 보세요.`;
    } else {
      const byLevel = new Map(state.levels.map((lv) => [lv.id, levelItems(lv.id)]));
      shelf.innerHTML = state.levels.map((lv) => {
        const items = byLevel.get(lv.id);
        const chap = `<li class="chap${lv.layer === "build" ? " build" : ""}" data-chap="${lv.id}">
          <span class="cl">${lv.id}</span><b>${esc(lv.name)}</b><span class="cq">${esc(lv.question)}</span><p>${esc(lv.goal)}</p>
          <span class="cc">${items.length}개</span></li>`;
        return chap + items.map((r, k) => episodeHTML(r, lv.id, k, top)).join("");
      }).join("");
      $("#chapters").innerHTML = state.levels.map((lv) => `<button type="button" data-chapter="${lv.id}" style="flex-grow:${byLevel.get(lv.id).length + 1}" aria-current="false"><span class="bar" aria-hidden="true"></span><b>${lv.id}</b> <span class="nm">${esc(lv.name)}</span></button>`).join("");
      $("#route-note").textContent = "목표를 고르면 트랙 지도와 커리큘럼에 볼 순서가 표시됩니다.";
    }
    wireAvatars(shelf);

    const repos = [...state.repos.values()].filter((r) => !r.kind && r.status !== "depot");
    const depot = [...state.repos.values()].filter((r) => r.status === "depot");
    const learnable = repos.filter((r) => (r.lines || []).length);
    const done = learnable.filter((r) => state.ridden.has(r.repo)).length;
    $("#curriculum-sub").textContent = `팀 레포 ${repos.length}개. 트랙 지도로 전체를 보고, 커리큘럼에서 하나씩 열어 보세요.`;
    $("#n-course").textContent = repos.length;
    $("#shelf-foot").innerHTML = `${done ? `<span class="done-n">학습 완료 ${done} / ${learnable.length}</span> ` : ""}카드를 누르면 자세한 정보와 링크가 열립니다. 운영·보관 레포: ${depot.map((r) => `<a href="${esc(repoUrl(r))}" target="_blank" rel="noopener">${esc(r.title)}</a>`).join(", ")}`;
    shelf.scrollLeft = keepScroll ? prevLeft : 0;
    shelfSpy();
  }

  function scrollShelfTo(el, smooth = true) {
    const shelf = $("#shelf");
    if (!el) return;
    shelf.scrollTo({ left: el.offsetLeft - 4, behavior: smooth && !reduceMotion ? "smooth" : "auto" });
  }

  function shelfSpy() {
    const shelf = $("#shelf");
    const x = shelf.scrollLeft + 40;
    const marks = [...shelf.querySelectorAll("[data-chap]")];
    let cur = marks[0] ? marks[0].dataset.chap : "";
    marks.forEach((c) => { if (c.offsetLeft <= x) cur = c.dataset.chap; });
    const routing = shelf.classList.contains("routing");
    const inView = new Set(marks.filter((c) => c.offsetLeft + c.offsetWidth / 2 > shelf.scrollLeft && c.offsetLeft + c.offsetWidth / 2 < shelf.scrollLeft + shelf.clientWidth).map((c) => c.dataset.chap));
    document.querySelectorAll("[data-chapter]").forEach((b) => b.setAttribute("aria-current", String(routing ? inView.has(b.dataset.chapter) : b.dataset.chapter === cur)));
    const [prev, next] = document.querySelectorAll("[data-shelf]");
    const atStart = shelf.scrollLeft <= 4, atEnd = shelf.scrollLeft + shelf.clientWidth >= shelf.scrollWidth - 4;
    prev.disabled = atStart; next.disabled = atEnd;
    const wrap = $("#shelf-wrap");
    wrap.classList.toggle("fade-l", !atStart);
    wrap.classList.toggle("fade-r", !atEnd);
  }

  /* ---------- goals (routes) ---------- */
  function setRoute(id) {
    state.route = id;
    $("#route-chips").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", String(c.dataset.route === id)));
    renderShelf();
    applyRouteMap();
  }

  function renderRouteChips() {
    const box = $("#route-chips");
    const all = [{ id: "all", label: "전체 보기" }, ...state.routes];
    box.innerHTML = all.map((r) => `<button type="button" class="chip" role="radio" data-route="${r.id}" aria-checked="${r.id === state.route}">${esc(r.label)}</button>`).join("");
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-route]");
      if (b) setRoute(b.dataset.route);
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
      get(p.builder).items.push({ cohort: p.cohort, term: p.term, name: p.name, runners: p.runners, repo: r ? r.repo : null, title: r ? r.title : null, link: p.link, line: r ? primaryLine(r) : "none" });
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
  function stripHTML(p, cohorts) {
    const ranAs = new Set(p.runnerOf.map((x) => x.cohort));
    return `<span class="strip" style="--n:${cohorts.length}">${cohorts.map((c) => {
      const its = p.byCohort.get(c);
      if (its) {
        const n = its.reduce((s, i) => s + (i.runners || 0), 0);
        const live = its.some((i) => i.live);
        const label = `${c}기 Builder: ${its.map((i) => i.title || i.name).join(", ")}${n ? `, 러너 ${n}명` : ""}${live ? ", 진행 중" : ""}`;
        return `<span class="sc on${live ? " live" : ""}" data-line="${its[0].line}" title="${esc(label)}">${n || ""}</span>`;
      }
      if (ranAs.has(c)) return `<span class="sc ran" title="${esc(`${c}기 러너로 참여`)}"></span>`;
      return `<span class="sc"></span>`;
    }).join("")}</span>`;
  }

  function renderContrib() {
    const list = builderStats();
    state.people = list;
    const cohorts = [...new Set(state.projects.map((p) => p.cohort))].sort((a, b) => a - b);
    const terms = new Map(state.projects.map((p) => [p.cohort, p.term]));
    const stripLabel = (p) => `${span(p.cohorts)}${p.cohorts.length > 1 ? ` 중 ${p.cohorts.length}개 기수` : ""}`;

    $("#top3").innerHTML = list.slice(0, 3).map((p) => {
      const recent = [...p.items].reverse().slice(0, 2);
      return `<li class="tcard" data-line="${p.line}"><button type="button" data-person="${esc(p.name)}" aria-label="${esc(`기여 ${p.rank}위 ${p.name}, 이력 보기`)}">
        <span class="t-rank" aria-hidden="true">${p.rank}</span>
        <span class="t-head">${avatarHTML(p.name, "lg")}<span><b class="t-name">${esc(p.name)}</b><span class="t-since">${p.first}기부터 Builder · ${p.cohorts.length}개 기수</span></span></span>
        <span class="t-stats"><span><b>${p.projects}</b>프로젝트</span><span><b>${fmt(p.runners)}</b>함께한 러너</span><span><b>${p.repos.size}</b>레포</span></span>
        ${stripHTML(p, cohorts)}
        <span class="t-recent">${recent.map((i) => `<span>${i.cohort}기 · ${esc(i.name)}</span>`).join("")}</span>
        <span class="t-more">이력 보기</span>
      </button></li>`;
    }).join("");

    const rest = list.slice(3);
    const card = (p, copy) => {
      const latest = p.items[p.items.length - 1];
      return `<li class="pcard" data-line="${p.line}"><button type="button" data-person="${esc(p.name)}"${copy ? ' tabindex="-1"' : ""}>${avatarHTML(p.name, "lg")}
        <span class="pc-body"><b class="pc-name">${esc(p.name)}</b><span class="pc-since">${p.first}기부터 Builder</span>
          <span class="pc-stats">프로젝트 <b>${p.projects}</b> · 러너 <b>${fmt(p.runners)}</b></span>
          ${latest ? `<span class="pc-latest">최근 · ${esc(latest.name)}</span>` : ""}</span></button></li>`;
    };
    $("#people-rail").innerHTML = rest.length ? `<div class="people-move" style="--dur:${rest.length * 6}s"><ul class="people-track">${rest.map((p) => card(p, false)).join("")}</ul><ul class="people-track dup" aria-hidden="true">${rest.map((p) => card(p, true)).join("")}</ul></div>` : "";

    const head = `<div class="ro-head" aria-hidden="true"><span>Builder</span><span class="strip" style="--n:${cohorts.length}">${cohorts.map((c) => `<span class="sh" title="${esc(terms.get(c) || "")}">${c}</span>`).join("")}</span><span>프로젝트</span><span class="tot">러너</span></div>`;
    $("#roster").innerHTML = head + `<ol class="ro-list">${list.map((p) => `<li class="ro" data-line="${p.line}">
      <span class="ro-who"><span class="ro-rank">${p.rank}</span>${avatarHTML(p.name, "sm")}<span><button type="button" class="ro-name" data-person="${esc(p.name)}">${esc(p.name)}</button><span class="ro-span">${stripLabel(p)}</span></span></span>
      <span class="ro-strip" aria-label="${esc(`기수별 기여: ${p.cohorts.map((c) => `${c}기`).join(", ")}`)}">${stripHTML(p, cohorts)}</span>
      <ul class="ro-projects">${p.items.map((i) => `<li><span class="c">${i.cohort}기</span>${i.repo ? `<button type="button" data-open="${esc(i.repo)}" title="${esc(`${i.name} · 레포: ${i.title}`)}">${esc(i.name)}</button>` : i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener" title="${esc(i.name)}">${esc(i.name)}</a>` : `<span title="${esc(i.name)}">${esc(i.name)}</span>`}${i.live ? `<span class="live-dot">진행 중</span>` : ""}</li>`).join("")}</ul>
      <span class="ro-total tot"><b>${fmt(p.runners)}</b><span>프로젝트 ${p.projects}</span></span>
    </li>`).join("")}</ol>`;
    wireAvatars($("#top3")); wireAvatars($("#people-rail")); wireAvatars($("#roster"));

    const contributors = state.stats.totals && state.stats.totals.contributors;
    $("#n-contrib").textContent = list.length;
    $("#contrib-sub").textContent = `Builder ${list.length}명이 ${cohorts.length}개 기수 동안 프로젝트 ${state.projects.length}개를 열었습니다.${contributors ? ` GitHub 기여자는 ${fmt(contributors)}명입니다.` : ""}`;
    $("#roster-legend").innerHTML = `<li><span class="sc on" data-line="main"></span>Builder로 연 기수, 숫자는 함께한 러너 수</li><li><span class="sc ran" data-line="main"></span>러너로 참여한 기수</li><li><span class="sc on live" data-line="main"></span>진행 중</li><li>칸은 왼쪽부터 ${cohorts[0]}기–${cohorts[cohorts.length - 1]}기</li>`;
  }

  function openPerson(name) {
    const p = (state.people || []).find((x) => x.name === name);
    if (!p) return;
    const info = builderInfo(name);
    const runnerItems = p.runnerOf.map((x) => {
      const proj = state.projects.find((q) => q.cohort === x.cohort && q.name === x.project);
      const r = proj && proj.repo && state.repos.get(proj.repo);
      return { cohort: x.cohort, role: "러너", name: x.project, title: r ? r.title : null, repo: r ? r.repo : null, link: proj && proj.link, by: proj && proj.builder, line: r ? primaryLine(r) : "none" };
    });
    const events = [...p.items.map((i) => ({ ...i, role: "Builder" })), ...runnerItems].sort((a, b) => b.cohort - a.cohort || (a.role === "Builder" ? -1 : 1));
    const terms = new Map(state.projects.map((q) => [q.cohort, q.term]));
    const item = (e) => {
      const facts = e.role === "Builder" ? [e.runners ? `러너 ${e.runners}명` : "", e.live ? "진행 중" : ""] : [e.by ? `Builder ${esc(e.by)}` : ""];
      const go = e.repo ? `<button type="button" data-open="${esc(e.repo)}">레포 · ${esc(e.title)}</button>` : e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">기록 보기</a>` : "";
      const note = [...facts.filter(Boolean), go].filter(Boolean).join('<span class="sep" aria-hidden="true">·</span>');
      return `<li class="${e.role === "Builder" ? "b" : "r"}" data-line="${e.line}"><span class="tl-c"><b>${e.cohort}기</b><span>${esc(shortTerm(terms.get(e.cohort)))}</span></span><span class="tl-body"><span class="tl-role">${e.role}</span><span class="tl-name">${esc(e.name)}</span>${note ? `<span class="tl-note">${note}</span>` : ""}</span></li>`;
    };
    const repos = [...p.repos].map((id) => state.repos.get(id)).filter(Boolean);
    $("#station-body").innerHTML = `
      <div class="station-band" data-line="${p.line}"></div>
      <button type="button" class="station-close" aria-label="닫기" data-close>${icons.close}</button>
      <div class="station-content person" data-line="${p.line}">
        <div class="tags"><span class="rank-tag">기여 ${p.rank}위</span><span class="tag-line" data-line="${p.line}"><span class="num" aria-hidden="true"></span>${p.first}기부터 Builder</span></div>
        <div class="p-head">${avatarHTML(p.name, "lg")}<div><h2 id="station-title">${esc(p.name)}</h2>${info.linkedin ? `<a href="${esc(info.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ""}</div></div>
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
  function renderWeek() {
    const list = learnables();
    if (!list.length) return;
    const ordered = state.levels.flatMap((lv) => list.filter((r) => r.level === lv.id).sort((a, b) => (b.stars || 0) - (a.stars || 0)));
    const n = ordered.length;
    const pick = ordered.at(((weekIndex() % n) + n) % n);
    const lv = state.levels.find((l) => l.id === pick.level);
    const who = (pick.builders || []).join(", ");
    const fresh = list.filter((r) => r.pushed).sort((a, b) => Date.parse(b.pushed) - Date.parse(a.pushed)).slice(0, 4);
    const recent = state.recent.map((x) => state.repos.get(x.id)).filter(Boolean).slice(0, 3);
    const done = list.filter((r) => state.ridden.has(r.repo)).length;
    const cont = recent.length ? `<div class="continue"><span class="cont-label">이어서 보기</span>${recent.map((r) => `<button type="button" class="cont-chip" data-line="${primaryLine(r)}" data-open="${esc(r.repo)}"><i aria-hidden="true"></i>${esc(r.title)}</button>`).join("")}
      <span class="cont-progress">학습 완료 <b>${done}</b> / ${list.length}<span class="bar" aria-hidden="true"><i style="width:${Math.round((done / list.length) * 100)}%"></i></span></span></div>` : "";
    $("#week").innerHTML = `${cont}<div class="week-grid">
      <article class="spot" data-line="${primaryLine(pick)}">
        <p class="spot-label">이번 주의 레포<span>월요일마다 바뀝니다</span></p>
        <h3>${esc(pick.title)}</h3>
        <p class="spot-meta">${lv ? `<span>${lv.id} ${esc(lv.name)}</span>` : ""}${who ? `<span>${esc(who)}</span>` : ""}${pick.stars ? `<span class="star">${icons.star}${fmt(pick.stars)}</span>` : ""}</p>
        <p class="spot-sum">${esc(pick.summary)}</p>
        <div class="spot-cta"><button type="button" class="btn" data-open="${esc(pick.repo)}">자세히 보기</button>${pick.site ? `<a class="btn ghost" href="${esc(pick.site)}" target="_blank" rel="noopener">${esc(pick.siteLabel || "사이트 열기")}</a>` : ""}</div>
      </article>
      <div class="fresh">
        <p class="spot-label">최근 업데이트<span>매주 월요일 집계</span></p>
        <ol>${fresh.map((r) => `<li data-line="${primaryLine(r)}"><button type="button" data-open="${esc(r.repo)}"><i aria-hidden="true"></i><span class="t">${esc(r.title)}</span><span class="d">${ago(r.pushed)}</span></button></li>`).join("")}</ol>
      </div>
    </div>`;
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

  function renderLegend() {
    $("#line-legend").innerHTML = state.lineList.map((l) => `<li data-line="${l.id}"><span class="num" aria-hidden="true"></span>${esc(l.name)}</li>`).join("") +
      `<li><svg width="28" height="6" aria-hidden="true"><path d="M2 3H26" stroke="var(--l-main)" stroke-width="3" stroke-dasharray="5 6" stroke-linecap="round"/></svg>책·강의 (유료)</li>`;
  }

  /* ---------- tabs ---------- */
  function selectTab(id) {
    document.querySelectorAll("#curriculum [role=tab][aria-controls]").forEach((x) => {
      const on = x.id === id;
      x.setAttribute("aria-selected", String(on));
      x.tabIndex = on ? 0 : -1;
      $("#" + x.getAttribute("aria-controls")).hidden = !on;
    });
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
    if (state.route !== "all") setRoute("all");
    $("#curriculum").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    scrollShelfTo($(`#shelf [data-chap="${levelId}"]`), false);
  }

  /* Jump to one card on the curriculum shelf and mark it briefly. */
  function gotoItem(id) {
    closeStation();
    selectTab("tab-course");
    if (state.route !== "all") setRoute("all");
    $("#curriculum").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    const el = $(`#shelf .ep[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    scrollShelfTo(el, false);
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }

  /* ---------- book and lecture (hero) ---------- */
  function renderPartner() {
    const items = (state.map.paid || []).filter((p) => p.cover);
    $("#partner-list").innerHTML = items.map((p) => {
      const lv = state.levels.find((l) => l.id === p.level);
      const out = (p.links || [])[0];
      return `<li class="pt-card">
        <button type="button" class="pt-main" data-goto="${esc(p.id)}" aria-label="${esc(`${p.type} ${p.title}, 커리큘럼 ${p.level}에서 보기`)}">
          <img class="pt-img ${p.type === "도서" ? "book" : "wide"}" src="${esc(p.cover)}" alt="" width="${p.type === "도서" ? 44 : 84}" height="${p.type === "도서" ? 56 : 56}">
          <span class="pt-text"><span class="pt-type">${esc(p.type)}</span><b>${esc(p.title)}</b><span class="pt-lv">커리큘럼 ${esc(p.level)}${lv ? ` ${esc(lv.name)}` : ""}</span></span>
        </button>
        ${out ? `<a class="pt-out" href="${esc(out.url)}" target="_blank" rel="noopener" aria-label="${esc(`${p.title} 한빛미디어에서 보기`)}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4h6v6M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a>` : ""}
      </li>`;
    }).join("");
  }

  /* ---------- featured sites (hero) ---------- */
  function renderFeatured() {
    $("#featured").innerHTML = (state.featured || []).map((f) => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener"><span class="tag">${esc(f.tag)}</span><span class="t">${esc(f.title)}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4h6v6M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a></li>`).join("");
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
    applyRouteMap();
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
    if (r.kind !== "paid") {
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
      statusText[r.status] ? `<dt>상태</dt><dd>${statusText[r.status]}</dd>` : "",
      r.kind ? "" : `<dt>스타</dt><dd>${fmt(r.stars || 0)}</dd>`,
      r.pushed ? `<dt>마지막 커밋</dt><dd>${dot(r.pushed.slice(0, 10))}</dd>` : ""
    ].join("");
    const links = r.kind
      ? r.links.map((l, i) => `<a class="btn${i ? " ghost" : ""}" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")
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
        <div class="tags">${lineTags}${extraTag}</div>
        ${r.cover ? `<img class="station-art ${r.type === "도서" ? "book" : "wide"}" src="${esc(r.cover)}" alt="">` : ""}
        <h2 id="station-title">${esc(r.title)}</h2>
        ${r.kind ? "" : `<span class="repo">${ORG}/${esc(r.repo)}</span>`}
        <p>${esc(r.summary)}</p>
        ${rows ? `<dl>${rows}</dl>` : ""}
        <div class="links">${links}${r.kind === "paid" ? `<button type="button" class="btn ghost" data-goto="${esc(r.repo)}">커리큘럼에서 위치 보기</button>` : ""}</div>
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
    renderMap(); renderShelf(true);
    openStation(id);
  }

  function wire() {
    document.addEventListener("click", (e) => {
      const ride = e.target.closest("[data-ride]");
      if (ride) { toggleRide(ride.dataset.ride); return; }
      if (e.target.closest("[data-close]")) { closeStation(); return; }
      const person = e.target.closest("[data-person]");
      if (person) { openPerson(person.dataset.person); return; }
      const go = e.target.closest("[data-goto]");
      if (go) { gotoItem(go.dataset.goto); return; }
      const lv = e.target.closest("[data-level]:not(.ep):not(.chap)");
      if (lv && lv.tagName === "BUTTON") { gotoLevel(lv.dataset.level); return; }
      const ch = e.target.closest("[data-chapter]");
      if (ch) { scrollShelfTo($(`#shelf [data-chap="${CSS.escape(ch.dataset.chapter)}"]`)); return; }
      const step = e.target.closest("[data-shelf]");
      if (step) {
        const shelf = $("#shelf");
        shelf.scrollBy({ left: Number(step.dataset.shelf) * shelf.clientWidth * 0.8, behavior: reduceMotion ? "auto" : "smooth" });
        return;
      }
      const tabLink = e.target.closest('a[href="#contrib"]');
      if (tabLink) { e.preventDefault(); selectTab("tab-contrib"); $("#curriculum").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }); return; }
      const open = e.target.closest("[data-open]");
      if (open) { e.preventDefault(); openStation(open.dataset.open); }
    });
    dialog().addEventListener("click", (e) => { if (e.target === dialog()) closeStation(); });
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
    const contribOn = $("#tab-contrib").getAttribute("aria-selected") === "true";
    document.querySelectorAll(".site-nav a[href^='#']").forEach((a) => {
      const href = a.getAttribute("href");
      const on = navCur === "curriculum" ? (href === "#contrib" ? contribOn : href === "#curriculum" && !contribOn) : href === "#" + navCur;
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
  }
  function navSpy() {
    if (!("IntersectionObserver" in window)) return;
    const ids = ["curriculum", "events", "reading", "join"];
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
    renderRouteChips(); renderShelf(); renderWeek();
    $("#shelf").addEventListener("scroll", shelfSpy, { passive: true });
    renderContrib();
    renderLegend(); renderMap(); wireTabs();
    renderFeatured(); renderPartner(); renderEvents(); renderArticles();
    if (location.hash === "#contrib") selectTab("tab-contrib");
    navSpy();
    refreshStars();
  }

  init();
})();
