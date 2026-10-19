(() => {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const title = document.getElementById("article-title");
  const meta = document.getElementById("article-meta");
  const body = document.getElementById("article-body");
  const more = document.getElementById("article-more");
  let articles = [];

  function notFound() {
    title.textContent = "글을 찾을 수 없습니다";
    meta.textContent = "";
    body.innerHTML = '<p>주소가 바뀌었을 수 있습니다. 오른쪽 목록이나 <a href="./#reading">읽을거리</a>에서 다시 골라 주세요.</p>';
  }

  async function show() {
    const slug = location.hash.replace(/^#/, "") || (articles[0] && articles[0].slug);
    const a = articles.find((x) => x.slug === slug);
    more.innerHTML = articles.filter((x) => x !== a).map((x) =>
      `<li><a class="article-card" href="#${esc(x.slug)}"><h3>${esc(x.title)}</h3><time datetime="${esc(x.date)}">${x.date.replace(/-/g, ".")}</time></a></li>`).join("");
    if (!a) { notFound(); return; }
    document.title = `${a.title} | 가짜연구소 인과추론팀`;
    title.textContent = a.title;
    meta.textContent = `${a.author} · ${a.date.replace(/-/g, ".")}`;
    try {
      const res = await fetch(`articles/${a.slug}.md`, { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status);
      const md = await res.text();
      body.innerHTML = window.marked ? window.marked.parse(md) : `<pre>${esc(md)}</pre>`;
      body.querySelectorAll("table").forEach((t) => {
        const w = document.createElement("div");
        w.className = "table-wrap";
        t.parentNode.insertBefore(w, t);
        w.appendChild(t);
      });
      body.querySelectorAll('a[href^="http"]').forEach((l) => { l.target = "_blank"; l.rel = "noopener"; });
      window.scrollTo(0, 0);
    } catch (e) {
      body.innerHTML = "<p>본문을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</p>";
    }
  }

  fetch("data/articles.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((list) => { articles = list; show(); })
    .catch(notFound);
  window.addEventListener("hashchange", show);
})();
