/* Google Analytics 4 for every page of the hub: the hub's own property. Local previews are not
   counted. Incoming utm_* (from shared links or other team sites) reach GA through page_location
   and are then removed from the address bar so the URL people copy stays clean. */
(() => {
  /* The hub's GA4 stream is G-C5V0X2SGD3. Until its own Google tag is served (it was combined into the
     web book's tag, G-BEBVKYH8HL, whose script then also sends to the web book's stream), the hub falls back to
     that shared tag, which is how it measured until now. Once the hub's destination is removed from the
     shared tag, gtag/js?id=G-C5V0X2SGD3 loads and the hub reports to its own property only. */
  const OWN = "G-C5V0X2SGD3", SHARED = "G-BEBVKYH8HL";
  if (location.hostname === "causalinferencelab.github.io") {
    const cfg = { page_location: location.href, allow_google_signals: false, allow_ad_personalization_signals: false };
    const load = (id, onerror) => {
      const s = document.createElement("script");
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
      if (onerror) s.onerror = onerror;
      document.head.appendChild(s);
    };
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", OWN, cfg);
    load(OWN, () => { window.gtag("config", SHARED, cfg); load(SHARED); });
  }
  try {
    const u = new URL(location.href);
    const drop = [...u.searchParams.keys()].filter((k) => k.startsWith("utm_"));
    /* keep where this visit came from for the rest of the tab's session (the hub's forum mode reads it) */
    if (drop.length) {
      try { sessionStorage.setItem("cil-hub-landing", JSON.stringify(Object.fromEntries(drop.map((k) => [k.slice(4), u.searchParams.get(k)])))); } catch (e) { /* storage off */ }
      window.hubLanding = Object.fromEntries(drop.map((k) => [k.slice(4), u.searchParams.get(k)]));
      drop.forEach((k) => u.searchParams.delete(k));
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    }
  } catch (e) { /* old browsers keep the URL as it is */ }
})();
