/* Analytics helpers shared by every hub page.
   - hubTrack(name, params): send a GA4 event when the tag is present.
   - Links to the team's other sites on this domain (the web book, causal-studio, ...) open in the same tab,
     carry utm_* so the other site's GA property can see the visit came from the hub, and send a click event. */
(function () {
  "use strict";
  window.hubTrack = function (name, params) {
    try { if (typeof window.gtag === "function") window.gtag("event", name, params || {}); } catch (e) {}
  };

  const HUB_PATHS = /^\/(?:$|index\.html$|article\.html$|404\.html$|assets\/|data\/|articles\/)/;
  const WEBBOOK = "Causal-Inference-with-Python";

  function teamSite(a) {
    let u;
    try { u = new URL(a.href, location.href); } catch (e) { return null; }
    if (u.origin !== location.origin || HUB_PATHS.test(u.pathname)) return null;
    const site = u.pathname.split("/")[1];
    return site ? { url: u, site } : null;
  }

  function placement(a) {
    const spots = [
      ["#featured", "featured"], [".partner", "partner"], ["#station-dialog", "station"],
      ["#shelf, #week, .spot", "curriculum"], [".reader, .prose", "article"], [".site-footer", "footer"], [".banner", "banner"]
    ];
    for (const [sel, name] of spots) if (a.closest(sel)) return name;
    return "other";
  }

  function decorate(e) {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    const t = teamSite(a);
    if (!t) return;
    const where = placement(a);
    const u = t.url;
    if (!u.searchParams.has("utm_source")) {
      u.searchParams.set("utm_source", "hub");
      u.searchParams.set("utm_medium", "referral");
      u.searchParams.set("utm_campaign", "crosslink");
      u.searchParams.set("utm_content", where);
      a.href = u.toString();
    }
    /* team sites are one family: open them in place, unless the reader asked for a new tab */
    if (e.type === "click" && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) a.removeAttribute("target");
    window.hubTrack(t.site === WEBBOOK ? "webbook_click" : "team_site_click", { site: t.site, placement: where, link_url: u.origin + u.pathname });
  }
  document.addEventListener("click", decorate, true);
  document.addEventListener("auxclick", decorate, true);
})();
