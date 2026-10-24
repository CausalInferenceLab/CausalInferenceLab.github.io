"""Build one page per Builder, an index page, and a badge for each Builder.

Reads data/builders.json, data/projects.json and data/repos.json and writes
builders/<slug>.html, builders/index.html and badges/<slug>.svg. The output is
generated, so it is not committed; the deploy workflow runs this script before
publishing. Run it locally to preview:

    python3 scripts/build_builders.py && python3 -m http.server 8000

Share images live in assets/og/builders/<slug>.jpg and are made separately by
scripts/builder_cards.py. A page whose image is missing falls back to the hub's.
"""
import html
import json
import os
import re
from collections import OrderedDict
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://causalinferencelab.github.io"
ORG = "CausalInferenceLab"


def load(name):
    with open(os.path.join(ROOT, "data", name), encoding="utf-8") as f:
        return json.load(f)


def esc(s):
    return html.escape(str(s if s is not None else ""), quote=True)


SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
TOKEN = re.compile(r"[A-Za-z0-9_-]+")


def safe_url(u):
    """Only http(s) links reach an href; anything else (javascript:, data:) becomes "#"."""
    try:
        return u if urlsplit(str(u)).scheme in ("http", "https") else "#"
    except ValueError:
        return "#"


def token(v, fallback="none"):
    """Ids that land in attributes (track ids) must be plain tokens."""
    return v if isinstance(v, str) and TOKEN.fullmatch(v) else fallback


def builder_stats():
    """Mirror builderStats() in assets/js/hub.js so the pages and the hub agree."""
    builders = load("builders.json")
    projects = load("projects.json")
    repos = {r["repo"]: r for r in load("repos.json")}
    current = max(p["cohort"] for p in projects)
    people = OrderedDict()

    def get(name):
        if name not in people:
            people[name] = {"name": name, "items": [], "repos": [], "runnerOf": []}
        return people[name]

    for p in projects:
        if not p.get("builder"):
            continue
        r = repos.get(p.get("repo") or "")
        get(p["builder"])["items"].append({
            "cohort": p["cohort"], "term": p.get("term", ""), "name": p["name"], "runners": p.get("runners"),
            "repo": r["repo"] if r else None, "title": r["title"] if r else None, "link": p.get("link"),
            "line": (r.get("lines") or ["none"])[0] if r else "none", "retro": p.get("retro"), "live": False,
        })
    for r in repos.values():
        for b in r.get("builders") or []:
            if r["repo"] not in get(b)["repos"]:
                get(b)["repos"].append(r["repo"])
        if r.get("status") != "running" or any(p.get("repo") == r["repo"] for p in projects):
            continue
        for b in r.get("builders") or []:
            get(b)["items"].append({
                "cohort": current, "term": "", "name": r["title"], "runners": None, "repo": r["repo"], "title": r["title"],
                "link": None, "line": (r.get("lines") or ["none"])[0], "retro": None, "live": True,
            })
    info = {b["name"]: b for b in builders}
    for name, p in people.items():
        p["runnerOf"] = info.get(name, {}).get("runnerOf", [])
        p["info"] = info.get(name, {"name": name})
        p["items"].sort(key=lambda i: i["cohort"])
        p["cohorts"] = sorted({i["cohort"] for i in p["items"]})
        p["projects"] = len(p["items"])
        p["runners"] = sum(i["runners"] or 0 for i in p["items"])
        p["first"] = p["cohorts"][0]
        p["line"] = next((i["line"] for i in p["items"] if i["line"] != "none"), "main")
    ranked = sorted(people.values(), key=lambda p: (-p["projects"], -p["runners"], p["first"], p["name"]))
    for i, p in enumerate(ranked):
        p["rank"] = i + 1
    terms = {p["cohort"]: p.get("term", "") for p in projects}
    return ranked, repos, projects, terms


def span(cohorts):
    if not cohorts:
        return ""
    return f"{cohorts[0]}기" if cohorts[0] == cohorts[-1] else f"{cohorts[0]}–{cohorts[-1]}기"


def head(title, desc, url, image):
    return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com; img-src 'self' data: blob: https://github.com https://avatars.githubusercontent.com https://*.google-analytics.com https://*.googletagmanager.com; connect-src 'self' https://api.github.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com; object-src 'none'; base-uri 'self'; form-action 'self'">
<script src="/assets/js/ga.js"></script>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:image" content="{esc(image)}">
<meta property="og:url" content="{esc(url)}">
<meta property="og:type" content="profile">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="{esc(url)}">
<link rel="icon" href="/assets/img/team-mark.png">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" integrity="sha384-/uC/GIvKJ/9RN6i1izHoBY9ubYo60OAsQRNQ3NRFiNsN+N/MVQJHD5OYcZz6wvwn" crossorigin="anonymous">
<link rel="stylesheet" href="/assets/css/hub.css">
</head>
<body class="bpage">
<a class="skip" href="#main">본문으로 건너뛰기</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/" aria-label="Causal Inference Hub 처음으로"><img class="brand-logo" src="/assets/img/team-mark.png" alt="" width="34" height="34"><span class="brand-text"><span class="brand-name">Causal Inference Hub</span><span class="brand-sub">가짜연구소 인과추론팀</span></span></a>
    <nav class="site-nav" aria-label="주요 메뉴"><a href="/#curriculum">커리큘럼</a><a href="/game.html">게임</a><a href="/lab.html">실험실</a><a href="/builders/" aria-current="page">Builder</a><a href="/#join">참여하기</a></nav>
    <button type="button" class="pass-btn" data-passport aria-label="활동 여권 열기">여권 <b data-passport-count>0/9</b></button>
  </div>
</header>
"""


FOOT = """<footer class="site-footer">
  <div class="wrap footer-row">
    <div><p class="footer-brand">가짜연구소 인과추론팀</p><p>러너는 이름 없이 인원수로만 표시합니다.</p></div>
    <ul class="footer-links"><li><a href="/">허브</a></li><li><a href="/builders/">Builder 전체</a></li><li><a href="https://github.com/CausalInferenceLab" target="_blank" rel="noopener">GitHub</a></li></ul>
  </div>
</footer>
<script src="/assets/js/track.js" defer></script>
<script src="/assets/js/passport.js" defer></script>
</body>
</html>
"""


def avatar(p, size="lg"):
    gh = p["info"].get("github")
    img = f'<img src="https://github.com/{esc(gh)}.png?size=160" alt="" loading="lazy" data-fallback="1">' if gh else ""
    return f'<span class="avatar {size}" aria-hidden="true">{esc(p["name"][:1])}{img}</span>'


def retro_html(r):
    if not r or not any(r.get(k) for k in ("why", "learned", "next")):
        return ""
    rows = "".join(f"<dt>{k}</dt><dd>{esc(r[f])}</dd>" for k, f in (("왜 만들었나", "why"), ("무엇을 배웠나", "learned"), ("다음 사람에게", "next")) if r.get(f))
    return f'<details class="tl-retro" open><summary>회고</summary><dl>{rows}</dl></details>'


def note_html(note):
    return f'<span class="tl-note">{note}</span>' if note else ""


def timeline(p, repos, projects, terms):
    events = [dict(i, role="Builder") for i in p["items"]]
    for x in p["runnerOf"]:
        proj = next((q for q in projects if q["cohort"] == x["cohort"] and q["name"] == x["project"]), None)
        r = repos.get((proj or {}).get("repo") or "")
        events.append({"cohort": x["cohort"], "role": "러너", "name": x["project"], "repo": r["repo"] if r else None,
                       "title": r["title"] if r else None, "link": (proj or {}).get("link"), "by": (proj or {}).get("builder"),
                       "line": (r.get("lines") or ["none"])[0] if r else "none", "runners": None, "live": False, "retro": None})
    events.sort(key=lambda e: (-e["cohort"], 0 if e["role"] == "Builder" else 1))
    out = []
    for e in events:
        if e["role"] == "Builder":
            facts = [f"러너 {esc(e['runners'])}명" if e.get("runners") else "", "진행 중" if e.get("live") else ""]
        else:
            facts = [f"Builder {esc(e['by'])}" if e.get("by") else ""]
        link = (f'<a href="https://github.com/{ORG}/{esc(e["repo"])}" target="_blank" rel="noopener">레포 보기</a>' if e.get("repo")
                else f'<a href="{esc(safe_url(e["link"]))}" target="_blank" rel="noopener">기록 보기</a>' if e.get("link") else "")
        note = '<span class="sep" aria-hidden="true">·</span>'.join(x for x in facts + [link] if x)
        cls = "b" if e["role"] == "Builder" else "r"
        out.append(f'<li class="{cls}" data-line="{esc(token(e["line"]))}"><span class="tl-c"><b>{esc(e["cohort"])}기</b><span>{esc(terms.get(e["cohort"], ""))}</span></span>'
                   f'<span class="tl-body"><span class="tl-role">{esc(e["role"])}</span><span class="tl-name">{esc(e["name"])}</span>'
                   f'{note_html(note)}{retro_html(e.get("retro"))}</span></li>')
    return "".join(out)


def badge_svg(label, message):
    def width(text):
        return sum(11 if "가" <= ch <= "힣" else 6.6 for ch in text)
    lw, mw = round(width(label) + 14), round(width(message) + 14)
    w = lw + mw
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="20" role="img" aria-label="{esc(label)}: {esc(message)}">
<title>{esc(label)}: {esc(message)}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="{w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="{lw}" height="20" fill="#23276A"/><rect x="{lw}" width="{mw}" height="20" fill="#5B54B0"/><rect width="{w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,Apple SD Gothic Neo,Noto Sans KR,sans-serif" font-size="11">
<text x="{lw / 2}" y="14" textLength="{lw - 14}">{esc(label)}</text>
<text x="{lw + mw / 2}" y="14" textLength="{mw - 14}">{esc(message)}</text>
</g>
</svg>
"""


def tenure(p):
    """The same wording the hub uses: "8기부터 · 3개 기수 (8·9·12기)"."""
    c = p["cohorts"]
    return f"{p['first']}기 Builder" if len(c) == 1 else f"{p['first']}기부터 · {len(c)}개 기수 ({'·'.join(str(x) for x in c)}기)"


# Medal rules, kept in step with TIERS and SPECIALS in assets/js/hub.js.
TIERS = [
    {"id": "honor", "min": 5, "name": "명예 Builder", "rule": "5개 기수 이상", "c": ("#9C95E8", "#33378C"), "ink": "#FFFFFF"},
    {"id": "gold", "min": 3, "name": "베테랑 Builder", "rule": "3개 기수 이상", "c": ("#F8D978", "#B98318"), "ink": "#3A2700"},
    {"id": "silver", "min": 2, "name": "다시 온 Builder", "rule": "2개 기수", "c": ("#E6EBF1", "#8995A6"), "ink": "#1B2230"},
    {"id": "bronze", "min": 1, "name": "Builder", "rule": "첫 기수", "c": ("#E3A36A", "#8E5226"), "ink": "#FFFFFF"},
]
SPECIALS = [
    {"id": "mentor", "name": "멘토", "rule": "러너 20명 이상과 함께", "c": ("#63D2B1", "#1B7A61"), "ink": "#FFFFFF",
     "has": lambda p: p["runners"] >= 20},
    {"id": "rise", "name": "러너에서 Builder로", "rule": "러너로 참여한 뒤 Builder가 됨", "c": ("#FFAE8C", "#C04F33"), "ink": "#FFFFFF",
     "has": lambda p: any(x.get("cohort", 99) < p["first"] for x in p["runnerOf"])},
]


def tier_of(p):
    return next(t for t in TIERS if len(p["cohorts"]) >= t["min"])


def specials_of(p):
    return [m for m in SPECIALS if m["has"](p)]


def medal_svg(m, size, n=0, uid="m", standalone=False):
    """Same drawing as medalSVG() in hub.js. standalone adds the namespace for a file of its own."""
    ns = ' xmlns="http://www.w3.org/2000/svg"' if standalone else ""
    grad = (f'<defs><linearGradient id="{uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{m["c"][0]}"/>'
            f'<stop offset="1" stop-color="{m["c"][1]}"/></linearGradient></defs>')
    font = ' font-family="Pretendard Variable,Pretendard,Apple SD Gothic Neo,Noto Sans KR,sans-serif"'
    if m.get("min"):
        h = round(size * 84 / 64)
        return (f'<svg{ns} class="medal" viewBox="0 0 64 84" width="{size}" height="{h}" role="img" aria-label="{esc(m["name"])} 메달">{grad}'
                f'<path d="M15 0h15l8 32H23z" fill="#2A2E7A"/><path d="M49 0H34l-8 32h15z" fill="#A9A4F5"/>'
                f'<circle cx="32" cy="56" r="26" fill="url(#{uid})"/><circle cx="32" cy="56" r="20.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/>'
                f'<ellipse cx="23" cy="44" rx="9" ry="5" fill="#fff" fill-opacity=".28" transform="rotate(-30 23 44)"/>'
                f'<text x="32" y="61" text-anchor="middle" font-size="18" font-weight="800" fill="{m["ink"]}"{font}>{n}</text>'
                f'<text x="32" y="71" text-anchor="middle" font-size="7.5" font-weight="700" fill="{m["ink"]}" fill-opacity=".85"{font}>기수</text></svg>')
    glyph = (f'<text x="26" y="31" text-anchor="middle" font-size="13" font-weight="800" fill="{m["ink"]}"{font}>20+</text>' if m["id"] == "mentor"
             else f'<path d="M26 14l9 10h-6v13h-6V24h-6z" fill="{m["ink"]}"/>')
    return (f'<svg{ns} class="medal" viewBox="0 0 52 52" width="{size}" height="{size}" role="img" aria-label="{esc(m["name"])} 메달">{grad}'
            f'<circle cx="26" cy="26" r="24" fill="url(#{uid})"/><circle cx="26" cy="26" r="19" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/>{glyph}</svg>')


def badge_message(p):
    n = len(p["cohorts"])
    return f"Builder · {p['first']}기" if n == 1 else f"{tier_of(p)['name']} · {n}개 기수"


def page(p, repos, projects, terms):
    slug = p["info"]["slug"]
    url = f"{SITE}/builders/{slug}.html"
    s = span(p["cohorts"])
    desc = f"{s} Builder · 프로젝트 {p['projects']}개 · 함께한 러너 {p['runners']}명. 가짜연구소 인과추론팀"
    card = os.path.join(ROOT, "assets", "og", "builders", f"{slug}.jpg")
    image = f"{SITE}/assets/og/builders/{slug}.jpg" if os.path.exists(card) else f"{SITE}/assets/img/og-hub.png"
    linkedin = p["info"].get("linkedin")
    intro = p["info"].get("intro")
    own = [repos[r] for r in p["repos"] if r in repos]
    badge_url = f"{SITE}/badges/{slug}.svg"
    badge_md = f"[![CausalInferenceLab Builder]({badge_url})]({SITE}/builders/{slug}.html?utm_source=share&utm_medium=badge)"
    share = f"{url}?utm_source=share&utm_medium=builder_page"
    repo_cards = "".join(
        f'<li data-line="{esc(token((r.get("lines") or ["none"])[0]))}"><a href="https://github.com/{ORG}/{esc(r["repo"])}" target="_blank" rel="noopener">'
        f'<span class="num" aria-hidden="true"></span><span><b>{esc(r["title"])}</b><span>{esc(r.get("summary", ""))}</span></span></a></li>'
        for r in own)
    top = rank_tag(p)
    t, sp = tier_of(p), specials_of(p)
    medal_file = f"/badges/{slug}-medal.svg"
    # books and lectures this Builder wrote, translated or teaches
    books = [x for x in (load("map.json").get("paid") or []) if p["name"] in (x.get("credit") or "")]
    def book_li(x):
        out = next((l["url"] for l in x.get("links") or [] if str(l.get("url", "")).startswith("https://")), "")
        role = "옮김" if x.get("type") == "도서" else "강의"
        return (f'<li><a href="{esc(safe_url(out))}" target="_blank" rel="noopener" data-event="click_partner" '
                f'data-event-params=\'{{"item":"{esc(token(x["id"]))}","action":"out","source":"builder_page"}}\'>'
                f'<img src="/{esc(x["cover"])}" alt="" width="{30 if x.get("type") == "도서" else 52}" height="40">'
                f'<span><b>{esc(x.get("shortTitle") or x["title"])}</b><span>{esc(x.get("type", ""))} · {role} · 한빛미디어</span></span></a></li>') if out else ""
    books_html = "".join(book_li(x) for x in books)
    ribbons = "".join(f'<li>{medal_svg(m, 30, uid="sp-" + m["id"])}<span><b>{esc(m["name"])}</b>{esc(m["rule"])}</span></li>' for m in sp)
    body = f"""<main id="main" class="bp">
  <div class="wrap">
    <a class="back" href="/builders/">Builder 전체 보기</a>
    <section class="bp-hero" data-line="{esc(token(p['line']))}">
      {avatar(p)}
      <div class="bp-id">
        <p class="bp-kicker">{top}<span class="bp-tier">{esc(t["name"])}</span><span>Causal Inference Hub Builder</span></p>
        <h1>{esc(p['name'])}</h1>
        <p class="bp-since">{esc(tenure(p))}</p>
        {f'<p class="bp-intro">{esc(intro)}</p>' if intro else ''}
        <p class="bp-links">{f'<a href="{esc(safe_url(linkedin))}" target="_blank" rel="noopener">LinkedIn</a>' if linkedin else ''}<button type="button" class="btn ghost sm" data-copy="{esc(share)}" data-share="builder">이 페이지 링크 복사</button></p>
        {'' if (intro and p["info"].get("github")) else f'<p class="bp-self">본인이신가요? <a href="https://github.com/{ORG}/CausalInferenceLab.github.io/edit/main/data/builders.json" target="_blank" rel="noopener">소개와 사진 추가하기</a></p>'}
      </div>
      <span class="bp-medal">{medal_svg(t, 112, len(p["cohorts"]), uid="tier")}</span>
    </section>
    <ul class="p-stats bp-stats"><li><b>{esc(p['projects'])}</b>프로젝트</li><li><b>{len(p['cohorts'])}</b>기수</li><li><b>{esc(p['runners'])}</b>함께한 러너</li><li><b>{len(own)}</b>레포</li></ul>
    <div class="bp-grid">
      <section aria-labelledby="h-history"><h2 id="h-history">이력</h2><ol class="p-timeline">{timeline(p, repos, projects, terms)}</ol></section>
      <aside>
        {f'<section aria-labelledby="h-books"><h2 id="h-books">이 Builder의 책·강의</h2><ul class="post-related-list">{books_html}</ul></section>' if books_html else ''}
        {f'<section aria-labelledby="h-repos"><h2 id="h-repos">만든 레포</h2><ul class="bp-repos">{repo_cards}</ul></section>' if own else ''}
        <section class="bp-badge bp-medals" aria-labelledby="h-medal">
          <h2 id="h-medal">Builder 메달</h2>
          <p class="bp-tier-line">{medal_svg(t, 40, len(p["cohorts"]), uid="tier-s")}<span><b>{esc(t["name"])}</b>Builder로 연 기수 {len(p["cohorts"])}개 · 기준: {esc(t["rule"])}</span></p>
          {f'<ul class="p-ribbons">{ribbons}</ul>' if ribbons else ''}
          <p>오래 함께한 Builder에게는 학회와 Data Forum에서 발표할 기회가 열립니다. <a href="/#stage">학회와 함께 여는 무대</a></p>
          <a class="btn ghost sm" href="{esc(medal_file)}" download="causal-inference-hub-{esc(slug)}-medal.svg">메달 이미지 받기</a>
        </section>
        <section class="bp-badge" aria-labelledby="h-badge">
          <h2 id="h-badge">Builder 배지</h2>
          <p>GitHub 프로필이나 레포 README에 붙이면 이 페이지로 연결됩니다.</p>
          <img src="/badges/{esc(slug)}.svg" alt="CausalInferenceLab {esc(badge_message(p))}">
          <pre><code>{esc(badge_md)}</code></pre>
          <button type="button" class="btn sm" data-copy="{esc(badge_md)}" data-share="badge">배지 코드 복사</button>
        </section>
      </aside>
    </div>
    <section class="bp-cta">
      <div><h2>다음 기수에 프로젝트를 열어 보세요</h2><p>러너로 시작한 Builder도 많습니다. 템플릿으로 레포를 만들고, 기수 모집 때 프로젝트를 등록하면 됩니다.</p></div>
      <div class="bp-cta-links"><a class="btn" href="/#join" data-event="click_join" data-event-params='{{"target":"join_section","source":"builder_page"}}'>참여 방법 보기</a><a class="btn ghost" href="https://github.com/{ORG}/Project-template" target="_blank" rel="noopener" data-event="click_join" data-event-params='{{"target":"template","source":"builder_page"}}'>프로젝트 템플릿</a></div>
    </section>
  </div>
</main>
"""
    return head(f"{p['name']} | Causal Inference Hub Builder", desc, url, image) + body + FOOT


def rank_tag(p):
    return f'<span class="rank-tag">Top {p["rank"]}</span>' if p["rank"] <= 3 else ""


def index_page(ranked):
    cards = "".join(
        f'<li data-line="{esc(token(p["line"]))}"><a href="/builders/{esc(p["info"]["slug"])}.html">{avatar(p)}'
        f'<span class="bi-body"><b>{esc(p["name"])} <span class="bi-medal" title="{esc(tier_of(p)["name"])}">{medal_svg(tier_of(p), 16, len(p["cohorts"]), uid="i" + str(p["rank"]))}</span></b><span>{esc(tier_of(p)["name"])} · {esc(tenure(p))} · 프로젝트 {esc(p["projects"])}개 · 러너 {esc(p["runners"])}명</span>'
        f'<span class="bi-last">최근 · {esc(p["items"][-1]["name"])}</span></span>{rank_tag(p)}</a></li>'
        for p in ranked)
    total_projects = len(load("projects.json"))
    body = f"""<main id="main" class="bp">
  <div class="wrap">
    <a class="back" href="/#contrib">허브로 돌아가기</a>
    <h1 class="bi-title">Builder</h1>
    <p class="bi-sub">인과추론팀에서 프로젝트를 연 사람들입니다. {len(ranked)}명이 프로젝트 {total_projects}개를 열었습니다. 이름을 누르면 이력과 배지가 있습니다.</p>
    <ol class="bi-list">{cards}</ol>
  </div>
</main>
"""
    return head("Builder | Causal Inference Hub", f"가짜연구소 인과추론팀에서 프로젝트를 연 Builder {len(ranked)}명", f"{SITE}/builders/", f"{SITE}/assets/img/og-hub.png") + body + FOOT


def main():
    ranked, repos, projects, terms = builder_stats()
    os.makedirs(os.path.join(ROOT, "builders"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "badges"), exist_ok=True)
    for p in ranked:
        slug = p["info"].get("slug")
        if not isinstance(slug, str) or not SLUG.fullmatch(slug):
            raise SystemExit(f"builders.json: {p['name']} has a missing or invalid slug {slug!r} (lowercase letters, digits, hyphens)")
        with open(os.path.join(ROOT, "builders", f"{slug}.html"), "w", encoding="utf-8") as f:
            f.write(page(p, repos, projects, terms))
        with open(os.path.join(ROOT, "badges", f"{slug}.svg"), "w", encoding="utf-8") as f:
            f.write(badge_svg("CausalInferenceLab", badge_message(p)))
        with open(os.path.join(ROOT, "badges", f"{slug}-medal.svg"), "w", encoding="utf-8") as f:
            f.write(medal_svg(tier_of(p), 256, len(p["cohorts"]), uid="g", standalone=True) + "\n")
    with open(os.path.join(ROOT, "builders", "index.html"), "w", encoding="utf-8") as f:
        f.write(index_page(ranked))
    print(f"wrote {len(ranked)} Builder pages and badges")


if __name__ == "__main__":
    main()
