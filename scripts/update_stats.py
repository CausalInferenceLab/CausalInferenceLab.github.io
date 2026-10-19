"""Collect GitHub stats for the hub: stars over time, contributors, last push dates.

Runs in GitHub Actions with GITHUB_TOKEN and writes data/stats.json.
Uses only the standard library.
"""
import json
import os
import sys
import urllib.request
from collections import Counter
from datetime import datetime, timezone

ORG = "CausalInferenceLab"
API = "https://api.github.com"
TOKEN = os.environ.get("GITHUB_TOKEN", "")


def get(url, accept="application/vnd.github+json"):
    headers = {"Accept": accept, "User-Agent": "cil-hub-stats"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as res:
        return json.load(res)


def paged(url, accept="application/vnd.github+json"):
    page, items = 1, []
    while True:
        batch = get(f"{url}{'&' if '?' in url else '?'}per_page=100&page={page}", accept)
        items += batch
        if len(batch) < 100:
            return items
        page += 1


def main(out_path):
    repos = [r for r in paged(f"{API}/orgs/{ORG}/repos?type=public") if not r["archived"]]
    star_months = Counter()
    contributors = set()
    repo_stats = {}

    for r in repos:
        repo_stats[r["name"]] = {"stars": r["stargazers_count"], "pushed": r["pushed_at"]}
        if r["fork"]:
            continue
        for s in paged(f"{API}/repos/{ORG}/{r['name']}/stargazers", "application/vnd.github.star+json"):
            star_months[s["starred_at"][:7]] += 1
        try:
            for c in paged(f"{API}/repos/{ORG}/{r['name']}/contributors"):
                if c.get("type") != "Bot" and not c["login"].endswith("[bot]"):
                    contributors.add(c["login"])
        except urllib.error.HTTPError as e:
            print(f"skip contributors for {r['name']}: {e.code}", file=sys.stderr)

    total, stars_by_month = 0, []
    for month in sorted(star_months):
        total += star_months[month]
        stars_by_month.append({"month": month, "cumulative": total})

    stats = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "totals": {
            "repos": len(repos),
            "stars": sum(r["stargazers_count"] for r in repos),
            "contributors": len(contributors),
        },
        "starsByMonth": stars_by_month,
        "repos": repo_stats,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(json.dumps(stats["totals"]))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "data/stats.json")
