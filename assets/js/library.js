/* 자료실: causal inference and online experiment topics with deep links into the team's web book,
   Causal Studio, the practitioner lectures, book code, study slides and case lists, plus the web
   book's glossary. Data: data/topics.json, data/glossary.json (scripts/build_glossary.py), data/pseudo.json
   (one-line meanings), data/term_links.json (team materials per term, scripts/build_term_links.py),
   data/repos.json (source names, and the team's projects a search can name) and data/articles.json (posts tagged with topics).
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
  const FIRST_EACH = 2;
  /* a topic lists its videos together and its other materials (writing, code, slides) together */
  const isVideo = (x) => x.kind === "video";
  function groupsHTML(items, t) {
    const vids = items.filter(isVideo), docs = items.filter((x) => !isVideo(x));
    const pool = t.items.filter(itemOk);
    const count = (list, all) => (st.q ? list.length : all);
    const group = (name, cls, list, all) => (list.length ? `<p class="lib-group">${name}<span>${count(list, all)}</span></p><ol class="lib-items ${cls}">${list.map((x) => itemHTML(x, t)).join("")}</ol>` : "");
    return group("영상", "is-video", vids, pool.filter(isVideo).length) + group("자료", "is-doc", docs, pool.filter((x) => !isVideo(x)).length);
  }
  /* the sources in the order a newcomer meets them, with what each one is */
  const SOURCES = [
    ["causal-studio", "Causal Studio", "짧은 입문 영상과 노트북"],
    ["Causal-Inference-with-Python", "Brave & True 웹북", "원서 25장과 부록을 옮긴 웹북"],
    ["causal-inference-lecture", "실무자 특강", "책 장마다 현업 사례 강의"],
    ["causal-inference-in-python-code", "책 예제 코드", "『실무로 통하는 인과추론』 장별 코드"],
    ["OCE-Materials", "온라인 실험 스터디", "온라인 통제 실험 스터디 발표"],
    ["Experimentation-platform-materials", "실험 플랫폼 자료", "국내외 실험 플랫폼 사례 모음"],
    ["causal-inference-practice", "산업 사례 템플릿", "기법별 산업 사례 발표"],
    ["awesome-causal-inference-python", "메서드 코드북", "주제별 파이썬 코드"],
    ["Smart_Causal_Inference", "책 스터디 노트", "『실무로 통하는 인과추론』 장별 정리"],
    ["causal-inference-with-causalML", "CausalML 스터디", "책 이론을 causalml 코드로"],
    ["Marketing_Science", "Marketing Science", "마케팅 데이터와 베이지안 스터디 발표"]
  ];
  const SRC_NAME = Object.fromEntries(SOURCES.map(([id, name]) => [id, name]));
  /* each material's curriculum level, so a newcomer can tell an intro from a research paper */
  const LV_NAME = { L0: "입문", L1: "개념", L2: "실전", L3: "도구", L4: "연구" };
  const LV_FULL = { L0: "입문", L1: "개념 완성", L2: "실전 적용", L3: "도구 개발", L4: "연구" };
  const LV_PICK = [["all", "전체"], ["L0", "L0 입문"], ["L1", "L1 개념"], ["L2", "L2 실전"], ["L3", "L3–4 도구·연구"]];
  SRC_NAME.hub = "허브 연재";
  /* the glossary's "온라인 실험" section is the experiments shelf; every other section is causal inference */
  const glShelf = (name) => (/실험/.test(name) ? "exp" : "causal");
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* 와/과 after a word: 과 when its last Korean syllable ends in a consonant */
  const wa = (w) => { const c = String(w).trim().slice(-1).charCodeAt(0) - 0xac00; return c >= 0 && c <= 11171 && c % 28 ? "과" : "와"; };
  const askPseudo = (q) => `<button type="button" class="btn ghost sm" data-helper-ask="${esc(q)} 알려 주세요">Pseudo에게 물어보기</button>`;

  let data = null, gloss = null, repos = new Map(), read = {}, opened = new Set(), defs = {}, teamLinks = {};
  const st = { q: "", shelf: "all", kinds: new Set(), src: "", lv: "all", view: "topics", open: new Set() };

  const srcName = (id) => SRC_NAME[id] || (repos.get(id) && repos.get(id).title) || id;
  /* the web book's second part (chapters 17–25) and its appendices are Level 2, as in the curriculum */
  function levelOf(x) {
    if (x.repo === "Causal-Inference-with-Python") { const m = /\/(\d+)-[^/]*\.html$/.exec(x.url || ""); return m && Number(m[1]) < 17 ? "L1" : "L2"; }
    const r = repos.get(x.repo);
    return r && /^L[0-4]$/.test(r.level || "") ? r.level : null;
  }
  const lvOk = (x) => st.lv === "all" || (st.lv === "L3" ? ["L3", "L4"].includes(levelOf(x)) : levelOf(x) === st.lv);
  const bookSlug = (url) => { const m = /\/Causal-Inference-with-Python\/([A-Za-z0-9-]+)\.html$/.exec(url || ""); return m ? m[1] : null; };
  const shelfOf = (id) => data.shelves.find((s) => s.id === id);
  const allTerms = () => (gloss ? gloss.sections.flatMap((s) => s.terms) : []);

  function fromURL() {
    const p = new URLSearchParams(location.search);
    st.q = (p.get("q") || "").slice(0, 60);
    st.shelf = ["causal", "exp"].includes(p.get("shelf")) ? p.get("shelf") : "all";
    st.kinds = new Set((p.get("kind") || "").split(",").filter((k) => KIND_ORDER.includes(k)));
    st.src = SRC_NAME[p.get("src")] ? p.get("src") : "";
    st.lv = LV_PICK.some(([v]) => v === p.get("lv")) ? p.get("lv") : "all";
    st.view = gloss && (p.get("view") === "glossary" || /^#term-/.test(decodeURIComponent(location.hash))) ? "glossary" : "topics";
  }
  function toURL() {
    const p = new URLSearchParams();
    if (st.q) p.set("q", st.q);
    if (st.shelf !== "all") p.set("shelf", st.shelf);
    if (st.kinds.size) p.set("kind", [...st.kinds].join(","));
    if (st.src) p.set("src", st.src);
    if (st.lv !== "all") p.set("lv", st.lv);
    if (st.view === "glossary") p.set("view", "glossary");
    const s = p.toString();
    history.replaceState(history.state, "", `${location.pathname}${s ? `?${s}` : ""}${location.hash}`);
  }

  /* ---------- search ---------- */
  /* A search first looks for the whole phrase. When nothing has it, each word counts on its own
     ("성향점수 매칭 예제"), a particle at the end is let go ("도구변수란" → 도구변수), a longer word still finds
     its topic ("교란변수" → 교란), and words like 예제·영상 pick the kind of material instead. Words such as
     효과·분석 only count when nothing more specific was typed. */
  const WANT = { code: ["예제", "코드", "구현", "실습", "파이썬", "python", "노트북", "notebook"], video: ["영상", "강의", "유튜브"], read: ["웹북", "책", "글"], slides: ["발표", "슬라이드"], case: ["사례"] };
  const GENERIC = new Set(["효과", "분석", "방법", "데이터", "실험", "모델", "추정", "개념", "정리", "이해", "원인", "차이", "문제", "기법", "공부", "자료"]);
  const ENDING = /(이란|란|은|는|을|를|의|에서|으로|로|이|가|과|와)$/;
  const hasKo = (s) => /[가-힣]/.test(s);
  let looseUsed = false;
  function parseQuery(raw) {
    const words = String(raw || "").split(/\s+/).map(norm).filter((w) => w.length >= 2);
    const kinds = new Set(), kindWords = [], forms = [];
    words.forEach((w) => {
      const k = Object.keys(WANT).find((kk) => WANT[kk].includes(w));
      if (k) { kinds.add(k); kindWords.push(w); return; }
      const cut = hasKo(w) ? w.replace(ENDING, "") : w;
      forms.push(cut.length >= 2 && cut !== w ? [w, cut] : [w]);
    });
    const specific = forms.filter((f) => !GENERIC.has(f[f.length - 1]));
    return { forms: specific.length ? specific : forms, kinds, kindWords };
  }
  const anyForm = (fs, text) => fs.some((f) => text.includes(f));

  /* ---------- topics ---------- */
  const itemOk = (x) => (!st.kinds.size || st.kinds.has(x.kind)) && (!st.src || x.repo === st.src) && lvOk(x);
  function visibleTopics() {
    const strict = phraseTopics();
    looseUsed = false;
    if (!st.q || strict.length) return strict;
    const loose = wordTopics();
    looseUsed = loose.length > 0;
    return loose;
  }
  const itemText = (x) => norm(`${x.title} ${srcName(x.repo)} ${x.by || ""}`);
  function wordTopics() {
    const pq = parseQuery(st.q);
    if (!pq.forms.length && !pq.kinds.size) return [];
    const scored = data.topics.filter((t) => st.shelf === "all" || t.shelf === st.shelf).map((t) => {
      const pool = t.items.filter(itemOk);
      const head = [t.name, t.en, t.about, ...(t.keys || [])].map(norm);
      const keysKo = [t.name, ...(t.keys || [])].map(norm).filter((k) => k.length >= 2 && hasKo(k));
      const headHits = pq.forms.filter((fs) => fs.some((f) => head.some((h) => h.includes(f)) || keysKo.some((k) => f.includes(k)))).length;
      const hits = (x) => pq.forms.filter((fs) => anyForm(fs, itemText(x))).length;
      let items = pq.forms.length && !headHits ? pool.filter((x) => hits(x) > 0) : pool;
      if (pq.kinds.size && !st.kinds.size) {
        const want = items.filter((x) => pq.kinds.has(x.kind) || pq.kindWords.some((w) => itemText(x).includes(w)));
        items = want.length || !pq.forms.length ? want : items;
      }
      const score = pq.forms.length ? headHits * 2 + Math.max(0, ...items.map(hits)) : items.length ? 1 : 0;
      return { t, items, total: pool.length, score };
    }).filter((v) => v.items.length && v.score > 0);
    const top = Math.max(0, ...scored.map((v) => v.score));
    return scored.filter((v) => v.score * 2 >= top).map((v) => ({ t: v.t, items: v.items, partial: false, total: v.total, n: v.items.length }));
  }
  function phraseTopics() {
    const q = norm(st.q);
    return data.topics.filter((t) => st.shelf === "all" || t.shelf === st.shelf).map((t) => {
      const pool = t.items.filter(itemOk);
      let items = pool, partial = false;
      if (q && pool.length) {
        const head = [t.name, t.en, t.about, ...(t.keys || [])].some((s) => norm(s).includes(q));
        if (!head) {
          const hit = pool.filter((x) => itemText(x).includes(q));
          partial = hit.length > 0 && hit.length < pool.length && !st.open.has(t.id);
          items = st.open.has(t.id) && hit.length ? pool : hit;
        }
      }
      /* two videos and two other materials per topic at first; the rest open on request, so a topic never
         reads as a wall of links */
      if (!q && !st.open.has(t.id)) {
        const vids = items.filter(isVideo), docs = items.filter((x) => !isVideo(x));
        const shown = [...vids.slice(0, FIRST_EACH), ...docs.slice(0, FIRST_EACH)];
        if (shown.length < items.length) { partial = true; items = shown; }
      }
      return { t, items, partial, total: pool.length, n: q ? items.length : pool.length };
    }).filter((v) => v.items.length);
  }

  /* the team's projects that a search names (CausalML 스터디, Lang2SQL, …): a hit in the name, the repository,
     its tags or search words always shows; one only in the summary shows when no topic has the search */
  const NOT_PROJECTS = new Set(["CausalInferenceLab.github.io", "Project-template", "python-causality-handbook"]);
  function visibleProjects(topicsFound) {
    if (!st.q || st.src) return [];
    const q = norm(st.q), pq = looseUsed || !topicsFound ? parseQuery(st.q) : null;
    const strong = (r) => [r.title, r.repo, ...(r.tags || []), ...(r.keys || []), ...(r.builders || [])].map(norm);
    const weak = (r) => [r.summary, r.format].map(norm);
    const has = (texts) => texts.some((t) => t.includes(q)) || (pq && pq.forms.length > 0 && pq.forms.every((fs) => texts.some((t) => anyForm(fs, t))));
    return [...repos.values()].filter((r) => !NOT_PROJECTS.has(r.repo) && r.status !== "depot")
      .filter((r) => has(strong(r)) || (!topicsFound && has([...strong(r), ...weak(r)]))).slice(0, 4);
  }
  function projectsHTML(list) {
    if (!list.length) return "";
    return `<section class="lib-pjs" aria-labelledby="lib-pjs-h"><h2 class="lib-pjs-h" id="lib-pjs-h">팀 프로젝트<span>저장소째 살펴보기</span></h2><ul>${list.map((r) => {
      const url = r.site ? (/^https?:/.test(r.site) ? r.site : `${window.hubSite}/${String(r.site).replace(/^\//, "")}`) : `https://github.com/CausalInferenceLab/${r.repo}`;
      const lv = /^L[0-4]$/.test(r.level || "") ? `<b class="lib-lv lv-${r.level}">${r.level} ${LV_NAME[r.level]}</b>` : "";
      return `<li class="lib-pj" id="pj-${esc(r.repo)}" tabindex="-1"><a href="${esc(url)}" target="_blank" rel="noopener" data-event="library_click" data-event-params='${esc(JSON.stringify({ topic: "project", kind: "project", repo: r.repo, target: "project" }))}'>
        <span class="lib-pj-t">${esc(r.title)}<span class="lib-out" aria-hidden="true"> ↗</span></span><span class="lib-pj-s">${esc(r.summary || "")}</span><span class="lib-src">${lv}${r.site ? "사이트" : "GitHub"} · ${esc(r.repo)}</span></a></li>`;
    }).join("")}</ul></section>`;
  }

  function itemHTML(x, t) {
    const kind = data.kinds[x.kind] || x.kind;
    const ev = (target) => `data-event="library_click" data-event-params='${esc(JSON.stringify({ topic: t.id, kind: x.kind, repo: x.repo, target }))}'`;
    const done = x.repo === "Causal-Inference-with-Python" && read[bookSlug(x.url)];
    const seen = !done && opened.has(x.url);
    const extra = [x.notebook && `<a href="${esc(x.notebook)}" ${ev("notebook")}>노트북</a>`, x.slides && `<a href="${esc(x.slides)}" target="_blank" rel="noopener" ${ev("slides")}>발표 자료</a>`].filter(Boolean).join("");
    const out = /^https?:\/\//.test(x.url) && !/^https:\/\/causalinferencelab\.github\.io\//.test(x.url);
    return `<li class="lib-item k-${esc(x.kind)}">
      <span class="lib-kind">${esc(kind)}</span>
      <span class="lib-main"><a href="${esc(x.url)}" data-opened${out ? ' target="_blank" rel="noopener"' : ""} ${ev("main")}>${esc(x.title)}${out ? '<span class="lib-out" aria-hidden="true"> ↗</span>' : ""}</a>
        <span class="lib-src">${(() => { const l = levelOf(x); return l ? `<b class="lib-lv lv-${l}" title="커리큘럼 Level ${l.slice(1)} · ${LV_FULL[l]}">${l} ${LV_NAME[l]}</b>` : ""; })()}${esc(srcName(x.repo))}${x.by ? ` · ${esc(x.by)}` : ""}${done ? ' · <b class="lib-done">읽음</b>' : ""}${seen ? ' · <b class="lib-done">열어봄</b>' : ""}${extra ? `<span class="lib-extra">${extra}</span>` : ""}</span></span>
    </li>`;
  }

  function renderTopics(list) {
    const nItems = list.reduce((a, v) => a + v.n, 0);
    const pjs = visibleProjects(list.length > 0);
    const filt = [st.lv !== "all" && LV_PICK.find(([v]) => v === st.lv)[1], st.src && srcName(st.src), st.kinds.size && [...st.kinds].map((k) => data.kinds[k]).join("·"), st.q && `‘${st.q}’ ${looseUsed ? "낱말별 검색" : "검색"}`].filter(Boolean).join(" · ");
    const counts = [pjs.length && `프로젝트 ${pjs.length}개`, list.length && `주제 ${list.length}개 · 자료 ${nItems}개`].filter(Boolean).join(" · ");
    $("#lib-count").innerHTML = counts ? `${counts}${filt ? ` · ${esc(filt)}` : ""}${st.src || st.kinds.size || st.lv !== "all" ? ' <button type="button" class="lib-clear" data-lib-reset>거르기 풀기</button>' : ""}` : "";
    const note = looseUsed ? `<p class="lib-note">‘${esc(st.q)}’ 전체와 맞는 자료가 없어, 낱말마다 찾은 결과입니다.</p>` : "";
    $("#lib-index").innerHTML = data.shelves.filter((s) => st.shelf === "all" || s.id === st.shelf).map((s) => {
      const ts = list.filter((v) => v.t.shelf === s.id);
      return ts.length ? `<div class="lib-ix s-${esc(s.id)}"><p>${esc(s.name)}</p><ul>${ts.map((v) => `<li><a href="#${esc(v.t.id)}">${esc(v.t.name)}<span>${v.n}</span></a></li>`).join("")}</ul></div>` : "";
    }).join("");
    if (!list.length && pjs.length) {
      $("#lib-topics").innerHTML = `${projectsHTML(pjs)}<div class="lib-empty"><p><b>‘${esc(st.q)}’${wa(st.q)} 맞는 주제별 자료는 아직 없습니다.</b> 위 프로젝트에서 시작해 보세요.</p><p>${askPseudo(st.q)}</p></div>`;
      return;
    }
    if (!list.length) {
      const terms = st.q ? visibleTerms().reduce((n, v) => n + v.terms.length, 0) : 0;
      const sug = ["이중차분", "성향점수", "A/B", "SRM", "메타러너"].map((w) => `<button type="button" class="chip" data-lib-try="${esc(w)}">${esc(w)}</button>`).join("");
      $("#lib-topics").innerHTML = `<div class="lib-empty"><p><b>${st.q ? `‘${esc(st.q)}’${wa(st.q)} 맞는 자료가 없습니다.` : "고른 조건에 맞는 자료가 없습니다."}</b> ${terms ? `용어집에는 ${terms}개가 있습니다.` : "다른 말로 찾거나 조건을 풀어 보세요."}</p>
        ${terms ? `<p><button type="button" class="btn sm" data-view="glossary">용어집에서 보기</button></p>` : `<p class="lib-try">${sug}</p>`}
        <p><button type="button" class="btn ghost sm" data-lib-reset>조건 모두 지우기</button>${st.q ? ` ${askPseudo(st.q)}` : ""}</p></div>`;
      return;
    }
    let lastShelf = null;
    $("#lib-topics").innerHTML = note + projectsHTML(pjs) + list.map((v) => {
      const t = v.t, s = shelfOf(t.shelf);
      const head = t.shelf !== lastShelf && st.shelf === "all" ? `<h2 class="lib-shelf s-${esc(t.shelf)}">${esc(s.name)}<span>${esc(s.about)}</span></h2>` : "";
      lastShelf = t.shelf;
      const terms = termsFor(t).slice(0, 3);
      return `${head}<article class="lib-topic s-${esc(t.shelf)}" id="${esc(t.id)}" tabindex="-1" aria-labelledby="t-${esc(t.id)}">
        <header><h3 id="t-${esc(t.id)}">${esc(t.name)}</h3><span class="lib-en" lang="en">${esc(t.en)}</span>
          <button type="button" class="lib-link" data-copy="${esc(`${window.hubSite}/library.html#${t.id}`)}" data-share="library_topic" aria-label="${esc(t.name)} 링크 복사">링크 복사</button></header>
        <p class="lib-about">${esc(t.about)}</p>
        ${terms.length ? `<p class="lib-terms"><span>먼저 알아 둘 용어</span>${terms.map((x) => `<a href="#${esc(x.id)}" data-term="${esc(x.id)}">${esc(x.ko)}</a>`).join("")}</p>` : ""}
        ${groupsHTML(v.items, t)}
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
    const pick = (ok) => gloss.sections.filter((s) => st.shelf === "all" || glShelf(s.name) === st.shelf)
      .map((s) => ({ s, terms: s.terms.filter((x) => !q || ok(termText(x))) }))
      .filter((v) => v.terms.length);
    const strict = pick((t) => t.includes(q));
    if (!q || strict.length) return strict;
    /* nothing has the whole phrase: a term that has one of its words */
    const pq = parseQuery(st.q);
    return pq.forms.length ? pick((t) => pq.forms.some((fs) => anyForm(fs, t))) : [];
  }
  /* Each term is a dictionary entry: the name, the English, and a one-line meaning (data/pseudo.json) in the
     list; opening it shows the full meaning, the web book chapters that use the term, the team's other
     materials that use it most (data/term_links.json: slides, Causal Studio, book code, study notes) and the
     library topics it belongs to. A link to #term-... opens that entry; a search with one or two hits opens them. */
  const TEAM_KIND = { slides: "발표 자료", code: "노트북", read: "글" };
  const glOpen = new Set();
  function termDetail(x) {
    const def = defs[x.id];
    const ch = (x.chapters || []).map((c) => `<li><a href="${BOOK}${esc(c.slug)}.html" data-event="library_click" data-event-params='${esc(JSON.stringify({ topic: "glossary", kind: "read", repo: "Causal-Inference-with-Python", target: "term_chapter" }))}'><b>${esc(c.num)}</b>${esc(c.title)}</a></li>`).join("");
    const team = (teamLinks[x.id] || []).map((d) => `<li><a href="${esc(d.url)}" target="_blank" rel="noopener" data-event="library_click" data-event-params='${esc(JSON.stringify({ topic: "glossary", kind: d.kind, repo: d.repo, target: "term_team" }))}'>
        <span class="gl-tk k-${esc(d.kind)}">${esc(TEAM_KIND[d.kind] || "자료")}</span><span class="gl-tt">${esc(d.title)}<span class="lib-out" aria-hidden="true"> ↗</span></span>
        <span class="gl-ts">${esc(srcName(d.repo))}${d.page ? ` · ${d.page}쪽` : ""}</span></a></li>`).join("");
    const tp = x._topics.map((t) => `<a class="gl-tp s-${esc(t.shelf)}" href="#${esc(t.id)}" data-goto-topic="${esc(t.id)}">${esc(t.name)}</a>`).join("");
    return `<div class="gl-detail">
      <p class="gl-def">${def ? esc(def) : "아직 풀이가 없습니다. Pseudo에게 물어보면 웹북과 팀 자료에서 찾아 드립니다."}</p>
      ${(x.alias || []).length ? `<p class="gl-alias">다른 표기 <span>${esc(x.alias.join(", "))}</span></p>` : ""}
      <div class="gl-where">
        <section class="gl-col"><h4>웹북에서 읽기</h4>${ch ? `<ul class="gl-chs">${ch}</ul>` : '<p class="gl-none">웹북 본문에는 나오지 않는 용어입니다.</p>'}</section>
        <section class="gl-col"><h4>팀 자료에서</h4>${team ? `<ul class="gl-team">${team}</ul>` : '<p class="gl-none">이 용어를 주로 다룬 팀 자료를 아직 찾지 못했습니다.</p>'}</section>
      </div>
      <p class="gl-acts">${tp ? `<span class="gl-tps"><span>자료실 주제</span>${tp}</span>` : ""}
        <span class="gl-btns"><button type="button" class="lib-link" data-copy="${esc(`${window.hubSite}/library.html#${x.id}`)}" data-share="library_term" aria-label="${esc(x.ko)} 링크 복사">링크 복사</button>
        <button type="button" class="lib-link" data-helper-ask="${esc(x.ko)} 알려 주세요">Pseudo에게 묻기</button>
        <a class="lib-link" href="${BOOK}glossary.html#${encodeURIComponent(x.id)}">웹북 용어집</a></span></p>
    </div>`;
  }
  function termRow(x, sh) {
    const open = glOpen.has(x.id), def = defs[x.id], nCh = (x.chapters || []).length, nTeam = (teamLinks[x.id] || []).length;
    return `<li class="gl-row s-${sh}${open ? " open" : ""}" id="${esc(x.id)}" tabindex="-1">
      <h3 class="gl-h"><button type="button" class="gl-btn" aria-expanded="${open}" aria-controls="${esc(x.id)}-d" data-gl-toggle="${esc(x.id)}">
        <span class="gl-name"><span class="gl-ko">${esc(x.ko)}</span><span class="gl-en" lang="en">${esc(x.en)}</span></span>
        <span class="gl-sum">${def ? esc(def) : ""}</span>
        <span class="gl-meta">${nCh ? `<span>웹북 ${nCh}</span>` : ""}${nTeam ? `<span>팀 자료 ${nTeam}</span>` : ""}</span>
        <span class="gl-chev" aria-hidden="true"></span>
      </button></h3>
      <div id="${esc(x.id)}-d" class="gl-d"${open ? "" : " hidden"}>${open ? termDetail(x) : ""}</div>
    </li>`;
  }
  function toggleTerm(id, force, source) {
    const row = document.getElementById(id);
    if (!row || !row.classList.contains("gl-row")) return;
    const open = force ?? !glOpen.has(id);
    if (open) glOpen.add(id); else glOpen.delete(id);
    const x = allTerms().find((t) => t.id === id);
    row.classList.toggle("open", open);
    row.querySelector(".gl-btn").setAttribute("aria-expanded", String(open));
    const d = row.querySelector(".gl-d");
    d.innerHTML = open && x ? termDetail(x) : "";
    d.hidden = !open;
    if (open && source) track("library_term", { term: id, source });
  }
  function renderGlossary(list) {
    const n = list.reduce((a, v) => a + v.terms.length, 0);
    $("#gl-count").textContent = n ? `용어 ${n}개${st.q ? ` · ‘${st.q}’ 검색` : " · 이름을 누르면 풀이와 관련 자료가 열립니다"}` : "";
    $("#gl-index").innerHTML = list.length ? `<div class="lib-ix"><p>분류</p><ul>${list.map((v) => `<li><a href="#gl-${esc(v.s.key)}" data-gl-jump="gl-${esc(v.s.key)}">${esc(v.s.name)}<span>${v.terms.length}</span></a></li>`).join("")}</ul></div>` : "";
    if (!list.length) {
      $("#gl-body").innerHTML = `<div class="lib-empty"><p><b>‘${esc(st.q)}’${wa(st.q)} 맞는 용어가 없습니다.</b> 영어 원어나 다른 표기로도 찾을 수 있습니다.</p><p><button type="button" class="btn ghost sm" data-lib-reset>조건 모두 지우기</button> ${askPseudo(st.q)}</p></div>`;
      return;
    }
    /* a search that narrows to one or two terms opens them */
    if (st.q && n <= 2) list.forEach((v) => v.terms.forEach((x) => glOpen.add(x.id)));
    $("#gl-body").innerHTML = list.map((v) => {
      const sh = glShelf(v.s.name);
      return `<section class="gl-sec" aria-labelledby="gl-${esc(v.s.key)}"><h2 class="lib-shelf s-${sh}" id="gl-${esc(v.s.key)}" tabindex="-1">${esc(v.s.name)}<span>${v.terms.length}개</span></h2>
      <ul class="gl-list">${v.terms.map((x) => termRow(x, sh)).join("")}</ul></section>`;
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
    const lvBox = $("#lib-levels");
    if (lvBox) lvBox.innerHTML = `<span class="lib-lv-k" aria-hidden="true">난이도</span>` + LV_PICK.map(([v, name]) =>
      `<button type="button" role="radio" class="lib-lvb${v === "all" ? "" : ` lv-${v}`}" data-lv="${v}" aria-checked="${st.lv === v}" tabindex="${st.lv === v ? 0 : -1}">${esc(name)}</button>`).join("");
    $("#lib-q").value = st.q;
  }

  function go(id, smooth) {
    const el = id && document.getElementById(id);
    if (!el || !["lib-topic", "gl-row", "lib-shelf", "lib-pj"].some((c) => el.classList.contains(c))) return false;
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
    if (/^term-/.test(id)) glOpen.add(id);
    st.view = /^term-/.test(id) && gloss ? "glossary" : "topics";
    render();
    if (!document.getElementById(id)) { st.q = ""; st.shelf = "all"; st.kinds.clear(); st.src = ""; st.lv = "all"; controls(); render(); }
    toURL();
    const url = `${location.pathname}${location.search}#${encodeURIComponent(id)}`;
    if (push) { history.replaceState(history.state, "", before); history.pushState(null, "", url); }
    else history.replaceState(history.state, "", url);
    requestAnimationFrame(() => go(id, true));
  }

  let searchTimer = 0, lastLogged = "";
  /* what people look for, where the search started, and whether it found anything: the gaps to fill next.
     source: typed (paused typing), enter, suggest, try (a chip on the empty result), hero/topics (the hub's boxes), link */
  function logSearch(source) {
    clearTimeout(searchTimer);
    if (!st.q || `${source}|${st.q}` === lastLogged) return;
    lastLogged = `${source}|${st.q}`;
    const tl = visibleTopics(), loose = looseUsed;
    const results = tl.reduce((a, v) => a + v.n, 0) + visibleProjects(tl.length > 0).length, terms = visibleTerms().reduce((a, v) => a + v.terms.length, 0);
    track("search", { search_term: st.q, results, terms, found: results + terms > 0 ? "yes" : "no", match: loose ? "words" : "phrase", source, view: st.view, page: "library" });
  }
  function onSearch(source) {
    st.q = $("#lib-q").value.trim().slice(0, 60);
    st.open.clear();
    /* stay on the tab the reader is on, unless it has nothing and the other one has something */
    if (st.q) {
      const tl = visibleTopics(), nt = tl.length + visibleProjects(tl.length > 0).length, ng = visibleTerms().length;
      if (st.view === "topics" && !nt && ng) st.view = "glossary";
      else if (st.view === "glossary" && !ng && nt) st.view = "topics";
    }
    toURL(); render();
    clearTimeout(searchTimer);
    /* what people look for and whether it was there: the gaps to fill next */
    if (source) logSearch(source);
    else if (st.q) searchTimer = setTimeout(() => logSearch("typed"), 1500);
  }

  function bind() {
    $("#lib-form").addEventListener("submit", (e) => { e.preventDefault(); onSearch("enter"); const first = document.querySelector(st.view === "glossary" ? "#gl-body .gl-row" : "#lib-topics .lib-topic"); if (first) go(first.id, true); });
    $("#lib-q").addEventListener("input", () => onSearch());
    /* a related search picked under the box: search for its name and go straight to it */
    $("#lib-q").addEventListener("hub:suggest", (e) => {
      e.preventDefault();
      const { type, id, label } = e.detail;
      $("#lib-q").value = label;
      st.q = label.slice(0, 60); st.open.clear(); st.shelf = "all"; controls();
      st.view = type === "term" && gloss ? "glossary" : "topics";
      toURL(); render(); logSearch("suggest");
      if (!document.getElementById(id)) { st.q = ""; controls(); render(); }
      history.replaceState(history.state, "", `${location.pathname}${location.search}#${encodeURIComponent(id)}`);
      requestAnimationFrame(() => go(id, true));
    });
    /* "/" jumps to the search box, as on most search pages */
    document.addEventListener("keydown", (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
      e.preventDefault(); $("#lib-q").focus(); $("#lib-q").select();
    });
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
    const lvBox = $("#lib-levels");
    if (lvBox) {
      lvBox.addEventListener("click", (e) => {
        const b = e.target.closest("[data-lv]"); if (!b) return;
        st.lv = b.dataset.lv; st.open.clear(); controls(); toURL(); render();
        track("library_filter", { filter: "level", value: st.lv });
      });
      lvBox.addEventListener("keydown", arrows("#lib-levels [data-lv]", "data-lv"));
    }
    document.querySelector(".lib-tabs").addEventListener("keydown", arrows(".lib-tabs [role=tab]", "id"));
    $("#tab-topics").addEventListener("click", () => { if (st.view !== "topics") { setView("topics"); track("library_view", { view: "topics", source: "tab" }); } });
    $("#tab-glossary").addEventListener("click", () => { if (st.view !== "glossary") { setView("glossary"); track("library_view", { view: "glossary", source: "tab" }); } });
    document.addEventListener("click", (e) => {
      const o = e.target.closest("[data-lib-open]");
      if (o) { st.open.add(o.dataset.libOpen); render(); go(o.dataset.libOpen); return; }
      const tr = e.target.closest("[data-lib-try]");
      if (tr) { $("#lib-q").value = tr.dataset.libTry; onSearch("try"); return; }
      const v = e.target.closest("[data-view]");
      if (v) { setView(v.dataset.view); $(".lib-tabs").scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" }); track("library_view", { view: v.dataset.view, source: "button" }); return; }
      if (e.target.closest("[data-lib-reset]")) { st.q = ""; st.shelf = "all"; st.kinds.clear(); st.src = ""; st.lv = "all"; st.open.clear(); controls(); toURL(); render(); return; }
      const term = e.target.closest("[data-term]");
      if (term) { e.preventDefault(); reveal(term.dataset.term, true); track("library_term", { term: term.dataset.term, source: term.closest(".lib-topic") ? "topic" : "start" }); return; }
      const tp = e.target.closest("[data-goto-topic]");
      if (tp) { e.preventDefault(); reveal(tp.dataset.gotoTopic, true); track("library_topic", { topic: tp.dataset.gotoTopic, source: tp.closest(".gl-row") ? "glossary" : "start" }); return; }
      const gt = e.target.closest("[data-gl-toggle]");
      if (gt) { toggleTerm(gt.dataset.glToggle, undefined, "glossary"); return; }
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
    opened = window.hubOpened ? window.hubOpened() : new Set();
    /* the opened mark appears on the item right away; the list is not redrawn under the reader */
    document.addEventListener("hub:opened", (e) => {
      opened.add(e.detail.url);
      document.querySelectorAll("#lib-topics .lib-item .lib-main > a[data-opened]").forEach((a) => {
        if (a.getAttribute("href") !== e.detail.url) return;
        const src = a.parentElement.querySelector(".lib-src");
        if (src && !src.querySelector(".lib-done")) {
          const b = document.createElement("b"); b.className = "lib-done"; b.textContent = "열어봄";
          const extra = src.querySelector(".lib-extra");
          src.insertBefore(document.createTextNode(" · "), extra); src.insertBefore(b, extra);
        }
      });
    });
    const get = (p) => fetch(p).then((x) => { if (!x.ok) throw new Error(p); return x.json(); });
    try {
      const [t, r, g, posts, ps, tl] = await Promise.all([get("data/topics.json"), get("data/repos.json").catch(() => []), get("data/glossary.json").catch(() => null), get("data/articles.json").catch(() => []),
        get("data/pseudo.json").catch(() => null), get("data/term_links.json").catch(() => null)]);
      data = t; repos = new Map((r || []).map((x) => [x.repo, x]));
      defs = (ps && ps.defs) || {}; teamLinks = (tl && tl.terms) || {};
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
    const from = new URLSearchParams(location.search).get("from");
    fromURL();
    /* a search that arrives with no topics but some glossary terms opens on the glossary */
    if (st.q && st.view === "topics" && !visibleTopics().length && !visibleProjects(false).length && visibleTerms().length) st.view = "glossary";
    controls(); render(); bind();
    /* a search that arrived from the hub (or a shared ?q= link) is recorded once, then the address is tidied */
    if (st.q) logSearch(["hero", "topics", "suggest"].includes(from) ? from : "link");
    if (from) toURL();
    const id = decodeURIComponent(location.hash.slice(1));
    if (/^pj-/.test(id) && document.getElementById(id)) requestAnimationFrame(() => go(id, false));
    else if (id && (data.topics.some((t) => t.id === id) || (/^term-/.test(id) && gloss))) {
      reveal(id);
      const isTerm = /^term-/.test(id);
      track(isTerm ? "library_term" : "library_topic", { [isTerm ? "term" : "topic"]: id, source: "link" });
    }
  }
  init();
})();
