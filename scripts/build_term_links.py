"""Write data/term_links.json: for each glossary term, the team materials outside the web book that use it most.

The web book's glossary already says which chapters use a term. This looks for the same terms in the team's
other repositories (study slides, Causal Studio notebooks, the book's code, study notes, case decks) so the
library's glossary can point from a term to where the team explained or used it.

    python3 scripts/build_term_links.py <folder with clones>      # e.g. a folder holding causal-studio/, OCE-Materials/, ...
    python3 scripts/build_term_links.py <folder> --check-urls      # also check that site pages exist (slower)

Clone the repositories first (a shallow clone is enough):

    for r in causal-studio OCE-Materials ...; do git clone --depth 1 https://github.com/CausalInferenceLab/$r.git; done

What counts:
- Markdown files, notebook markdown cells, and PDF pages (with pdftotext from poppler-utils).
- A term is looked for by its Korean name and other spellings (spaces ignored) and by its English name
  (whole words). Very common words (결과, 처치, bias, ...) are skipped: a link from them would point anywhere.
- A document scores by how often it uses the term, more when the term is in a heading or the file name.
  Documents named after the term come first; others need several mentions or a heading. Each term keeps
  up to four documents, at most two from one repository.
- Links go to the team's site page when the repository publishes one (Causal Studio, the study notes book),
  otherwise to the file on GitHub. PDFs keep the page with the most mentions.
Run it again when the team repositories change, and commit data/term_links.json.
"""
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "term_links.json")
ORG = "https://github.com/CausalInferenceLab"
SKIP_REPOS = {"Causal-Inference-with-Python", "CausalInferenceLab.github.io", "Project-template", "python-causality-handbook"}
SKIP_DIRS = {".git", "_build", "node_modules", ".github", "site-packages", "__pycache__", ".ipynb_checkpoints"}
PER_TERM, PER_REPO, MIN_SCORE, MIN_BODY = 4, 2, 4, 9
# words too common to point anywhere useful
COMMON_KO = {"결과", "처치", "개입", "구간", "전환", "잡음", "절편", "특성", "노드", "엣지", "편향", "모델", "추정값", "변수", "분산", "평균", "표본", "가설", "효과", "지표", "넛지", "데이터"}
COMMON_EN = {"treatment", "outcome", "bias", "noise", "unit", "feature", "parameter", "estimate", "model", "variance",
             "mean", "sample", "effect", "metric", "intervention", "conversion", "residual", "intercept", "band", "nudge",
             "consistency", "relevance", "interaction", "estimator", "node", "edge", "chain", "fork", "parent", "child"}


def squash(s):
    return re.sub(r"\s+", "", s or "")


def forms(term):
    """Korean spellings (spaces removed) and English patterns for a term."""
    ko = []
    for s in [term.get("ko", "")] + list(term.get("alias") or []):
        for part in re.split(r"\s*/\s*", s):
            for p in [re.sub(r"\(.*?\)", "", part)] + re.findall(r"\((.*?)\)", part):
                p = squash(p)
                if re.search(r"[가-힣]", p) and len(p) >= 2 and p not in COMMON_KO and not (len(p) == 2 and p in COMMON_KO):
                    ko.append(p)
    en = []
    for part in re.split(r"\s*[/,]\s*", term.get("en", "")):
        base = re.sub(r"\(.*?\)", "", part).strip()
        for p in [base] + re.findall(r"\(([^)]*)\)", part):
            p = p.strip()
            if not p or re.search(r"[가-힣]", p) or p.lower() in COMMON_EN:
                continue
            if re.fullmatch(r"[A-Z]{2,6}", p):
                en.append(re.compile(rf"(?<![A-Za-z]){re.escape(p)}(?![A-Za-z])"))
            elif " " in p or "-" in p or len(p) >= 11:
                en.append(re.compile(rf"(?<![A-Za-z]){re.escape(p).replace(r'\ ', r'[\s-]+').replace(r'\-', r'[\s-]?')}(?![A-Za-z])", re.I))
    # two-letter Korean terms only when nothing longer exists (they match inside too many words)
    if any(len(k) >= 3 for k in ko):
        ko = [k for k in ko if len(k) >= 3]
    return sorted(set(ko)), en


def md_text(path):
    with open(path, encoding="utf-8", errors="ignore") as f:
        t = f.read()
    heads = "\n".join(re.findall(r"^#{1,4}\s+(.+)$", t, re.M))
    title = (re.findall(r"^#\s+(.+)$", t, re.M) or [None])[0]
    return t, heads, title


def nb_text(path):
    try:
        with open(path, encoding="utf-8") as f:
            nb = json.load(f)
    except Exception:
        return "", "", None
    md = ["".join(c.get("source", "")) if isinstance(c.get("source"), list) else c.get("source", "")
          for c in nb.get("cells", []) if c.get("cell_type") == "markdown"]
    t = "\n".join(md)
    heads = "\n".join(re.findall(r"^#{1,4}\s+(.+)$", t, re.M))
    title = (re.findall(r"^#{1,2}\s+(.+)$", t, re.M) or [None])[0]
    return t, heads, title


def pdf_pages(path):
    try:
        out = subprocess.run(["pdftotext", "-layout", "-q", path, "-"], capture_output=True, timeout=120).stdout.decode("utf-8", "ignore")
    except Exception:
        return []
    return out.split("\f")


def clean_title(s, fallback):
    s = re.sub(r"[*_`#]|\[(.*?)\]\(.*?\)", lambda m: m.group(1) or "", s or "").strip()
    s = re.sub(r"<[^>]+>", "", s).strip()
    return (s or fallback)[:80]


def file_title(rel):
    stem = os.path.splitext(os.path.basename(rel))[0]
    stem = re.sub(r"^\d{8}_", "", stem)
    return stem.replace("_", " ").strip()


def site_url(repo, rel, info):
    """The team site's page for a file, when the repository publishes one."""
    site = (info or {}).get("site") or ""
    if repo == "causal-studio" and rel.startswith("book/") and rel.endswith(".ipynb"):
        slug = re.sub(r"^\d+_", "", os.path.splitext(os.path.basename(rel))[0]).replace("_", "-").lower()
        return f"https://causalinferencelab.github.io/causal-studio/{slug}"
    if site.startswith("https://causalinferencelab.github.io/") and rel.startswith("book/") and rel.endswith((".md", ".ipynb")):
        base = site.rsplit("/", 1)[0] + "/" if site.endswith(".html") else site.rstrip("/") + "/"
        return base + urllib.parse.quote(os.path.splitext(rel[len("book/"):])[0]) + ".html"
    return None


def gh_url(repo, branch, rel, page=None):
    return f"{ORG}/{repo}/blob/{branch}/{urllib.parse.quote(rel)}" + (f"#page={page}" if page else "")


def kind_of(rel):
    if rel.endswith(".pdf"):
        return "slides"
    if rel.endswith(".ipynb"):
        return "code"
    return "read"


def url_ok(url, cache={}):
    if url not in cache:
        try:
            req = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(req, timeout=15) as r:
                cache[url] = r.status < 400
        except Exception as e:
            cache[url] = getattr(e, "code", 0) in (301, 302)
    return cache[url]


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    base, check = sys.argv[1], "--check-urls" in sys.argv
    with open(os.path.join(ROOT, "data", "glossary.json"), encoding="utf-8") as f:
        terms = [t for s in json.load(f)["sections"] for t in s.get("terms", []) if str(t.get("id", "")).startswith("term-")]
    with open(os.path.join(ROOT, "data", "repos.json"), encoding="utf-8") as f:
        repos = {r["repo"]: r for r in json.load(f)}
    pats = {t["id"]: forms(t) for t in terms}

    docs = []  # (repo, rel, title, kind, text per unit [(page, text, heads)], branch)
    for repo in sorted(os.listdir(base)):
        path = os.path.join(base, repo)
        if repo in SKIP_REPOS or repo not in repos or not os.path.isdir(os.path.join(path, ".git")):
            continue
        branch = subprocess.run(["git", "-C", path, "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True).stdout.strip() or "main"
        for d, dirs, files in os.walk(path):
            dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
            for fn in files:
                full = os.path.join(d, fn)
                rel = os.path.relpath(full, path).replace(os.sep, "/")
                if fn.lower() in ("license.md", "contributing.md", "code_of_conduct.md") or "/_en" in rel or rel.endswith("_en.ipynb") or rel.endswith("_en.md"):
                    continue
                if fn.endswith(".md"):
                    t, h, title = md_text(full)
                    units = [(None, t, h)]
                elif fn.endswith(".ipynb"):
                    t, h, title = nb_text(full)
                    units = [(None, t, h)]
                elif fn.lower().endswith(".pdf"):
                    pages = pdf_pages(full)
                    units = [(i + 1, p, p.strip().split("\n", 1)[0]) for i, p in enumerate(pages) if p.strip()]
                    title = None
                else:
                    continue
                if not any(u[1].strip() for u in units):
                    continue
                docs.append({"repo": repo, "rel": rel, "branch": branch, "title": clean_title(title, file_title(rel)), "kind": kind_of(rel),
                             "readme": fn.lower() == "readme.md", "units": units, "fname": squash(file_title(rel)).lower()})
    print(f"{len(docs)} documents in {len({d['repo'] for d in docs})} repositories", file=sys.stderr)

    out = {}
    for t in terms:
        ko, en = pats[t["id"]]
        if not ko and not en:
            continue
        hits = []
        for doc in docs:
            best_page, best, total, head = None, 0, 0, 0
            for page, text, heads in doc["units"]:
                st = squash(text)
                n = sum(st.count(k) for k in ko) + sum(len(p.findall(text)) for p in en)
                if not n:
                    continue
                total += min(n, 6)
                sh = squash(heads)
                if any(k in sh for k in ko) or any(p.search(heads) for p in en):
                    head += 1
                if n > best:
                    best, best_page = n, page
            if not total:
                continue
            title_hit = any(k in squash(doc["title"]) for k in ko) or any(p.search(doc["title"]) for p in en) or any(k.lower() in doc["fname"] for k in ko)
            score = total + 6 * min(head, 3) + 10 * title_hit
            if doc["readme"]:
                score //= 2
            # a passing mention does not make a document about the term
            if score >= (MIN_SCORE if title_hit else MIN_BODY):
                hits.append((score, doc, best_page, title_hit))
        hits.sort(key=lambda h: (not h[3], -h[0], h[1]["repo"], h[1]["rel"]))
        picked, per = [], {}
        for score, doc, page, title_hit in hits:
            if per.get(doc["repo"], 0) >= PER_REPO:
                continue
            # the same deck uploaded twice (or in two versions) counts once
            key = squash(doc["title"]).lower()[:14]
            if any(e["repo"] == doc["repo"] and squash(e["title"]).lower()[:14] == key for e in picked):
                continue
            url = site_url(doc["repo"], doc["rel"], repos.get(doc["repo"]))
            if url and check and not url_ok(url):
                url = None
            entry = {"repo": doc["repo"], "title": doc["title"], "kind": doc["kind"],
                     "url": url or gh_url(doc["repo"], doc["branch"], doc["rel"], page if doc["kind"] == "slides" else None)}
            if doc["kind"] == "slides" and page:
                entry["page"] = page
            if title_hit:
                entry["main"] = True
            picked.append(entry)
            per[doc["repo"]] = per.get(doc["repo"], 0) + 1
            if len(picked) >= PER_TERM:
                break
        if picked:
            out[t["id"]] = picked

    data = {"about": "용어마다 웹북 밖의 팀 자료(발표 자료, Causal Studio, 책 예제 코드, 스터디 노트 등)에서 그 용어를 많이 쓴 문서. scripts/build_term_links.py가 만듭니다.",
            "terms": out}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{len(out)} of {len(terms)} terms linked", file=sys.stderr)


if __name__ == "__main__":
    main()
