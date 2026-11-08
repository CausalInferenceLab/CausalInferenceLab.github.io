/* Related searches under every library search box (the hub's hero and topics section, the library page).
   Typing "이중" lists the topics and glossary terms that contain it (이중차분법, 이중 머신러닝, 합성 이중차분법,
   …); Korean initials work too ("ㅇㅈㅊㅂ"), as do English names and abbreviations ("did", "cuped").
   An input opts in with data-suggest="<placement>". Picking a suggestion fires a cancelable
   "hub:suggest" event on the input ({ type, id, label, href }); unless a page handles it, the browser goes to
   href. The team's projects are suggested too ("caus" → CausalML 스터디). When nothing has the whole phrase, the
   longest word decides ("성향점수 매칭 예제" → 성향점수), with a particle at its end let go ("도구변수란").
   Data: data/topics.json, data/glossary.json and data/repos.json, loaded on first focus. */
(() => {
  "use strict";
  const ROOT = new URL("../../", document.currentScript ? document.currentScript.src : location.href).href;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s·\-_/()'".,]/g, "");
  const track = (n, p) => window.hubTrack && window.hubTrack(n, p);
  const page = /library\.html$/.test(location.pathname) ? "library" : "hub";
  const MAX = 8;

  /* initial consonants, so "ㅇㅈㅊㅂ" finds 이중차분법 */
  const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const cho = (s) => [...String(s || "")].map((c) => { const k = c.charCodeAt(0) - 0xac00; return k >= 0 && k <= 11171 ? CHO[Math.floor(k / 588)] : c; }).join("");
  const onlyCho = (q) => /^[ㄱ-ㅎ]+$/.test(q);

  let index = null, loading = null;
  function load() {
    if (loading) return loading;
    const get = (p) => fetch(ROOT + p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    loading = Promise.all([get("data/topics.json"), get("data/glossary.json"), get("data/repos.json")]).then(([t, g, r]) => {
      const shelves = Object.fromEntries(((t && t.shelves) || []).map((s) => [s.id, s.name]));
      const topics = ((t && t.topics) || []).map((x) => ({
        type: "topic", id: x.id, label: x.name, sub: `${shelves[x.shelf] || "주제"} · 자료 ${(x.items || []).length}개`,
        href: `${ROOT}library.html#${encodeURIComponent(x.id)}`, keys: [x.name, x.en, ...(x.keys || [])]
      }));
      const terms = ((g && g.sections) || []).flatMap((s) => s.terms || []).filter((x) => x && x.ko && /^term-/.test(x.id || "")).map((x) => ({
        type: "term", id: x.id, label: x.ko, sub: `용어 · ${x.en || ""}`,
        href: `${ROOT}library.html?view=glossary#${encodeURIComponent(x.id)}`, keys: [x.ko, ...(x.alias || []), x.en, ...String(x.en || "").split("/")]
      }));
      const skip = new Set(["CausalInferenceLab.github.io", "Project-template", "python-causality-handbook"]);
      const projects = (Array.isArray(r) ? r : []).filter((x) => x && x.title && !skip.has(x.repo) && x.status !== "depot").map((x) => ({
        type: "project", id: `pj-${x.repo}`, label: x.title, sub: `프로젝트 · ${(x.tags || []).slice(0, 2).join(" · ") || x.repo}`,
        href: `${ROOT}library.html#pj-${encodeURIComponent(x.repo)}`, keys: [x.title, x.repo, ...(x.keys || []), ...(x.tags || [])]
      }));
      index = [...topics, ...terms, ...projects].map((e) => {
        const keys = e.keys.filter(Boolean).map(String);
        return { ...e, n: keys.map(norm), c: keys.map((k) => norm(cho(k))), words: keys.flatMap((k) => k.toLowerCase().split(/[\s/()·-]+/)).filter(Boolean) };
      });
    });
    return loading;
  }

  /* a match in the name itself beats one in a hidden keyword; then starts with > a word starts with > contains;
     topics before terms; shorter names first. A hit only in a keyword says which one. */
  const ENDING = /(이란|란|은|는|을|를|의|에서|으로|로|이|가|과|와)$/;
  function find(raw) {
    const hit = findOne(raw);
    const words = String(raw || "").trim().split(/\s+/);
    if (hit.length) return hit;
    const word = words.length > 1 ? words.slice().sort((a, b) => b.length - a.length)[0] : words[0];
    const cut = /[가-힣]$/.test(word) ? word.replace(ENDING, "") : word;
    if (words.length > 1 && word.length >= 2) { const w = findOne(word); if (w.length) return w; }
    return cut !== word && cut.length >= 2 ? findOne(cut) : [];
  }
  function findOne(raw) {
    const q = norm(raw);
    if (!index || !q) return [];
    const jamo = onlyCho(q);
    const scored = [];
    index.forEach((e) => {
      const keys = jamo ? e.c : e.n, label = keys[0] || "";
      const wordHit = (i) => !jamo && e.words.some((w) => norm(w).startsWith(q) && keys[i] && keys[i].includes(norm(w)));
      let s = 0, via = "";
      if (label.startsWith(q)) s = 6;
      else if (label.includes(q) && (jamo || wordHit(0))) s = 5;
      else if (label.includes(q)) s = 4;
      else {
        const i = keys.findIndex((k, j) => j > 0 && k.startsWith(q));
        const j = i > 0 ? i : keys.findIndex((k, n) => n > 0 && k.includes(q));
        if (j > 0) { s = i > 0 ? 3 : 1; via = e.keys[j]; }
      }
      if (s) scored.push({ e: via && e.type === "topic" ? { ...e, sub: `${e.sub} · ‘${via}’ 포함` } : e, s: s * 10 + (e.type === "topic" ? 1 : 0) });
    });
    scored.sort((a, b) => b.s - a.s || a.e.label.length - b.e.label.length || a.e.label.localeCompare(b.e.label, "ko"));
    const seen = new Set();
    return scored.map((x) => x.e).filter((e) => { const k = e.type + norm(e.label); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, MAX);
  }
  /* the typed part of a name, in bold (or the word of it that matched) */
  function mark(label, raw) {
    const low = label.toLowerCase();
    const q = [String(raw || "").trim(), ...String(raw || "").trim().split(/\s+/).sort((a, b) => b.length - a.length)].find((w) => w && low.includes(w.toLowerCase())) || "";
    const i = q ? low.indexOf(q.toLowerCase()) : -1;
    return i < 0 ? esc(label) : `${esc(label.slice(0, i))}<b>${esc(label.slice(i, i + q.length))}</b>${esc(label.slice(i + q.length))}`;
  }

  let uid = 0;
  function attach(input) {
    const form = input.closest("form") || input.parentElement;
    /* the list sits right after the search box (outside its label, so it is not read as the box's name) */
    const field = input.closest("label") || input;
    const host = field.parentElement;
    const placement = input.dataset.suggest || page;
    const id = `sg-${++uid}`;
    const box = document.createElement("ul");
    box.className = "sg";
    box.id = id;
    box.setAttribute("role", "listbox");
    box.setAttribute("aria-label", "관련 검색어");
    box.hidden = true;
    host.classList.add("sg-host");
    field.insertAdjacentElement("afterend", box);
    const place = () => { box.style.top = `${field.offsetTop + field.offsetHeight + 6}px`; box.style.left = `${field.offsetLeft}px`; box.style.width = `${field.offsetWidth}px`; };
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", id);
    let items = [], at = -1;

    const close = () => { box.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); at = -1; };
    const paint = () => {
      box.querySelectorAll("[role=option]").forEach((li, i) => li.setAttribute("aria-selected", String(i === at)));
      if (at >= 0) { input.setAttribute("aria-activedescendant", `${id}-${at}`); const li = box.children[at + 1]; if (li && li.scrollIntoView) li.scrollIntoView({ block: "nearest" }); }
      else input.removeAttribute("aria-activedescendant");
    };
    const show = () => {
      const raw = input.value;
      items = find(raw);
      at = -1;
      if (!raw.trim() || !items.length) { close(); return; }
      box.innerHTML = `<li class="sg-head" role="presentation">관련 검색어 ${items.length}개 · ↑↓로 고르고 Enter</li>` + items.map((e, i) => `<li role="option" id="${id}-${i}" class="sg-o t-${e.type}" aria-selected="false" data-i="${i}">
          <span class="sg-k">${{ topic: "주제", term: "용어", project: "프로젝트" }[e.type]}</span><span class="sg-l">${mark(e.label, raw)}</span><span class="sg-s">${esc(e.sub)}</span></li>`).join("");
      place();
      box.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };
    const pick = (i) => {
      const e = items[i];
      if (!e) return;
      const typed = input.value.trim().slice(0, 60);
      track("search_suggest", { search_term: typed, type: e.type, item: e.id, rank: i + 1, page, placement });
      close();
      const ev = new CustomEvent("hub:suggest", { cancelable: true, detail: { type: e.type, id: e.id, label: e.label, href: e.href, typed } });
      if (!input.dispatchEvent(ev)) return;
      /* from the hub, the library records the pick on arrival (a record sent while leaving can be lost) */
      const u = new URL(e.href);
      u.searchParams.set("q", e.label.slice(0, 60));
      u.searchParams.set("from", "suggest");
      location.href = u.href;
    };

    input.addEventListener("focus", () => { load().then(() => { if (document.activeElement === input) show(); }); });
    input.addEventListener("input", () => { if (index) show(); else load().then(show); });
    input.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (box.hidden && e.key === "ArrowDown") { show(); return; }
      if (box.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); at = (at + 1) % items.length; paint(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); at = at <= 0 ? items.length - 1 : at - 1; paint(); }
      else if (e.key === "Enter" && at >= 0) { e.preventDefault(); pick(at); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    });
    /* pointerdown, not click: the input keeps focus, so the list does not vanish under the finger */
    box.addEventListener("pointerdown", (e) => { const li = e.target.closest("[role=option]"); if (!li) return; e.preventDefault(); pick(Number(li.dataset.i)); });
    box.addEventListener("mousemove", (e) => { const li = e.target.closest("[role=option]"); if (li && Number(li.dataset.i) !== at) { at = Number(li.dataset.i); paint(); } });
    input.addEventListener("blur", () => setTimeout(close, 120));
    form.addEventListener("submit", close);
  }

  const start = () => document.querySelectorAll("input[data-suggest]").forEach(attach);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.hubSuggest = { find: (q) => load().then(() => find(q)) };
})();
