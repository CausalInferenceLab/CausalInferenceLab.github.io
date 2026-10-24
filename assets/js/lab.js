/* Confounding lab: 800 simulated users. Loyalty z pushes both "notifications on" (T) and
   retention (Y); the slider sets how hard z pushes T. Y = 50 + 6z + effect*T + noise.
   Shows the true effect, the naive difference in means, and an OLS estimate adjusted for z. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const track = (n, p) => window.hubTrack && window.hubTrack(n, p);
  const N = 800, SVG_NS = "http://www.w3.org/2000/svg";
  let seed = 9, base = null, started = false, solved = false;

  function rng(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function draw(s) {
    const r = rng(s), normal = () => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    return Array.from({ length: N }, () => ({ z: normal(), u: r(), e: normal() * 4 }));
  }
  /* OLS of Y on [1, T, z]: solve the 3x3 normal equations. */
  function ols(rows) {
    const X = rows.map((d) => [1, d.t, d.z]), y = rows.map((d) => d.y);
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
    X.forEach((x, i) => { for (let j = 0; j < 3; j++) { b[j] += x[j] * y[i]; for (let k = 0; k < 3; k++) A[j][k] += x[j] * x[k]; } });
    for (let c = 0; c < 3; c++) {
      let p = c; for (let r2 = c + 1; r2 < 3; r2++) if (Math.abs(A[r2][c]) > Math.abs(A[p][c])) p = r2;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      if (Math.abs(A[c][c]) < 1e-9) return NaN;
      for (let r2 = 0; r2 < 3; r2++) if (r2 !== c) { const f = A[r2][c] / A[c][c]; for (let k = c; k < 3; k++) A[r2][k] -= f * A[c][k]; b[r2] -= f * b[c]; }
    }
    return [b[0] / A[0][0], b[1] / A[1][1], b[2] / A[2][2]];
  }
  const fmt = (v) => (Number.isFinite(v) ? `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}` : "계산 불가");

  function compute() {
    const conf = Number($("#in-conf").value), eff = Number($("#in-eff").value), rand = $("#in-rand").getAttribute("aria-pressed") === "true";
    const k = conf * 0.12;
    const rows = base.map((d) => { const p = rand ? 0.5 : 1 / (1 + Math.exp(-k * d.z)); const t = d.u < p ? 1 : 0; return { z: d.z, t, y: 50 + 6 * d.z + eff * t + d.e }; });
    const on = rows.filter((d) => d.t), off = rows.filter((d) => !d.t);
    const mean = (a) => a.reduce((s, d) => s + d.y, 0) / (a.length || 1);
    const mOn = mean(on), mOff = mean(off);
    const fit = ols(rows);
    return { conf, eff, rand, rows, mOn, mOff, naive: mOn - mOff, adj: Array.isArray(fit) ? fit[1] : NaN, fit, nOn: on.length };
  }

  function bars(r) {
    const hi = Math.max(10, r.eff, r.naive, Number.isFinite(r.adj) ? r.adj : 0) * 1.08;
    const w = (v) => `${Math.max(0, Math.min(100, (Math.max(0, v) / hi) * 100))}%`;
    $("#bar-true").style.width = w(r.eff); $("#bar-naive").style.width = w(r.naive); $("#bar-adj").style.width = w(r.adj);
    $("#v-true").textContent = fmt(r.eff); $("#v-naive").textContent = fmt(r.naive); $("#v-adj").textContent = fmt(r.adj);
    const bias = r.naive - r.eff;
    $("#lab-bias").innerHTML = r.rand
      ? `단순 비교와 진짜 효과의 차이 <b>${fmt(bias)}</b>: 800명 표본의 우연 오차 범위(±1 안팎)입니다.`
      : Math.abs(bias) <= 1
        ? `단순 비교의 편향 <b>${fmt(bias)}</b>: 진짜 효과에 거의 붙었습니다.`
        : `단순 비교의 편향 <b>${fmt(bias)}</b>: 진짜 효과보다 ${Math.abs(bias).toFixed(1)}점 ${bias > 0 ? "부풀려졌습니다" : "작게 나왔습니다"}.`;
    $("#out-conf").textContent = r.conf; $("#out-eff").textContent = `+${r.eff}`;
    /* while randomized, loyalty no longer decides who turns notifications on */
    const ctl = $("#in-conf").closest(".lab-ctl");
    ctl.classList.toggle("off", r.rand);
    $("#in-conf").setAttribute("aria-disabled", String(r.rand));
    ctl.querySelector("small").textContent = r.rand ? "무작위 배정 중: 충성도가 알림을 정하지 못합니다" : "충성도가 알림 켜기에 얼마나 영향을 주나";
  }

  function chart(r) {
    const svg = $("#lab-svg"); while (svg.lastChild && svg.lastChild.nodeName !== "desc") svg.removeChild(svg.lastChild);
    /* draw in the chart's own pixel size so labels stay readable on phones */
    const W = Math.max(300, Math.round(svg.parentElement.clientWidth - 40)), H = W < 480 ? 220 : Math.round(Math.min(360, Math.max(260, W * 0.62)));
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const small = W < 480, dot = small ? 2 : 2.6;
    const L = 40, R = W - 16, T = 14, B = H - 40, X = (z) => L + ((Math.max(-3, Math.min(3, z)) + 3) / 6) * (R - L), Y = (y) => B - ((Math.max(15, Math.min(85, y)) - 15) / 70) * (B - T);
    const el = (tag, a, parent = svg) => { const n = document.createElementNS(SVG_NS, tag); Object.entries(a).forEach(([k2, v]) => n.setAttribute(k2, v)); parent.appendChild(n); return n; };
    const g = el("g", { class: "axes" });
    [20, 35, 50, 65, 80].forEach((v) => { el("line", { x1: L, x2: R, y1: Y(v), y2: Y(v), class: "grid" }, g); el("text", { x: L - 8, y: Y(v) + 4, class: "tick", "text-anchor": "end" }, g).textContent = v; });
    [-2, 0, 2].forEach((v) => { el("text", { x: X(v), y: B + 18, class: "tick", "text-anchor": "middle" }, g).textContent = v === 0 ? "평균" : v < 0 ? "낮음" : "높음"; });
    el("text", { x: R, y: B + 34, class: "axis-t", "text-anchor": "end" }, g).textContent = "충성도 →";
    const dots = el("g", { class: "dots" });
    r.rows.forEach((d) => el("circle", { cx: X(d.z).toFixed(1), cy: Y(d.y).toFixed(1), r: dot, class: d.t ? "on" : "off" }, dots));
    /* the adjusted estimate: two parallel fitted lines, one per group, at the same loyalty */
    if (Array.isArray(r.fit)) {
      const [a, tau, bz] = r.fit, fitG = el("g", { class: "fit" });
      [[0, "off"], [1, "on"]].forEach(([tt, cls]) => el("line", { x1: X(-3), x2: X(3), y1: Y(a + bz * -3 + tau * tt), y2: Y(a + bz * 3 + tau * tt), class: `fit-l ${cls}` }, fitG));
      const zl = -2.2, yOn = Y(a + bz * zl + tau), yOff = Y(a + bz * zl);
      el("line", { x1: X(zl), x2: X(zl), y1: yOn, y2: yOff, class: "fit-gap" }, fitG);
      /* label in the sparse top-left corner, so it never sits on the dots or between close lines */
      el("text", { x: L + 8, y: T + 14, class: "fit-t" }, fitG).textContent = small ? `세로 실선 = 보정 ${fmt(tau)}` : `세로 실선(같은 충성도에서의 간격) = 보정 ${fmt(tau)}`;
    }
    const means = el("g", { class: "means" });
    [["on", r.mOn, "켬 평균"], ["off", r.mOff, "끔 평균"]].forEach(([cls, m, label]) => {
      el("line", { x1: L, x2: R, y1: Y(m), y2: Y(m), class: `mean ${cls}` }, means);
      const t = el("text", { x: R - 4, y: Y(m) + (cls === "on" ? -6 : 14), class: `mean-t ${cls}`, "text-anchor": "end" }, means); t.textContent = `${label} ${m.toFixed(1)}`;
    });
  }

  let moves = 0;
  function challenge(r) {
    if (solved) return;
    const close = Math.abs(r.naive - r.eff) <= 1;
    if (r.conf >= 5 && r.rand && close) {
      solved = true;
      $("#lab-challenge").classList.add("done");
      $("#lab-ch-text").textContent = "해냈습니다. 무작위로 켜면 충성도와 알림이 따로 움직여서, 단순 비교만으로도 진짜 효과에 가까워집니다. 이것이 무작위 실험이 하는 일입니다.";
      track("lab_challenge_complete", { randomized: true, conf: r.conf });
      if (window.hubStamp) window.hubStamp("lab");
      const learn = $("#lab-learn"); if (learn) learn.open = true;
      return;
    }
    if (r.rand && r.conf >= 5) {
      $("#lab-ch-text").textContent = "무작위 배정이 맞는 답입니다. 지금 남은 차이는 800명 표본의 우연 오차입니다. ‘새 사용자 800명 뽑기’를 눌러 보세요.";
    } else if (moves >= 8) {
      $("#lab-ch-text").textContent = "힌트: 교란 강도는 5 이상으로 그대로 두고, 슬라이더가 아닌 다른 버튼을 찾아보세요.";
    }
  }

  /* the sticky chart sits right under the header, whose height changes with the nav wrap */
  const header = document.querySelector(".site-header");
  const setHeader = () => { if (header) document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`); };
  setHeader(); window.addEventListener("resize", setHeader);

  function update(source) {
    if (source === "confounding" || source === "effect") moves += 1;
    const r = compute();
    bars(r); chart(r); challenge(r);
    if (source && !started) { started = true; track("lab_start", { control: source }); }
  }

  document.addEventListener("DOMContentLoaded", () => {
    base = draw(seed);
    $("#in-conf").addEventListener("input", () => update("confounding"));
    $("#in-eff").addEventListener("input", () => update("effect"));
    $("#in-rand").addEventListener("click", (e) => { const b = e.currentTarget; b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")); track("lab_randomize", { on: b.getAttribute("aria-pressed") === "true" }); update("randomize"); });
    $("#in-seed").addEventListener("click", () => { seed += 1; base = draw(seed); update("reseed"); });
    $("#lab-share").addEventListener("click", async (e) => {
      const url = window.hubShareUrl ? window.hubShareUrl("/lab.html", "lab") : location.href;
      const ok = window.hubCopy ? await window.hubCopy(url) : false;
      const b = e.currentTarget, label = b.textContent; b.textContent = ok ? "복사했습니다" : "복사하지 못했습니다"; setTimeout(() => { b.textContent = label; }, 1600);
      if (ok) track("share", { content: "lab", method: "copy" });
    });
    update();
    let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => chart(compute()), 150); });
  });
})();
