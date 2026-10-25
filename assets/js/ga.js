/* Google Analytics 4 for every page of the hub: the hub's own property. Local previews are not
   counted. Incoming utm_* (from shared links or other team sites) reach GA through page_location
   and are then removed from the address bar so the URL people copy stays clean. */
(() => {
  /* ID is the hub's GA4 stream. Google serves no tag script for that ID on its own (gtag/js?id=ID is a 404);
     the stream's Google tag is TAG, so the script loads from TAG and only ID is configured, which keeps the
     hub's events in the hub's property. */
  const ID = "G-C5V0X2SGD3";
  const TAG = "G-BEBVKYH8HL";
  if (location.hostname === "causalinferencelab.github.io") {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${TAG}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", ID, { page_location: location.href, allow_google_signals: false, allow_ad_personalization_signals: false });
  }
  try {
    const u = new URL(location.href);
    const drop = [...u.searchParams.keys()].filter((k) => k.startsWith("utm_"));
    if (drop.length) {
      drop.forEach((k) => u.searchParams.delete(k));
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    }
  } catch (e) { /* old browsers keep the URL as it is */ }
})();
