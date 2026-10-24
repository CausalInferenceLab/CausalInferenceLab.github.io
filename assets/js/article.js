(() => {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const title = document.getElementById("article-title");
  const meta = document.getElementById("article-meta");
  const body = document.getElementById("article-body");
  const more = document.getElementById("article-more");
  const after = document.getElementById("article-after");
  let articles = [], builders = [];

  function notFound() {
    title.textContent = "글을 찾을 수 없습니다";
    meta.textContent = "";
    body.innerHTML = '<p>주소가 바뀌었을 수 있습니다. 오른쪽 목록이나 <a href="./#posts">연재 목록</a>에서 다시 골라 주세요.</p>';
  }

  async function show() {
    const slug = location.hash.replace(/^#/, "") || (articles[0] && articles[0].slug);
    const a = articles.find((x) => x.slug === slug);
    more.innerHTML = articles.filter((x) => x !== a && !x.url).map((x) =>
      `<li><a class="article-card" href="#${esc(x.slug)}"><h3>${esc(x.title)}</h3><time datetime="${esc(x.date)}">${esc(String(x.date).replace(/-/g, "."))}</time></a></li>`).join("");
    if (!a) { notFound(); return; }
    document.title = `${a.title} | Causal Inference Hub`;
    title.textContent = a.title;
    meta.textContent = `${a.series ? `${a.series}${a.episode ? ` ${a.episode}편` : ""} · ` : ""}${a.author} · ${String(a.date).replace(/-/g, ".")}`;
    /* the writer, and the next and previous parts of the same series */
    const b = builders.find((x) => x.name === a.author);
    const slugOk = b && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(b.slug || "");
    const series = a.series ? articles.filter((x) => x.series === a.series && !x.url).sort((x, y) => (x.episode || 0) - (y.episode || 0)) : [];
    const i = series.indexOf(a), prev = series[i - 1], next = series[i + 1];
    after.innerHTML = `<div class="writer"><span class="k">글쓴이</span><b>${esc(a.author)}</b>${slugOk ? `<a href="builders/${esc(b.slug)}.html">Builder 페이지</a>` : ""}</div>
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
      if (window.hubStamp) window.hubStamp("post");
    } catch (e) {
      body.innerHTML = "<p>본문을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</p>";
    }
  }

  Promise.all([
    fetch("data/articles.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("data/builders.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => [])
  ])
    .then(([list, people]) => { articles = list; builders = people; show(); })
    .catch(notFound);
  window.addEventListener("hashchange", show);
})();
