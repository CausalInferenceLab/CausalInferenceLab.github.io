/* Pseudo, the library helper: the team mascot in the corner. A visitor types what they want to learn or a
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
      { id: "hello", text: "안녕하세요, 저는 Pseudo예요! 어디서부터 볼지 막막하면 저를 불러 주세요. 같이 골라 봐요.", acts: [["처음 왔어요", "처음인데 뭐부터 볼까요?"], ["궁금한 말이 있어요", ""]], make: () => forumHello() },
      { id: "forum", when: "#events", make: () => forumLine() },
      { id: "topics", when: "#topics", text: "여기가 제 자리예요. 낯선 말이 보이면 저한테 툭 던져 주세요.", acts: [["SRM이 뭐예요?", "SRM이 뭐예요?"], ["이중차분법이 뭐예요?", "이중차분법이 뭐예요?"]] }
    ],
    library: [
      { id: "hello", text: "어서 와요, 저는 Pseudo예요! 이름이 기억 안 나도 괜찮아요. 하고 싶은 걸 그냥 말해 주세요.", acts: [["쿠폰 효과를 재고 싶어요", "쿠폰 효과를 재고 싶어요"], ["A/B 테스트는 처음이에요", "A/B 테스트는 처음이에요"]] }
    ],
    article: [
      { id: "read", when: "half", text: "여기까지 읽느라 고생했어요. 걸리는 말 있었어요? 같이 찾아봐요.", acts: [["하나 있어요", ""]] }
    ]
  };
  const page = /library\.html$/.test(location.pathname) ? "library" : /article\.html$/.test(location.pathname) ? "article" : "hub";
  const SUGGEST = {
    hub: ["처음인데 뭐부터 볼까요?", "이번 행사 알려 주세요", "같이 하고 싶어요"],
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

  let data = null, terms = [], defs = {}, events = [], posts = [], loading = null, root, panel, log, input, opener;
  /* what Pseudo remembers within one conversation, so "더 보여 주세요" or "영상은요?" make sense */
  const mem = { topic: null, shown: 0, term: null };

  function load() {
    if (!loading) {
      const get = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      loading = Promise.all([get("data/topics.json"), get("data/glossary.json"), get("data/pseudo.json"), get("data/events.json"), get("data/articles.json")]).then(([t, g, ps, ev, ar]) => {
        data = t && Array.isArray(t.topics) ? t : { topics: [] };
        terms = g && Array.isArray(g.sections) ? g.sections.flatMap((s) => s.terms || []).filter((x) => x && x.ko && /^term-/.test(x.id || "")) : [];
        defs = (ps && ps.defs) || {};
        events = Array.isArray(ev) ? ev : [];
        posts = Array.isArray(ar) ? ar : [];
      });
    }
    return loading;
  }

  /* ---------- reading the question ---------- */
  const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = (w, text) => new RegExp(`(^|[^a-z0-9])${reEsc(w.toLowerCase())}($|[^a-z0-9])`).test(text);
  const heads = (x) => [x.ko, ...(x.alias || [])].flatMap((s) => String(s).split("/")).map((s) => s.replace(/\([^)]*\)/g, "").trim()).filter(Boolean);
  const abbr = (x) => (String(x.ko + " " + x.en).match(/\(([A-Za-z][A-Za-z0-9-]{1,})\)/g) || []).map((s) => s.slice(1, -1));
  const enParts = (x) => String(x.en || "").split("/").map((e) => e.replace(/\([^)]*\)/g, "").trim().toLowerCase()).filter((e) => e.length >= 4);
  /* one typo in an English word is forgiven: a letter missing, extra, wrong, or two letters swapped ("cupd", "sampel") */
  function near(a, b) {
    if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
    let i = 0, j = 0, diff = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++diff > 1) return false;
      if (a.length === b.length && a[i] === b[j + 1] && a[i + 1] === b[j]) { i += 2; j += 2; continue; }
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return diff + (a.length - i) + (b.length - j) <= 1;
  }
  /* every glossary term the question names, longest first, without overlaps */
  function findTerms(q) {
    const nq = norm(q), lq = String(q).toLowerCase(), toks = lq.match(/[a-z][a-z0-9-]{3,}/g) || [];
    const hits = [];
    terms.forEach((x) => {
      let s = 0, at = "";
      heads(x).forEach((h) => { const k = norm(h); if (k.length >= 2 && nq.includes(k) && k.length * 2 > s) { s = k.length * 2; at = k; } });
      abbr(x).forEach((a) => { if (word(a, lq) && a.length * 2 + 1 > s) { s = a.length * 2 + 1; at = a.toLowerCase(); } });
      enParts(x).forEach((e) => { if (lq.includes(e) && e.length > s) { s = e.length; at = norm(e); } });
      if (!s) [...abbr(x), ...enParts(x).filter((e) => !/\s/.test(e))].forEach((a) => { if (toks.some((t) => near(t, a.toLowerCase()))) { s = 3; at = a.toLowerCase(); } });
      /* a multi-word English name with a typo in one word: every word must be there, exactly or one letter off */
      if (!s) enParts(x).filter((e) => /\s/.test(e)).forEach((e) => {
        const ws = e.split(/\s+/).filter((w) => w.length >= 3);
        if (ws.length >= 2 && ws.every((w) => toks.some((t) => t === w || near(t, w)) || lq.includes(w))) { s = e.length - 1; at = norm(e); }
      });
      if (s) hits.push({ x, s, at });
    });
    hits.sort((a, b) => b.s - a.s);
    const out = [];
    hits.forEach((h) => { if (!out.some((o) => o.at.includes(h.at) || h.at.includes(o.at))) out.push(h); });
    return out.slice(0, 3).map((h) => h.x);
  }
  function findTopic(q) {
    const nq = norm(q), lq = String(q).toLowerCase();
    let best = null, score = 0;
    (data.topics || []).forEach((t) => {
      let s = 0;
      [t.name, ...(t.keys || [])].forEach((k) => {
        if (/[가-힣]/.test(k)) { const n = norm(k); if (n.length >= 2 && nq.includes(n)) s += n.length; }
        else if (k.length >= 2 && word(k, lq)) s += k.length + 1;
      });
      if (s > score) { best = t; score = s; }
    });
    return best;
  }
  const topicById = (id) => (data.topics || []).find((t) => t.id === id);
  /* the name to say out loud: the first of "A / B" forms, keeping an (ABBR) */
  const said_ = (x) => String(x.ko).split(" / ")[0].trim();
  /* everyday words people use for a topic or a term that the data does not list */
  const SYN = [
    [/통계(를|가|는)?\s*(잘\s*)?(몰라|모르|약해|기초)|통계\s*기초/, "topic:stats"],
    [/실험\s*설계|실험을?\s*(어떻게|설계)/, "topic:ab-basics"],
    [/머신\s*러닝|machine learning|\bml\b/i, "topic:hte"],
    [/p\s*-?\s*hacking|피\s*해킹/i, "term:term-다중-검정-거짓-발견률-FDR"],
    [/업리프트|uplift/i, "term:term-업리프트-모델링"],
    [/가격.{0,6}(올리|내리|바꾸|인상|인하)/, "term:term-탄력성"]
  ];
  function synonym(q) {
    const hit = SYN.find(([re]) => re.test(q));
    if (!hit) return {};
    const [kind_, id] = hit[1].split(":");
    return kind_ === "topic" ? { topic: topicById(id) } : { term: terms.find((x) => x.id === id) };
  }
  /* a term goes with a topic when the topic names it; used to point from a word to where it is taught */
  function topicForTerm(x) {
    const txt = norm(`${x.ko} ${(x.alias || []).join(" ")}`), en = String(x.en || "").toLowerCase();
    return (data.topics || []).find((t) => [t.name, ...(t.keys || [])].some((k) => (/[가-힣]/.test(k) ? norm(k).length >= 2 && (norm(k).length >= 4 ? txt.includes(norm(k)) : heads(x).map(norm).includes(norm(k))) : k.length >= 3 && word(k, en))));
  }
  /* the topic the reader is looking at: a topic or term in the library address, or the post's own topics */
  function pageTopic() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (page === "library") {
      const t = topicById(h); if (t) return t;
      const x = terms.find((y) => y.id === h); if (x) return topicForTerm(x);
    }
    if (page === "article") { const a = posts.find((p) => p.slug === h); if (a && a.topics && a.topics[0]) return topicById(a.topics[0]); }
    return null;
  }

  const INTENT = {
    greet: /^(안녕|하이|헬로|hello|hi\b|hey|반가|ㅎㅇ)/i,
    thanks: /(고마|감사|땡큐|thank|thx|ㄱㅅ)/i,
    who: /((너|넌|당신|pseudo|슈도)\s*(는|은)?\s*(누구|뭐야|뭐니|정체))|이름이 뭐|자기\s*소개/i,
    event: /(포럼|행사|forum|밋업|세미나|오프라인|모임|연사|발표자|누가 발표|타임테이블|프로그램|행사장|추천 코드|신청)/i,
    ask: /(디스코드|discord|문의|질문은 어디|어디에 물어|어디서 물어)/i,
    level: /(레벨|진단|내 수준|실력 테스트)/,
    curriculum: /(커리큘럼|로드맵|순서대로|공부 순서)/,
    join: /(기여|참여|빌더|builder|러너|스터디 신청|같이 하고|오픈소스 하고|PR 올)/i,
    glossary: /(용어집|용어 목록|용어 전체)/,
    more: /(더 보여|더 있|더 줘|다른 거|다른 자료|하나 더|^더$|^또$|다음 거)/,
    video: /(영상|동영상|유튜브|강의|보면서)/,
    code: /(코드|노트북|파이썬|python|실습|예제)/i,
    slides: /(발표 자료|슬라이드|pdf|ppt)/i,
    easy: /(쉽게|쉬운|가볍게|입문용|초보용)/,
    compare: /(차이|vs\.?|비교|다른 점|뭐가 달라|어떻게 달라)/i,
    start: /처음|입문|시작|뭐부터|어디서부터|기초|초보/,
    exp: /실험|a\/?b|ab ?테스트|에이비/i,
    here: /(이거|이 주제|이 글|여기 나온|지금 보는)/,
    words: /(말|용어|단어)/,
    measure: /(효과|영향|성과).{0,10}(재|측정|알고|확인|보고 싶|분석|증명)/,
    trust: /(믿어도|믿을 수|신뢰할|맞는지 확인|이상한지)/,
    broken: /(깨지면|위반|안 맞으면|만족 안|성립 안|틀리면)/,
    book: /(책|도서|교재)/,
    predict: /(예측|forecast|predict)/i,
    effect: /(효과|영향|성과|임팩트)/
  };
  const KINDS = ["video", "read", "code", "slides", "case", "post"];
  function wantKind(q) { return INTENT.video.test(q) ? "video" : INTENT.code.test(q) ? "code" : INTENT.slides.test(q) ? "slides" : null; }
  /* items of a topic in the order a learner would want them, honouring "영상으로", "쉽게", and what was already shown */
  function pick(t, { kind, easy, offset = 0, n = 2 } = {}) {
    let list = t.items.slice();
    if (easy) list.sort((a, b) => (b.repo === "causal-studio") - (a.repo === "causal-studio") || (b.kind === "video") - (a.kind === "video"));
    if (kind) list = list.filter((x) => x.kind === kind);
    return list.slice(offset, offset + n);
  }
  const linkOf = (x) => ({ title: x.title, url: x.url, note: `${KIND[x.kind] || ""} · ${SRC[x.repo] || ""}` });
  const allLink = (t) => ({ title: `${t.name} 자료 모두 보기`, url: `library.html#${t.id}`, note: `자료실 · ${t.items.length}개` });
  const end = (w) => (topicMark(w) === "은" ? "이에요" : "예요");
  const WD = "일월화수목금토";
  const md = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${m}월 ${d}일(${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`; };
  const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const subj = (w) => (topicMark(w) === "은" ? "이" : "가");
  const named = (w) => (topicMark(w) === "은" ? "이라는" : "라는");

  /* ---------- the next Data Forum, from data/events.json ---------- */
  const evName = (e) => String(e.name).split(" - ")[0];
  const dayGap = (iso) => Math.round((Date.parse(iso) - Date.parse(kstToday())) / 864e5);
  function nextForum() {
    const today = kstToday();
    return events.filter((e) => e.date && e.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0] || null;
  }
  const signupOpen = (e) => { const t = kstToday(); return !!(e.signupEnd && e.signupEnd >= t && (!e.signupStart || e.signupStart <= t)); };
  const talksOf = (e) => (e.timetable || []).filter((t) => t.talk && t.who && !/패널|네트워킹/.test(t.kind));
  const whenOf = (e) => { const n = dayGap(e.date); return n === 0 ? "오늘" : n === 1 ? "내일" : md(e.date); };
  /* the visit opens with the forum while it is close (six weeks) */
  function forumHello() {
    const e = nextForum();
    if (!e || dayGap(e.date) > 42) return null;
    const name = evName(e);
    return { as: "hello_forum", text: `안녕하세요, 저는 Pseudo예요! ${whenOf(e)} ${name}${subj(name)} 열려요. ${signupOpen(e) ? `신청은 ${md(e.signupEnd)}까지 받아요. 같이 가요!` : "현장에서 만나요!"}`,
      acts: [["행사 이야기 들려줘", "이번 행사 알려 주세요"], ["공부하러 왔어요", "처음인데 뭐부터 볼까요?"]] };
  }
  function forumLine() {
    const e = nextForum();
    if (!e || !e.tagline) return null;
    const n = talksOf(e).length;
    return { text: `이번 포럼은 ‘${e.tagline}’${named(e.tagline)} 주제로 열려요.${n ? ` 발표 ${n}개에 패널토크, 네트워킹까지 있어요.` : ""} 궁금한 건 저한테 물어봐요!`,
      acts: [["누가 발표해요?", "누가 발표해요?"], ["어떻게 가요?", "행사장 어떻게 가요?"]] };
  }
  function forumAnswer(q) {
    const e = nextForum();
    if (!e) return { text: "지금 잡힌 다음 행사는 아직 없어요. 정해지면 허브 첫 화면에 바로 올라와요!", links: [{ title: "지난 행사 보기", url: "./#events", note: "Data Forum" }], chips: [], matched: "event" };
    const name = evName(e), open = signupOpen(e), talks = talksOf(e), start = e.time ? e.time.split("–")[0] : "";
    const evPage = e.link && { title: `${name} 행사 페이지`, url: e.link, note: open ? "참가 신청" : "행사 안내" };
    const hub = { title: "허브에서 행사 보기", url: "./#events", note: "타임테이블 · 캘린더 · 지도" };
    const signupChip = e.code ? "추천 코드가 뭐예요?" : "신청은 어떻게 해요?";
    if (/(누가|발표|연사|타임테이블|프로그램|세션)/.test(q) && talks.length) {
      const list = talks.map((t) => `${t.time.split("–")[0]} ‘${t.title}’(${String(t.who).split(" (")[0]})`).join(", ");
      const panel = (e.timetable || []).some((t) => /패널/.test(t.kind));
      return { text: `${list} 순서로 발표가 있어요.${panel ? " 그다음 패널토크와 네트워킹으로 이어져요." : ""}`, links: [hub, evPage].filter(Boolean), chips: ["행사장 어떻게 가요?", signupChip], matched: "event_program" };
    }
    if (/(어디|장소|가는|가요|위치|지도|행사장|주차|오시는)/.test(q) && (e.venue || e.address)) {
      const where = e.address || e.venue;
      return { text: `${e.venue ? `${e.venue}에서 열려요. ` : ""}${e.address ? `주소는 ${e.address}${end(e.address)}. ` : ""}${md(e.date)}${start ? ` ${start}` : ""}에 시작해요.`,
        links: [{ title: "네이버 지도", url: `https://map.naver.com/p/search/${encodeURIComponent(where)}`, note: "길찾기" }, { title: "카카오맵", url: `https://map.kakao.com/?q=${encodeURIComponent(where)}`, note: "길찾기" }],
        chips: ["누가 발표해요?", signupChip], matched: "event_place" };
    }
    if (/(신청|등록|코드|추천|마감|정원|자리)/.test(q)) {
      const t = kstToday();
      const status = open ? `${md(e.signupEnd)}까지 신청을 받아요.${e.capacity ? ` 자리는 ${e.capacity}명이에요.` : ""}` : e.signupStart && e.signupStart > t ? `신청은 ${md(e.signupStart)}부터 받아요.` : "신청은 마감됐어요. 다음 포럼에서 만나요!";
      const code = open && e.code ? " 인과추론팀 Builder에게 받은 추천 코드가 있으면 신청할 때 넣어 주세요." : "";
      return { text: `${open ? "가짜연구소 행사 페이지에서 ‘참여하기’를 눌러 신청하면 돼요. " : ""}${status}${code}`, links: [evPage].filter(Boolean), chips: ["누가 발표해요?", "행사장 어떻게 가요?"], matched: "event_signup" };
    }
    const topic = e.tagline ? ` ‘${e.tagline}’${named(e.tagline)} 주제로${talks.length ? ` 발표 ${talks.length}개와 패널토크, 네트워킹이 이어져요` : " 열려요"}.` : "";
    return { text: `${whenOf(e)}${start ? ` ${start}` : ""}${e.venue ? `, ${e.venue}` : ""}에서 ${name}${subj(name)} 열려요.${topic}${open ? ` 신청은 ${md(e.signupEnd)}까지예요. 같이 가요!` : ""}`,
      links: [evPage, hub].filter(Boolean), chips: ["누가 발표해요?", "행사장 어떻게 가요?", signupChip], matched: "event" };
  }

  /* ---------- taking part: runner, first contribution, Builder ---------- */
  const ISSUES = "https://github.com/search?q=org%3ACausalInferenceLab+is%3Aissue+is%3Aopen&type=issues";
  const J = {
    runner: { title: "가짜연구소 프로젝트 보기", url: "https://pseudo-lab.com/", note: "러너 · 반기마다 모집" },
    issues: { title: "열린 이슈 보기", url: ISSUES, note: "첫 기여" },
    template: { title: "프로젝트 템플릿", url: "https://github.com/CausalInferenceLab/Project-template", note: "Builder · 레포 시작" },
    builders: { title: "Builder 둘러보기", url: "builders/", note: "지난 기수 프로젝트" },
    term: { title: "용어 제안하기", url: "https://github.com/CausalInferenceLab/Causal-Inference-with-Python/issues/new?template=term-proposal.yml", note: "웹북 번역어" },
    guide: { title: "허브에 올리는 방법", url: "https://github.com/CausalInferenceLab/CausalInferenceLab.github.io/blob/main/CONTRIBUTING.md", note: "데이터 파일 PR" },
    discord: { title: "가짜연구소 디스코드", url: "https://discord.gg/HeHbFAvmSZ", note: "질문 · 이야기" }
  };
  function joinAnswer(q) {
    if (/러너/.test(q)) return { text: "러너는 가짜연구소 기수 모집 때 인과추론팀 프로젝트에 지원해서 들어와요. 14주 동안 Builder와 같이 공부하고 결과물을 만들어요. 모집은 반기마다 있어요.", links: [J.runner, J.builders], chips: ["첫 기여는 어떻게 해요?", "Builder가 되려면요?"], matched: "join_runner" };
    if (/(빌더|builder|프로젝트.{0,3}열)/i.test(q)) return { text: "다음 기수에 직접 프로젝트를 열면 Builder예요. 레포는 프로젝트 템플릿으로 시작하고, 이 허브에는 데이터 파일 PR 한 번으로 올라가요.", links: [J.template, J.guide, J.builders], chips: ["러너는 뭘 해요?", "질문은 어디에 해요?"], matched: "join_builder" };
    if (/(기여|pr|이슈|오픈소스)/i.test(q)) return { text: "오탈자 하나, 예제 하나도 기여예요. 열린 이슈에서 하나 골라 PR을 보내 주세요. 웹북 번역어가 어색하면 용어 제안부터 해도 좋아요.", links: [J.issues, J.term], chips: ["Builder가 되려면요?", "질문은 어디에 해요?"], matched: "join_contribute" };
    return { text: "같이 하고 싶다니 너무 반가워요! 방법은 세 가지예요. 러너로 기수 프로젝트에 들어오거나, 열린 이슈에 PR 하나로 먼저 기여하거나, 다음 기수에 Builder로 직접 프로젝트를 열 수 있어요.", links: [J.runner, J.issues, J.template], chips: ["러너는 뭘 해요?", "첫 기여는 어떻게 해요?", "Builder가 되려면요?"], matched: "join" };
  }

  /* chips under a reply: the most likely next questions, never more than three */
  function nextFor(t, used = {}) {
    if (!t) return [];
    const c = [];
    if (!used.kind && t.items.some((x) => x.kind === "video")) c.push("영상으로 볼래요");
    if (!used.kind && t.items.some((x) => x.kind === "code")) c.push("코드도 있어요?");
    if (t.items.length > (used.shown || 2)) c.push("더 보여 주세요");
    const rel = terms.filter((x) => defs[x.id] && topicForTerm(x) === t && (!mem.term || x.id !== mem.term.id));
    if (rel[0]) c.push(`${heads(rel[0])[0]}${topicMark(heads(rel[0])[0])}요?`);
    if (c.length < 2) {
      const shelf = (data.topics || []).filter((x) => x.shelf === t.shelf);
      const sib = shelf[(shelf.indexOf(t) + 1) % shelf.length];
      if (sib && sib !== t) c.push(`${sib.name}${topicMark(sib.name)}요?`);
    }
    return c.slice(0, 3);
  }

  /* 은/는 after a term: look at the last Korean syllable before any (ABBR) */
  function topicMark(w) {
    const base = String(w).replace(/\s*\([^)]*\)\s*$/, "").trim();
    const c = base.charCodeAt(base.length - 1);
    if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 ? "은" : "는";
    return /[136780lmnLMN]$/.test(base) ? "은" : "는";
  }

  /* a different first word now and then, picked by the question so the same question gets the same reply */
  /* how Pseudo starts a term answer; picked by the question so the same question always gets the same reply.
     The second and third forms make the term the subject of the explanation that follows, so they need one. */
  const lead = (q, ko, hasDef) => {
    const n = hasDef ? [...String(q)].reduce((a, c) => a + c.charCodeAt(0), 0) % 3 : 0;
    if (n === 1) return `좋은 질문이에요! ${ko}${topicMark(ko)}`;
    if (n === 2) return `저도 처음에 헷갈렸던 거예요. ${ko}${topicMark(ko)}`;
    return `아, ${ko}요!`;
  };



  function answer(q) {
    const syn = synonym(q);
    const terms_ = findTerms(q), term = syn.term || terms_[0];
    const kind = wantKind(q), easy = INTENT.easy.test(q);
    const ctx = INTENT.here.test(q) ? pageTopic() : null;
    const topic0 = syn.topic || findTopic(q) || ctx;
    const nothingElse = !term && !topic0;
    /* small talk first: Pseudo answers like a person, then offers a way back to the materials */
    if (INTENT.who.test(q)) return { text: "저는 Pseudo예요! 가짜연구소 인과추론팀 자료실을 지키고 있어요. 공부하고 싶은 주제나 낯선 말을 알려 주면 팀이 만든 자료 중에서 딱 맞는 걸 골라 드려요. 행사 소식이나 같이 하는 방법도 물어봐 주세요.", links: [], chips: SUGGEST[page], matched: "who" };
    if (INTENT.thanks.test(q) && nothingElse) return { text: "도움이 됐다니 저도 기뻐요! 공부하다 또 막히면 언제든 불러 주세요.", links: [], chips: [], matched: "thanks" };
    if (INTENT.greet.test(q) && nothingElse && q.length < 20) return { text: "안녕하세요! 저는 Pseudo예요. 오늘은 어떤 걸 공부해 볼까요?", links: [], chips: SUGGEST[page], matched: "greet" };
    /* questions about the site itself */
    if (INTENT.event.test(q) && !term && !/스터디/.test(q)) return forumAnswer(q);
    if (INTENT.ask.test(q) && !term) return { text: "가짜연구소 디스코드에 남겨 주세요. 팀원들이 보고 답해 드려요.", links: [J.discord], chips: ["같이 하고 싶어요"], matched: "ask" };
    if (INTENT.level.test(q) && !term) return { text: "열 문제만 풀면 지금 어느 레벨에서 시작하면 좋을지 알려 드려요. 3분이면 돼요!", links: [{ title: "내 레벨 진단하기", url: "./?level", note: "10문항 · 3분" }, { title: "커리큘럼 보기", url: "./#curriculum", note: "Level 0–4" }], chips: [], matched: "level" };
    if (INTENT.curriculum.test(q) && !term) return { text: "순서대로 공부하고 싶다면 커리큘럼이 딱이에요. Level 0부터 4까지, 레벨마다 볼 자료가 정해져 있어요.", links: [{ title: "커리큘럼 보기", url: "./#curriculum", note: "Level 0–4" }, { title: "내 레벨 진단하기", url: "./?level", note: "시작 레벨 찾기" }], chips: [], matched: "curriculum" };
    if (INTENT.join.test(q) && !term) return joinAnswer(q);
    if (INTENT.glossary.test(q) && !term) return { text: `용어집에 ${terms.length}개가 있어요. 한국어로도, 영어로도 찾을 수 있어요.`, links: [{ title: "용어집 열기", url: "library.html?view=glossary", note: "자료실" }], chips: ["SRM이 뭐예요?", "교란 요인이 뭐예요?"], matched: "glossary" };

    /* books: the free web book and the book the team translated */
    if (INTENT.book.test(q) && !findTopic(q)) return { text: "무료로 보려면 Brave & True 웹북이 좋아요. 원서 25장을 다 옮겨 뒀어요. 종이책으로는 팀이 옮긴 『실무로 통하는 인과추론 with 파이썬』이 있고, 장마다 예제 코드도 있어요.", links: [{ title: "Brave & True 웹북", url: BOOK, note: "무료 · 25장 + 부록" }, { title: "실무로 통하는 인과추론 with 파이썬", url: "https://www.hanbit.co.kr/store/books/look.php?p_code=B6208936856", note: "한빛미디어 · 인과추론팀 옮김" }, { title: "책 예제 코드", url: "https://github.com/CausalInferenceLab/causal-inference-in-python-code", note: "장별 노트북" }], chips: ["처음인데 뭐부터 볼까요?", "영상으로 볼래요"], matched: "book" };
    /* prediction is a different question; say so kindly and point to where the book compares them */
    if (INTENT.predict.test(q) && !term) return { text: "예측은 ‘무엇이 일어날지’를, 인과추론은 ‘무엇을 바꾸면 달라질지’를 물어요. 예측 모델을 잘 만드는 건 제 전문은 아니지만, 둘이 어떻게 다르고 언제 같이 쓰는지는 이 자료에 있어요.", links: [{ title: "웹북 17장: 예측 모델 101", url: `${BOOK}17-Predictive-Models-101.html`, note: "글 · 웹북" }, { title: "부록: 예측이 실패할 때", url: `${BOOK}When-Prediction-Fails.html`, note: "글 · 웹북" }], chips: ["Double ML은요?", "메타러너는요?"], matched: "predict" };
    /* "영상 있어요?" with nothing to go on yet: the places that are all videos or all code */
    if ((kind || /강의/.test(q)) && !term && !topic0 && !mem.topic) {
      const k = kind || "video";
      const SRCS = { video: [{ title: "Causal Studio 입문 영상", url: "https://causalinferencelab.github.io/causal-studio/videos-ko", note: "짧은 입문 영상 · 노트북" }, { title: "실무로 통하는 인과추론 특강", url: "https://www.youtube.com/playlist?list=PLKKkeayRo4PWuwIL0_C7n_QQQ_at6CpoE", note: "현업 특강 17강 · YouTube" }], code: [{ title: "책 예제 코드", url: "https://github.com/CausalInferenceLab/causal-inference-in-python-code", note: "장별 노트북" }, { title: "메서드 코드북", url: "https://github.com/CausalInferenceLab/awesome-causal-inference-python", note: "주제별 파이썬 코드" }], slides: [{ title: "온라인 실험 스터디 발표 자료", url: "https://github.com/CausalInferenceLab/OCE-Materials", note: "16회" }, { title: "산업 사례 템플릿", url: "https://github.com/CausalInferenceLab/causal-inference-practice", note: "14주" }] }[k];
      return { text: k === "video" ? "영상으로 보고 싶다면 이 두 곳이에요. 처음이면 짧은 입문 영상부터, 실무 사례가 궁금하면 특강부터 보세요." : k === "code" ? "코드로 따라 하고 싶다면 이 두 곳이에요. 책 장별 노트북과 주제별 코드가 있어요." : "발표 자료는 이 두 곳에 모여 있어요.", links: SRCS, chips: ["이중차분법이 뭐예요?", "A/B 테스트는 처음이에요"], matched: `source:${k}` };
    }
    /* "이 글에 나온 말": the words this page is about, each one a tap away */
    if (ctx && INTENT.words.test(q) && !term) {
      const ws = terms.filter((x) => defs[x.id] && topicForTerm(x) === ctx).slice(0, 3);
      mem.topic = ctx; mem.shown = 0; mem.term = null;
      if (ws.length) return { text: `여기서는 이런 말이 자주 나와요. 궁금한 걸 눌러 보세요. 뜻부터 풀어 드릴게요.`, links: [allLink(ctx)], chips: ws.map((x) => `${heads(x)[0]}${topicMark(heads(x)[0])} 뭐예요?`), matched: `words:${ctx.id}` };
    }
    /* "효과를 재고 싶어요": the first fork is whether an experiment is still possible */
    if ((INTENT.measure.test(q) || (INTENT.effect.test(q) && !topic0)) && !term) {
      const ab = topicById("ab-basics"), did = topicById("did"), why = topicById("why-causal");
      const price = why && why.items.find((x) => /가격할인/.test(x.title));
      mem.topic = ab || null; mem.shown = 0; mem.term = null;
      return { text: "효과를 재는 길은 두 갈래예요. 아직 나눠 줄 수 있다면 A/B 테스트가 제일 확실하고, 이미 지난 일이라면 이중차분법 같은 관측 데이터 방법을 써요. 어느 쪽인가요?", links: [ab && linkOf(ab.items[0]), price && linkOf(price), did && allLink(did)].filter(Boolean), chips: ["A/B 테스트는 처음이에요", "이중차분법이 뭐예요?", "성향점수는요?"], matched: "measure" };
    }
    /* "결과를 믿어도 될까요?": trustworthiness checks */
    if (INTENT.trust.test(q) && INTENT.exp.test(q)) {
      const t = topicById("trust");
      if (t) {
        mem.topic = t; mem.shown = 2; mem.term = null;
        return { text: "결과를 보기 전에 먼저 확인할 게 있어요. 실험군과 대조군에 사람이 계획대로 나뉘었는지(SRM), 같은 버전끼리 비교해도 차이가 안 나는지(A/A 테스트)부터 봐요.", links: [...pick(t).map(linkOf), allLink(t)].slice(0, 3), chips: ["SRM이 뭐예요?", "가드레일 지표는요?", "다중 검정은요?"], matched: "trust" };
      }
    }
    /* two words and "차이": explain both side by side */
    if (INTENT.compare.test(q) && terms_.length >= 2) {
      const [a, b] = terms_;
      const da = defs[a.id], db = defs[b.id];
      const links = [a, b].map((x) => { const c = (x.chapters || [])[0]; return c ? { title: `웹북 ${c.num}: ${c.title}`, url: `${BOOK}${c.slug}.html`, note: `${x.ko}` } : { title: `${x.ko} 용어집에서 보기`, url: `library.html#${x.id}`, note: "자료실" }; });
      mem.term = a; mem.topic = topicForTerm(a) || topicForTerm(b) || null; mem.shown = 0;
      return { text: `둘을 나란히 놓고 볼게요. ${said_(a)}${topicMark(said_(a))} ${da || `영어로 “${a.en}”라고 써요.`} 그리고 ${said_(b)}${topicMark(said_(b))} ${db || `영어로 “${b.en}”라고 써요.`}`, links, chips: nextFor(mem.topic), matched: `compare:${a.id}+${b.id}` };
    }
    /* follow-ups lean on what was just talked about */
    const follow = !term && !findTopic(q) && mem.topic && (INTENT.more.test(q) || kind || easy);
    if (follow) {
      const t = mem.topic;
      const offset = INTENT.more.test(q) && !kind ? mem.shown : 0;
      const items = pick(t, { kind, easy, offset, n: 2 });
      if (!items.length) return { text: kind ? `아쉽지만 ‘${t.name}’에는 ${kind === "slides" ? "발표 자료가" : `${KIND[kind]} 자료가`} 아직 없어요. 대신 다른 자료를 보여 드릴게요.` : `‘${t.name}’ 자료는 여기까지예요! 자료실에서 전부 한눈에 볼 수 있어요.`, links: kind ? [...pick(t, { n: 2 }).map(linkOf), allLink(t)] : [allLink(t)], chips: [], matched: `follow:${t.id}` };
      mem.shown = offset + items.length;
      return { text: kind ? `‘${t.name}’ ${KIND[kind]} 자료는 이거예요.` : `그럼 이것도 같이 봐요.`, links: [...items.map(linkOf), allLink(t)].slice(0, 3), chips: nextFor(t, { kind, shown: mem.shown }), matched: `follow:${t.id}` };
    }
    if (INTENT.start.test(q) && !term && !ctx) {
      const t = topicById(INTENT.exp.test(q) || (topic0 && topic0.shelf === "exp") ? "ab-basics" : "why-causal");
      if (t) {
        mem.topic = t; mem.shown = 2; mem.term = null;
        const text = t.id === "ab-basics" ? "A/B 테스트가 처음이면 이 두 개부터 같이 봐요. 실험 하나가 어떻게 굴러가는지 금방 감이 와요." : "처음이면 상관과 인과가 왜 다른지부터 봐요. 짧은 영상 하나랑 웹북 1장이면 충분해요.";
        return { text, links: [...pick(t, { kind, easy: true }).map(linkOf), allLink(t)].slice(0, 3), chips: ["레벨 진단도 해 볼래요", ...nextFor(t, { shown: 2 })].slice(0, 3), matched: `start:${t.id}` };
      }
    }
    if (term) {
      const t0 = topicForTerm(term) || topic0;
      const inTopic = t0 ? t0.items.map((x) => x.url) : [];
      /* name a web book chapter only when the topic teaches it, or when there is no topic to point to */
      const ch = (term.chapters || []).find((c) => inTopic.includes(`${BOOK}${c.slug}.html`)) || (t0 ? null : (term.chapters || [])[0]);
      const def = defs[term.id];
      const broke = INTENT.broken.test(q) && t0 ? ` 가정이 흔들릴 때 쓰는 방법은 ‘${t0.name}’ 자료에 같이 있어요. 내 상황에 맞춰 더 깊게 보려면 Claude랑 이어서 이야기해 봐요.` : "";
      const text = `${lead(q, said_(term), !!def)}${def ? ` ${def}` : ""} 영어로는 “${term.en}”라고 해요.${ch ? ` 웹북 ${ch.num} ‘${ch.title}’에 차근차근 나와요.` : ""}${broke}`;
      const links = [];
      if (ch && (!kind || kind === "read")) links.push({ title: `웹북 ${ch.num}: ${ch.title}`, url: `${BOOK}${ch.slug}.html`, note: "글 · 웹북" });
      if (t0) {
        pick(t0, { kind, easy }).filter((x) => !ch || x.url !== `${BOOK}${ch.slug}.html`).slice(0, links.length ? 1 : 2).forEach((x) => links.push(linkOf(x)));
        links.push(allLink(t0));
      } else links.push({ title: "용어집에서 보기", url: `library.html#${term.id}`, note: "자료실" });
      mem.term = term; mem.topic = t0 || null; mem.shown = 2;
      return { text, links: links.slice(0, 3), chips: nextFor(t0, { kind, shown: 2 }), matched: `term:${term.id}` };
    }
    if (topic0) {
      mem.topic = topic0; mem.shown = 2; mem.term = null;
      const items = pick(topic0, { kind, easy: easy || (ctx && topic0 === ctx && INTENT.start.test(q)) });
      const text = ctx && topic0 === ctx ? `지금 보고 있는 ‘${topic0.name}’에서는 이것부터 보면 좋아요.` : kind && !items.length ? `‘${topic0.name}’에는 ${KIND[kind]} 자료가 아직 없어서, 대신 이걸 골라 왔어요.` : `그거라면 ‘${topic0.name}’ 쪽 자료가 딱이에요. 먼저 볼 만한 걸 골라 왔어요.`;
      return { text, links: [...(items.length ? items : pick(topic0)).map(linkOf), allLink(topic0)].slice(0, 3), chips: nextFor(topic0, { kind, shown: 2 }), matched: `topic:${topic0.id}` };
    }
    return { text: "음, 제 자료실엔 딱 맞는 게 아직 없네요. 미안해요! 다르게 물어봐 주거나, 아래에서 Claude한테 같이 물어봐요.", links: [], chips: SUGGEST[page], matched: "none" };
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
    if (line.make) {
      const made = line.make();
      if (!made && line.when) return;
      line = { ...line, ...(made || {}) };
    }
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
    track("helper_say", { line: line.as || line.id, page });
  }
  function hush(forGood) {
    clearTimeout(sayTimer);
    if (sayEl) sayEl.hidden = true;
    if (forGood) { try { sessionStorage.setItem(QUIET, "1"); } catch (e) { /* storage off */ } }
  }
  function listen() {
    (LINES[page] || []).forEach((line) => {
      if (!line.when) {
        /* the greeting is the first A/B test on the hub (experiment "pseudo-greeting" in data/experiments.json).
           Both arms are exposed at the same moment and under the same conditions; only treatment speaks.
           With the experiment off, variant() is null and Pseudo greets as usual. */
        const exp = window.hubExperiment;
        const gate = Promise.all([exp ? exp.variant("pseudo-greeting", 1200) : null, load()]).then(([v]) => v);
        setTimeout(() => gate.then((v) => {
          const eligible = !quiet() && panel.hidden && !spoke && !said().includes(`${page}:${line.id}`);
          if (v && eligible) exp.expose("pseudo-greeting");
          if (v !== "control") speak(line);
        }), 1600);
        return;
      }
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
  /* source: typed, suggest (the first chips), chip (a follow-up chip), bubble (the speech bubble), page */
  async function ask(q, source = "typed") {
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
    /* only the newest reply offers next steps and Claude; older ones stay quiet */
    log.querySelectorAll(".hp-ai, .hp-next").forEach((el) => el.remove());
    wait.innerHTML = `<p class="hp-said"></p>${a.links.length ? `<ul class="hp-links">${a.links.map((l) => `<li><a href="${esc(l.url)}"${/^https?:/.test(l.url) && !l.url.startsWith(SITE) ? ' target="_blank" rel="noopener"' : ""} data-event="helper_click" data-event-params='${esc(JSON.stringify({ matched: a.matched, page }))}'>${esc(l.title)}</a><span>${esc(l.note)}</span></li>`).join("")}</ul>` : ""}
      ${a.chips && a.chips.length ? `<p class="hp-sug hp-next">${a.chips.map((c) => `<button type="button" data-ask="${esc(c)}">${esc(c)}</button>`).join("")}</p>` : ""}
      <p class="hp-ai"><a class="hp-claude" href="https://claude.ai/new?q=${encodeURIComponent(p)}" target="_blank" rel="noopener" data-event="helper_handoff" data-event-params='${esc(JSON.stringify({ target: "claude", matched: a.matched, page }))}'>Claude랑 더 이야기하기<span aria-hidden="true"> ↗</span></a><button type="button" class="hp-copy" data-copy="${esc(p)}" data-label="질문 복사하기">질문 복사하기</button></p>`;
    wait.querySelector(".hp-copy").addEventListener("click", () => track("helper_handoff", { target: "copy", matched: a.matched, page }));
    /* the links wait until the mascot has finished typing its line */
    wait.classList.add("typing-now");
    if (a.chips && a.chips.length) wait.querySelector(".hp-next").hidden = true;
    await typeOut(wait.querySelector(".hp-said"), a.text);
    wait.classList.remove("typing-now");
    const nx = wait.querySelector(".hp-next"); if (nx) nx.hidden = false;
    log.scrollTop = log.scrollHeight;
    /* what was typed stays in the browser (the panel says so); GA gets how it came in and what Pseudo answered */
    track("helper_ask", { source, answer: String(a.matched).split(":")[0], matched: a.matched, links: a.links.length, page });
  }
  function grow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; }

  /* source: button (the mascot), bubble (a reply chip under its speech bubble), page (a link or button on the page) */
  function open(withQuestion, source = "button") {
    if (!panel.hidden) return;
    panel.hidden = false;
    opener.setAttribute("aria-expanded", "true");
    root.classList.add("open");
    hush(false);
    load();
    if (!log.children.length && !withQuestion) {
      const first = say(`<p class="hp-said"></p><p class="hp-sug" hidden>${SUGGEST[page].map((s) => `<button type="button" data-ask="${esc(s)}">${esc(s)}</button>`).join("")}</p>`, "bot");
      typeOut(first.querySelector(".hp-said"), page === "article" ? "반가워요, 저는 Pseudo예요! 글에서 걸리는 말이 있으면 편하게 적어 주세요. 뜻을 풀고 더 볼 자료도 찾아 드릴게요." : "반가워요, 저는 Pseudo예요! 공부하고 싶은 거나 낯선 말을 편하게 적어 주세요. 뜻도 풀어 드리고, 팀 자료 중에 딱 맞는 걸 골라 올게요.")
        .then(() => { first.querySelector(".hp-sug").hidden = false; log.scrollTop = log.scrollHeight; });
    }
    setTimeout(() => input.focus(), 30);
    track("helper_open", { page, source });
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
        <header class="hp-head"><img src="assets/img/mascot.webp" alt="" width="40" height="34"><h2 id="hp-title">Pseudo<span>인과추론팀 자료실에서 같이 찾아봐요</span></h2>
          <button type="button" class="hp-x" aria-label="닫기"><svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3.5 3.5l9 9m0-9l-9 9"/></svg></button></header>
        <ol class="hp-log" aria-live="polite" aria-label="Pseudo와 나눈 이야기" tabindex="0"></ol>
        <form class="hp-form"><label class="sr-only" for="hp-q">Pseudo에게 물어보기</label>
          <textarea id="hp-q" rows="1" maxlength="300" placeholder="편하게 적어 주세요" enterkeyhint="send"></textarea>
          <button type="submit" class="hp-send" aria-label="보내기"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h12M10 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></form>
        <p class="hp-note">적어 준 말은 어디에도 저장하지 않아요.</p>
      </section>
      <div class="hp-say" role="status" hidden>
        <button type="button" class="hp-say-x" aria-label="말풍선 닫기, 이번 방문 동안 다시 말 걸지 않기"><svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 4l8 8m0-8l-8 8"/></svg></button>
        <p class="hp-say-t"></p><p class="hp-say-acts"></p>
      </div>
      <button type="button" class="hp-open" aria-controls="hp-panel" aria-expanded="false" aria-label="Pseudo에게 물어보기"><span class="hp-mascot" aria-hidden="true"><img src="assets/img/mascot-blank.webp" alt="" width="84" height="72">${SCREEN}</span></button>`;
    document.body.appendChild(root);
    document.body.classList.add("has-helper");
    panel = root.querySelector(".hp-panel"); log = root.querySelector(".hp-log"); input = root.querySelector("#hp-q"); opener = root.querySelector(".hp-open");
    opener.addEventListener("click", () => (panel.hidden ? open(false, "button") : close()));
    root.querySelector(".hp-x").addEventListener("click", close);
    root.querySelector(".hp-form").addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
    input.addEventListener("input", grow);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } });
    root.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    log.addEventListener("click", (e) => {
      const b = e.target.closest("[data-ask]");
      if (b) { ask(b.dataset.ask, b.closest(".hp-next") ? "chip" : "suggest"); return; }
      /* a link to a spot on this same page: get out of the way so the reader sees where it went */
      const a = e.target.closest("a[href]");
      if (a && !a.target) { const u = new URL(a.href, location.href); if (u.pathname === location.pathname) { panel.hidden = true; opener.setAttribute("aria-expanded", "false"); root.classList.remove("open"); } }
    });
    sayEl = root.querySelector(".hp-say");
    root.querySelector(".hp-say-x").addEventListener("click", () => { hush(true); track("helper_say_close", { page }); });
    sayEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-say-ask]");
      if (!b) return;
      open(!!b.dataset.sayAsk, "bubble");
      if (b.dataset.sayAsk) ask(b.dataset.sayAsk, "bubble"); else input.focus();
    });
    opener.addEventListener("mouseenter", () => { if (!reduced()) { typing(true); setTimeout(() => typing(false), 1500); } });
    /* the page asks Pseudo: data-helper-ask="..." on any link or button outside the widget opens it with that question */
    const askFromPage = (q) => { open(true, "page"); ask(q, "page"); };
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-helper-ask]");
      if (!b || root.contains(b)) return;
      e.preventDefault();
      askFromPage(b.dataset.helperAsk);
    });
    /* old links to the join section (#join) now open Pseudo on taking part */
    const joinHash = () => { if (location.hash === "#join") { history.replaceState(history.state, "", location.pathname + location.search); askFromPage("같이 하고 싶어요"); } };
    addEventListener("hashchange", joinHash);
    setTimeout(joinHash, 300);
    listen();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
