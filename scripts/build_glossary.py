"""Write data/glossary.json from the web book's glossary page.

The web book (Causal-Inference-with-Python) builds its glossary from the term table in its
TRANSLATION_GUIDE.md, with the chapters each term appears in most. The library page shows the
same terms, so this reads the published page instead of keeping a second copy by hand.

    python3 scripts/build_glossary.py                 # read the published page
    python3 scripts/build_glossary.py glossary.html   # read a saved copy

The deploy workflow runs it before collecting the site files. If the page cannot be read or looks
wrong, the committed data/glossary.json is kept and the deploy goes on.
"""
import datetime
import json
import os
import re
import sys
import urllib.request
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "https://causalinferencelab.github.io/Causal-Inference-with-Python/glossary.html"
OUT = os.path.join(ROOT, "data", "glossary.json")
SLUG = re.compile(r"^[A-Za-z0-9-]+$")


class Glossary(HTMLParser):
    """Collects h2 sections and, inside .gloss-table rows, the term, English, aliases and chapter links."""

    def __init__(self):
        super().__init__()
        self.sections, self.term, self.cell, self.grab, self.chip = [], None, None, None, None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = (a.get("class") or "").split()
        if tag == "h2":
            self.grab = "h2"; self.buf = ""
        elif tag == "tr" and (a.get("id") or "").startswith("term-"):
            self.term = {"id": a["id"], "ko": "", "en": "", "alias": [], "chapters": []}
        elif self.term is not None and tag == "td":
            self.cell = a.get("data-label")
        elif self.term is not None and tag == "strong" and self.cell == "번역어":
            self.grab = "ko"; self.buf = ""
        elif self.term is not None and tag == "span" and "gloss-alias" in cls:
            self.grab = "alias"; self.buf = ""
        elif self.term is not None and tag == "a" and "ch-chip" in cls:
            slug = (a.get("href") or "").rsplit("/", 1)[-1].removesuffix(".html")
            self.chip = {"slug": slug, "title": a.get("title") or "", "num": ""}
        elif self.chip is not None and tag == "strong":
            self.grab = "num"; self.buf = ""

    def handle_data(self, data):
        if self.grab:
            self.buf += data
        elif self.term is not None and self.cell == "원어":
            self.term["en"] += data

    def handle_endtag(self, tag):
        if tag == "h2" and self.grab == "h2":
            self.sections.append({"name": self.buf.strip(), "terms": []}); self.grab = None
        elif tag == "strong" and self.grab in ("ko", "num"):
            if self.grab == "ko":
                self.term["ko"] = self.buf.strip()
            else:
                self.chip["num"] = self.buf.strip()
            self.grab = None
        elif tag == "span" and self.grab == "alias":
            text = self.buf.replace("다른 표기:", "").strip()
            self.term["alias"] = [x.strip() for x in text.split(",") if x.strip()]
            self.grab = None
        elif tag == "a" and self.chip is not None:
            if SLUG.match(self.chip["slug"]):
                self.term["chapters"].append(self.chip)
            self.chip = None
        elif tag == "td":
            self.cell = None
        elif tag == "tr" and self.term is not None:
            self.term["en"] = re.sub(r"\s+", " ", self.term["en"]).strip()
            if self.term["ko"] and self.sections:
                self.sections[-1]["terms"].append(self.term)
            self.term = None


def main():
    try:
        if len(sys.argv) > 1:
            with open(sys.argv[1], encoding="utf-8") as f:
                page = f.read()
        else:
            page = urllib.request.urlopen(URL, timeout=30).read().decode("utf-8")
        p = Glossary()
        p.feed(page)
        sections = [s for s in p.sections if s["terms"]]
        n = sum(len(s["terms"]) for s in sections)
        if n < 50:
            raise ValueError(f"only {n} terms found")
    except Exception as e:  # keep the committed file
        print(f"glossary kept as is: {e}")
        return
    data = {"source": URL, "updated": datetime.date.today().isoformat(), "sections": sections}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"glossary: {len(sections)} sections, {n} terms")


if __name__ == "__main__":
    main()
