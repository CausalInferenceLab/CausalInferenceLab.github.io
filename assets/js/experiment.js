/* A/B tests on the hub through Iterglow (Pseudo-Lab's experiment platform).
   Off until data/experiments.json has "enabled": true, the project's public SDK key, and for each
   experiment the flag key and the sdk_v1 experiment id an Iterglow admin created. While off, the SDK
   is never loaded and nothing leaves the page.

   Other scripts ask for a variant and report the moment the variant could be seen:
     const v = await window.hubExperiment.variant("pseudo-greeting", 1200);  // "control", "treatment", ... or null
     window.hubExperiment.expose("pseudo-greeting");
   null means "no experiment": keep the page's normal behaviour. Goal events are the hub's own
   hubTrack events, mapped per experiment in experiments.json, and count only after an exposure. */
(() => {
  "use strict";
  const state = new Map(); // id -> { decision, exposure }
  let ready = null, sdk = null, cfg = null;

  function start() {
    if (ready) return ready;
    ready = fetch("data/experiments.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(async (c) => {
        if (!c || !c.enabled || !/^pk_/.test(c.apiKey || "") || !/^https:\/\//.test(c.baseUrl || "")) return null;
        cfg = c;
        const { IterglowSDK } = await import("../vendor/iterglow-sdk-0.3.0.js");
        sdk = new IterglowSDK({ apiKey: c.apiKey, baseUrl: c.baseUrl, eventModel: "sdk_v1" });
        return sdk;
      })
      .catch(() => null);
    return ready;
  }
  const find = (id) => (cfg && (cfg.experiments || []).find((x) => x.id === id && x.flagKey && x.experimentId)) || null;

  /* the variant for this visitor, or null when the experiment is off, unknown, slow or failing */
  async function variant(id, timeout = 1200) {
    const timer = new Promise((res) => setTimeout(() => res(null), timeout));
    const ask = (async () => {
      if (!(await start())) return null;
      const x = find(id);
      if (!x) return null;
      if (state.has(id)) return state.get(id).decision.variant;
      const d = await sdk.decide(x.flagKey, { experimentId: x.experimentId });
      if (!d || d.key !== x.flagKey || d.type !== "flag" || !d.variant || !d.tracking_context) return null;
      state.set(id, { decision: d, exposure: null });
      return d.variant;
    })().catch(() => null);
    const v = await Promise.race([ask, timer]);
    /* a decision that arrives after the timeout was never shown, so it is dropped rather than exposed */
    if (v === null && state.has(id) && !state.get(id).exposure) state.delete(id);
    return v;
  }

  /* call when the variant could actually be seen, in every arm, control included */
  async function expose(id) {
    const s = state.get(id);
    if (!s || s.exposure) return;
    try { s.exposure = await sdk.expose(s.decision); } catch (e) { /* not recorded; goals stay unattributed */ }
  }

  /* goals: the hub's own events, forwarded once an experiment has been exposed */
  function goal(name) {
    if (!cfg || !sdk) return;
    state.forEach((s, id) => {
      const x = find(id), g = x && x.goals && x.goals[name];
      if (!g || !s.exposure) return;
      sdk.track(g, { hub_event: name }, { tracking_context: s.exposure, eventId: crypto.randomUUID() }).catch(() => {});
    });
  }
  const wrap = () => {
    const orig = window.hubTrack;
    if (typeof orig !== "function" || orig.__exp) return;
    const wrapped = (name, params) => { orig(name, params); goal(name); };
    wrapped.__exp = true;
    window.hubTrack = wrapped;
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wrap); else wrap();

  window.hubExperiment = { variant, expose };
})();
