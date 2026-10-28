(() => {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const title = document.getElementById("article-title");
  const meta = document.getElementById("article-meta");
  const body = document.getElementById("article-body");
  const more = document.getElementById("article-more");
  const after = document.getElementById("article-after");
  let articles = [], builders = [], paid = [], sites = [];
  /* posts dated in the future are not listed until their day (Korean time); a direct link still opens them */
  const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const published = (x) => String(x.date || "") <= todayKST();

  function notFound() {
    title.textContent = "글을 찾을 수 없습니다";
    meta.textContent = "";
    body.innerHTML = '<p>주소가 바뀌었을 수 있습니다. 오른쪽 목록이나 <a href="./#posts">연재 목록</a>에서 다시 골라 주세요.</p>';
  }

  async function show() {
    const slug = location.hash.replace(/^#/, "") || (articles[0] && articles[0].slug);
    const a = articles.find((x) => x.slug === slug);
    more.innerHTML = articles.filter((x) => x !== a && !x.url && published(x)).map((x) =>
      `<li><a class="article-card" href="#${esc(x.slug)}"><h3>${esc(x.title)}</h3><time datetime="${esc(x.date)}">${esc(String(x.date).replace(/-/g, "."))}</time></a></li>`).join("");
    if (!a) { notFound(); return; }
    document.title = `${a.title} | Causal Inference Hub`;
    title.textContent = a.title;
    meta.textContent = `${a.series ? `${a.series}${a.episode ? ` ${a.episode}편` : ""} · ` : ""}${a.author} · ${String(a.date).replace(/-/g, ".")}`;
    /* the writer, and the next and previous parts of the same series */
    const b = builders.find((x) => x.name === a.author);
    const slugOk = b && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(b.slug || "");
    const series = a.series ? articles.filter((x) => x.series === a.series && !x.url && (published(x) || x === a)).sort((x, y) => (x.episode || 0) - (y.episode || 0)) : [];
    const i = series.indexOf(a), prev = series[i - 1], next = series[i + 1];
    /* the book and lecture this post belongs with, one click to Hanbit */
    const rel = (a.related || []).map((id) => paid.find((p) => p.id === id)).filter(Boolean);
    /* team sites on this domain (the web book, causal-studio, ...) */
    const relSites = (a.related || []).map((id) => sites.find((r) => r.repo === id)).filter((r) => r && /^https:\/\/causalinferencelab\.github\.io\//.test(r.site || ""));
    const siteHTML = relSites.map((r) => `<li><a href="${esc(r.site)}"><img src="assets/img/team-mark.png" alt="" width="40" height="40"><span><b>${esc(r.title)}</b><span>${esc(r.level || "")}${r.level ? " · " : ""}무료 · 가짜연구소 인과추론팀</span></span></a></li>`).join("");
    const relHTML = rel.length || relSites.length ? `<div class="post-related"><p class="k">${rel.length ? (relSites.length ? "이 글과 이어지는 자료" : "이 글과 이어지는 책·강의") : "이 글과 이어지는 자료"}</p><ul>${siteHTML}${rel.map((p) => { const out = (p.links || [])[0]; const url = out && /^https:\/\//.test(out.url) ? out.url : ""; return url ? `<li><a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(p.cover)}" alt="" width="${p.type === "도서" ? 30 : 52}" height="40"><span><b>${esc(p.shortTitle || p.title)}</b><span>${esc(p.type)} · ${esc(p.type === "도서" ? "인과추론팀 옮김" : `강사 ${p.credit || ""}`)} · 한빛미디어</span></span></a></li>` : ""; }).join("")}</ul></div>` : "";
    after.innerHTML = relHTML + `<div class="writer"><span class="k">글쓴이</span><b>${esc(a.author)}</b>${slugOk ? `<a href="builders/${esc(b.slug)}.html">Builder 페이지</a>` : ""}</div>
      ${prev || next ? `<nav class="series-nav" aria-label="연재 이동">${prev ? `<a href="#${esc(prev.slug)}"><span>이전 편</span>${esc(prev.title)}</a>` : "<span></span>"}${next ? `<a class="next" href="#${esc(next.slug)}"><span>다음 편</span>${esc(next.title)}</a>` : ""}</nav>` : ""}`;
    try {
      const res = await fetch(`articles/${a.slug}.md`, { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status);
      const md = await res.text();
      /* articles come from pull requests: never render their HTML unsanitised */
      body.innerHTML = window.marked && window.DOMPurify
        ? window.DOMPurify.sanitize(window.marked.parse(md), { USE_PROFILES: { html: true } })
        : `<pre>${esc(md)}</pre>`;
      body.querySelectorAll("table").forEach((t) => {
        const w = document.createElement("div");
        w.className = "table-wrap";
        t.parentNode.insertBefore(w, t);
        w.appendChild(t);
      });
      body.querySelectorAll('a[href^="http"]').forEach((l) => { l.target = "_blank"; l.rel = "noopener"; });
      window.scrollTo(0, 0);
      /* the post stamp is for reading to the end, and so it does not cover the text on arrival */
      if (window.hubStamp && "IntersectionObserver" in window) {
        const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); window.hubStamp("post"); } });
        io.observe(after);
      }
    } catch (e) {
      body.innerHTML = "<p>본문을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</p>";
    }
  }

  Promise.all([
    fetch("data/articles.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("data/builders.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => []),
    fetch("data/map.json", { cache: "no-cache" }).then((r) => r.json()).then((m) => m.paid || []).catch(() => []),
    fetch("data/repos.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => [])
  ])
    .then(([list, people, books, repos]) => { articles = list; builders = people; paid = books; sites = repos; show(); })
    .catch(notFound);
  window.addEventListener("hashchange", show);
})();
