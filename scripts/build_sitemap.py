"""Write sitemap.xml for the whole causalinferencelab.github.io domain.

The hub owns the domain root, so its sitemap also lists the team's other sites served under it
(the web book, Causal Studio and the rest, from data/repos.json) and every Builder page.
Run after build_builders.py in the deploy workflow; the file is not committed.
"""
import datetime
import json
import os
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://causalinferencelab.github.io/"


def load(name):
    with open(os.path.join(ROOT, "data", name), encoding="utf-8") as f:
        return json.load(f)


def main():
    today = datetime.date.today().isoformat()
    urls = [(BASE, "1.0"), (BASE + "game.html", "0.6"), (BASE + "lab.html", "0.6"), (BASE + "builders/", "0.7")]
    urls += [(f"{BASE}builders/{b['slug']}.html", "0.5") for b in load("builders.json") if b.get("slug")]
    for r in load("repos.json"):
        site = (r.get("site") or "").split("#")[0]
        if site.startswith(BASE) and "." not in site.rstrip("/").rsplit("/", 1)[-1] and not site.endswith("/"):
            site += "/"
        if site.startswith(BASE) and site != BASE:
            urls.append((site, "0.8"))
    seen, rows = set(), []
    for loc, pri in urls:
        if loc in seen:
            continue
        seen.add(loc)
        rows.append(f"  <url><loc>{escape(loc)}</loc><lastmod>{today}</lastmod><priority>{pri}</priority></url>")
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(rows) + "\n</urlset>\n"
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(xml)
    print(f"sitemap.xml: {len(rows)} URLs")


if __name__ == "__main__":
    main()
