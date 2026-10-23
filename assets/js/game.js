/* "상관일까, 인과일까?": ten situations, one choice each, a reason and a web book chapter per answer. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const track = (n, p) => window.hubTrack && window.hubTrack(n, p);
  const LABEL = { corr: "상관까지만 말할 수 있다", cause: "인과라고 볼 수 있다" };
  const state = { qs: [], i: 0, score: 0, wrong: [], answered: false };
  const root = $("#game");

  function tier(score, n) {
    if (score >= n - 1) return { head: "인과 감각이 탄탄합니다", body: "실험과 준실험을 본격적으로 다루는 커리큘럼 L1–L2로 바로 가 보세요." };
    if (score >= Math.ceil(n * 0.6)) return { head: "좋은 출발입니다", body: "틀린 문제의 장부터 읽으면 빈틈이 빠르게 채워집니다." };
    return { head: "여기서부터 시작하면 됩니다", body: "처음이라면 영상으로 감을 잡고 웹북 1장부터 읽어 보세요." };
  }

  function question() {
    const q = state.qs.at(state.i), n = state.qs.length;
    state.answered = false;
    root.innerHTML = `
      <p class="gm-progress"><span>${state.i + 1} / ${n}</span><span class="gm-bar" aria-hidden="true"><i style="width:${(state.i / n) * 100}%"></i></span><span>맞힌 문제 ${state.score}</span></p>
      <h2 class="gm-q">${esc(q.text)}</h2>
      <div class="gm-opts" role="group" aria-label="답 고르기">
        <button type="button" data-pick="corr">${LABEL.corr}</button>
        <button type="button" data-pick="cause">${LABEL.cause}</button>
      </div>
      <div class="gm-feedback" id="gm-feedback"></div>`;
    $(".gm-opts button", root).focus();
  }

  function answer(pick) {
    if (state.answered) return;
    state.answered = true;
    const q = state.qs.at(state.i), right = pick === q.answer;
    if (right) state.score += 1; else state.wrong.push(q);
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
      <p class="gm-read"><a href="${esc(q.chapter.url)}" target="_blank" rel="noopener">${esc(q.chapter.title)} 읽기</a></p>
      <button type="button" class="btn" data-next>${last ? "결과 보기" : "다음 문제"}</button>`;
    $("[data-next]", root).focus();
  }

  function result() {
    const n = state.qs.length, t = tier(state.score, n);
    track("game_complete", { score: state.score });
    const chapters = [...new Map(state.wrong.map((q) => [q.chapter.url, q.chapter])).values()];
    const share = window.hubShareUrl ? window.hubShareUrl("/game.html", "game") : location.href;
    root.innerHTML = `
      <p class="gm-kicker">결과</p>
      <p class="gm-score"><b>${state.score}</b> / ${n}</p>
      <h2>${t.head}</h2>
      <p class="gm-lede">${t.body}</p>
      ${chapters.length ? `<div class="gm-review"><h3>다시 볼 장</h3><ul>${chapters.map((c) => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a></li>`).join("")}</ul></div>` : ""}
      <div class="gm-cta">
        <a class="btn" href="./?quiz=1">3문항으로 내 시작점 찾기</a>
        <button type="button" class="btn ghost" data-copy="${esc(share)}" data-share="game">친구에게 링크 보내기</button>
        <button type="button" class="btn ghost" data-restart>다시 하기</button>
      </div>`;
    $(".gm-score", root).focus?.();
  }

  async function start() {
    if (!state.qs.length) {
      const res = await fetch("data/game.json", { cache: "no-cache" });
      state.qs = (await res.json()).questions;
    }
    state.i = 0; state.score = 0; state.wrong = [];
    track("game_start", {});
    question();
  }

  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-game-start], [data-restart]")) { start().catch(() => { root.innerHTML = "<p>문제를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>"; }); return; }
    const pick = e.target.closest("[data-pick]");
    if (pick) { answer(pick.dataset.pick); return; }
    if (e.target.closest("[data-next]")) { state.i += 1; if (state.i < state.qs.length) question(); else result(); }
  });
})();
