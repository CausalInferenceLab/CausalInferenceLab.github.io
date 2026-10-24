/* "상관일까, 인과일까?": ten situations, one choice each, a reason and a web book chapter per answer. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const track = (n, p) => window.hubTrack && window.hubTrack(n, p);
  const LABEL = { cause: "그렇게 말할 수 있다", corr: "상관까지만 말할 수 있다" };
  const state = { qs: [], i: 0, score: 0, wrong: [], answered: false, right: { corr: 0, cause: 0 }, runs: 0 };
  const root = $("#game");

  const STUDIO = "https://causalinferencelab.github.io/causal-studio/";
  const CH1 = "https://causalinferencelab.github.io/Causal-Inference-with-Python/01-Introduction-To-Causality.html";
  /* A good score needs both kinds right: answering "상관" every time should not pass. */
  function tier(score, n, right, kinds) {
    const both = right.corr >= kinds.corr - 1 && right.cause >= kinds.cause - 1;
    if (score >= n - 1) return { head: "인과 감각이 탄탄합니다", body: "실험과 준실험을 본격적으로 다루는 커리큘럼 L1–L2로 바로 가 보세요." };
    if (score >= Math.ceil(n * 0.6) && both) return { head: "좋은 출발입니다", body: "틀린 문제의 장부터 읽으면 빈틈이 빠르게 채워집니다." };
    if (right.cause < kinds.cause - 1 && right.corr >= kinds.corr - 1) return { head: "의심은 충분합니다. 이제 근거를 볼 차례", body: "무작위 실험이나 잘 설계된 비교는 인과를 말할 수 있게 해 줍니다. 웹북 2장 무작위 실험부터 읽어 보세요." };
    return { head: "여기서부터 시작하면 됩니다", body: `처음이라면 <a href="${STUDIO}" target="_blank" rel="noopener">영상으로 감을 잡고</a> <a href="${CH1}" target="_blank" rel="noopener">웹북 1장</a>부터 읽어 보세요.`, html: true };
  }

  function question() {
    const q = state.qs.at(state.i), n = state.qs.length;
    state.answered = false;
    root.innerHTML = `
      <p class="gm-progress"><span>${state.i + 1} / ${n}</span><span class="gm-bar" aria-hidden="true"><i style="width:${(state.i / n) * 100}%"></i></span><span class="gm-count">맞힌 문제 ${state.score}</span></p>
      <h2 class="gm-q" tabindex="-1">${esc(q.text)}</h2>
      <p class="gm-claim"><span>이렇게 말해도 될까요?</span>“${esc(q.claim)}”</p>
      <div class="gm-opts" role="group" aria-label="답 고르기">
        <button type="button" data-pick="cause">${LABEL.cause}</button>
        <button type="button" data-pick="corr">${LABEL.corr}</button>
      </div>
      <div class="gm-feedback" id="gm-feedback" aria-live="polite"></div>`;
    $(".gm-q", root).focus();
  }

  function answer(pick) {
    if (state.answered) return;
    state.answered = true;
    const q = state.qs.at(state.i), right = pick === q.answer;
    if (right) { state.score += 1; state.right[q.answer] += 1; } else state.wrong.push(q);
    $(".gm-count", root).textContent = `맞힌 문제 ${state.score}`;
    $(".gm-bar i", root).style.width = `${((state.i + 1) / state.qs.length) * 100}%`;
    track("game_answer", { q: q.id, correct: right });
    root.querySelectorAll("[data-pick]").forEach((b) => {
      b.disabled = true;
      if (b.dataset.pick === q.answer) b.classList.add("ok");
      else if (b.dataset.pick === pick) b.classList.add("no");
    });
    const last = state.i === state.qs.length - 1;
    $("#gm-feedback").innerHTML = `
      <p class="gm-verdict ${right ? "ok" : "no"}">${right ? "맞았습니다" : "아쉽습니다"}<span>정답: ${LABEL[q.answer]}</span></p>
      <p>${esc(q.why)}</p>
      <p class="gm-read"><a href="${esc(q.chapter.url)}" target="_blank" rel="noopener" data-event="read_chapter" data-event-params='${esc(JSON.stringify({ source: "game", chapter: q.chapter.url.split("/").pop().slice(0, 2) }))}'>${esc(q.chapter.title)} 읽기</a></p>
      <button type="button" class="btn" data-next>${last ? "결과 보기" : "다음 문제"}</button>`;
    $("[data-next]", root).focus();
  }

  function result() {
    const n = state.qs.length;
    const kinds = { corr: state.qs.filter((q) => q.answer === "corr").length, cause: state.qs.filter((q) => q.answer === "cause").length };
    const t = tier(state.score, n, state.right, kinds);
    track("game_complete", { score: state.score, total: n, cause_right: state.right.cause, corr_right: state.right.corr });
    if (window.hubStamp) { window.hubStamp("game"); if (state.score >= 8) window.hubStamp("sharp"); }
    const chNum = (c) => parseInt(c.url.split("/").pop(), 10) || 99;
    const chapters = [...new Map(state.wrong.map((q) => [q.chapter.url, q.chapter])).values()].sort((x, y) => chNum(x) - chNum(y));
    const share = window.hubShareUrl ? window.hubShareUrl("/game.html", "game") : location.href;
    root.innerHTML = `
      <p class="gm-kicker">결과</p>
      <p class="gm-score" tabindex="-1"><b>${state.score}</b> / ${n}</p>
      <p class="gm-split">인과라고 말할 수 있는 문제 ${state.right.cause} / ${kinds.cause} · 상관까지만인 문제 ${state.right.corr} / ${kinds.corr}</p>
      <h2>${esc(t.head)}</h2>
      <p class="gm-lede">${t.html ? t.body : esc(t.body)}</p>
      ${chapters.length ? `<div class="gm-review"><h3>다시 볼 장</h3><ul>${chapters.map((c) => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener" data-event="read_chapter" data-event-params='${esc(JSON.stringify({ source: "game_review", chapter: c.url.split("/").pop().slice(0, 2) }))}'>${esc(c.title)}</a></li>`).join("")}</ul></div>` : ""}
      <div class="gm-cta">
        <a class="btn" href="./?quiz=1">3문항으로 내 시작점 찾기</a>
        <button type="button" class="btn ghost" data-share-game>${navigator.share ? "공유하기" : "결과와 링크 복사"}</button>
        <button type="button" class="btn ghost" data-restart>다시 하기</button>
      </div>`;
    state.shareText = `상관일까, 인과일까? 10문제 중 ${state.score}개를 맞혔어요. 당신은 몇 개?`;
    state.shareUrl = share;
    $(".gm-score", root).focus();
  }

  async function shareResult(btn) {
    if (navigator.share) {
      try { await navigator.share({ title: "상관일까, 인과일까?", text: state.shareText, url: state.shareUrl }); track("share", { content: "game", method: "share_sheet" }); } catch (e) { /* dismissed */ }
      return;
    }
    const ok = window.hubCopy ? await window.hubCopy(`${state.shareText} ${state.shareUrl}`) : false;
    const label = btn.textContent;
    btn.textContent = ok ? "복사했습니다" : "복사하지 못했습니다";
    setTimeout(() => { btn.textContent = label; }, 1600);
    if (ok) track("share", { content: "game", method: "copy" });
  }

  async function start() {
    if (!state.qs.length) {
      const res = await fetch("data/game.json", { cache: "no-cache" });
      /* links come from data/game.json: keep only https chapter links */
      state.qs = (await res.json()).questions.map((q) => ({ ...q, chapter: { ...q.chapter, url: /^https:\/\//.test(q.chapter && q.chapter.url) ? q.chapter.url : "#" } }));
    }
    state.i = 0; state.score = 0; state.wrong = []; state.right = { corr: 0, cause: 0 };
    track("game_start", { retry: state.runs > 0 });
    state.runs += 1;
    question();
  }

  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-game-start], [data-restart]")) { start().catch(() => { root.innerHTML = "<p>문제를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>"; }); return; }
    const pick = e.target.closest("[data-pick]");
    if (pick) { answer(pick.dataset.pick); return; }
    if (e.target.closest("[data-next]")) { state.i += 1; if (state.i < state.qs.length) question(); else result(); return; }
    const sh = e.target.closest("[data-share-game]");
    if (sh) shareResult(sh);
  });
})();
