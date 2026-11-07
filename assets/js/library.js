/* 자료실: causal inference and online experiment topics with deep links into the team's web book,
   Causal Studio, the practitioner lectures, book code, study slides and case lists, plus the web
   book's glossary. Data: data/topics.json, data/glossary.json (scripts/build_glossary.py),
   data/repos.json (source names) and data/articles.json (posts tagged with topics).
   State lives in the address: ?q= search, ?shelf= causal|exp, ?kind=, ?src=, ?view=glossary,
   and #topic-id or #term-... for a topic or a term. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const track = (n, p) => window.hubTrack && window.hubTrack(n, p);
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s·\-_/()]/g, "");
  const BOOK = "https://causalinferencelab.github.io/Causal-Inference-with-Python/";
  const KIND_ORDER = ["video", "read", "code", "slides", "case", "post"];
  const FIRST = 3;
  /* the sources in the order a newcomer meets them, with what each one is */
  const SOURCES = [
    ["causal-studio", "Causal Studio", "짧은 입문 영상과 노트북"],
    ["Causal-Inference-with-Python", "Brave & True 웹북", "원서 25장과 부록을 옮긴 웹북"],
    ["causal-inference-lecture", "실무자 특강", "책 장마다 현업 사례 강의"],
    ["causal-inference-in-python-code", "책 예제 코드", "『실무로 통하는 인과추론』 장별 코드"],
    ["OCE-Materials", "온라인 실험 스터디", "온라인 통제 실험 스터디 발표"],
    ["Experimentation-platform-materials", "실험 플랫폼 자료", "국내외 실험 플랫폼 사례 모음"],
    ["causal-inference-practice", "산업 사례 템플릿", "기법별 산업 사례 발표"],
    ["awesome-causal-inference-python", "메서드 코드북", "주제별 파이썬 코드"]
  ];
  const SRC_NAME = Object.fromEntries(SOURCES.map(([id, name]) => [id, name]));
  SRC_NAME.hub = "허브 연재";
  /* the glossary's "온라인 실험" section is the experiments shelf; every other section is causal inference */
  const glShelf = (name) => (/실험/.test(name) ? "exp" : "causal");
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  let data = null, gloss = null, repos = new Map(), read = {};
  const st = { q: "", shelf: "all", kinds: new Set(), src: "", view: "topics", open: new Set() };

  const srcName = (id) => SRC_NAME[id] || (repos.get(id) && repos.get(id).title) || id;
  const bookSlug = (url) => { const m = /\/Causal-Inference-with-Python\/([A-Za-z0-9-]+)\.html$/.exec(url || ""); return m ? m[1] : null; };
  const shelfOf = (id) => data.shelves.find((s) => s.id === id);
  const allTerms = () => (gloss ? gloss.sections.flatMap((s) => s.terms) : []);

  function fromURL() {
    const p = new URLSearchParams(location.search);
    st.q = (p.get("q") || "").slice(0, 60);
    st.shelf = ["causal", "exp"].includes(p.get("shelf")) ? p.get("shelf") : "all";
    st.kinds = new Set((p.get("kind") || "").split(",").filter((k) => KIND_ORDER.includes(k)));
    st.src = SRC_NAME[p.get("src")] ? p.get("src") : "";
    st.view = gloss && (p.get("view") === "glossary" || /^#term-/.test(decodeURIComponent(location.hash))) ? "glossary" : "topics";
  }
  function toURL() {
    const p = new URLSearchParams();
    if (st.q) p.set("q", st.q);
    if (st.shelf !== "all") p.set("shelf", st.shelf);
    if (st.kinds.size) p.set("kind", [...st.kinds].join(","));
    if (st.src) p.set("src", st.src);
    if (st.view === "glossary") p.set("view", "glossary");
    const s = p.toString();
    history.replaceState(history.state, "", `${location.pathname}${s ? `?${s}` : ""}${location.hash}`);
  }

  /* ---------- topics ---------- */
  const itemOk = (x) => (!st.kinds.size || st.kinds.has(x.kind)) && (!st.src || x.repo === st.src);
  function visibleTopics() {
    const q = norm(st.q);
    return data.topics.filter((t) => st.shelf === "all" || t.shelf === st.shelf).map((t) => {
      const pool = t.items.filter(itemOk);
      let items = pool, partial = false;
      if (q && pool.length) {
        const head = [t.name, t.en, t.about, ...(t.keys || [])].some((s) => norm(s).includes(q));
        if (!head) {
          const hit = pool.filter((x) => norm(`${x.title} ${srcName(x.repo)} ${x.by || ""}`).includes(q));
          partial = hit.length > 0 && hit.length < pool.length && !st.open.has(t.id);
          items = st.open.has(t.id) && hit.length ? pool : hit;
        }
      }
      /* three items per topic at first; the rest open on request, so a topic never reads as a wall of links */
      if (!q && !st.open.has(t.id) && items.length > FIRST) { partial = true; items = items.slice(0, FIRST); }
      return { t, items, partial, total: pool.length, n: q ? items.length : pool.length };
    }).filter((v) => v.items.length);
  }

  function itemHTML(x, t) {
    const kind = data.kinds[x.kind] || x.kind;
    const ev = (target) => `data-event="library_click" data-event-params='${esc(JSON.stringify({ topic: t.id, kind: x.kind, repo: x.repo, target }))}'`;
    const done = x.repo === "Causal-Inference-with-Python" && read[bookSlug(x.url)];
    const extra = [x.notebook && `<a href="${esc(x.notebook)}" ${ev("notebook")}>노트북</a>`, x.slides && `<a href="${esc(x.slides)}" target="_blank" rel="noopener" ${ev("slides")}>발표 자료</a>`].filter(Boolean).join("");
    const out = /^https?:\/\//.test(x.url) && !/^https:\/\/causalinferencelab\.github\.io\//.test(x.url);
    return `<li class="lib-item k-${esc(x.kind)}">
      <span class="lib-kind">${esc(kind)}</span>
      <span class="lib-main"><a href="${esc(x.url)}"${out ? ' target="_blank" rel="noopener"' : ""} ${ev("main")}>${esc(x.title)}${out ? '<span class="lib-out" aria-hidden="true"> ↗</span>' : ""}</a>
        <span class="lib-src">${esc(srcName(x.repo))}${x.by ? ` · ${esc(x.by)}` : ""}${done ? ' · <b class="lib-done">읽음</b>' : ""}${extra ? `<span class="lib-extra">${extra}</span>` : ""}</span></span>
    </li>`;
  }

  function renderTopics(list) {
    const nItems = list.reduce((a, v) => a + v.n, 0);
    const filt = [st.src && srcName(st.src), st.kinds.size && [...st.kinds].map((k) => data.kinds[k]).join("·"), st.q && `‘${st.q}’ 검색`].filter(Boolean).join(" · ");
    $("#lib-count").innerHTML = list.length ? `주제 ${list.length}개 · 자료 ${nItems}개${filt ? ` · ${esc(filt)}` : ""}${st.src || st.kinds.size ? ' <button type="button" class="lib-clear" data-lib-reset>거르기 풀기</button>' : ""}` : "";
    $("#lib-index").innerHTML = data.shelves.filter((s) => st.shelf === "all" || s.id === st.shelf).map((s) => {
      const ts = list.filter((v) => v.t.shelf === s.id);
      return ts.length ? `<div class="lib-ix s-${esc(s.id)}"><p>${esc(s.name)}</p><ul>${ts.map((v) => `<li><a href="#${esc(v.t.id)}">${esc(v.t.name)}<span>${v.n}</span></a></li>`).join("")}</ul></div>` : "";
    }).join("");
    if (!list.length) {
      const terms = st.q ? visibleTerms().reduce((n, v) => n + v.terms.length, 0) : 0;
      const sug = ["이중차분", "성향점수", "A/B", "SRM", "메타러너"].map((w) => `<button type="button" class="chip" data-lib-try="${esc(w)}">${esc(w)}</button>`).join("");
      $("#lib-topics").innerHTML = `<div class="lib-empty"><p><b>${st.q ? `‘${esc(st.q)}’와 맞는 자료가 없습니다.` : "고른 조건에 맞는 자료가 없습니다."}</b> ${terms ? `용어집에는 ${terms}개가 있습니다.` : "다른 말로 찾거나 조건을 풀어 보세요."}</p>
        ${terms ? `<p><button type="button" class="btn sm" data-view="glossary">용어집에서 보기</button></p>` : `<p class="lib-try">${sug}</p>`}
        <p><button type="button" class="btn ghost sm" data-lib-reset>조건 모두 지우기</button></p></div>`;
      return;
    }
    let lastShelf = null;
    $("#lib-topics").innerHTML = list.map((v) => {
      const t = v.t, s = shelfOf(t.shelf);
      const head = t.shelf !== lastShelf && st.shelf === "all" ? `<h2 class="lib-shelf s-${esc(t.shelf)}">${esc(s.name)}<span>${esc(s.about)}</span></h2>` : "";
      lastShelf = t.shelf;
      const terms = termsFor(t).slice(0, 3);
      return `${head}<article class="lib-topic s-${esc(t.shelf)}" id="${esc(t.id)}" tabindex="-1" aria-labelledby="t-${esc(t.id)}">
        <header><h3 id="t-${esc(t.id)}">${esc(t.name)}</h3><span class="lib-en" lang="en">${esc(t.en)}</span>
          <button type="button" class="lib-link" data-copy="${esc(`https://causalinferencelab.github.io/library.html#${t.id}`)}" data-share="library_topic" aria-label="${esc(t.name)} 링크 복사">링크 복사</button></header>
        <p class="lib-about">${esc(t.about)}</p>
        ${terms.length ? `<p class="lib-terms"><span>먼저 알아 둘 용어</span>${terms.map((x) => `<a href="#${esc(x.id)}" data-term="${esc(x.id)}">${esc(x.ko)}</a>`).join("")}</p>` : ""}
        <ol class="lib-items">${v.items.map((x) => itemHTML(x, t)).join("")}</ol>
        ${v.partial ? `<button type="button" class="lib-all" data-lib-open="${esc(t.id)}">${v.total - v.items.length}개 더 보기</button>` : ""}
      </article>`;
    }).join("");
  }

  /* ---------- glossary ---------- */
  /* a term goes with a topic when the topic's name or one of its keywords names it: English keys as
     whole words of the English term, short Korean keys only as the whole term, longer ones anywhere */
  let topicKeys = [];
  const reEsc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s-]+/g, "[\\s-]*");
  function indexKeys() {
    topicKeys = data.topics.map((t) => ({ t, keys: [t.name, ...(t.keys || [])].map((k) => String(k).trim()).filter(Boolean).map((k) => /[가-힣]/.test(k)
      ? { ko: norm(k) }
      : { en: new RegExp(`(^|[^a-z0-9])${reEsc(k.toLowerCase())}($|[^a-z0-9])`) }).filter((k) => (k.ko ? k.ko.length >= 2 : k.en)) }));
  }
  const termText = (x) => norm(`${x.ko} ${x.en} ${(x.alias || []).join(" ")}`);
  function topicsForTerm(x) {
    const en = String(x.en || "").toLowerCase();
    const heads = [x.ko, ...(x.alias || [])].flatMap((s) => String(s).split("/")).map((s) => norm(s.replace(/\([^)]*\)/g, "")));
    const koAll = norm(`${x.ko} ${(x.alias || []).join(" ")}`);
    const hit = (k) => (k.en ? k.en.test(en) : k.ko.length >= 4 ? koAll.includes(k.ko) : heads.includes(k.ko));
    return topicKeys.filter(({ keys }) => keys.some(hit)).map(({ t }) => t)
      .sort((a, b) => Number(koAll.includes(norm(b.name))) - Number(koAll.includes(norm(a.name)))).slice(0, 2);
  }
  const termsFor = (t) => allTerms().filter((x) => x._topics.includes(t));
  function visibleTerms() {
    if (!gloss) return [];
    const q = norm(st.q);
    return gloss.sections.filter((s) => st.shelf === "all" || glShelf(s.name) === st.shelf)
      .map((s) => ({ s, terms: s.terms.filter((x) => !q || termText(x).includes(q)) }))
      .filter((v) => v.terms.length);
  }
  function renderGlossary(list) {
    const n = list.reduce((a, v) => a + v.terms.length, 0);
    $("#gl-count").textContent = n ? `용어 ${n}개${st.q ? ` · ‘${st.q}’ 검색` : ""}` : "";
    $("#gl-index").innerHTML = list.length ? `<div class="lib-ix"><p>분류</p><ul>${list.map((v) => `<li><a href="#gl-${esc(v.s.key)}" data-gl-jump="gl-${esc(v.s.key)}">${esc(v.s.name)}<span>${v.terms.length}</span></a></li>`).join("")}</ul></div>` : "";
    if (!list.length) {
      $("#gl-body").innerHTML = `<div class="lib-empty"><p><b>‘${esc(st.q)}’와 맞는 용어가 없습니다.</b> 영어 원어나 다른 표기로도 찾을 수 있습니다.</p><p><button type="button" class="btn ghost sm" data-lib-reset>조건 모두 지우기</button></p></div>`;
      return;
    }
    $("#gl-body").innerHTML = list.map((v) => {
      const sh = glShelf(v.s.name);
      return `<section class="gl-sec" aria-labelledby="gl-${esc(v.s.key)}"><h2 class="lib-shelf s-${sh}" id="gl-${esc(v.s.key)}" tabindex="-1">${esc(v.s.name)}<span>${v.terms.length}개</span></h2>
      <dl class="gl-list">${v.terms.map((x) => {
        const ch = (x.chapters || []).slice(0, 3).map((c) => `<a class="gl-ch" href="${BOOK}${esc(c.slug)}.html" title="${esc(c.title)}" data-event="library_click" data-event-params='${esc(JSON.stringify({ topic: "glossary", kind: "read", repo: "Causal-Inference-with-Python", target: "term_chapter" }))}'><b>${esc(c.num)}</b> ${esc(c.title)}</a>`).join("");
        const tp = x._topics.map((t) => `<a class="gl-tp s-${esc(t.shelf)}" href="#${esc(t.id)}" data-goto-topic="${esc(t.id)}">${esc(t.name)}</a>`).join("");
        return `<div class="gl-row s-${sh}" id="${esc(x.id)}" tabindex="-1">
          <dt><a class="gl-ko" href="${BOOK}glossary.html#${encodeURIComponent(x.id)}" title="웹북 용어집에서 보기">${esc(x.ko)}</a>${(x.alias || []).length ? `<span class="gl-alias">다른 표기: ${esc(x.alias.join(", "))}</span>` : ""}</dt>
          <dd class="gl-en" lang="en">${esc(x.en)}</dd>
          <dd class="gl-links">${ch}${tp}${!ch && !tp ? '<span class="gl-none">웹북 밖의 용어</span>' : ""}</dd>
        </div>`;
      }).join("")}</dl></section>`;
    }).join("");
  }

  /* ---------- page ---------- */
  function render() {
    const topics = visibleTopics(), terms = visibleTerms();
    $("#n-topics").textContent = topics.reduce((a, v) => a + v.n, 0);
    $("#n-glossary").textContent = terms.reduce((a, v) => a + v.terms.length, 0);
    const g = st.view === "glossary";
    $("#tab-topics").setAttribute("aria-selected", String(!g)); $("#tab-topics").tabIndex = g ? -1 : 0;
    $("#tab-glossary").setAttribute("aria-selected", String(g)); $("#tab-glossary").tabIndex = g ? 0 : -1;
    $("#panel-topics").hidden = g; $("#panel-glossary").hidden = !g;
    if (g) renderGlossary(terms); else renderTopics(topics);
  }

  function controls() {
    const n = (id) => data.topics.filter((t) => id === "all" || t.shelf === id).length;
    $("#lib-shelves").innerHTML = [{ id: "all", name: "전체" }, ...data.shelves].map((s) =>
      `<button type="button" role="radio" class="lib-sh s-${esc(s.id)}" data-shelf="${esc(s.id)}" aria-checked="${st.shelf === s.id}" tabindex="${st.shelf === s.id ? 0 : -1}">${esc(s.name)}<span>${n(s.id)}</span></button>`).join("");
    $("#lib-q").value = st.q;
  }

  function go(id, smooth) {
    const el = id && document.getElementById(id);
    if (!el || !(el.classList.contains("lib-topic") || el.classList.contains("gl-row") || el.classList.contains("lib-shelf"))) return false;
    el.scrollIntoView({ behavior: smooth && !reduced() ? "smooth" : "auto", block: "start" });
    if (el.tabIndex === -1) el.focus({ preventScroll: true });
    el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit");
    return true;
  }
  function setView(v) { st.view = v; toURL(); render(); }
  /* open a topic or a term even when the current filters hide it */
  /* a jump the reader clicked (a term from a topic, a topic from a term) gets its own history entry,
     so the back button returns to where they were */
  function reveal(id, push) {
    const before = location.href;
    st.view = /^term-/.test(id) && gloss ? "glossary" : "topics";
    render();
    if (!document.getElementById(id)) { st.q = ""; st.shelf = "all"; st.kinds.clear(); st.src = ""; controls(); render(); }
    toURL();
    const url = `${location.pathname}${location.search}#${encodeURIComponent(id)}`;
    if (push) { history.replaceState(history.state, "", before); history.pushState(null, "", url); }
    else history.replaceState(history.state, "", url);
    requestAnimationFrame(() => go(id, true));
  }

  let searchTimer = 0;
  function onSearch() {
    st.q = $("#lib-q").value.trim().slice(0, 60);
    st.open.clear();
    /* stay on the tab the reader is on, unless it has nothing and the other one has something */
    if (st.q) {
      const nt = visibleTopics().length, ng = visibleTerms().length;
      if (st.view === "topics" && !nt && ng) st.view = "glossary";
      else if (st.view === "glossary" && !ng && nt) st.view = "topics";
    }
    toURL(); render();
    clearTimeout(searchTimer);
    /* what people look for and whether it was there: the gaps to fill next */
    if (st.q) searchTimer = setTimeout(() => track("search", { search_term: st.q, results: visibleTopics().length, terms: visibleTerms().reduce((a, v) => a + v.terms.length, 0), page: "library" }), 1200);
  }

  function bind() {
    $("#lib-form").addEventListener("submit", (e) => { e.preventDefault(); onSearch(); const first = document.querySelector(st.view === "glossary" ? "#gl-body .gl-row" : "#lib-topics .lib-topic"); if (first) go(first.id, true); });
    $("#lib-q").addEventListener("input", onSearch);
    $("#lib-shelves").addEventListener("click", (e) => {
      const b = e.target.closest("[data-shelf]"); if (!b) return;
      st.shelf = b.dataset.shelf; controls(); toURL(); render();
      track("library_filter", { filter: "shelf", value: st.shelf });
    });
    const arrows = (sel, attr) => (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const bs = [...document.querySelectorAll(sel)].filter((b) => !b.hidden), i = bs.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const nb = bs[(i + (e.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length];
      const key = nb.getAttribute(attr);
      nb.click(); (document.querySelector(`${sel}[${attr}="${key}"]`) || nb).focus();
    };
    $("#lib-shelves").addEventListener("keydown", arrows("#lib-shelves [data-shelf]", "data-shelf"));
    document.querySelector(".lib-tabs").addEventListener("keydown", arrows(".lib-tabs [role=tab]", "id"));
    $("#tab-topics").addEventListener("click", () => { if (st.view !== "topics") { setView("topics"); track("library_view", { view: "topics", source: "tab" }); } });
    $("#tab-glossary").addEventListener("click", () => { if (st.view !== "glossary") { setView("glossary"); track("library_view", { view: "glossary", source: "tab" }); } });
    document.addEventListener("click", (e) => {
      const o = e.target.closest("[data-lib-open]");
      if (o) { st.open.add(o.dataset.libOpen); render(); go(o.dataset.libOpen); return; }
      const tr = e.target.closest("[data-lib-try]");
      if (tr) { $("#lib-q").value = tr.dataset.libTry; onSearch(); return; }
      const v = e.target.closest("[data-view]");
      if (v) { setView(v.dataset.view); $(".lib-tabs").scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" }); track("library_view", { view: v.dataset.view, source: "button" }); return; }
      if (e.target.closest("[data-lib-reset]")) { st.q = ""; st.shelf = "all"; st.kinds.clear(); st.src = ""; st.open.clear(); controls(); toURL(); render(); return; }
      const term = e.target.closest("[data-term]");
      if (term) { e.preventDefault(); reveal(term.dataset.term, true); track("library_term", { term: term.dataset.term, source: term.closest(".lib-topic") ? "topic" : "start" }); return; }
      const tp = e.target.closest("[data-goto-topic]");
      if (tp) { e.preventDefault(); reveal(tp.dataset.gotoTopic, true); track("library_topic", { topic: tp.dataset.gotoTopic, source: tp.closest(".gl-row") ? "glossary" : "start" }); return; }
      const gj = e.target.closest("[data-gl-jump]");
      if (gj) { e.preventDefault(); go(gj.dataset.glJump, true); return; }
      const a = e.target.closest('#lib-index a[href^="#"]');
      if (a) { e.preventDefault(); const id = a.getAttribute("href").slice(1); history.replaceState(history.state, "", `#${id}`); go(id, true); track("library_topic", { topic: id, source: "index" }); }
    });
    addEventListener("hashchange", () => { const id = decodeURIComponent(location.hash.slice(1)); if (id) reveal(id); });
    addEventListener("popstate", () => {
      fromURL(); st.open.clear(); controls(); render();
      const id = decodeURIComponent(location.hash.slice(1));
      if (id) requestAnimationFrame(() => go(id, false));
    });
  }

  async function init() {
    try { const r = JSON.parse(localStorage.getItem("cil-book-read") || "{}"); read = r && typeof r === "object" ? r : {}; } catch (e) { read = {}; }
    const get = (p) => fetch(p).then((x) => { if (!x.ok) throw new Error(p); return x.json(); });
    try {
      const [t, r, g, posts] = await Promise.all([get("data/topics.json"), get("data/repos.json").catch(() => []), get("data/glossary.json").catch(() => null), get("data/articles.json").catch(() => [])]);
      data = t; repos = new Map((r || []).map((x) => [x.repo, x]));
      gloss = g && Array.isArray(g.sections) && g.sections.length ? g : null;
      if (gloss) gloss.sections.forEach((s, i) => { s.key = String(i + 1); s.terms = (s.terms || []).filter((x) => x && x.ko && /^term-/.test(x.id || "")); });
      /* hub posts tagged with topics join their topic on the day they are published (Korean time) */
      const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      (posts || []).filter((a) => String(a.date || "") <= today && Array.isArray(a.topics)).sort((a, b) => (a.series === b.series ? (a.episode || 0) - (b.episode || 0) : 0)).forEach((a) => {
        const url = a.url && /^https:\/\//.test(a.url) ? a.url : `article.html#${encodeURIComponent(a.slug)}`;
        a.topics.forEach((id) => { const tp = data.topics.find((x) => x.id === id); if (tp) tp.items.push({ kind: "post", repo: "hub", title: a.series && a.episode ? `${a.episode}편: ${a.title}` : a.title, url, by: a.author }); });
      });
    } catch (e) {
      $("#lib-topics").innerHTML = '<p class="lib-empty">자료 목록을 불러오지 못했습니다. 새로고침해 주세요.</p>';
      return;
    }
    indexKeys();
    allTerms().forEach((x) => { x._topics = topicsForTerm(x); });
    if (!gloss) $("#tab-glossary").hidden = true;
    fromURL(); controls(); render(); bind();
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && (data.topics.some((t) => t.id === id) || (/^term-/.test(id) && gloss))) {
      reveal(id);
      const isTerm = /^term-/.test(id);
      track(isTerm ? "library_term" : "library_topic", { [isTerm ? "term" : "topic"]: id, source: "link" });
    }
  }
  init();
})();
