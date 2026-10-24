안녕하세요, 가짜연구소 인과추론팀 [신진수](https://www.linkedin.com/in/jinsoo-shin-436060162/)입니다.

Matheus Facure의 『Causal Inference for The Brave and True』 한국어판을 전면 개정해 웹북으로 다시 열었습니다. 이 연재 '번역 노트: Brave & True 한국어판'에서는 무엇을 고쳤고, 용어를 왜 그렇게 정했고, 원서에서 무엇을 찾았는지를 세 편에 걸쳐 정리합니다. 첫 편은 이번 개정의 전체 그림입니다.

- 웹북: [Python으로 하는 인과추론](https://causalinferencelab.github.io/Causal-Inference-with-Python/)
- 저장소: [CausalInferenceLab/Causal-Inference-with-Python](https://github.com/CausalInferenceLab/Causal-Inference-with-Python)

## 왜 다시 옮겼나

이 번역은 2022년부터 2023년까지 가짜연구소 4기에서 6기에 걸쳐 스터디를 하며 처음 만들었습니다. 그 사이 원서는 꾸준히 바뀌었습니다. 장이 늘었고, 수식 기호가 바뀌었고, 2부 여러 장은 elasticity를 sensitivity로 고쳐 썼습니다. 한국어판은 그 변화를 따라가지 못했고, 처음 번역할 때 생긴 누락과 오역도 남아 있었습니다.

그래서 이번에는 고칠 곳만 고치는 대신, 원서 최신판과 한 셀씩 다시 맞췄습니다.

## 무엇이 바뀌었나

**원서 전체를 옮겼습니다.** 1부 16장, 2부 9장, 부록 5편까지 모두 한국어로 읽을 수 있습니다. 25장 합성 이중차분법과 부록 5편(직교화와 성향점수로 편향 제거하기, 예측이 실패하는 경우, 예측 지표의 함정, 통제집단합성법의 컨포멀 추론)은 이번에 처음 옮겼습니다.

**네 번 검수했습니다.** 오역 → 문맥과 용어 → 오역 재점검 → 윤문 순서입니다. 장마다 번역자 메모와 독립 감수 기록을 따로 남겼습니다. 몇 가지 예를 들면 이렇습니다.

| 장 | 기존 번역 | 바로잡은 번역 | 무엇이 문제였나 |
|---|---|---|---|
| 1장 | 고객 라인을 변경하게 된다면 | 고객의 신용 한도를 바꿨을 때 | customer line은 신용 한도(credit line) |
| 2장 | 처치 효과라고 하는 타겟군과 대조군 간의 작은 차이 | 실험군과 대조군의 단순한 평균 차이를 처치효과라고 부를 수 있습니다 | simple difference를 '작은 차이'로 옮김 |
| 7장 | 핀테크 데이터 수집팀 | 채권 추심팀 | collections team |
| 10장 | 해당 차이는 변수의 스케일에 따라 변하지 않습니다 | 이 거리는 특성의 스케일에 따라 값이 달라집니다 | not invariant를 반대로 옮김 |

빠진 문장도 다시 넣었습니다. 저자의 농담과 밈 설명이 특히 많이 빠져 있었는데, 이 책의 매력은 가볍게 읽히면서도 엄밀하다는 데 있어서 하나하나 살렸습니다.

**용어를 하나로 맞췄습니다.** 같은 저자의 책을 옮긴 『실무로 통하는 인과추론 with 파이썬』(한빛미디어)과 같은 용어를 씁니다. 두 책을 함께 읽어도 헷갈리지 않게 하려는 것입니다. 용어를 어떻게 정했는지는 다음 편에서 자세히 씁니다.

## 웹북으로 읽기

예전 Jupyter Book 대신 Quarto로 만든 웹북에서 읽습니다. 읽는 사람 입장에서 달라진 점은 이렇습니다.

- **검색:** 왼쪽 위 검색(단축키 `/` 또는 `Ctrl+K`)에 한국어나 영어 용어를 넣으면 됩니다. 띄어쓰기가 달라도 찾아 줍니다.
- **용어집:** [용어집](https://causalinferencelab.github.io/Causal-Inference-with-Python/glossary.html)에서 번역어, 원어, 그 용어를 다루는 장을 한 번에 봅니다. 용어마다 고유 주소가 있어서 블로그나 사내 문서에서 링크로 인용할 수 있습니다.
- **장별 댓글:** 장 끝 '의견 나누기'에 GitHub 계정으로 댓글을 남기면 장별로 GitHub Discussions에 모입니다.
- **읽은 장 기록:** 장을 끝까지 읽으면 왼쪽 목차에 ✓가 붙고, 다음에 오면 첫 화면에서 이어 읽을 수 있습니다. 기록은 내 브라우저에만 남습니다.

코드와 출력은 원서 노트북 그대로입니다. 노트북 파일은 저장소에서 내려받아 직접 실행할 수 있습니다.

## 허브에서 이 책의 자리

이 책은 Causal Inference Hub 커리큘럼의 L1(어떻게 추정하나)에 있습니다. 개념을 먼저 가볍게 잡고 싶다면 L0의 [영상으로 여는 인과추론](https://causalinferencelab.github.io/causal-studio/)부터 보고 넘어와도 좋습니다. 다 읽은 뒤에는 관심에 따라 이어 가면 됩니다.

- 내 데이터에 적용해 보고 싶다면: [산업 사례 템플릿](https://causalinferencelab.github.io/#station=causal-inference-practice)
- 메타러너와 이중 머신러닝을 코드로 더 익히고 싶다면: [CausalML 스터디](https://causalinferencelab.github.io/#station=causal-inference-with-causalML)
- A/B 테스트를 제대로 하고 싶다면: [온라인 통제 실험](https://causalinferencelab.github.io/#station=OCE-Materials)

웹북 장 끝에도 그 장 다음에 보면 좋은 허브 자료를 하나씩 붙여 두었습니다. 웹북에서 한 장을 끝까지 읽으면 허브 활동 여권에 '웹북 독자' 스탬프도 찍힙니다.

## 함께 만들어 주세요

번역은 전문 번역가가 아니라 데이터 분석가, 데이터 과학자, 연구자가 했습니다. 아무리 검수해도 놓친 곳이 있을 겁니다.

- 어색하거나 틀린 문장은 [이슈](https://github.com/CausalInferenceLab/Causal-Inference-with-Python/issues)로 알려 주시거나 직접 PR을 보내 주세요. 번역 원칙은 [번역 가이드](https://github.com/CausalInferenceLab/Causal-Inference-with-Python/blob/main/TRANSLATION_GUIDE.md)에 있습니다.
- 더 나은 번역어가 있다면 [용어 제안](https://github.com/CausalInferenceLab/Causal-Inference-with-Python/issues/new?template=term-proposal.yml)으로 남겨 주세요.
- 원서가 바뀌면 매달 확인해서 한국어판에 반영합니다.

한국어 번역에 흔쾌히 동의해 준 Matheus Facure와, 2022년부터 함께 번역하고 이번 개정까지 함께한 인과추론팀 멤버들에게 감사드립니다.

다음 편에서는 '처치군이 아니라 실험군', '탄력성과 민감도'처럼 번역하며 정한 용어와 그 이유를 씁니다.
