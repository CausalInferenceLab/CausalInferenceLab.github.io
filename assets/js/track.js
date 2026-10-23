/* Event layer for every page. Events go to GA4 when it is installed (gtag or dataLayer) and are
   dropped otherwise, so the code can ship before the measurement ID. Names follow the event
   dictionary in the PM doc; keep them in snake_case and the params flat. */
(() => {
  "use strict";
  const SITE = "https://causalinferencelab.github.io";
  window.hubTrack = (name, params = {}) => {
    try {
      if (typeof window.gtag === "function") window.gtag("event", name, params);
      else if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event: name, ...params });
      if (window.HUB_DEBUG) console.debug("[hub]", name, params);
    } catch (e) { /* never let measurement break the page */ }
  };
  /* Links people share carry utm tags so shared visits can be counted. */
  window.hubShareUrl = (path, medium) => `${SITE}${path}${path.includes("?") ? "&" : "?"}utm_source=share&utm_medium=${encodeURIComponent(medium)}`;
  window.hubCopy = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const t = document.createElement("textarea"); t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      t.remove(); return ok;
    }
  };
  /* Any element with data-track sends that event on click; data-track-params holds flat JSON. */
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-track]");
    if (!el) return;
    let params = {};
    try { params = JSON.parse(el.dataset.trackParams || "{}"); } catch (err) { params = {}; }
    window.hubTrack(el.dataset.track, params);
  });
  /* Buttons with data-copy copy their value and confirm in place. */
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    const ok = await window.hubCopy(b.dataset.copy);
    const label = b.dataset.label || b.textContent;
    b.dataset.label = label;
    b.textContent = ok ? "복사했습니다" : "복사하지 못했습니다";
    setTimeout(() => { b.textContent = label; }, 1600);
    if (ok && b.dataset.share) window.hubTrack("share", { content: b.dataset.share, method: "copy" });
  });
})();
