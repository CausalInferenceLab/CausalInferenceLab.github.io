/* The header on every page other than the hub: the same six stops as the hub, and the next Data Forum
   badge until the day (sign-up while it is open, the date after). The hub draws its own (hub.js). */
(() => {
  "use strict";
  const ROOT = new URL("../../", document.currentScript ? document.currentScript.src : location.href).href;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const days = (iso) => Math.round((Date.parse(iso) - Date.parse(today())) / 864e5);
  const md = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${m}.${d}`; };
  const WD = "일월화수목금토";
  const dot = (iso) => `${iso.replace(/-/g, ".")}(${WD[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;
  const ICON = '<svg class="hdr-ev-i" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h11A1.5 1.5 0 0 1 17 6.5V8a2 2 0 0 0 0 4v1.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 13.5V12a2 2 0 0 0 0-4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 5.5v9" stroke="currentColor" stroke-width="1.4" stroke-dasharray="1.6 1.6"/></svg>';

  async function badge() {
    const el = document.getElementById("hdr-event");
    if (!el) return;
    let events = [];
    try { events = await fetch(`${ROOT}data/events.json`).then((r) => (r.ok ? r.json() : [])); } catch (e) { return; }
    const next = (Array.isArray(events) ? events : []).find((e) => e.upcoming && e.date && days(e.date) >= 0);
    if (!next) return;
    const t = today(), d = days(next.date), name = String(next.name).split(" - ")[0];
    const state = next.signupStart && t < next.signupStart ? "soon" : next.signupEnd && t > next.signupEnd ? "closed" : "open";
    const open = state === "open" && next.link;
    const title = open ? "참가자 모집 중" : state === "soon" ? "참가 신청 예정" : d === 0 ? "오늘 행사" : `행사 D-${d}`;
    const sub = open ? `${name} · ${next.signupEnd ? `${md(next.signupEnd)} 마감` : ""}` : state === "soon" ? `${name} · ${md(next.signupStart)} 오픈` : `${name} · ${dot(next.date)}`;
    el.className = `hdr-ev ${open ? "open" : state}`;
    if (open) { el.href = next.link; el.target = "_blank"; el.rel = "noopener"; } else el.href = `${ROOT}#events`;
    el.setAttribute("aria-label", `${name} ${title}${open ? ", 신청 페이지 열기" : ", 행사 안내로 이동"}`);
    el.dataset.event = "click_event";
    el.dataset.eventParams = JSON.stringify({ event_order: next.order, action: open ? "signup" : "event_info", placement: "header" });
    el.innerHTML = `${ICON}${open ? '<span class="hdr-ev-dot" aria-hidden="true"></span>' : ""}<span class="hdr-ev-t">${open ? '<span class="hdr-ev-long">참가자 </span>모집 중' : esc(title)}</span><span class="hdr-ev-s">${esc(sub)}</span>${open ? '<span class="hdr-ev-go" aria-hidden="true">↗</span>' : ""}`;
    el.hidden = false;
  }

  /* the rail under the stops fills up to the page you are on */
  function rail() {
    const nav = document.querySelector(".site-nav"), stops = nav ? [...nav.querySelectorAll("a.stn")] : [];
    const i = stops.findIndex((a) => a.getAttribute("aria-current") === "page");
    if (nav && stops.length > 1) nav.style.setProperty("--p", String(i < 0 ? 0 : i / (stops.length - 1)));
  }

  const start = () => { rail(); badge(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
