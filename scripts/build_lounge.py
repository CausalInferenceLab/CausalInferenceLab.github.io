"""Collect the latest GitHub Discussions of this repository for the hub's lounge.

Runs in GitHub Actions on every deploy, daily, and whenever a discussion or a comment
on one changes, with GITHUB_TOKEN (discussions: read), and writes data/lounge.json.
Posts that look like spam (adult, gambling, loan ads, or a brand-new account dropping
links) are left out of the file and listed in the job log; nothing is deleted on GitHub.
A discussion with the label "spam" or "hidden" is left out too, so one label hides a post.
Uses only the standard library. Run it with a saved GraphQL answer to try the rules
offline: python3 scripts/build_lounge.py data/lounge.json --from answer.json
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

OWNER, NAME = "CausalInferenceLab", "CausalInferenceLab.github.io"
TOKEN = os.environ.get("GITHUB_TOKEN", "")
KEEP = 30
EXCERPT = 140
HIDE_LABELS = {"spam", "hidden", "숨김"}

QUERY = """
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    discussionCategories(first: 25) { nodes { name slug emoji isAnswerable } }
    discussions(first: 60, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes {
        number title url createdAt bodyText upvoteCount answerChosenAt locked
        category { name slug }
        author { login avatarUrl ... on User { createdAt } }
        comments { totalCount }
        labels(first: 10) { nodes { name } }
      }
    }
  }
}
"""

# Words that only show up in the spam this lounge does not want. Kept narrow on purpose:
# a false hit hides a real post until someone adds it back by hand.
SPAM_WORDS = re.compile(
    r"카지노|바카라|토토사이트|슬롯사이트|홀덤사이트|먹튀|도박사이트|배팅사이트|베팅사이트|"
    r"성인사이트|성인용품|야동|조건만남|출장안마|출장마사지|"
    r"대출\s*(상담|문의|가능)|작업대출|무직자\s*대출|"
    r"casino|baccarat|sportsbook|betting\s*site|porn|escort|viagra",
    re.I,
)
CONTACT_LINKS = re.compile(r"open\.kakao\.com|t\.me/|telegram\.me|wa\.me/", re.I)
LINK = re.compile(r"https?://", re.I)


def graphql():
    body = json.dumps({"query": QUERY, "variables": {"owner": OWNER, "name": NAME}}).encode()
    req = urllib.request.Request(
        "https://api.github.com/graphql",
        data=body,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json", "User-Agent": "cil-hub-lounge"},
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        out = json.load(res)
    if out.get("errors"):
        raise RuntimeError(json.dumps(out["errors"], ensure_ascii=False)[:500])
    return out["data"]


def days_old(iso, now):
    try:
        return (now - datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).days
    except (TypeError, ValueError):
        return None


def spam_reason(d, now):
    """Why a discussion stays off the hub, or None."""
    labels = {(n or {}).get("name", "").lower() for n in ((d.get("labels") or {}).get("nodes") or [])}
    if labels & HIDE_LABELS:
        return "label"
    text = f"{d.get('title', '')}\n{d.get('bodyText', '')}"
    if SPAM_WORDS.search(text):
        return "words"
    author = d.get("author") or {}
    age = days_old(author.get("createdAt"), now)
    links = len(LINK.findall(text))
    if CONTACT_LINKS.search(text) and (age is None or age < 90):
        return "contact link"
    if age is not None and age < 3 and links:
        return "new account with links"
    if age is not None and age < 30 and links > 3:
        return "new account, many links"
    return None


def excerpt(text):
    t = re.sub(r"\s+", " ", text or "").strip()
    return t if len(t) <= EXCERPT else t[: EXCERPT - 1].rstrip() + "…"


def builders():
    try:
        with open("data/builders.json", encoding="utf-8") as f:
            people = json.load(f)
    except (OSError, ValueError):
        return {}
    return {p["github"].lower(): p.get("name", "") for p in people if p.get("github")}


def build(data, now):
    repo = data.get("repository") or {}
    cats = [c for c in ((repo.get("discussionCategories") or {}).get("nodes") or []) if c]
    known = builders()
    posts, hidden, counts = [], [], {}
    for d in (repo.get("discussions") or {}).get("nodes") or []:
        if not d:
            continue
        why = spam_reason(d, now)
        if why:
            hidden.append((d.get("number"), why))
            continue
        url = d.get("url") or ""
        if not url.startswith(f"https://github.com/{OWNER}/{NAME}/discussions/"):
            continue
        author = d.get("author") or {}
        login = author.get("login") or "ghost"
        avatar = author.get("avatarUrl") or ""
        if not avatar.startswith("https://avatars.githubusercontent.com/"):
            avatar = ""
        cat = d.get("category") or {}
        counts[cat.get("slug")] = counts.get(cat.get("slug"), 0) + 1
        if len(posts) >= KEEP:
            continue
        posts.append({
            "number": d.get("number"),
            "title": d.get("title", ""),
            "url": url,
            "at": d.get("createdAt"),
            "category": cat.get("name", ""),
            "slug": cat.get("slug", ""),
            "excerpt": excerpt(d.get("bodyText")),
            "login": login,
            "avatar": avatar,
            "builder": known.get(login.lower(), ""),
            "comments": (d.get("comments") or {}).get("totalCount", 0),
            "upvotes": d.get("upvoteCount", 0),
            "answered": bool(d.get("answerChosenAt")),
        })
    categories = [{"name": c.get("name", ""), "slug": c.get("slug", ""), "emoji": c.get("emoji", ""),
                   "answerable": bool(c.get("isAnswerable")), "count": counts.get(c.get("slug"), 0)} for c in cats]
    return {
        "updated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "repo": f"{OWNER}/{NAME}",
        "categories": categories,
        "posts": posts,
    }, hidden


def main(out_path, saved=None):
    now = datetime.now(timezone.utc)
    if saved:
        with open(saved, encoding="utf-8") as f:
            data = json.load(f)
        data = data.get("data", data)
    else:
        if not TOKEN:
            print("no GITHUB_TOKEN: lounge kept as is", file=sys.stderr)
            return 1
        data = graphql()
    out, hidden = build(data, now)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"lounge: {len(out['posts'])} posts, {len(out['categories'])} categories")
    for number, why in hidden:
        print(f"::notice::lounge left out discussion #{number} ({why})")
    return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    saved = None
    if "--from" in args:
        i = args.index("--from")
        saved = args[i + 1]
        del args[i:i + 2]
    sys.exit(main(args[0] if args else "data/lounge.json", saved))
