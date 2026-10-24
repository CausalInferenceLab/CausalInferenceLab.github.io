"""Check the data files before the site is built and published.

Run by the deploy workflow, and worth running before opening a PR:

    python3 scripts/check_data.py

Data files are edited by pull requests, so this is where bad values are stopped
rather than trusted downstream: ids must be plain tokens, numbers must be numbers,
and every link must be https (or http) or a path on this site.
"""
import json
import os
import re
import sys
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = re.compile(r"[A-Za-z0-9_.-]+")
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
URL_KEYS = {"url", "link", "linkedin", "site", "cover", "href", "builderUrl"}
errors = []


def load(name):
    path = os.path.join(ROOT, "data", name)
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError) as e:
        errors.append(f"{name}: cannot read ({e})")
        return None


def err(where, msg):
    errors.append(f"{where}: {msg}")


def is_int(v, allow_none=False):
    return (v is None and allow_none) or (isinstance(v, int) and not isinstance(v, bool))


def check_urls(node, where):
    """Every value under a link-like key: http(s) or a site path. No javascript:, data:, etc."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k in URL_KEYS and isinstance(v, str) and v:
                scheme = urlsplit(v).scheme
                if scheme and scheme not in ("http", "https"):
                    err(where, f"{k} has a disallowed scheme: {v!r}")
                if v.lstrip().lower().startswith(("javascript:", "data:", "vbscript:")):
                    err(where, f"{k} is not a web link: {v!r}")
            check_urls(v, f"{where}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            check_urls(v, f"{where}[{i}]")


def token(v, where, field):
    if not (isinstance(v, str) and TOKEN.fullmatch(v)):
        err(where, f"{field} must be a plain id (letters, digits, - _ .), got {v!r}")


def main():
    files = sorted(f for f in os.listdir(os.path.join(ROOT, "data")) if f.endswith(".json"))
    data = {f: load(f) for f in files}
    for f, d in data.items():
        if d is not None:
            check_urls(d, f)

    levels = {lv.get("id") for lv in data.get("levels.json") or []}
    for lv in data.get("levels.json") or []:
        token(lv.get("id"), "levels.json", "id")
    lines = {ln.get("id") for ln in data.get("lines.json") or []}
    for ln in data.get("lines.json") or []:
        token(ln.get("id"), "lines.json", "id")

    repos = set()
    for r in data.get("repos.json") or []:
        w = f"repos.json {r.get('repo')!r}"
        token(r.get("repo"), w, "repo")
        repos.add(r.get("repo"))
        if r.get("level") and r["level"] not in levels:
            err(w, f"level {r['level']!r} is not in levels.json")
        for ln in r.get("lines") or []:
            if ln not in lines:
                err(w, f"line {ln!r} is not in lines.json")
        if not all(is_int(c) for c in r.get("cohorts") or []):
            err(w, "cohorts must be whole numbers")
        if not is_int(r.get("stars", 0)):
            err(w, "stars must be a whole number")

    for i, p in enumerate(data.get("projects.json") or []):
        w = f"projects.json[{i}]"
        if not is_int(p.get("cohort")):
            err(w, "cohort must be a whole number")
        if not is_int(p.get("runners"), allow_none=True):
            err(w, "runners must be a whole number or null")
        if p.get("repo") and p["repo"] not in repos:
            err(w, f"repo {p['repo']!r} is not in repos.json")

    slugs = set()
    for b in data.get("builders.json") or []:
        w = f"builders.json {b.get('name')!r}"
        s = b.get("slug")
        if not (isinstance(s, str) and SLUG.fullmatch(s)):
            err(w, f"slug must be lowercase letters, digits and hyphens, got {s!r}")
        elif s in slugs:
            err(w, f"slug {s!r} is used twice")
        slugs.add(s)
        if b.get("github") and not TOKEN.fullmatch(b["github"]):
            err(w, "github must be a GitHub user name")
        for x in b.get("runnerOf") or []:
            if not is_int(x.get("cohort")):
                err(w, "runnerOf cohort must be a whole number")

    for i, e in enumerate(data.get("events.json") or []):
        w = f"events.json[{i}]"
        for k in ("order", "year"):
            if not is_int(e.get(k)):
                err(w, f"{k} must be a whole number")
        if not is_int(e.get("participants"), allow_none=True):
            err(w, "participants must be a whole number or null")
        if e.get("date") is not None and not DATE.fullmatch(str(e["date"])):
            err(w, "date must look like 2026-11-21")

    for i, a in enumerate(data.get("articles.json") or []):
        w = f"articles.json[{i}]"
        if not a.get("author"):
            err(w, "author is required (the name shown on the post)")
        if a.get("episode") is not None and not is_int(a.get("episode")):
            err(w, "episode must be a whole number")
        if a.get("weekOf") is not None and not DATE.fullmatch(str(a["weekOf"])):
            err(w, "weekOf must be the Monday of that week, like 2026-11-02")
        if not (isinstance(a.get("slug"), str) and re.fullmatch(r"[A-Za-z0-9-]+", a["slug"])):
            err(w, f"slug must be letters, digits and hyphens, got {a.get('slug')!r}")
        if not DATE.fullmatch(str(a.get("date", ""))):
            err(w, "date must look like 2026-11-21")

    for r in data.get("routes.json") or []:
        w = f"routes.json {r.get('id')!r}"
        token(r.get("id"), w, "id")
        for s in r.get("stops") or []:
            if s not in repos and s != "external":
                err(w, f"stop {s!r} is not in repos.json")

    for i, x in enumerate((data.get("stages.json") or {}).get("items", [])):
        w = f"stages.json items[{i}]"
        token(x.get("id"), w, "id")
        if not is_int(x.get("year")):
            err(w, "year must be a whole number")
        if not str(x.get("url", "")).startswith("https://"):
            err(w, "url must be an https link")

    for name in ("game.json", "daily.json"):
        for q in (data.get(name) or {}).get("questions", []):
            w = f"{name} {q.get('id')!r}"
            token(q.get("id"), w, "id")
            if q.get("answer") not in ("corr", "cause"):
                err(w, "answer must be corr or cause")
            if not str((q.get("chapter") or {}).get("url", "")).startswith("https://"):
                err(w, "chapter.url must be an https link")

    if errors:
        print("Data check failed:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print(f"Data check passed ({len(files)} files)")


if __name__ == "__main__":
    main()
