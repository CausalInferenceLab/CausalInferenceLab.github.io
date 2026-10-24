# 허브를 고치고 더하는 방법

이 문서는 [Causal Inference Hub](https://causalinferencelab.github.io)를 관리하는 사람을 위한 안내입니다. 허브 소개는 [README](README.md)에 있습니다.

## 공개 원칙

- 이름은 Builder만 표시합니다. 러너는 이름 없이 인원수로만 보여 줍니다.
- 커리큘럼 L0–L2는 무료 자료만으로 끝까지 갈 수 있게 유지합니다. 책과 강의는 L2에 유료로 따로 표시합니다.

## 내용 더하기

사이트는 빌드 도구 없이 `data/` 폴더의 JSON 파일을 읽어 그립니다. 대부분의 수정은 파일 하나를 고치는 PR이면 됩니다.

| 파일 | 고치는 경우 |
| --- | --- |
| `data/featured.json` | 첫 화면 배너의 대표 오픈소스 링크를 바꿀 때. `repo`를 적으면 스타 수가 함께 나옵니다. |
| `data/projects.json` | 기수별 프로젝트를 추가할 때. 러너는 인원수(`runners`)만 적습니다. Builder가 회고를 보내 주면 `"retro": {"why": "…", "learned": "…", "next": "…"}`로 넣습니다. 비어 있으면 화면에 나오지 않습니다. |
| `data/builders.json` | Builder의 LinkedIn, GitHub 아이디(프로필 사진에 쓰임), 한 줄 소개, Builder가 되기 전 러너로 참여한 프로젝트(`runnerOf`)를 넣을 때. `slug`는 Builder 페이지 주소(`/builders/<slug>.html`)가 되므로 한 번 정하면 바꾸지 않습니다. |
| `data/growth.json` | 기수별 누적 러너 수. 프로젝트 시트를 xlsx로 내려받아 `python scripts/runners_from_sheet.py 파일.xlsx > data/growth.json`으로 만듭니다. 이름은 파일에 남지 않습니다. |
| `data/events.json` | Data Forum 같은 행사를 추가할 때 |
| `data/repos.json` | 레포를 추가하거나 설명·단계·트랙·상태를 바꿀 때 |
| `data/map.json` | 트랙 지도에서 레포의 위치를 정할 때. 책과 강의(`paid`)의 표지와 소개도 여기서 고칩니다. |
| `data/routes.json` | 경로 안내 항목을 바꿀 때 |
| `data/articles.json`, `articles/*.md` | 읽을거리를 추가할 때 |
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

링크를 공유할 때 보이는 이미지(`assets/og/builders/<slug>.jpg`)는 따로 만들어 커밋합니다. Builder가 새로 생기거나 숫자가 바뀌면 다시 만들어 주세요. 이미지가 없는 페이지는 허브 기본 이미지를 씁니다.

```bash
pip install playwright && python -m playwright install chromium
python3 scripts/builder_cards.py
```

## 학습 여권과 실험실

스탬프 정의는 `assets/js/passport.js`의 `STAMPS`에 있습니다. 다른 페이지에서는 `window.hubStamp("lab")`처럼 부르면 되고, 이미 받은 스탬프는 다시 주지 않습니다. 기록은 `localStorage`에만 남습니다. 교란 실험실(`lab.html`, `assets/js/lab.js`)의 데이터는 페이지에서 만드는 가상 사용자입니다.

## 이벤트 측정

`assets/js/track.js`의 `hubTrack(이름, 파라미터)`가 GA4로 이벤트를 보냅니다. GA4가 설치되지 않았으면 아무 일도 하지 않습니다. 이벤트 이름과 파라미터는 PM 문서의 이벤트 사전을 따르고, 새 이벤트를 넣을 때는 사전에도 같이 적습니다. HTML에서는 `data-event="click_join" data-event-params='{"target":"template","source":"builder_page"}'`처럼 속성만으로도 보낼 수 있습니다. 로컬에서 확인하려면 콘솔에서 `window.HUB_DEBUG = true`를 켭니다.

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
