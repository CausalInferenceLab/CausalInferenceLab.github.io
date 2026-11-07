/* Library: causal inference and online experiment topics, each with deep links into the team's
   web book, Causal Studio, the practitioner lectures, book code, study slides and case lists.
   Data: data/topics.json (shelves, kinds, topics) and data/repos.json (source names).
   State lives in the address: ?q= search, ?shelf= causal|exp, ?kind= video,read,... and #topic. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const track = (n, p) => window.hubTrack && window.hubTrack(n, p);
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s·\-_/()]/g, "");
  const KIND_ORDER = ["video", "read", "code", "slides", "case", "post"];
  const SRC = {
    "Causal-Inference-with-Python": "Brave & True 웹북", "causal-studio": "Causal Studio", "causal-inference-lecture": "실무자 특강",
    "causal-inference-in-python-code": "책 예제 코드", "OCE-Materials": "온라인 실험 스터디", "causal-inference-practice": "산업 사례 템플릿",
    "awesome-causal-inference-python": "메서드 코드북", "Experimentation-platform-materials": "실험 플랫폼 자료", hub: "허브 연재"
  };
  let data = null, repos = new Map(), read = {};
  const st = { q: "", shelf: "all", kinds: new Set(), open: new Set() };

  const srcName = (id) => SRC[id] || (repos.get(id) && repos.get(id).title) || id;
  const bookSlug = (url) => { const m = /\/Causal-Inference-with-Python\/([A-Za-z0-9-]+)\.html$/.exec(url || ""); return m ? m[1] : null; };

  function fromURL() {
    const p = new URLSearchParams(location.search);
    st.q = (p.get("q") || "").slice(0, 60);
    st.shelf = ["causal", "exp"].includes(p.get("shelf")) ? p.get("shelf") : "all";
    st.kinds = new Set((p.get("kind") || "").split(",").filter((k) => KIND_ORDER.includes(k)));
  }
  function toURL() {
    const p = new URLSearchParams();
    if (st.q) p.set("q", st.q);
    if (st.shelf !== "all") p.set("shelf", st.shelf);
    if (st.kinds.size) p.set("kind", [...st.kinds].join(","));
    const s = p.toString();
    history.replaceState(history.state, "", `${location.pathname}${s ? `?${s}` : ""}${location.hash}`);
  }

  /* which topics and items survive the shelf, kind and search filters */
  function visible() {
    const q = norm(st.q);
    return data.topics.filter((t) => st.shelf === "all" || t.shelf === st.shelf).map((t) => {
      let items = t.items.filter((x) => !st.kinds.size || st.kinds.has(x.kind));
      let partial = false;
      if (q) {
        const head = [t.name, t.en, t.about, ...(t.keys || [])].some((s) => norm(s).includes(q));
        if (!head) {
          const hit = items.filter((x) => norm(`${x.title} ${srcName(x.repo)} ${x.by || ""}`).includes(q));
          partial = hit.length > 0 && hit.length < items.length;
          items = st.open.has(t.id) ? items : hit;
          if (!hit.length) items = [];
        }
      }
      return { t, items, partial: partial && !st.open.has(t.id), total: t.items.filter((x) => !st.kinds.size || st.kinds.has(x.kind)).length };
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

  function render() {
    const list = visible();
    const shelves = data.shelves.map((s) => ({ ...s, n: data.topics.filter((t) => t.shelf === s.id).length }));
    const nItems = list.reduce((a, v) => a + v.items.length, 0);
    $("#lib-count").textContent = list.length
      ? `주제 ${list.length}개 · 자료 ${nItems}개${st.q ? ` · ‘${st.q}’ 검색 결과` : ""}`
      : "";
    $("#lib-index").innerHTML = shelves.filter((s) => st.shelf === "all" || s.id === st.shelf).map((s) => {
      const ts = list.filter((v) => v.t.shelf === s.id);
      return ts.length ? `<div class="lib-ix s-${esc(s.id)}"><p>${esc(s.name)}</p><ul>${ts.map((v) => `<li><a href="#${esc(v.t.id)}">${esc(v.t.name)}<span>${v.items.length}</span></a></li>`).join("")}</ul></div>` : "";
    }).join("");
    if (!list.length) {
      const sug = ["이중차분", "성향점수", "A/B", "SRM", "메타러너"].map((w) => `<button type="button" class="chip" data-lib-try="${esc(w)}">${esc(w)}</button>`).join("");
      $("#lib-topics").innerHTML = `<div class="lib-empty"><p><b>${st.q ? `‘${esc(st.q)}’와 맞는 자료가 없습니다.` : "고른 조건에 맞는 자료가 없습니다."}</b> 다른 말로 찾거나 조건을 풀어 보세요.</p><p class="lib-try">${sug}</p><p><button type="button" class="btn ghost sm" data-lib-reset>조건 모두 지우기</button></p></div>`;
      return;
    }
    let lastShelf = null;
    $("#lib-topics").innerHTML = list.map((v) => {
      const t = v.t, s = data.shelves.find((x) => x.id === t.shelf);
      const head = t.shelf !== lastShelf && st.shelf === "all" ? `<h2 class="lib-shelf s-${esc(t.shelf)}">${esc(s.name)}<span>${esc(s.about)}</span></h2>` : "";
      lastShelf = t.shelf;
      return `${head}<article class="lib-topic s-${esc(t.shelf)}" id="${esc(t.id)}" tabindex="-1" aria-labelledby="t-${esc(t.id)}">
        <header><h3 id="t-${esc(t.id)}">${esc(t.name)}</h3><span class="lib-en" lang="en">${esc(t.en)}</span>
          <button type="button" class="lib-link" data-copy="${esc(`https://causalinferencelab.github.io/library.html#${t.id}`)}" data-share="library_topic" aria-label="${esc(t.name)} 링크 복사">링크 복사</button></header>
        <p class="lib-about">${esc(t.about)}</p>
        <ol class="lib-items">${v.items.map((x) => itemHTML(x, t)).join("")}</ol>
        ${v.partial ? `<button type="button" class="lib-all" data-lib-open="${esc(t.id)}">이 주제 자료 ${v.total}개 모두 보기</button>` : ""}
      </article>`;
    }).join("");
  }

  function controls() {
    const n = (id) => data.topics.filter((t) => id === "all" || t.shelf === id).length;
    $("#lib-shelves").innerHTML = [{ id: "all", name: "전체" }, ...data.shelves].map((s) =>
      `<button type="button" role="radio" class="lib-sh s-${esc(s.id)}" data-shelf="${esc(s.id)}" aria-checked="${st.shelf === s.id}" tabindex="${st.shelf === s.id ? 0 : -1}">${esc(s.name)}<span>${n(s.id)}</span></button>`).join("");
    $("#lib-kinds").innerHTML = KIND_ORDER.filter((k) => data.kinds[k] && data.topics.some((t) => t.items.some((x) => x.kind === k))).map((k) =>
      `<button type="button" class="chip lib-k k-${k}" data-kind="${k}" aria-pressed="${st.kinds.has(k)}">${esc(data.kinds[k])}</button>`).join("");
    $("#lib-q").value = st.q;
  }

  function go(id, smooth) {
    const el = id && document.getElementById(id);
    if (!el || !el.classList.contains("lib-topic")) return false;
    el.scrollIntoView({ behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto", block: "start" });
    el.focus({ preventScroll: true });
    el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit");
    return true;
  }

  let searchTimer = 0;
  function onSearch() {
    st.q = $("#lib-q").value.trim().slice(0, 60);
    st.open.clear();
    toURL(); render();
    clearTimeout(searchTimer);
    /* what people look for and whether it was there: the gaps to fill next */
    if (st.q) searchTimer = setTimeout(() => track("search", { search_term: st.q, results: visible().length, page: "library" }), 1200);
  }

  function bind() {
    $("#lib-form").addEventListener("submit", (e) => { e.preventDefault(); onSearch(); const first = $("#lib-topics .lib-topic"); if (first) go(first.id, true); });
    $("#lib-q").addEventListener("input", onSearch);
    $("#lib-shelves").addEventListener("click", (e) => {
      const b = e.target.closest("[data-shelf]"); if (!b) return;
      st.shelf = b.dataset.shelf; controls(); toURL(); render();
      track("library_filter", { filter: "shelf", value: st.shelf });
    });
    $("#lib-shelves").addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const bs = [...document.querySelectorAll("#lib-shelves [data-shelf]")], i = bs.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const nb = bs[(i + (e.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length];
      nb.click(); document.querySelector(`#lib-shelves [data-shelf="${nb.dataset.shelf}"]`).focus();
    });
    $("#lib-kinds").addEventListener("click", (e) => {
      const b = e.target.closest("[data-kind]"); if (!b) return;
      const k = b.dataset.kind;
      st.kinds.has(k) ? st.kinds.delete(k) : st.kinds.add(k);
      b.setAttribute("aria-pressed", String(st.kinds.has(k)));
      toURL(); render();
      track("library_filter", { filter: "kind", value: [...st.kinds].join(",") || "all" });
    });
    document.addEventListener("click", (e) => {
      const o = e.target.closest("[data-lib-open]");
      if (o) { st.open.add(o.dataset.libOpen); render(); go(o.dataset.libOpen); return; }
      const tr = e.target.closest("[data-lib-try]");
      if (tr) { $("#lib-q").value = tr.dataset.libTry; onSearch(); return; }
      if (e.target.closest("[data-lib-reset]")) { st.q = ""; st.shelf = "all"; st.kinds.clear(); st.open.clear(); controls(); toURL(); render(); return; }
      const a = e.target.closest('#lib-index a[href^="#"]');
      if (a) { e.preventDefault(); const id = a.getAttribute("href").slice(1); history.replaceState(history.state, "", `#${id}`); go(id, true); track("library_topic", { topic: id, source: "index" }); }
    });
    addEventListener("hashchange", () => go(location.hash.slice(1), true));
  }

  async function init() {
    try { const r = JSON.parse(localStorage.getItem("cil-book-read") || "{}"); read = r && typeof r === "object" ? r : {}; } catch (e) { read = {}; }
    try {
      const [t, r] = await Promise.all([fetch("data/topics.json").then((x) => x.json()), fetch("data/repos.json").then((x) => x.json()).catch(() => [])]);
      data = t; repos = new Map((r || []).map((x) => [x.repo, x]));
      /* hub posts tagged with topics join their topic on the day they are published (Korean time) */
      const posts = await fetch("data/articles.json").then((x) => x.json()).catch(() => []);
      const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      (posts || []).filter((a) => String(a.date || "") <= today && Array.isArray(a.topics)).sort((a, b) => (a.series === b.series ? (a.episode || 0) - (b.episode || 0) : 0)).forEach((a) => {
        const url = a.url && /^https:\/\//.test(a.url) ? a.url : `article.html#${encodeURIComponent(a.slug)}`;
        a.topics.forEach((id) => { const tp = data.topics.find((x) => x.id === id); if (tp) tp.items.push({ kind: "post", repo: "hub", title: a.series && a.episode ? `${a.episode}편: ${a.title}` : a.title, url, by: a.author }); });
      });
    } catch (e) {
      $("#lib-topics").innerHTML = '<p class="lib-empty">자료 목록을 불러오지 못했습니다. 새로고침해 주세요.</p>';
      return;
    }
    fromURL(); controls(); render(); bind();
    const id = location.hash.slice(1);
    if (id && data.topics.some((t) => t.id === id)) {
      /* a shared topic link opens on that topic even when the filters in the link would hide it */
      if (!document.getElementById(id)) { st.q = ""; st.shelf = "all"; st.kinds.clear(); controls(); toURL(); render(); }
      requestAnimationFrame(() => go(id));
      track("library_topic", { topic: id, source: "link" });
    }
  }
  init();
})();
