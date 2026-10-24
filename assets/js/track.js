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
  /* Any element with data-event sends that event on click; data-event-params holds flat JSON. */
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-event]");
    if (!el) return;
    let params = {};
    try { params = JSON.parse(el.dataset.eventParams || "{}"); } catch (err) { params = {}; }
    window.hubTrack(el.dataset.event, params);
  });
  /* Profile photos that fail to load leave the initial underneath (no inline onerror, so a CSP can forbid inline handlers). */
  document.addEventListener("error", (e) => { const t = e.target; if (t && t.tagName === "IMG" && t.hasAttribute("data-fallback")) t.remove(); }, true);
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

/* Links to the team's other sites on this domain (the web book, causal-studio, ccwr, ...): add utm_*
   so that site's GA sees the visit came from the hub and from which spot, open them in the same tab
   unless the reader asked for a new one, and send webbook_click or team_site_click. */
(() => {
  "use strict";
  const HUB_PATHS = /^\/(?:$|index\.html$|article\.html$|404\.html$|game\.html$|lab\.html$|assets\/|data\/|articles\/|builders\/|badges\/)/;
  const WEBBOOK = "Causal-Inference-with-Python";
  const SPOTS = [
    ["#featured", "featured"], [".partner", "partner"], ["#station-dialog", "station"], ["#daily", "daily"],
    ["#shelf, #week, .spot", "curriculum"], [".gm", "game"], [".lab", "lab"], [".bp", "builder_page"],
    [".reader, .prose", "article"], [".site-footer", "footer"], [".banner", "banner"]
  ];
  function teamSite(a) {
    let u;
    try { u = new URL(a.href, location.href); } catch (e) { return null; }
    if (u.origin !== location.origin || HUB_PATHS.test(u.pathname)) return null;
    const site = u.pathname.split("/")[1];
    return site ? { url: u, site } : null;
  }
  const placement = (a) => (SPOTS.find(([sel]) => a.closest(sel)) || [null, "other"])[1];
  function decorate(e) {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    const t = teamSite(a);
    if (!t) return;
    const where = placement(a), u = t.url;
    if (!u.searchParams.has("utm_source")) {
      u.searchParams.set("utm_source", "hub");
      u.searchParams.set("utm_medium", "referral");
      u.searchParams.set("utm_campaign", "crosslink");
      u.searchParams.set("utm_content", where);
      a.href = u.toString();
    }
    if (e.type === "click" && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) a.removeAttribute("target");
    window.hubTrack(t.site === WEBBOOK ? "webbook_click" : "team_site_click", { site: t.site, placement: where, link_url: u.origin + u.pathname });
  }
  document.addEventListener("click", decorate, true);
  document.addEventListener("auxclick", decorate, true);
})();
