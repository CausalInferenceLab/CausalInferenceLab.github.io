# 허브를 고치고 더하는 방법

이 문서는 [Causal Inference Hub](https://causalinferencelab.github.io)를 관리하는 사람을 위한 안내입니다. 허브 소개는 [README](README.md)에 있습니다.

## 공개 원칙

- 이름은 Builder만 표시합니다. 러너는 이름 없이 인원수로만 보여 줍니다.
- 커리큘럼 L0–L2는 무료 자료만으로 끝까지 갈 수 있게 유지합니다. 책과 강의는 L2에 유료로 따로 표시합니다.

## 내용 더하기

PR을 올리기 전에 `python3 scripts/check_data.py`를 실행해 주세요. 배포 워크플로도 같은 검사를 하며, 실패하면 배포하지 않습니다. 링크는 https(또는 http)나 사이트 안의 경로만, id는 영문·숫자·하이픈만, 기수·인원은 정수만 허용합니다. 글(`articles/*.md`)의 HTML은 화면에 그릴 때 정리(sanitize)되어 스크립트가 실행되지 않습니다.

사이트는 빌드 도구 없이 `data/` 폴더의 JSON 파일을 읽어 그립니다. 대부분의 수정은 파일 하나를 고치는 PR이면 됩니다.

| 파일 | 고치는 경우 |
| --- | --- |
| `data/featured.json` | 첫 화면 배너의 대표 오픈소스 링크를 바꿀 때. `repo`를 적으면 스타 수가 함께 나옵니다. |
| `data/projects.json` | 기수별 프로젝트를 추가할 때. 러너는 인원수(`runners`)만 적습니다. Builder가 회고를 보내 주면 `"retro": {"why": "…", "learned": "…", "next": "…"}`로 넣습니다. 비어 있으면 화면에 나오지 않습니다. |
| `data/builders.json` | Builder의 LinkedIn, GitHub 아이디(프로필 사진에 쓰임), 한 줄 소개, Builder가 되기 전 러너로 참여한 프로젝트(`runnerOf`)를 넣을 때. `slug`는 Builder 페이지 주소(`/builders/<slug>.html`)가 되므로 한 번 정하면 바꾸지 않습니다. |
| `data/growth.json` | 기수별 누적 러너 수. 프로젝트 시트를 xlsx로 내려받아 `python scripts/runners_from_sheet.py 파일.xlsx > data/growth.json`으로 만듭니다. 이름은 파일에 남지 않습니다. |
| `data/events.json` | Data Forum 같은 행사를 추가할 때. 다가오는 행사에는 `tagline`, `time`, `venue`, `address`, `signupStart`·`signupEnd`(신청 기간), `capacity`(정원), `code`(추천 코드 안내), `timetable`, `poster`·`timetableImage`(`assets/img/`의 이미지)를 적을 수 있습니다. 신청 기간에 따라 첫 화면 띠와 카드의 문구가 ‘신청 예정 · 받는 중 · 마감’으로 바뀝니다. 행사 전에는 `date`·`time`으로 캘린더 추가 링크(Google, .ics)를, `address`(없으면 `venue`)로 네이버 지도·카카오맵 링크를 카드에 만듭니다. `time`은 `13:30–17:30`처럼 한국 시간으로 적습니다. 행사 다음 날부터 6주 동안은 큰 카드가 ‘지난 행사’로 남고, `participants`(참가 인원)와 `recap`(`{"label": "후기 보기", "url": "https://..."}`)을 넣으면 카드에 함께 보입니다. |
| `data/topics.json` | 자료실의 주제와 자료를 고칠 때. 주제마다 `shelf`(`causal` 인과추론, `exp` 온라인 실험), `name`, `about`, 검색어 `keys`, 자료 `items`를 적습니다. 자료는 `kind`(`video`·`read`·`code`·`slides`·`case`), `repo`(`repos.json`의 레포), `title`, `url`이고, 영상에 딸린 노트북은 `notebook`, 발표 자료 PDF는 `slides`로 붙입니다. 연재 글은 `articles.json`에 `topics`(주제 id 목록)를 적으면 공개일부터 그 주제에 함께 나옵니다. 검색은 전체 문구를 먼저 찾고, 없으면 낱말마다 찾습니다(끝의 조사는 떼고, `예제`·`코드`·`영상`·`발표` 같은 말은 자료 종류로 읽습니다). GA의 `search` 이벤트에서 `found=no`인 검색어가 다음에 채울 자리이고, `match=words`는 낱말별로 찾아서야 결과가 나온 검색입니다. |
| `data/experiments.json` | 허브에서 Iterglow(가짜연구소 실험 플랫폼)로 A/B 테스트를 돌릴 때. 기본은 꺼져 있습니다(`"enabled": false`). 켜려면 관리자가 만든 sdk_v1 실험의 `experimentId`와 연결된 flag의 `flagKey`를 실험마다 적고 `enabled`를 `true`로 바꿉니다. 공개 SDK 키(`pk_…`)는 저장소에 적지 않고(`apiKey`는 비워 둡니다) 저장소 Actions secret `ITERGLOW_SDK_KEY`에 둡니다. 배포가 실험이 켜져 있을 때만 그 키를 게시본에 넣고, secret이 없으면 실험은 꺼진 채로 배포됩니다. 공개 키는 실험이 켜지면 방문자 브라우저로 전달되는 값이라 관리 권한은 없지만, 서버 키나 계정 세션은 어디에도 넣지 않습니다. `goals`는 허브가 이미 보내는 이벤트 이름을 Iterglow 지표 이름에 잇습니다. 켜져 있는 동안 SDK가 방문자 브라우저에 익명 ID(`experibase_uid`)를 만들고, 그 ID와 페이지 경로, 기기 종류를 Iterglow로 보냅니다. 첫 실험은 `pseudo-greeting`(Pseudo가 먼저 인사하기)이고, 코드는 `assets/js/experiment.js`에 있습니다. |
| `data/pseudo.json` | Pseudo가 용어를 설명할 때 쓰는 한두 문장 풀이. 키는 `glossary.json`의 용어 id(`term-…`)입니다. 풀이가 없는 용어는 원어와 웹북 장만 알려 줍니다. 해요체로, 예시를 하나 넣어 짧게 씁니다. 다른 용어를 쓸 때는 용어집의 번역어 그대로 씁니다(예: 처치군이 아니라 실험군). 배포 때마다 웹북 용어집을 새로 읽고, 웹북에서 사라진 용어나 다른 표기를 쓴 풀이는 `check_data.py`가 경고로 알려 줍니다. |
| `assets/js/helper.js` | Pseudo(자료실 마스코트)의 답과 추천 질문, 마스코트가 먼저 거는 말(`LINES`: 페이지마다 첫 인사와 특정 섹션·스크롤 위치에서 한 번씩, 방문당 한 번, 닫으면 그 방문 동안 조용히)을 고칠 때. Pseudo는 `topics.json`의 이름·`keys`와 `glossary.json`의 용어로 답을 찾으므로, 잘 못 찾는 질문이 있으면 먼저 해당 주제의 `keys`를 늘려 보세요. 방문자가 적은 문장은 어디에도 보내지 않고, `helper_ask` 이벤트에는 질문이 들어온 경로(`source`)와 답의 종류(`answer`)만 남습니다. |
| `assets/js/header.js` | 허브가 아닌 페이지(자료실, 게임, 실험실, 글, Builder, 404)의 상단. 메뉴는 허브와 같은 여섯 곳이고, 다음 Data Forum 배지를 `events.json`에서 그립니다. 메뉴를 바꿀 때는 `index.html`, 각 페이지, `scripts/build_builders.py`의 `site-nav`를 함께 고칩니다. |
| `assets/js/suggest.js` | 검색창 아래 관련 검색어. `data-suggest`가 붙은 입력창에서 `topics.json`의 주제(이름·영문·`keys`)와 `glossary.json`의 용어(번역어·다른 표기·원어)를 찾고, 한글 초성(ㅇㅈㅊㅂ)과 영문 약어(DID)도 받습니다. 주제가 숨은 키워드로만 걸리면 어떤 키워드인지 함께 보여 줍니다. 팀 프로젝트(`repos.json`)도 함께 제안하고, 전체 문구로 없으면 가장 긴 낱말로 다시 찾습니다. 잘 안 걸리는 말이 있으면 해당 주제의 `keys`를 늘리세요. |
| `data/glossary.json` | 직접 고치지 않습니다. 배포할 때 `scripts/build_glossary.py`가 웹북 용어집 페이지를 읽어 새로 만듭니다. 용어를 고치려면 Causal-Inference-with-Python의 `TRANSLATION_GUIDE.md` 용어표를 고치세요. 웹북이 다시 배포된 다음 허브 배포 때 반영됩니다. |
| `data/term_links.json` | 자료실 용어집의 ‘팀 자료에서’ 목록. 손으로 고치지 않고, 팀 저장소를 한 폴더에 clone한 뒤 `python3 scripts/build_term_links.py <폴더> --check-urls`로 다시 만듭니다. 발표 자료(PDF, `pdftotext` 필요), 노트북과 마크다운에서 용어의 번역어·다른 표기·원어를 찾아, 용어마다 많이 다룬 문서를 4개까지(저장소당 2개) 고릅니다. 팀 저장소에 자료가 늘면 다시 돌려 커밋하세요. 용어의 한 줄 풀이는 `data/pseudo.json`에 있고 Pseudo와 용어집이 함께 씁니다. |
| `data/repos.json` | 레포를 추가하거나 설명·단계·트랙·상태를 바꿀 때. 자료실 검색은 레포 이름·`title`·`tags`·`builders`와 검색어 `keys`로 팀 프로젝트를 찾아 주제 위에 보여 줍니다(예: `CausalML`, `LLM`). 주제에 넣기 어려운 프로젝트가 검색에 안 걸리면 `keys`를 늘리세요. |
| `data/map.json` | 트랙 지도에서 레포의 위치를 정할 때. 책과 강의(`paid`)의 표지와 소개도 여기서 고칩니다. |
| `data/levels.json` | 레벨의 설명과 볼 순서를 바꿀 때. `learn`(배우는 것), `outcome`(끝나면), `steps`(순서대로 볼 레포와 한 줄 `note`), `more`(웹북 장이나 허브 페이지 같은 더 해 보기 링크)를 적습니다. `steps`에 없는 같은 레벨의 레포는 ‘골라 보기’로 나옵니다. |
| `data/leveltest.json` | 레벨 진단 문제를 고칠 때. 문제마다 `band`(L0·L1·L2), 보기 `opts`, 정답 순서 `answer`(0부터), 해설 `why`, 다시 볼 장 `chapter`를 적습니다. `bands`의 `pass`보다 적게 맞힌 첫 구간이 시작 Level이 되고, 모두 넘으면 관심 분야에 따라 Level 3이나 4가 됩니다. |
| `data/routes.json` | 관심 분야별로 이어서 볼 자료를 바꿀 때. 레벨 진단 결과의 ‘관심 분야에 맞춰 이어서’에 쓰입니다. |
| `data/articles.json`, `articles/*.md` | 연재 글을 추가할 때. 아래 ‘연재 쓰기’를 보세요. |
| `data/game.json` | ‘상관일까, 인과일까?’ 문항을 고칠 때. `answer`는 `corr` 또는 `cause`이고, 문항마다 웹북 장 링크(`chapter`)를 답니다. |
| `data/daily.json` | 오늘의 한 문제 문항을 더하거나 고칠 때. 형식은 `game.json`과 같고, 날짜마다 순서대로 돌아갑니다. 인과와 상관 문항을 비슷한 수로 맞춥니다. |
| `data/stats.json` | 직접 고치지 않습니다. 매주 GitHub Actions가 스타 추이와 기여자 수를 갱신합니다. |

레포를 추가할 때의 예시입니다.

```json
{
  "repo": "new-repo-name",
  "title": "허브에 보일 이름",
  "summary": "한두 문장 소개",
  "level": "L2",
  "lines": ["main"],
  "status": "running",
  "builders": ["Builder 이름"],
  "cohorts": [13],
  "site": "https://causalinferencelab.github.io/new-repo-name/",
  "stars": 0
}
```

`stars`는 기본값이고, 사이트는 열릴 때 GitHub에서 최신 스타 수와 마지막 커밋 날짜를 불러옵니다.

## Builder 페이지와 배지

`builders/<slug>.html`, `builders/index.html`, `badges/<slug>.svg`는 `scripts/build_builders.py`가 데이터 파일로 만듭니다. 만들어지는 파일이라 커밋하지 않고, 배포할 때 GitHub Actions가 실행합니다. 로컬에서 보려면 먼저 실행하세요.

```bash
python3 scripts/build_builders.py
```

Builder 본인은 [Builder 프로필과 회고](https://github.com/CausalInferenceLab/CausalInferenceLab.github.io/issues/new?template=builder-profile.yml) 이슈 양식으로 공개 동의, GitHub 아이디, 한 줄 소개, 회고 세 줄을 보냅니다. 운영진은 받은 내용을 `data/builders.json`(`github`, `intro`, `linkedin`)과 `data/projects.json`(`retro`)에 옮기고 이슈를 닫습니다. 허브의 Builder 섹션과 각 Builder 페이지에 이 양식 링크가 있습니다.

링크를 공유할 때 보이는 이미지(`assets/og/builders/<slug>.jpg`)는 따로 만들어 커밋합니다. Builder가 새로 생기거나 숫자가 바뀌면 다시 만들어 주세요. 이미지가 없는 페이지는 허브 기본 이미지를 씁니다.

```bash
pip install playwright && python -m playwright install chromium
python3 scripts/builder_cards.py
```

## 연재 쓰기

허브의 ‘연재’ 섹션은 팀원이 쓰는 글을 모읍니다. 매주 월요일 ‘이번 주 포스트’가 바뀌고, 글쓴이는 작가 카드로 소개됩니다.

1. `articles/<slug>.md`에 본문을 씁니다. `slug`는 영문 소문자·숫자·하이픈입니다.
2. `data/articles.json`에 한 줄을 더합니다.

```json
{ "slug": "did-in-practice-01", "title": "이중차분법을 실무에 쓸 때", "summary": "한 줄 소개", "date": "2026-11-02",
  "author": "Builder 이름", "series": "연재 이름", "episode": 1, "weekOf": "2026-11-02" }
```

- `author`가 `data/builders.json`의 이름과 같으면 작가 카드에 사진, 메달, Builder 페이지가 붙습니다.
- `series`와 `episode`를 넣으면 같은 연재의 글이 순서대로 묶이고, 글 아래에 이전 편·다음 편이 생깁니다.
- `weekOf`(그 주 월요일)를 넣으면 그 주의 ‘이번 주 포스트’로 고정됩니다. 없으면 일주일 안에 올라온 새 글, 그다음은 돌아가며 보여 줍니다.
- 다른 블로그에 올린 글은 `"url": "https://..."`를 넣으면 그 주소로 연결됩니다(본문 파일은 필요 없습니다).
- `date`가 미래인 글은 그날(한국 시간)까지 목록에 보이지 않습니다. 연재 여러 편을 PR 하나로 올려 두고, 편마다 `date`와 `weekOf`를 그 주 월요일로 넣으면 한 주에 한 편씩 열립니다. 미리 보려면 `article.html#<slug>`로 직접 엽니다.
- `related`에는 `map.json`의 책·강의 id나, `repos.json`에서 `site`가 있는 레포 이름(예: `Causal-Inference-with-Python`)을 넣습니다. 글 아래에 이어지는 자료로 보입니다.

## 활동 여권과 실험실

스탬프 정의는 `assets/js/passport.js`의 `STAMPS`에 있습니다. `kind: "auto"`는 허브가 알아서 찍고(`window.hubStamp("post")`), `kind: "self"`는 행사 후기, 강의 후기, 레포 댓글처럼 허브 밖에서 하는 일이라 방문자가 ‘했어요’를 눌러 찍습니다. 레벨 스탬프(`stage_L0`–`stage_L4`)는 그 레벨의 퀘스트를 모두 클리어하면 허브가 찍습니다. L3·L4처럼 `data/levels.json`에 `quests`(스탬프 id 목록)가 있는 레벨은 그 스탬프들이 퀘스트이고, 없는 레벨은 `steps`에 적은 자료가 퀘스트입니다. 레벨 진단 스탬프(`level_test`)는 진단을 끝까지 풀면 찍히고, 결과는 `cil-hub-level`에 남습니다. `/?level`로 들어오면 진단이 바로 열립니다. 이미 받은 스탬프는 다시 주지 않고, 기록은 `localStorage`에만 남습니다. 웹북 독자 스탬프는 같은 도메인의 웹북이 남기는 `cil-book-read`(읽은 장)를 보고 찍고, 역 정보 창의 '내 진도'와 '이어 읽기'는 `cil-book-read`, `cil-book-last`를 읽습니다. `/#passport`로 들어오면 여권이 바로 열립니다. 교란 실험실(`lab.html`, `assets/js/lab.js`)의 데이터는 페이지에서 만드는 가상 사용자입니다.

## 이벤트 측정

`assets/js/track.js`의 `hubTrack(이름, 파라미터)`가 GA4로 이벤트를 보냅니다. 허브는 `assets/js/ga.js`에서 자체 Google 태그(`G-CS9K0E86LR`, 허브 GA4 속성의 스트림)만 불러오고, 웹북 태그와는 섞이지 않습니다. GA4가 설치되지 않았으면 아무 일도 하지 않습니다. 이벤트 이름과 파라미터는 PM 문서의 이벤트 사전을 따르고, 새 이벤트를 넣을 때는 사전에도 같이 적습니다. HTML에서는 `data-event="click_join" data-event-params='{"target":"template","source":"builder_page"}'`처럼 속성만으로도 보낼 수 있습니다. 로컬에서 확인하려면 콘솔에서 `window.HUB_DEBUG = true`를 켭니다.

한빛미디어 링크는 `track.js`가 한곳에서 처리합니다. 누를 때마다 `click_partner`(item, action, placement)를 한 번 보내고 링크에 `utm_source=causalinference_hub`를 붙이므로, 한빛 링크에는 따로 `data-event`를 달지 않습니다. `item`은 책 `paid-book`, 강의 `paid-lecture`, 채널 H 연재 `channel-h`이고, 그 밖의 한빛 주소는 `other`입니다. 들어온 링크의 `utm_*`는 `ga.js`가 주소창에서 지우기 전에 `sessionStorage`의 `cil-hub-landing`에 남깁니다. `utm_source=forum5`처럼 `forum<회차>`로 들어오면 그 탭에서는 진단이 행사 현장 모드가 됩니다. 진단 결과에 네트워킹 카드가 생기고, 진단 이벤트에 `context`가 붙습니다. 카드는 행사 다음 날까지만 나옵니다.

## 배포

`main`에 머지되면 Deploy site 워크플로가 사이트를 만들어 `gh-pages` 브랜치에 올리고, GitHub Pages가 그 브랜치를 공개합니다. **`gh-pages`는 지우지 마세요.** 지우면 Pages 설정이 꺼지고 사이트 전체가 404가 됩니다. 머지된 브랜치를 한꺼번에 지울 때도 `gh-pages`와 `main`은 남겨 두세요.

## 로컬에서 보기

```bash
python3 -m http.server 8000
# http://localhost:8000
```

JSON을 `fetch`로 읽기 때문에 파일을 더블클릭해서 열면 데이터가 보이지 않습니다.

## 배포

`main`에 머지되면 GitHub Actions가 JSON 문법을 검사한 뒤 사이트 파일을 `gh-pages` 브랜치로 배포합니다 (`.github/workflows/deploy.yml`). 같은 워크플로가 매주 월요일 `scripts/update_stats.py`로 스타의 월별 추이, 기여자 수, 레포별 마지막 커밋 날짜를 모아 `data/stats.json`에 반영한 뒤 다시 배포합니다. 머지 직후 Actions 탭에서 "Run workflow"를 한 번 누르면 바로 채워집니다.

## 레포의 상태 (`status`)

| 상태 | 기준 |
| --- | --- |
| `running` 진행 중 | 이번 기수에 진행 중인 프로젝트 |
| `active` 최근 업데이트 | 올해 코드나 내용이 갱신된 레포 |
| `stable` 완결 | 내용이 마무리되어 오류 수정 위주로 관리하는 레포 |
| `depot` 운영·보관 | 허브 운영(이 레포, 프로젝트 템플릿)과 보관용 레포 |

## 검색 노출

배포할 때 `scripts/build_sitemap.py`가 도메인 전체의 `sitemap.xml`을 만듭니다. 허브 페이지, Builder 페이지, 그리고 `data/repos.json`의 `site` 중 이 도메인 아래 있는 팀 사이트(웹북, Causal Studio 등)가 들어갑니다. `robots.txt`가 이 사이트맵을 가리킵니다. 팀 사이트를 새로 열면 `repos.json`에 `site`만 적으면 다음 배포부터 사이트맵에 들어갑니다.
