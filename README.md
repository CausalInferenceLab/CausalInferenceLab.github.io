# 인과추론 노선도

가짜연구소 인과추론팀의 오픈소스 허브입니다. 팀이 2022년부터 만든 레포를 학습 단계(L0–L4)와 트랙(노선)으로 엮고, 프로젝트를 연 Builder와 팀이 걸어온 길을 한곳에 모았습니다.

**사이트: https://causalinferencelab.github.io**

![인과추론 노선도](assets/img/metro-map.png)

> **English summary.** This repository is the hub of the Pseudo-Lab Causal Inference Team. It maps our open-source repositories onto five learning levels (L0 Foundation to L4 Research) and six tracks drawn as metro lines, credits the Builders who led each project, and shows the team's history by cohort. The site is plain HTML, CSS and JavaScript that reads JSON files in `data/`, so adding a repository or a project is a one-file pull request.

## 허브에서 할 수 있는 일

| 메뉴 | 내용 |
| --- | --- |
| 경로 안내 | "처음 시작해요", "A/B 테스트를 해요"처럼 하고 싶은 일을 고르면 노선도 위에 경로를 표시합니다. |
| 노선도 | 역(레포)을 누르면 소개, Builder, 기수, 이전·다음 역이 열립니다. 탑승한 역은 브라우저에 기록되어 "이어서 타기"로 다음 역을 추천합니다. |
| 지금 운행 중 · TOP 5 | 이번 기수 프로젝트와 GitHub 스타 순위를 콘텐츠 앱처럼 가로 선반으로 보여 줍니다. |
| 커리큘럼 | L0–L4 구역별 목표와 레포, 구역별 탑승 기록을 보여 줍니다. |
| Builder | 프로젝트를 열고 운영한 Builder와 그 프로젝트 목록입니다. |
| 걸어온 길 | 4기(2022 상반기)부터 지금까지 기수별 프로젝트와 Data Forum입니다. |
| 읽을거리 | 팀이 쓴 글과 독자를 위한 자료입니다. |

## 커리큘럼: 다섯 개의 구역

L0–L2는 **배우는 구역**이고 무료 자료만으로 끝까지 갈 수 있습니다. L3–L4는 **만드는 구역**입니다. 책과 강의는 노선도에 점선 "급행"으로 표시한 가속 옵션입니다.

| 구역 | 질문 | 대표 레포 |
| --- | --- | --- |
| L0 Foundation | 왜 인과추론인가 | [causal-studio](https://github.com/CausalInferenceLab/causal-studio) |
| L1 Theory & Concept | 어떻게 추정하나 | [Causal-Inference-with-Python](https://github.com/CausalInferenceLab/Causal-Inference-with-Python), [OCE-Materials](https://github.com/CausalInferenceLab/OCE-Materials) |
| L2 Application | 내 데이터에 어떻게 쓰나 | [causal-inference-in-python-code](https://github.com/CausalInferenceLab/causal-inference-in-python-code), [causal-inference-practice](https://github.com/CausalInferenceLab/causal-inference-practice), [causal-inference-lecture](https://github.com/CausalInferenceLab/causal-inference-lecture) 외 |
| L3 Amplification | 분석을 어떻게 키우나 | [Lang2SQL](https://github.com/CausalInferenceLab/Lang2SQL), [policy-effect-analytics-agent](https://github.com/CausalInferenceLab/policy-effect-analytics-agent) |
| L4 Research | 무엇이 아직 안 풀렸나 | [ccwr](https://github.com/CausalInferenceLab/ccwr), RWE 가이드라인·적응형 설계 스터디 |

## 여섯 개의 노선

| 노선 | 다루는 것 |
| --- | --- |
| 1호선 본선 | 입문 영상에서 번역서, 책 코드, 산업 사례 템플릿, 정책 효과 분석까지 |
| 2호선 ML선 | 이질적 처치효과와 메타러너, 외부 라이브러리 기여 |
| 3호선 연구선 | Real-World Evidence, 적응형 임상 설계, target trial emulation |
| 4호선 실험선 | 온라인 통제 실험과 실험 플랫폼 |
| 5호선 행동·마케팅선 | 현업 특강, 마케팅 사이언스, 행동 데이터 리딩 살롱 |
| 6호선 AI선 | 사람과 협업하는 데이터 에이전트 |

## 역의 상태

| 상태 | 기준 |
| --- | --- |
| 운행 중 | 이번 기수에 진행 중인 프로젝트 |
| 최근 업데이트 | 올해 코드나 내용이 갱신된 레포 |
| 완결 | 내용이 마무리되어 오류 수정 위주로 관리하는 레포 |
| 차량기지 | 허브 운영(이 레포, 프로젝트 템플릿)과 보관용 레포 |

## 참여하는 방법

1. **러너로 탑승**: 가짜연구소 기수 모집 때 인과추론팀 프로젝트에 러너로 참여합니다.
2. **첫 기여**: 운행 중인 레포의 이슈를 보고 PR을 보냅니다. 오탈자 하나, 예제 하나도 기여입니다.
3. **Builder로 노선 열기**: 다음 기수에 프로젝트를 열고, [Project-template](https://github.com/CausalInferenceLab/Project-template)으로 레포를 만든 뒤 이 허브에 역을 추가합니다.

질문은 [가짜연구소 디스코드](https://discord.gg/HeHbFAvmSZ)에 남겨 주세요.

## 허브에 내용 더하기

사이트는 빌드 도구 없이 `data/` 폴더의 JSON 파일을 읽어 그립니다. 대부분의 수정은 파일 하나를 고치는 PR이면 됩니다.

| 파일 | 고치는 경우 |
| --- | --- |
| `data/repos.json` | 레포(역)를 추가하거나 설명·레벨·노선·상태를 바꿀 때 |
| `data/map.json` | 노선도에서 역의 위치를 정할 때 (`stations`에 `id`, `x`, `y`) |
| `data/projects.json` | 기수별 프로젝트를 추가할 때. 사람 이름은 Builder만 적습니다. |
| `data/events.json` | Data Forum 같은 행사를 추가할 때 |
| `data/routes.json` | 경로 안내 항목을 바꿀 때 |
| `data/articles.json`, `articles/*.md` | 읽을거리를 추가할 때 |

레포를 추가할 때의 예시입니다.

```json
{
  "repo": "new-repo-name",
  "title": "노선도에 보일 이름",
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

## 로컬에서 보기

```bash
python3 -m http.server 8000
# http://localhost:8000
```

JSON을 `fetch`로 읽기 때문에 파일을 더블클릭해서 열면 데이터가 보이지 않습니다.

## 배포

`main`에 머지되면 GitHub Actions가 JSON 문법을 검사한 뒤 사이트 파일을 `gh-pages` 브랜치로 배포합니다 (`.github/workflows/deploy.yml`).

## 라이선스

[MIT](LICENSE)
