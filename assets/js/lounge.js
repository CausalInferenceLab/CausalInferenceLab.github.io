/* The lounge: the latest GitHub Discussions of this repo, collected into data/lounge.json on every deploy
   and whenever a discussion changes (scripts/build_lounge.py). The home page shows the newest five
   ([data-lounge="home"]); lounge.html shows them all with a category filter ([data-lounge="page"]).
   Writing happens on GitHub: each category's button opens a new discussion in it. */
(() => {
  "use strict";
  const ROOT = new URL("../../", document.currentScript ? document.currentScript.src : location.href).href;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /* the four boards in the order people meet them; any other category GitHub has comes after */
  const BOARDS = [
    { name: "질문", verb: "질문하기", hint: "분석, 실험, 커리어 무엇이든", line: "main" },
    { name: "공유", verb: "공유하기", hint: "내 글, 좋은 자료와 발표", line: "behavior" },
    { name: "회고", verb: "회고 쓰기", hint: "프로젝트, 스터디, 이직 후기", line: "ml" },
    { name: "소식", verb: "소식 알리기", hint: "모집, 행사, 채용", line: "exp" },
  ];
  const board = (name) => BOARDS.find((b) => b.name === name);
  const lineOf = (name) => (board(name) || { line: "ai" }).line;

  function ago(iso) {
    const t = Date.parse(iso);
    if (!t) return "";
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 60) return `${Math.max(1, m)}분 전`;
    if (m < 1440) return `${Math.round(m / 60)}시간 전`;
    if (m < 1440 * 14) return `${Math.round(m / 1440)}일 전`;
    const d = new Date(t + 9 * 3600e3);
    return `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
  }

  function writeUrl(data, cat) {
    const repo = data.repo || "CausalInferenceLab/CausalInferenceLab.github.io";
    return cat && cat.slug ? `https://github.com/${repo}/discussions/new?category=${encodeURIComponent(cat.slug)}` : `https://github.com/${repo}/discussions/new/choose`;
  }

  /* the write buttons: one per board that exists on GitHub, or one plain button before the boards are made */
  function writeHTML(data, where) {
    const cats = data.categories || [];
    const ours = BOARDS.map((b) => ({ b, c: cats.find((c) => c.name === b.name) })).filter((x) => x.c);
    const ev = (cat) => `data-event="lounge_write" data-event-params='${esc(JSON.stringify({ category: cat, placement: where }))}'`;
    if (!ours.length) return `<p class="lg-write"><a class="btn" href="${esc(writeUrl(data))}" target="_blank" rel="noopener" ${ev("any")}>글쓰기</a></p>`;
    return `<ul class="lg-write">${ours.map(({ b, c }) => `<li><a class="lg-w l-${b.line}" href="${esc(writeUrl(data, c))}" target="_blank" rel="noopener" ${ev(b.name)}><b>${esc(b.verb)}</b><span>${esc(b.hint)}</span></a></li>`).join("")}</ul>`;
  }

  function postHTML(p, where) {
    const badge = p.builder ? '<span class="lg-badge">Builder</span>' : "";
    const meta = [
      p.answered ? '<span class="lg-done">답변 채택</span>' : "",
      p.comments ? `<span>답 ${p.comments}</span>` : (p.category === "질문" ? '<span class="lg-wait">답을 기다려요</span>' : ""),
      p.upvotes ? `<span>추천 ${p.upvotes}</span>` : "",
    ].filter(Boolean).join("");
    return `<li class="lg-post l-${lineOf(p.category)}">
      <a class="lg-main" href="${esc(p.url)}" target="_blank" rel="noopener" data-event="lounge_open" data-event-params='${esc(JSON.stringify({ category: p.category, placement: where }))}'>
        <span class="lg-cat">${esc(p.category)}</span>
        <span class="lg-t">${esc(p.title)}</span>
        ${p.excerpt ? `<span class="lg-x">${esc(p.excerpt)}</span>` : ""}
      </a>
      <p class="lg-meta"><span class="lg-who"><span class="avatar sm" aria-hidden="true">${esc(p.login.slice(0, 1).toUpperCase())}${p.avatar ? `<img src="${esc(`${p.avatar}${p.avatar.includes("?") ? "&" : "?"}s=64`)}" alt="" loading="lazy" data-fallback="1">` : ""}</span>${esc(p.builder || p.login)}${badge}</span><span>${esc(ago(p.at))}</span>${meta}</p>
    </li>`;
  }

  function emptyHTML(data, where) {
    return `<div class="lg-empty"><p><b>아직 올라온 글이 없습니다.</b> 첫 질문이나 회고를 올려 주세요. GitHub 계정이면 누구나 쓸 수 있습니다.</p>${writeHTML(data, where)}</div>`;
  }

  function renderHome(el, data) {
    const posts = (data.posts || []).slice(0, 5);
    const waiting = (data.posts || []).filter((p) => p.category === "질문" && !p.comments && !p.answered).slice(0, 3);
    const wait = waiting.length ? `<div class="lg-waiting"><p class="lg-wk">답을 기다리는 질문 ${waiting.length}개</p><ul>${waiting.map((p) => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener" data-event="lounge_open" data-event-params='${esc(JSON.stringify({ category: p.category, placement: "home_waiting" }))}'>${esc(p.title)}</a><span>${esc(p.builder || p.login)} · ${esc(ago(p.at))}</span></li>`).join("")}</ul></div>` : "";
    el.innerHTML = posts.length
      ? `${writeHTML(data, "home")}${wait}<ol class="lg-list">${posts.map((p) => postHTML(p, "home")).join("")}</ol>
         <p class="lg-more"><a href="lounge.html" data-event="lounge_more" data-event-params='{"placement":"home"}'>라운지 전체 보기<span aria-hidden="true"> →</span></a></p>`
      : emptyHTML(data, "home");
  }

  function renderPage(el, data) {
    const posts = data.posts || [];
    const cats = BOARDS.filter((b) => (data.categories || []).some((c) => c.name === b.name) || posts.some((p) => p.category === b.name));
    const params = new URLSearchParams(location.search);
    let pick = cats.some((b) => b.name === params.get("c")) ? params.get("c") : "";
    let sort = params.get("sort") === "hot" ? "hot" : "new";
    const draw = () => {
      const shown = posts.filter((p) => !pick || p.category === pick)
        .sort((a, b) => (sort === "hot" ? (b.comments + b.upvotes) - (a.comments + a.upvotes) : 0) || (a.at < b.at ? 1 : -1));
      const count = (name) => posts.filter((p) => !name || p.category === name).length;
      const tab = (name, label) => `<button type="button" class="chip${pick === name ? " on" : ""}" aria-pressed="${pick === name}" data-lg-cat="${esc(name)}">${esc(label)}<span class="lg-n">${count(name)}</span></button>`;
      el.innerHTML = `${writeHTML(data, "lounge")}
        <div class="lg-tools">
          <div class="lg-tabs" role="group" aria-label="게시판">${tab("", "전체")}${cats.map((b) => tab(b.name, b.name)).join("")}</div>
          <div class="lg-sort" role="group" aria-label="정렬"><button type="button" class="chip${sort === "new" ? " on" : ""}" aria-pressed="${sort === "new"}" data-lg-sort="new">최신순</button><button type="button" class="chip${sort === "hot" ? " on" : ""}" aria-pressed="${sort === "hot"}" data-lg-sort="hot">반응순</button></div>
        </div>
        ${shown.length ? `<ol class="lg-list lg-grid">${shown.map((p) => postHTML(p, "lounge")).join("")}</ol>` : `<p class="lg-none">${pick ? `${esc(pick)} 게시판에 아직 글이 없습니다.` : "아직 올라온 글이 없습니다."}</p>`}
        <p class="lg-more"><a href="https://github.com/${esc(data.repo || "CausalInferenceLab/CausalInferenceLab.github.io")}/discussions" target="_blank" rel="noopener">GitHub에서 모든 글 보기<span aria-hidden="true"> ↗</span></a></p>`;
    };
    el.addEventListener("click", (e) => {
      const c = e.target.closest("[data-lg-cat]"), s = e.target.closest("[data-lg-sort]");
      if (!c && !s) return;
      if (c) { pick = c.dataset.lgCat; window.hubTrack && window.hubTrack("lounge_filter", { category: pick || "all" }); }
      if (s) sort = s.dataset.lgSort;
      const q = new URLSearchParams(location.search);
      if (pick) q.set("c", pick); else q.delete("c");
      if (sort === "hot") q.set("sort", "hot"); else q.delete("sort");
      history.replaceState(null, "", `${location.pathname}${q.toString() ? `?${q}` : ""}`);
      draw();
    });
    draw();
  }

  /* ---------- 레포 소식: the team's GitHub activity (data/activity.json), one line per person, repo, kind and day ---------- */
  const KIND = {
    pr_open: (n) => (n > 1 ? `PR ${n}개를 올렸습니다` : "PR을 올렸습니다"), pr_merge: (n) => (n > 1 ? `PR ${n}개를 머지했습니다` : "PR을 머지했습니다"), push: (n) => (n > 1 ? `커밋을 ${n}번 올렸습니다` : "커밋을 올렸습니다"),
    issue: (n) => (n > 1 ? `이슈 ${n}개를 열었습니다` : "이슈를 열었습니다"), comment: (n) => (n > 1 ? `댓글 ${n}개를 남겼습니다` : "댓글을 남겼습니다"), review: (n) => (n > 1 ? `리뷰 ${n}개를 남겼습니다` : "리뷰를 남겼습니다"),
    release: () => "새 버전을 냈습니다", star: () => "별을 달았습니다", repo: () => "새 레포를 열었습니다",
  };
  const kstDay = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10);
  async function renderRepoNews(el) {
    const get = (f) => fetch(`${ROOT}data/${f}`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [act, people] = await Promise.all([get("activity.json"), get("builders.json")]);
    const names = new Map((Array.isArray(people) ? people : []).filter((p) => p.github).map((p) => [p.github.toLowerCase(), p.name]));
    const items = ((act && act.items) || []).filter((x) => x && x.login && x.repo && KIND[x.kind]).sort((a, b) => (a.at < b.at ? 1 : -1));
    const groups = [];
    items.forEach((x) => {
      const key = `${x.login}|${x.repo}|${x.kind}|${kstDay(x.at)}`;
      const g = groups.find((y) => y.key === key);
      if (g) { g.n += 1; return; }
      groups.push({ key, n: 1, first: x });
    });
    if (!groups.length) { el.innerHTML = '<p class="lg-none">최근 소식이 아직 없습니다.</p>'; return; }
    el.innerHTML = `<ol class="lg-list rn-list">${groups.slice(0, 12).map(({ n, first: x }) => {
      const who = names.get(x.login.toLowerCase()) || x.login;
      const url = x.url && /^https:\/\/github\.com\//.test(x.url) ? x.url : `https://github.com/CausalInferenceLab/${encodeURIComponent(x.repo)}`;
      const line = x.kind === "star" ? `${esc(who)}님이 <b>${esc(x.repo)}</b>에 ${KIND.star(n)}` : `${esc(who)}님이 <b>${esc(x.repo)}</b>에 ${KIND[x.kind](n)}`;
      return `<li class="lg-post rn-${esc(x.kind)}"><a class="rn-main" href="${esc(url)}" target="_blank" rel="noopener" data-event="repo_news_open" data-event-params='${esc(JSON.stringify({ repo: x.repo, kind: x.kind }))}'>
        <span class="avatar sm" aria-hidden="true">${esc(who.slice(0, 1).toUpperCase())}<img src="https://github.com/${esc(encodeURIComponent(x.login))}.png?size=64" alt="" loading="lazy" data-fallback="1"></span>
        <span class="rn-tx"><span class="rn-t">${line}</span>${x.title ? `<span class="rn-x">${esc(x.title)}${n > 1 ? ` 외 ${n - 1}개` : ""}</span>` : ""}</span><span class="rn-at">${esc(ago(x.at))}</span></a></li>`;
    }).join("")}</ol><p class="lg-more"><a href="https://github.com/CausalInferenceLab" target="_blank" rel="noopener">GitHub에서 팀 레포 보기<span aria-hidden="true"> ↗</span></a></p>`;
  }

  /* ---------- home tabs: 커리큘럼 (default), 라운지, 자료, 연재, 레포 소식 under the question box ---------- */
  function wireTabs() {
    const bar = document.querySelector(".ht-bar");
    if (!bar) return;
    const tabs = [...bar.querySelectorAll("[role=tab]")];
    const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls"))).filter(Boolean);
    const drawn = new Set();
    const show = (id, how) => {
      const tab = tabs.find((t) => t.getAttribute("aria-controls") === id);
      if (!tab) return false;
      tabs.forEach((t) => { const on = t === tab; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; });
      panels.forEach((p) => { p.hidden = p.id !== id; });
      if (id === "repo-news" && !drawn.has(id)) { drawn.add(id); const box = document.querySelector("[data-repo-news]"); if (box) renderRepoNews(box); }
      /* parts of a panel that measure themselves (the map, sparklines) draw again now that it is shown */
      window.dispatchEvent(new Event("resize"));
      if (how) window.hubTrack && window.hubTrack("home_tab", { tab: id, placement: how });
      return true;
    };
    window.hubShowTab = (id) => show(id);
    bar.addEventListener("click", (e) => {
      const t = e.target.closest("[role=tab]");
      if (!t) return;
      const id = t.getAttribute("aria-controls");
      show(id, "tab");
      history.replaceState(null, "", id === "curriculum" ? location.pathname + location.search : `#${id}`);
    });
    bar.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const j = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[j].focus(); tabs[j].click();
    });
    /* a link to a panel (the header stops, "#lounge" links) opens its tab first, then the page scrolls there */
    const panelOf = (hash) => { const el = hash && hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null; return el ? panels.find((p) => p === el || p.contains(el)) : null; };
    document.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#"], a[href^="/#"]');
      if (!a) return;
      const p = panelOf(a.getAttribute("href").replace(/^\//, ""));
      if (p && p.hidden) show(p.id, "link");
    }, true);
    const fromHash = () => { const p = panelOf(location.hash); if (p && p.hidden) { show(p.id); requestAnimationFrame(() => p.scrollIntoView()); } };
    addEventListener("hashchange", fromHash);
    fromHash();
  }

  async function start() {
    wireTabs();
    const boxes = [...document.querySelectorAll("[data-lounge]")];
    if (!boxes.length) return;
    let data = { posts: [], categories: [] };
    try { const r = await fetch(`${ROOT}data/lounge.json`, { cache: "no-cache" }); if (r.ok) data = await r.json(); } catch (e) { /* the empty lounge still offers the write button */ }
    boxes.forEach((el) => (el.dataset.lounge === "page" ? renderPage(el, data) : renderHome(el, data)));
    const n = document.getElementById("n-lounge");
    if (n && (data.posts || []).length) n.textContent = String(data.posts.length);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
