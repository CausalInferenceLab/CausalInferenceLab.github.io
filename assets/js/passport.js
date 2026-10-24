/* Learning passport: stamps for small actions across the hub, the game, the lab and the
   Builder pages. Stamps stay in this browser (localStorage); GA gets stamp_earned and
   passport_open with counts only. */
(() => {
  "use strict";
  const KEY = "cil-hub-stamps";
  const STAMPS = [
    { id: "first_open", mark: "첫", name: "첫 걸음", how: "커리큘럼에서 레포 하나를 열어 보세요.", href: "/#curriculum" },
    { id: "quiz", mark: "길", name: "길잡이", how: "3문항 시작점 진단을 끝내 보세요.", href: "/?quiz=1" },
    { id: "daily", mark: "오", name: "오늘의 한 문제", how: "허브의 오늘의 한 문제에 답해 보세요.", href: "/#daily" },
    { id: "streak3", mark: "3", name: "사흘 연속", how: "오늘의 한 문제를 3일 연속 풀어 보세요.", href: "/#daily" },
    { id: "game", mark: "몸", name: "몸풀기 완주", how: "‘상관일까, 인과일까?’ 10문제를 끝까지 풀어 보세요.", href: "/game.html" },
    { id: "sharp", mark: "감", name: "인과 감별사", how: "게임에서 8문제 이상 맞혀 보세요.", href: "/game.html" },
    { id: "lab", mark: "실", name: "실험가", how: "교란 실험실에서 편향을 0 가까이 줄여 보세요.", href: "/lab.html" },
    { id: "finish", mark: "완", name: "한 단계 완주", how: "한 단계의 자료를 모두 학습 완료로 표시해 보세요.", href: "/#curriculum" },
    { id: "builder", mark: "B", name: "Builder 탐방", how: "Builder 이력이나 페이지를 세 번 열어 보세요.", href: "/builders/" }
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

  let toastTimer;
  function toast(stamp, n) {
    let el = document.getElementById("hub-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "hub-toast"; el.className = "toast"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
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
    return true;
  };
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
    const next = STAMPS.find((s) => !got[s.id]);
    dlg.innerHTML = `<div class="station-inner"><div class="station-band" data-line="main"></div>
      <button type="button" class="station-close" aria-label="닫기" data-passport-close><svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3.5 3.5l9 9m0-9l-9 9"/></svg></button>
      <div class="station-content">
        <p class="quiz-step"><span>학습 여권</span></p>
        <h2 id="passport-title">스탬프 ${n} / ${STAMPS.length}</h2>
        <p class="pp-sub">${n === STAMPS.length ? "모든 스탬프를 모았습니다. 이제 다음 기수의 러너나 Builder로 만나요." : next ? `다음 스탬프: <b>${esc(next.name)}</b>. ${esc(next.how)}` : ""}</p>
        <ul class="pp-grid">${STAMPS.map((s) => {
          const on = !!got[s.id];
          return `<li class="${on ? "on" : ""}"><a href="${esc(s.href)}" data-passport-close><span class="stamp ${on ? "on" : ""}" aria-hidden="true">${esc(s.mark)}</span><b>${esc(s.name)}</b><span>${on ? `${esc(got[s.id])} 획득` : esc(s.how)}</span></a></li>`;
        }).join("")}</ul>
        <p class="pp-note">기록은 이 브라우저에만 저장됩니다. 다른 기기나 시크릿 창에서는 처음부터 시작합니다.</p>
      </div></div>`;
    if (!dlg.open) { if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); }
    dlg.querySelector(".station-close").focus();
    if (window.hubTrack) window.hubTrack("passport_open", { count: n, source: source || "header" });
  }
  window.openPassport = passportDialog;

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-passport]");
    if (b) { e.preventDefault(); passportDialog(b.dataset.passport || "header"); }
  });
  document.addEventListener("DOMContentLoaded", () => {
    paintCounts();
    /* a Builder page view counts toward the Builder stamp */
    const m = location.pathname.match(/^\/builders\/([^/]+)\.html$/);
    if (m) window.hubSeen("builders", m[1], 3, "builder");
  });
})();
