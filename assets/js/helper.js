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
  const SEEN = "cil-helper-seen";
  const page = /library\.html$/.test(location.pathname) ? "library" : /article\.html$/.test(location.pathname) ? "article" : "hub";
  const SUGGEST = {
    hub: ["인과추론이 처음인데 뭐부터 봐요?", "A/B 테스트 결과를 믿어도 되는지 어떻게 확인해요?", "이중차분법이 뭐예요?"],
    library: ["A/B 테스트는 처음이에요", "SRM이 뭐예요?", "쿠폰 효과를 재고 싶어요"],
    article: ["이 글에 나온 용어를 설명해 주세요", "이 주제를 더 공부하려면?", "실험군과 대조군 차이가 뭐예요?"]
  };
  const SRC = {
    "Causal-Inference-with-Python": "웹북", "causal-studio": "Causal Studio", "causal-inference-lecture": "실무자 특강",
    "causal-inference-in-python-code": "책 예제 코드", "OCE-Materials": "온라인 실험 스터디", "causal-inference-practice": "산업 사례",
    "awesome-causal-inference-python": "메서드 코드북", "Experimentation-platform-materials": "실험 플랫폼 자료"
  };
  const KIND = { video: "영상", read: "글", code: "코드", slides: "발표 자료", case: "사례" };

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

  function answer(q) {
    const links = [];
    let text = "", matched = "none";
    const term = findTerm(q), topic0 = findTopic(q);
    if (isStart(q)) {
      const t = topicById(isExp(q) || (topic0 && topic0.shelf === "exp") ? "ab-basics" : "why-causal");
      if (t) {
        text = `처음이라면 ‘${t.name}’부터 보세요. 아래 두 개면 감을 잡을 수 있어요.`;
        t.items.slice(0, 2).forEach((x) => links.push({ title: x.title, url: x.url, note: `${KIND[x.kind] || ""} · ${SRC[x.repo] || ""}` }));
        links.push({ title: `${t.name} 자료 모두 보기`, url: `library.html#${t.id}`, note: "자료실" });
        matched = `start:${t.id}`;
      }
    } else if (term) {
      const t0 = topicForTerm(term) || topic0;
      /* the chapter to read: one the topic also lists, else the first the glossary gives */
      const inTopic = t0 ? t0.items.map((x) => x.url) : [];
      const ch = (term.chapters || []).find((c) => inTopic.includes(`${BOOK}${c.slug}.html`)) || (term.chapters || [])[0];
      text = `‘${term.ko}’${topicMark(term.ko)} 영어로 ${term.en}입니다.${ch ? ` 웹북 ${ch.num} ‘${ch.title}’에서 자세히 다뤄요.` : ""}`;
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
      text = `‘${topic0.name}’ 주제에 맞는 자료가 있어요. ${topic0.about.split(". ")[0].replace(/\.$/, "")}.`;
      topic0.items.slice(0, 2).forEach((x) => links.push({ title: x.title, url: x.url, note: `${KIND[x.kind] || ""} · ${SRC[x.repo] || ""}` }));
      links.push({ title: `${topic0.name} 자료 모두 보기`, url: `library.html#${topic0.id}`, note: "자료실" });
      matched = `topic:${topic0.id}`;
    } else {
      text = "자료실에서 딱 맞는 자료를 찾지 못했어요. 아래 버튼으로 AI에게 이어서 물어보세요. 질문을 바꿔 다시 적어도 좋아요.";
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
    const wait = say('<span class="hp-dots" aria-label="찾는 중"><i></i><i></i><i></i></span>', "bot");
    await load();
    const a = answer(q);
    const p = prompt(q, a.links);
    wait.innerHTML = `<p>${esc(a.text)}</p>${a.links.length ? `<ul class="hp-links">${a.links.map((l) => `<li><a href="${esc(l.url)}"${/^https?:/.test(l.url) && !l.url.startsWith(SITE) ? ' target="_blank" rel="noopener"' : ""} data-event="helper_click" data-event-params='${esc(JSON.stringify({ matched: a.matched, page }))}'>${esc(l.title)}</a><span>${esc(l.note)}</span></li>`).join("")}</ul>` : ""}
      <p class="hp-ai"><a class="hp-claude" href="https://claude.ai/new?q=${encodeURIComponent(p)}" target="_blank" rel="noopener" data-event="helper_handoff" data-event-params='${esc(JSON.stringify({ target: "claude", matched: a.matched, page }))}'>Claude에게 이어서 묻기<span aria-hidden="true"> ↗</span></a><button type="button" class="hp-copy" data-copy="${esc(p)}" data-label="프롬프트 복사">프롬프트 복사</button></p>`;
    wait.querySelector(".hp-copy").addEventListener("click", () => track("helper_handoff", { target: "copy", matched: a.matched, page }));
    log.scrollTop = log.scrollHeight;
    track("helper_ask", { search_term: q.slice(0, 100), matched: a.matched, page });
  }
  function grow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; }

  function open() {
    if (!panel.hidden) return;
    panel.hidden = false;
    opener.setAttribute("aria-expanded", "true");
    root.classList.add("open");
    hideBubble();
    load();
    if (!log.children.length) {
      say(`<p>${page === "article" ? "글을 읽다가 모르는 말이 나오면 적어 주세요." : "무엇을 공부하고 싶나요? 주제나 모르는 용어를 적으면 자료실에서 맞는 자료를 찾아 드릴게요."}</p>
        <p class="hp-sug">${SUGGEST[page].map((s) => `<button type="button" data-ask="${esc(s)}">${esc(s)}</button>`).join("")}</p>`, "bot");
    }
    setTimeout(() => input.focus(), 30);
    track("helper_open", { page });
  }
  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    opener.setAttribute("aria-expanded", "false");
    root.classList.remove("open");
    opener.focus();
  }
  function hideBubble() {
    const b = root.querySelector(".hp-bubble");
    if (b) b.remove();
    try { localStorage.setItem(SEEN, "1"); } catch (e) { /* storage off */ }
  }

  function build() {
    root = document.createElement("div");
    root.className = "hp";
    let seen = true;
    try { seen = !!localStorage.getItem(SEEN); } catch (e) { seen = true; }
    root.innerHTML = `
      <section class="hp-panel" id="hp-panel" role="dialog" aria-modal="false" aria-labelledby="hp-title" hidden>
        <header class="hp-head"><img src="assets/img/mascot.webp" alt="" width="40" height="34"><h2 id="hp-title">자료실 도우미</h2>
          <button type="button" class="hp-x" aria-label="도우미 닫기"><svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3.5 3.5l9 9m0-9l-9 9"/></svg></button></header>
        <ol class="hp-log" aria-live="polite"></ol>
        <form class="hp-form"><label class="sr-only" for="hp-q">도우미에게 묻기</label>
          <textarea id="hp-q" rows="1" maxlength="300" placeholder="예: 쿠폰 효과를 어떻게 재요?" enterkeyhint="send"></textarea>
          <button type="submit" class="hp-send" aria-label="보내기"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h12M10 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></form>
        <p class="hp-note">답은 자료실 안에서 찾습니다. 적은 내용은 저장하지 않아요.</p>
      </section>
      ${seen ? "" : `<p class="hp-bubble" aria-hidden="true">궁금한 걸 물어보세요</p>`}
      <button type="button" class="hp-open" aria-controls="hp-panel" aria-expanded="false" aria-label="자료실 도우미에게 묻기"><img src="assets/img/mascot.webp" alt="" width="84" height="72"></button>`;
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
    if (!seen) setTimeout(hideBubble, 9000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
