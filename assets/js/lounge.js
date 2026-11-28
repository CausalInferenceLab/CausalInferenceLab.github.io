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
    el.innerHTML = posts.length
      ? `${writeHTML(data, "home")}<ol class="lg-list">${posts.map((p) => postHTML(p, "home")).join("")}</ol>
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
      const tab = (name, label) => `<button type="button" class="chip${pick === name ? " on" : ""}" aria-pressed="${pick === name}" data-lg-cat="${esc(name)}">${esc(label)}</button>`;
      el.innerHTML = `${writeHTML(data, "lounge")}
        <div class="lg-tools">
          <div class="lg-tabs" role="group" aria-label="게시판">${tab("", "전체")}${cats.map((b) => tab(b.name, b.name)).join("")}</div>
          <div class="lg-sort" role="group" aria-label="정렬"><button type="button" class="chip${sort === "new" ? " on" : ""}" aria-pressed="${sort === "new"}" data-lg-sort="new">최신순</button><button type="button" class="chip${sort === "hot" ? " on" : ""}" aria-pressed="${sort === "hot"}" data-lg-sort="hot">반응순</button></div>
        </div>
        ${shown.length ? `<ol class="lg-list">${shown.map((p) => postHTML(p, "lounge")).join("")}</ol>` : `<p class="lg-none">${pick ? `${esc(pick)} 게시판에 아직 글이 없습니다.` : "아직 올라온 글이 없습니다."}</p>`}
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

  async function start() {
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
