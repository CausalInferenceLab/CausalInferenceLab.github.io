/* The library helper: the team mascot in the corner. A visitor types what they want to learn or a
   word they do not know; the helper answers from the library itself (data/topics.json and
   data/glossary.json) with at most three links, and can pass the question on to an AI chat as a
   ready-made prompt that carries those links. Nothing typed here leaves the page unless the visitor
   opens the AI chat or copies the prompt. */
(() => {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s·\-_/()?!.,~'"]/g, "");
  const track = (n, p) => window.hubTrack && window.hubTrack(n, p);
  const SITE = "https://causalinferencelab.github.io/";
  const BOOK = SITE + "Causal-Inference-with-Python/";
  const SAID = "cil-helper-said", QUIET = "cil-helper-quiet";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* what the mascot says on its own: once per visit each, and never again after the reader closes a bubble */
  const LINES = {
    hub: [
      { id: "hello", text: "안녕하세요, 반가워요! 어디서부터 볼지 막막하면 저를 불러 주세요. 같이 골라 봐요.", acts: [["처음 왔어요", "처음인데 뭐부터 볼까요?"], ["궁금한 말이 있어요", ""]] },
      { id: "topics", when: "#topics", text: "여기가 제 자리예요. 낯선 말이 보이면 저한테 툭 던져 주세요.", acts: [["SRM이 뭐예요?", "SRM이 뭐예요?"], ["이중차분법이 뭐예요?", "이중차분법이 뭐예요?"]] }
    ],
    library: [
      { id: "hello", text: "어서 와요! 이름이 기억 안 나도 괜찮아요. 하고 싶은 걸 그냥 말해 주세요.", acts: [["쿠폰 효과를 재고 싶어요", "쿠폰 효과를 재고 싶어요"], ["A/B 테스트는 처음이에요", "A/B 테스트는 처음이에요"]] }
    ],
    article: [
      { id: "read", when: "half", text: "여기까지 읽느라 고생했어요. 걸리는 말 있었어요? 같이 찾아봐요.", acts: [["하나 있어요", ""]] }
    ]
  };
  const page = /library\.html$/.test(location.pathname) ? "library" : /article\.html$/.test(location.pathname) ? "article" : "hub";
  const SUGGEST = {
    hub: ["처음인데 뭐부터 볼까요?", "A/B 테스트 결과, 믿어도 될까요?", "이중차분법이 뭐예요?"],
    library: ["A/B 테스트는 처음이에요", "SRM이 뭐예요?", "쿠폰 효과를 재고 싶어요"],
    article: ["이 글에 나온 말이 궁금해요", "이 주제 더 공부하고 싶어요", "실험군이랑 대조군이 뭐가 달라요?"]
  };
  const SRC = {
    "Causal-Inference-with-Python": "웹북", "causal-studio": "Causal Studio", "causal-inference-lecture": "실무자 특강",
    "causal-inference-in-python-code": "책 예제 코드", "OCE-Materials": "온라인 실험 스터디", "causal-inference-practice": "산업 사례",
    "awesome-causal-inference-python": "메서드 코드북", "Experimentation-platform-materials": "실험 플랫폼 자료"
  };
  const KIND = { video: "영상", read: "글", code: "코드", slides: "발표 자료", case: "사례" };
  /* coordinates are those of the mascot image (1084 x 924); the strokes redraw the "</>" on its screen */
  const SCREEN = `<svg class="hp-screen" viewBox="0 0 1084 924" focusable="false"><defs><linearGradient id="hp-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8edd0"/><stop offset="1" stop-color="#38b588"/></linearGradient></defs>
    <g fill="none" stroke="url(#hp-g)" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"><path class="hp-k1" d="M283 579 L258 607 L291 639"/><path class="hp-k2" d="M322 574 L306 656"/><path class="hp-k3" d="M351 589 L384 622 L353 655"/></g>
    <rect class="hp-caret" x="402" y="596" width="11" height="58" rx="4" fill="#8be6c4"/></svg>`;

  let data = null, terms = [], loading = null, root, panel, log, input, opener;

  function load() {
    if (!loading) {
      const get = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      loading = Promise.all([get("data/topics.json"), get("data/glossary.json")]).then(([t, g]) => {
        data = t && Array.isArray(t.topics) ? t : { topics: [] };
        terms = g && Array.isArray(g.sections) ? g.sections.flatMap((s) => s.terms || []).filter((x) => x && x.ko && /^term-/.test(x.id || "")) : [];
      });
    }
    return loading;
  }

  /* ---------- finding an answer in the library ---------- */
  const heads = (x) => [x.ko, ...(x.alias || [])].flatMap((s) => String(s).split("/")).map((s) => s.replace(/\([^)]*\)/g, "").trim()).filter(Boolean);
  const abbr = (x) => (String(x.ko + " " + x.en).match(/\(([A-Za-z][A-Za-z0-9-]{1,})\)/g) || []).map((s) => s.slice(1, -1));
  function findTerm(q) {
    const nq = norm(q), lq = String(q).toLowerCase();
    let best = null, score = 0;
    terms.forEach((x) => {
      heads(x).forEach((h) => { const k = norm(h); if (k.length >= 2 && nq.includes(k) && k.length * 2 > score) { best = x; score = k.length * 2; } });
      abbr(x).forEach((a) => { if (new RegExp(`(^|[^a-z0-9])${a.toLowerCase()}($|[^a-z0-9])`).test(lq) && a.length * 2 + 1 > score) { best = x; score = a.length * 2 + 1; } });
      String(x.en || "").split("/").map((e) => e.replace(/\([^)]*\)/g, "").trim().toLowerCase()).forEach((e) => { if (e.length >= 5 && lq.includes(e) && e.length > score) { best = x; score = e.length; } });
    });
    return best;
  }
  function findTopic(q) {
    const nq = norm(q), lq = String(q).toLowerCase();
    let best = null, score = 0;
    (data.topics || []).forEach((t) => {
      let s = 0;
      [t.name, ...(t.keys || [])].forEach((k) => {
        if (/[가-힣]/.test(k)) { const n = norm(k); if (n.length >= 2 && nq.includes(n)) s += n.length; }
        else if (k.length >= 2 && new RegExp(`(^|[^a-z0-9])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(lq)) s += k.length + 1;
      });
      if (s > score) { best = t; score = s; }
    });
    return best;
  }
  const isStart = (q) => /처음|입문|시작|뭐부터|어디서부터|기초|초보/.test(q);
  const isExp = (q) => /실험|a\/?b|ab테스트|에이비/i.test(q);
  const topicById = (id) => (data.topics || []).find((t) => t.id === id);
  /* a term goes with a topic when the topic names it; used to point from a word to where it is taught */
  function topicForTerm(x) {
    const txt = norm(`${x.ko} ${(x.alias || []).join(" ")}`), en = String(x.en || "").toLowerCase();
    return (data.topics || []).find((t) => [t.name, ...(t.keys || [])].some((k) => (/[가-힣]/.test(k) ? norm(k).length >= 2 && (norm(k).length >= 4 ? txt.includes(norm(k)) : heads(x).map(norm).includes(norm(k))) : k.length >= 3 && new RegExp(`(^|[^a-z0-9])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(en))));
  }

  /* 은/는 after a term: look at the last Korean syllable before any (ABBR) */
  function topicMark(w) {
    const base = String(w).replace(/\s*\([^)]*\)\s*$/, "").trim();
    const c = base.charCodeAt(base.length - 1);
    if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 ? "은" : "는";
    return /[136780lmnLMN]$/.test(base) ? "은" : "는";
  }

  /* a different first word now and then, picked by the question so the same question gets the same reply */
  const lead = (q, ko, en) => {
    const n = [...String(q)].reduce((a, c) => a + c.charCodeAt(0), 0) % 3;
    if (n === 0) return `아, ${ko}요! 영어로는 “${en}”라고 써요.`;
    if (n === 1) return `좋은 질문이에요! ${ko}${topicMark(ko)} 영어로 “${en}”라고 써요.`;
    return `그거 저도 처음에 헷갈렸어요. ${ko}${topicMark(ko)} 영어로 “${en}”라고 써요.`;
  };

  function answer(q) {
    const links = [];
    let text = "", matched = "none";
    const term = findTerm(q), topic0 = findTopic(q);
    if (isStart(q)) {
      const t = topicById(isExp(q) || (topic0 && topic0.shelf === "exp") ? "ab-basics" : "why-causal");
      if (t) {
        text = t.id === "ab-basics" ? "A/B 테스트가 처음이면 이 두 개부터 같이 봐요. 실험 하나가 어떻게 굴러가는지 금방 감이 와요." : "처음이면 상관과 인과가 왜 다른지부터 봐요. 짧은 영상 하나랑 웹북 1장이면 충분해요.";
        t.items.slice(0, 2).forEach((x) => links.push({ title: x.title, url: x.url, note: `${KIND[x.kind] || ""} · ${SRC[x.repo] || ""}` }));
        links.push({ title: `${t.name} 자료 모두 보기`, url: `library.html#${t.id}`, note: "자료실" });
        matched = `start:${t.id}`;
      }
    } else if (term) {
      const t0 = topicForTerm(term) || topic0;
      /* the chapter to read: one the topic also lists, else the first the glossary gives */
      const inTopic = t0 ? t0.items.map((x) => x.url) : [];
      const ch = (term.chapters || []).find((c) => inTopic.includes(`${BOOK}${c.slug}.html`)) || (term.chapters || [])[0];
      text = `${lead(q, term.ko, term.en)}${ch ? ` 웹북 ${ch.num} ‘${ch.title}’에 차근차근 나와요.` : " 제가 아는 자료 중엔 아래가 제일 좋아요."}`;
      if (ch) links.push({ title: `웹북 ${ch.num}: ${ch.title}`, url: `${BOOK}${ch.slug}.html`, note: "글 · 웹북" });
      const t = t0;
      if (t) {
        const first = t.items.find((x) => !ch || x.url !== `${BOOK}${ch.slug}.html`);
        if (first) links.push({ title: first.title, url: first.url, note: `${KIND[first.kind] || ""} · ${SRC[first.repo] || ""}` });
        links.push({ title: `${t.name} 자료 모두 보기`, url: `library.html#${t.id}`, note: "자료실" });
      } else {
        links.push({ title: "용어집에서 보기", url: `library.html#${term.id}`, note: "자료실" });
      }
      matched = `term:${term.id}`;
    } else if (topic0) {
      text = `그거라면 ‘${topic0.name}’ 쪽 자료가 딱이에요. 먼저 볼 만한 걸 골라 왔어요.`;
      topic0.items.slice(0, 2).forEach((x) => links.push({ title: x.title, url: x.url, note: `${KIND[x.kind] || ""} · ${SRC[x.repo] || ""}` }));
      links.push({ title: `${topic0.name} 자료 모두 보기`, url: `library.html#${topic0.id}`, note: "자료실" });
      matched = `topic:${topic0.id}`;
    } else {
      text = "음, 제 자료실엔 딱 맞는 게 아직 없네요. 미안해요! 다르게 물어봐 주거나, 아래에서 Claude한테 같이 물어봐요.";
    }
    return { text, links: links.slice(0, 3), matched };
  }

  /* the prompt an AI chat gets: the question, what the reader is looking at, and the library's own links */
  function prompt(q, links) {
    const ctx = page === "article" ? (document.getElementById("article-title") || {}).textContent : "";
    const refs = links.filter((l) => !/^library\.html/.test(l.url)).map((l) => `- ${l.title}: ${new URL(l.url, SITE).href}`);
    return [
      "나는 인과추론과 온라인 실험(A/B 테스트)을 공부하고 있어. 아래 질문에 처음 배우는 사람도 이해할 수 있게 한국어로 답해 줘. 용어는 처음 나올 때 영어 원어를 괄호로 함께 적고, 예시는 쿠폰 지급이나 앱 기능 출시 같은 실무 상황으로 들어 줘.",
      `질문: ${q}${ctx ? `\n지금 읽고 있는 글: ${ctx}` : ""}`,
      refs.length ? "참고할 자료 (가짜연구소 인과추론팀 자료실):\n" + refs.join("\n") : "",
      `답을 마치면 더 공부할 자료를 가짜연구소 인과추론팀 자료실(${SITE}library.html)에서 고르도록 한 줄로 안내해 줘.`
    ].filter(Boolean).join("\n\n").slice(0, 1800);
  }

  /* ---------- the mascot types: the laptop screen fills in while text appears ---------- */
  let typingN = 0;
  function typing(on) {
    typingN = Math.max(0, typingN + (on ? 1 : -1));
    if (root) root.classList.toggle("typing", typingN > 0);
  }
  /* type text into el one character at a time; screen readers get the whole line at once from a hidden copy */
  function typeOut(el, text) {
    return new Promise((done) => {
      el.innerHTML = `<span class="sr-only">${esc(text)}</span><span class="hp-typed" aria-hidden="true"></span>`;
      const out = el.querySelector(".hp-typed");
      if (reduced()) { out.textContent = text; done(); return; }
      typing(true);
      const chars = [...text], step = Math.max(12, Math.min(38, 1400 / chars.length));
      let i = 0, last = 0;
      const tick = (t) => {
        if (!last) last = t;
        const n = Math.min(chars.length, i + Math.floor((t - last) / step));
        if (n > i) { out.textContent = chars.slice(0, n).join(""); i = n; last = t; if (log) log.scrollTop = log.scrollHeight; }
        if (i < chars.length) requestAnimationFrame(tick); else { typing(false); done(); }
      };
      requestAnimationFrame(tick);
    });
  }

  /* ---------- the mascot speaks first ---------- */
  const said = () => { try { return JSON.parse(sessionStorage.getItem(SAID) || "[]"); } catch (e) { return []; } };
  const quiet = () => { try { return sessionStorage.getItem(QUIET) === "1"; } catch (e) { return false; } };
  let sayEl = null, sayTimer = 0, spoke = false;
  function speak(line) {
    if (quiet() || !panel.hidden || said().includes(`${page}:${line.id}`)) return;
    /* the greeting only opens a visit; if the reader already reached a section that has its own line, that one wins */
    if (!line.when && spoke) return;
    spoke = true;
    try { sessionStorage.setItem(SAID, JSON.stringify([...said(), `${page}:${line.id}`])); } catch (e) { /* storage off */ }
    sayEl.hidden = false;
    sayEl.querySelector(".hp-say-acts").innerHTML = "";
    typeOut(sayEl.querySelector(".hp-say-t"), line.text).then(() => {
      sayEl.querySelector(".hp-say-acts").innerHTML = line.acts.map(([label, q]) => `<button type="button" data-say-ask="${esc(q)}">${esc(label)}</button>`).join("");
    });
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { if (!sayEl.matches(":hover, :focus-within")) hush(false); }, 14000);
    track("helper_say", { line: line.id, page });
  }
  function hush(forGood) {
    clearTimeout(sayTimer);
    if (sayEl) sayEl.hidden = true;
    if (forGood) { try { sessionStorage.setItem(QUIET, "1"); } catch (e) { /* storage off */ } }
  }
  function listen() {
    (LINES[page] || []).forEach((line) => {
      if (!line.when) { setTimeout(() => speak(line), 1600); return; }
      if (line.when === "half") {
        const onScroll = () => {
          if (scrollY + innerHeight < document.documentElement.scrollHeight * 0.55) return;
          removeEventListener("scroll", onScroll); speak(line);
        };
        addEventListener("scroll", onScroll, { passive: true });
        return;
      }
      /* watch the section only once the reader scrolls: before the page has drawn, every section sits in view */
      const watch = () => {
        removeEventListener("scroll", watch);
        const el = document.querySelector(line.when);
        if (!el || !("IntersectionObserver" in window)) return;
        const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) { io.disconnect(); setTimeout(() => speak(line), 600); } }, { threshold: 0.4 });
        io.observe(el);
      };
      addEventListener("scroll", watch, { passive: true });
    });
  }

  /* ---------- the widget ---------- */
  function say(html, who) {
    const li = document.createElement("li");
    li.className = `hp-msg ${who}`;
    li.innerHTML = html;
    log.appendChild(li);
    log.scrollTop = log.scrollHeight;
    return li;
  }
  async function ask(q) {
    q = String(q || "").trim().slice(0, 300);
    if (!q) return;
    say(esc(q), "me");
    input.value = ""; grow();
    const wait = say('<span class="hp-dots" aria-label="찾아보는 중이에요"><i></i><i></i><i></i></span>', "bot");
    typing(true);
    await Promise.all([load(), new Promise((r) => setTimeout(r, reduced() ? 0 : 450))]);
    typing(false);
    const a = answer(q);
    const p = prompt(q, a.links);
    /* only the newest reply offers to carry on with Claude; older ones stay quiet */
    log.querySelectorAll(".hp-ai").forEach((el) => el.remove());
    wait.innerHTML = `<p class="hp-said"></p>${a.links.length ? `<ul class="hp-links">${a.links.map((l) => `<li><a href="${esc(l.url)}"${/^https?:/.test(l.url) && !l.url.startsWith(SITE) ? ' target="_blank" rel="noopener"' : ""} data-event="helper_click" data-event-params='${esc(JSON.stringify({ matched: a.matched, page }))}'>${esc(l.title)}</a><span>${esc(l.note)}</span></li>`).join("")}</ul>` : ""}
      <p class="hp-ai"><a class="hp-claude" href="https://claude.ai/new?q=${encodeURIComponent(p)}" target="_blank" rel="noopener" data-event="helper_handoff" data-event-params='${esc(JSON.stringify({ target: "claude", matched: a.matched, page }))}'>Claude랑 더 이야기하기<span aria-hidden="true"> ↗</span></a><button type="button" class="hp-copy" data-copy="${esc(p)}" data-label="질문 복사하기">질문 복사하기</button></p>`;
    wait.querySelector(".hp-copy").addEventListener("click", () => track("helper_handoff", { target: "copy", matched: a.matched, page }));
    /* the links wait until the mascot has finished typing its line */
    wait.classList.add("typing-now");
    await typeOut(wait.querySelector(".hp-said"), a.text);
    wait.classList.remove("typing-now");
    log.scrollTop = log.scrollHeight;
    track("helper_ask", { search_term: q.slice(0, 100), matched: a.matched, page });
  }
  function grow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; }

  function open() {
    if (!panel.hidden) return;
    panel.hidden = false;
    opener.setAttribute("aria-expanded", "true");
    root.classList.add("open");
    hush(false);
    load();
    if (!log.children.length) {
      const first = say(`<p class="hp-said"></p><p class="hp-sug" hidden>${SUGGEST[page].map((s) => `<button type="button" data-ask="${esc(s)}">${esc(s)}</button>`).join("")}</p>`, "bot");
      typeOut(first.querySelector(".hp-said"), page === "article" ? "반가워요! 글에서 걸리는 말이 있으면 편하게 적어 주세요. 같이 찾아볼게요." : "반가워요! 공부하고 싶은 거나 낯선 말을 편하게 적어 주세요. 제가 아는 자료 중에 딱 맞는 걸 골라 올게요.")
        .then(() => { first.querySelector(".hp-sug").hidden = false; log.scrollTop = log.scrollHeight; });
    }
    setTimeout(() => input.focus(), 30);
    track("helper_open", { page });
  }
  let waved = false;
  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    opener.setAttribute("aria-expanded", "false");
    root.classList.remove("open");
    /* a small goodbye, once per page and only if the reader has not asked for quiet */
    if (!waved && !quiet() && log.querySelector(".hp-msg.me")) {
      waved = true;
      sayEl.hidden = false; sayEl.classList.add("bye");
      sayEl.querySelector(".hp-say-acts").innerHTML = "";
      typeOut(sayEl.querySelector(".hp-say-t"), "언제든 또 불러 주세요!");
      clearTimeout(sayTimer);
      sayTimer = setTimeout(() => { sayEl.classList.remove("bye"); hush(false); }, 2800);
    }
    opener.focus();
  }

  function build() {
    root = document.createElement("div");
    root.className = "hp";
    root.innerHTML = `
      <section class="hp-panel" id="hp-panel" role="dialog" aria-modal="false" aria-labelledby="hp-title" hidden>
        <header class="hp-head"><img src="assets/img/mascot.webp" alt="" width="40" height="34"><h2 id="hp-title">같이 찾아봐요<span>인과추론팀 자료실 지킴이</span></h2>
          <button type="button" class="hp-x" aria-label="닫기"><svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3.5 3.5l9 9m0-9l-9 9"/></svg></button></header>
        <ol class="hp-log" aria-live="polite"></ol>
        <form class="hp-form"><label class="sr-only" for="hp-q">자료실 지킴이에게 물어보기</label>
          <textarea id="hp-q" rows="1" maxlength="300" placeholder="편하게 적어 주세요" enterkeyhint="send"></textarea>
          <button type="submit" class="hp-send" aria-label="보내기"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h12M10 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></form>
        <p class="hp-note">적어 준 말은 어디에도 저장하지 않아요.</p>
      </section>
      <div class="hp-say" role="status" hidden>
        <button type="button" class="hp-say-x" aria-label="말풍선 닫기, 이번 방문 동안 다시 말 걸지 않기"><svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 4l8 8m0-8l-8 8"/></svg></button>
        <p class="hp-say-t"></p><p class="hp-say-acts"></p>
      </div>
      <button type="button" class="hp-open" aria-controls="hp-panel" aria-expanded="false" aria-label="자료실 지킴이에게 물어보기"><span class="hp-mascot" aria-hidden="true"><img src="assets/img/mascot-blank.webp" alt="" width="84" height="72">${SCREEN}</span></button>`;
    document.body.appendChild(root);
    document.body.classList.add("has-helper");
    panel = root.querySelector(".hp-panel"); log = root.querySelector(".hp-log"); input = root.querySelector("#hp-q"); opener = root.querySelector(".hp-open");
    opener.addEventListener("click", () => (panel.hidden ? open() : close()));
    root.querySelector(".hp-x").addEventListener("click", close);
    root.querySelector(".hp-form").addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
    input.addEventListener("input", grow);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } });
    root.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    log.addEventListener("click", (e) => {
      const b = e.target.closest("[data-ask]");
      if (b) { ask(b.dataset.ask); return; }
      /* a link to a spot on this same page: get out of the way so the reader sees where it went */
      const a = e.target.closest("a[href]");
      if (a && !a.target) { const u = new URL(a.href, location.href); if (u.pathname === location.pathname) { panel.hidden = true; opener.setAttribute("aria-expanded", "false"); root.classList.remove("open"); } }
    });
    sayEl = root.querySelector(".hp-say");
    root.querySelector(".hp-say-x").addEventListener("click", () => { hush(true); track("helper_say_close", { page }); });
    sayEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-say-ask]");
      if (!b) return;
      open();
      if (b.dataset.sayAsk) ask(b.dataset.sayAsk); else input.focus();
    });
    opener.addEventListener("mouseenter", () => { if (!reduced()) { typing(true); setTimeout(() => typing(false), 1500); } });
    listen();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
