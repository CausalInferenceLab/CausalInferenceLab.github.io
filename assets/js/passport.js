/* Activity passport: stamps for learning on the hub and for taking part in the team
   (reviews, comments, projects). Stamps stay in this browser (localStorage); GA gets stamp_earned and
   passport_open with counts only. */
(() => {
  "use strict";
  const KEY = "cil-hub-stamps";
  const REPO = "https://github.com/CausalInferenceLab/CausalInferenceLab.github.io";
  /* auto: the hub sees it happen. self: done outside the hub (GitHub, an event, a store),
     so the visitor ticks it after doing it. */
  const GROUPS = [["roadmap", "로드맵"], ["learn", "배우기"], ["together", "함께하기"], ["build", "기여하기"]];
  /* one stamp per roadmap stage: the hub gives it when every quest in the stage is cleared */
  const STAGES = [["L0", "입", "입문"], ["L1", "개", "개념 완성"], ["L2", "실", "실전 적용"], ["L3", "도", "도구 개발"], ["L4", "연", "연구"]];
  const STAMPS = [
    ...STAGES.map(([id, mark, name]) => ({ id: `stage_${id}`, group: "roadmap", kind: "auto", mark, name: `${name} 클리어`, how: `로드맵 ${id} ${name} 스테이지의 퀘스트를 모두 클리어하세요.`, href: "/#curriculum" })),
    { id: "first_open", group: "learn", kind: "auto", mark: "첫", name: "첫 걸음", how: "커리큘럼에서 자료 하나를 열어 보세요.", href: "/#curriculum" },
    { id: "post", group: "learn", kind: "auto", mark: "글", name: "연재 독자", how: "연재 글을 하나 읽어 보세요.", href: "/#posts" },
    { id: "webbook", group: "learn", kind: "auto", mark: "책", name: "웹북 독자", how: "웹북 『Python으로 하는 인과추론』에서 한 장을 끝까지 읽어 보세요.", href: "/Causal-Inference-with-Python/" },
    { id: "builder", group: "learn", kind: "auto", mark: "B", name: "Builder 탐방", how: "Builder 세 명의 이력이나 페이지를 열어 보세요.", href: "/#contrib" },
    { id: "comment", group: "together", kind: "self", mark: "말", name: "레포에 한마디", how: "관심 있는 레포에 질문이나 응원을 남겨 보세요.", go: `${REPO}/discussions`, goLabel: "토론 게시판" },
    { id: "event_photo", group: "together", kind: "self", mark: "찰", name: "행사 사진 후기", how: "Data Forum 같은 팀 행사 사진과 한 줄 후기를 올려 보세요.", go: `${REPO}/discussions/new/choose`, goLabel: "후기 올리기" },
    { id: "review", group: "together", kind: "self", mark: "평", name: "강의·책 후기", how: "AI 인과추론 실무 강의나 『실무로 통하는 인과추론』 후기를 남겨 보세요.", go: "https://www.hanbit.co.kr/product/C0781073345", goLabel: "강의 페이지" },
    { id: "runner", group: "build", kind: "self", mark: "런", name: "러너로 참여", how: "가짜연구소 기수 모집 때 인과추론팀 프로젝트에 러너로 들어와 보세요.", go: "https://pseudo-lab.com/", goLabel: "가짜연구소" },
    { id: "first_pr", group: "build", kind: "self", mark: "PR", name: "첫 기여", how: "진행 중인 레포에 이슈나 PR을 하나 남겨 보세요.", go: "https://github.com/search?q=org%3ACausalInferenceLab+is%3Aissue+is%3Aopen&type=issues", goLabel: "열린 이슈" },
    { id: "open_project", group: "build", kind: "self", mark: "열", name: "Builder 되기", how: "다음 기수에 직접 프로젝트를 열어 보세요.", go: "https://github.com/CausalInferenceLab/Project-template", goLabel: "프로젝트 템플릿" }
  ];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
  const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* storage unavailable */ } };
  const today = () => { const d = new Date(); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };
  const earnedCount = (d) => STAMPS.filter((s) => d.stamps && d.stamps[s.id]).length;

  function paintCounts() {
    const d = load(), n = earnedCount(d);
    document.querySelectorAll("[data-passport-count]").forEach((el) => { el.textContent = `${n}/${STAMPS.length}`; });
  }

  let toastTimer, toastEl = null;
  function toast(stamp, n) {
    let el = toastEl || document.getElementById("hub-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "hub-toast"; el.className = "toast"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
    }
    toastEl = el;
    /* a modal dialog puts the page behind it, so the toast goes inside the top one */
    const open = [...document.querySelectorAll("dialog[open]")].pop();
    const host = open || document.body;
    if (el.parentNode !== host) host.appendChild(el);
    el.innerHTML = `<span class="stamp sm on" aria-hidden="true">${esc(stamp.mark)}</span><span><b>스탬프 획득 · ${esc(stamp.name)}</b><span>${n}/${STAMPS.length}</span></span><button type="button" data-passport="toast">여권 보기</button>`;
    el.classList.add("show");
    const hide = () => { toastTimer = setTimeout(() => el.classList.remove("show"), 4200); };
    clearTimeout(toastTimer); hide();
    /* stay while the pointer or keyboard is on it */
    el.onmouseenter = el.onfocusin = () => clearTimeout(toastTimer);
    el.onmouseleave = el.onfocusout = () => { clearTimeout(toastTimer); hide(); };
  }

  window.hubStamp = (id) => {
    const stamp = STAMPS.find((s) => s.id === id);
    if (!stamp) return false;
    const d = load();
    d.stamps = d.stamps || {};
    if (d.stamps[id]) return false;
    d.stamps[id] = today();
    save(d);
    const n = earnedCount(d);
    if (window.hubTrack) window.hubTrack("stamp_earned", { stamp: id, count: n });
    paintCounts(); toast(stamp, n);
    document.dispatchEvent(new CustomEvent("hub:stamp", { detail: { id } }));
    return true;
  };
  /* what the roadmap reads: the stamp list and whether one is earned */
  window.hubPassport = { stamps: STAMPS, has: (id) => !!(load().stamps || {})[id], count: () => earnedCount(load()) };
  /* Distinct things seen (Builders), so reloading one page three times does not count. */
  window.hubSeen = (key, value, need, stampId) => {
    const d = load();
    d.seen = d.seen || {};
    const list = new Set(d.seen[key] || []);
    list.add(value);
    d.seen[key] = [...list];
    save(d);
    if (list.size >= need) window.hubStamp(stampId);
  };

  function passportDialog(source) {
    let dlg = document.getElementById("passport-dialog");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "passport-dialog"; dlg.className = "station passport"; dlg.setAttribute("aria-labelledby", "passport-title");
      document.body.appendChild(dlg);
      dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-passport-close]")) dlg.close(); });
    }
    const d = load(), n = earnedCount(d), got = d.stamps || {};
    const next = STAMPS.find((x) => !got[x.id]);
    const row = (x) => {
      const on = !!got[x.id];
      const act = x.kind === "auto"
        ? (on ? "" : `<a class="pp-go" href="${esc(x.href)}" data-passport-close>해 보기</a>`)
        : `${x.go ? `<a class="pp-go" href="${esc(x.go)}" target="_blank" rel="noopener" data-event="passport_go" data-event-params='${esc(JSON.stringify({ stamp: x.id }))}'>${esc(x.goLabel || "하러 가기")} ↗</a>` : ""}${on ? "" : `<button type="button" class="pp-claim" data-claim="${esc(x.id)}">했어요</button>`}`;
      return `<li class="${on ? "on" : ""}"><span class="stamp ${on ? "on" : ""}" aria-hidden="true">${esc(x.mark)}</span>
        <span class="pp-t"><b>${esc(x.name)}</b><span>${on ? `${esc(got[x.id])} 획득` : esc(x.how)}</span></span>
        <span class="pp-act">${act}</span></li>`;
    };
    dlg.innerHTML = `<div class="station-inner"><div class="station-band" data-line="main"></div>
      <button type="button" class="station-close" aria-label="닫기" data-passport-close><svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3.5 3.5l9 9m0-9l-9 9"/></svg></button>
      <div class="station-content">
        <p class="quiz-step"><span>활동 여권</span></p>
        <h2 id="passport-title">스탬프 ${n} / ${STAMPS.length}</h2>
        <p class="pp-sub">${n === STAMPS.length ? "모든 스탬프를 모았습니다. 다음 기수에 Builder로 만나요." : next ? `다음 스탬프: <b>${esc(next.name)}</b>. ${esc(next.how)}` : ""}</p>
        ${GROUPS.map(([g, label]) => `<section class="pp-group"><h3>${label}</h3><ul class="pp-list">${STAMPS.filter((x) => x.group === g).map(row).join("")}</ul></section>`).join("")}
        <p class="pp-note">로드맵 스탬프는 스테이지를 클리어하면, 배우기 스탬프는 허브가 알아서 찍고, 함께하기와 기여하기는 하고 나서 ‘했어요’를 누르면 찍힙니다. 기록은 이 브라우저에만 저장됩니다.</p>
      </div></div>`;
    if (!dlg.open) { if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); }
    dlg.querySelector(".station-close").focus();
    if (window.hubTrack && source !== "claim") window.hubTrack("passport_open", { count: n, source: source || "header" });
  }
  window.openPassport = passportDialog;

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-passport]");
    if (b) { e.preventDefault(); passportDialog(b.dataset.passport || "header"); return; }
    const c = e.target.closest("[data-claim]");
    if (c) {
      window.hubStamp(c.dataset.claim);
      passportDialog("claim");
      /* the redraw replaced the dialog's content, toast included: put it back */
      const dlg = document.getElementById("passport-dialog");
      if (toastEl && dlg && toastEl.parentNode !== dlg) dlg.appendChild(toastEl);
    }
  });
  /* #passport (the web book links here) opens the passport */
  function openFromHash() {
    if (location.hash !== "#passport") return;
    history.replaceState(history.state, "", location.pathname + location.search);
    passportDialog("link");
    const dlg = document.getElementById("passport-dialog");
    if (toastEl && dlg && toastEl.parentNode && toastEl.parentNode !== dlg) dlg.appendChild(toastEl);
  }
  window.addEventListener("hashchange", openFromHash);
  document.addEventListener("DOMContentLoaded", () => {
    paintCounts();
    /* a Builder page view counts toward the Builder stamp */
    const m = location.pathname.match(/^\/builders\/([^/]+)\.html$/);
    if (m) window.hubSeen("builders", m[1], 3, "builder");
    /* the web book (same origin) keeps finished chapters in cil-book-read: one is enough for the stamp */
    try {
      const read = JSON.parse(localStorage.getItem("cil-book-read") || "{}");
      if (read && typeof read === "object" && Object.keys(read).length) window.hubStamp("webbook");
    } catch (e) { /* storage unavailable */ }
    openFromHash();
  });
})();
