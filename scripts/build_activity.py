"""Collect the team's recent public GitHub activity for the hub's activity feed.

Runs in GitHub Actions on every deploy (and daily) with GITHUB_TOKEN and writes
data/activity.json. The hub also asks GitHub directly when a visitor opens it and
uses this file when that call is refused, so the feed is never empty for long.
Uses only the standard library.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ORG = "CausalInferenceLab"
API = "https://api.github.com"
TOKEN = os.environ.get("GITHUB_TOKEN", "")
KEEP = 60


class KeepTokenOnHost(urllib.request.HTTPRedirectHandler):
    """urllib copies Authorization to any redirect target; drop it when the host changes."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new is not None and urllib.parse.urlsplit(newurl).hostname != urllib.parse.urlsplit(req.full_url).hostname:
            new.remove_header("Authorization")
        return new


OPENER = urllib.request.build_opener(KeepTokenOnHost)


def get(url):
    if not url.startswith(API + "/"):
        raise ValueError(f"refusing to call {url}")
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "cil-hub-activity"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    with OPENER.open(urllib.request.Request(url, headers=headers), timeout=30) as res:
        return json.load(res)


def is_bot(login):
    return not login or login.endswith("[bot]") or login in ("github-actions", "dependabot")


def item(e):
    """One event as the hub shows it, or None for events the feed leaves out."""
    login = (e.get("actor") or {}).get("login", "")
    full = (e.get("repo") or {}).get("name", "")
    if is_bot(login) or "/" not in full:
        return None
    repo = full.split("/", 1)[1]
    p = e.get("payload") or {}
    t, action = e.get("type"), p.get("action")
    base = {"id": e.get("id"), "login": login, "repo": repo, "at": e.get("created_at")}
    if t == "PushEvent":
        if p.get("ref") not in ("refs/heads/main", "refs/heads/master"):
            return None
        return {**base, "kind": "push"}
    if t == "PullRequestEvent":
        pr = p.get("pull_request") or {}
        n = p.get("number") or pr.get("number")
        merged = action == "merged" or (action == "closed" and pr.get("merged"))
        if action != "opened" and not merged:
            return None
        return {**base, "kind": "pr_merge" if merged else "pr_open", "number": n, "title": pr.get("title"),
                "url": f"https://github.com/{full}/pull/{n}" if n else None}
    if t == "IssuesEvent":
        if action != "opened":
            return None
        issue = p.get("issue") or {}
        return {**base, "kind": "issue", "number": issue.get("number"), "title": issue.get("title"), "url": issue.get("html_url")}
    if t == "IssueCommentEvent":
        issue, comment = p.get("issue") or {}, p.get("comment") or {}
        return {**base, "kind": "comment", "number": issue.get("number"), "title": issue.get("title"),
                "url": comment.get("html_url") or issue.get("html_url")}
    if t == "PullRequestReviewEvent":
        pr = p.get("pull_request") or {}
        n = p.get("number") or pr.get("number")
        return {**base, "kind": "review", "number": n, "title": pr.get("title"),
                "url": f"https://github.com/{full}/pull/{n}" if n else None}
    if t == "WatchEvent":
        return {**base, "kind": "star"}
    if t == "ForkEvent":
        return {**base, "kind": "fork"}
    if t == "ReleaseEvent":
        rel = p.get("release") or {}
        return {**base, "kind": "release", "title": rel.get("tag_name"), "url": rel.get("html_url")}
    if t == "CreateEvent" and p.get("ref_type") == "repository":
        return {**base, "kind": "repo"}
    return None


def add_titles(items):
    """Org events leave out pull request titles; ask for the few that are shown."""
    cache = {}
    for it in items:
        if it.get("title") or not it.get("number") or it["kind"] not in ("pr_open", "pr_merge", "review"):
            continue
        key = (it["repo"], it["number"])
        if key not in cache:
            try:
                cache[key] = get(f"{API}/repos/{ORG}/{it['repo']}/pulls/{it['number']}").get("title")
            except (urllib.error.HTTPError, urllib.error.URLError) as e:
                print(f"skip title for {key}: {e}", file=sys.stderr)
                cache[key] = None
        it["title"] = cache[key]


def main(out_path):
    events = []
    for page in (1, 2, 3):
        try:
            batch = get(f"{API}/orgs/{ORG}/events?per_page=100&page={page}")
        except urllib.error.HTTPError as e:
            print(f"stop at page {page}: {e.code}", file=sys.stderr)
            break
        events += batch
        if len(batch) < 100:
            break
    items = [x for x in (item(e) for e in events) if x][:KEEP]
    add_titles(items)
    out = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "items": items}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"activity: {len(items)} items from {len(events)} events")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "data/activity.json")
