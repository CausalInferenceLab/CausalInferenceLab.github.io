"""Make the 1200x630 share image for each Builder page.

Writes assets/og/builders/<slug>.jpg. Needs Playwright with Chromium:

    pip install playwright && python -m playwright install chromium
    python3 scripts/builder_cards.py

Run it again when a Builder is added or their numbers change, and commit the
images. Pages without an image fall back to the hub's share image.
"""
import asyncio
import html
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_builders import ROOT, builder_stats, medal_svg, tenure, tier_of  # noqa: E402

TEMPLATE = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
*{{margin:0;box-sizing:border-box}}
body{{width:1200px;height:630px;font-family:"Pretendard Variable",Pretendard,sans-serif;color:#fff;
background:linear-gradient(118deg,#23276A 0%,#333689 46%,#5B54B0 82%,#6E68BC 100%);position:relative;overflow:hidden}}
body:before{{content:"";position:absolute;inset:0;background:radial-gradient(60% 90% at 88% 20%,rgba(255,255,255,.16),transparent 60%)}}
.in{{position:relative;padding:72px 80px;height:100%;display:flex;flex-direction:column}}
.k{{font-size:28px;font-weight:600;color:rgba(255,255,255,.82)}}
h1{{font-size:96px;font-weight:800;letter-spacing:-.03em;line-height:1.05;margin-top:6px}}
.s{{font-size:36px;font-weight:600;margin-top:14px;color:rgba(255,255,255,.9)}}
.st{{display:flex;gap:56px;margin-top:34px}}
.st div{{display:flex;flex-direction:column;font-size:24px;color:rgba(255,255,255,.75)}}
.st b{{font-size:60px;font-weight:800;color:#fff;line-height:1.1}}
.f{{margin-top:auto;font-size:24px;color:rgba(255,255,255,.7)}}
.md{{position:absolute;right:96px;top:110px;filter:drop-shadow(0 18px 30px rgba(0,0,0,.35))}}.md svg{{height:400px;width:auto;display:block}}
.tier{{display:inline-block;font-size:30px;font-weight:800;color:#FFD54A;margin-top:26px}}
.top{{display:inline-block;margin-left:14px;font-size:22px;font-weight:800;color:#14162B;background:#FFD54A;border-radius:999px;padding:3px 14px;vertical-align:middle}}
</style></head><body><span class="md">{medal}</span><div class="in">
<p class="k">Causal Inference Hub Builder · 가짜연구소 인과추론팀</p>
<p class="tier">{tier}</p>
<h1>{name}{top}</h1>
<p class="s">{since}</p>
<div class="st"><div><b>{projects}</b>프로젝트</div><div><b>{runners}</b>함께한 러너</div><div><b>{cohorts}</b>기수</div></div>
<p class="f">causalinferencelab.github.io/builders/{slug}</p>
</div></body></html>"""


def short(text, limit=30):
    return text if len(text) <= limit else text[: limit - 1].rstrip(" :·-") + "…"


async def main():
    from playwright.async_api import async_playwright
    ranked = builder_stats()[0]
    out = os.path.join(ROOT, "assets", "og", "builders")
    os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1200, "height": 630})
        for b in ranked:
            slug = b["info"]["slug"]
            if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug or ""):
                raise SystemExit(f"bad slug {slug!r}")
            doc = TEMPLATE.format(
                medal=medal_svg(tier_of(b), 300, len(b["cohorts"]), uid="og"), tier=html.escape(tier_of(b)["name"]),
                name=html.escape(b["name"]), slug=slug,
                top=f'<span class="top">Top&nbsp;{b["rank"]}</span>' if b["rank"] <= 3 else "",
                since=html.escape(tenure(b)),
                projects=b["projects"], runners=b["runners"], cohorts=len(b["cohorts"]))
            path = os.path.join(out, f"{slug}.html")
            with open(path, "w", encoding="utf-8") as f:
                f.write(doc)
            await page.goto("file://" + path)
            await page.wait_for_timeout(600)
            await page.screenshot(path=os.path.join(out, f"{slug}.jpg"), type="jpeg", quality=88)
            os.remove(path)
        await browser.close()
    print(f"wrote {len(ranked)} share images to {out}")


if __name__ == "__main__":
    asyncio.run(main())
