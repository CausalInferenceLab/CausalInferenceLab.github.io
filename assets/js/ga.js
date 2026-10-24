/* Google Analytics 4 for every page of the hub. The first ID is the hub's property;
   the second is the tag the web book already uses, kept so visits can be followed
   across both sites until one property is chosen. Local previews are not counted. */
(() => {
  const IDS = ["G-C5V0X2SGD3", "G-BEBVKYH8HL"];
  if (location.hostname !== "causalinferencelab.github.io") return;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${IDS[0]}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  IDS.forEach((id) => window.gtag("config", id));
})();
