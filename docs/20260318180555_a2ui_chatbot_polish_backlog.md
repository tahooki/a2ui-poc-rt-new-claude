# A2UI Chatbot Polish Backlog

## 문서 목적

이 문서는 [20260318162245_a2ui_chatbot_end_to_end_ux_design.md](./20260318162245_a2ui_chatbot_end_to_end_ux_design.md)
기준으로 기능 구현은 끝났지만, 제품 완성도 관점에서 아직 남아 있는 polish 항목을 정리한 문서다.

이 문서는 다음 질문에 답한다.

- 현재 end-to-end UX에서 무엇이 아직 어색한가
- 어떤 항목이 제품 완성도를 떨어뜨리는가
- 어떤 순서로 polish를 진행해야 하는가
- 언제 이 phase를 닫아도 되는가

---

## 1. 현재 상태

현재 구현 상태에서 이미 가능한 것:

- starter-like 템플릿 선택
- source/binding 확인
- source/binding 저장
- preview/test
- question simulator
- chat-like sandbox
- publish-style action
- recent activity / minimal diagnostics

즉 기능 흐름은 성립한다.

하지만 다음 항목들은 아직 제품 완성도 측면에서 부족하다.

---

## 2. 남은 polish 항목

### 2.1 온보딩 첫인상 정리

현재 `/templates`는 builder로서 동작하지만,
첫 진입 시 “무엇을 해야 하는지”를 더 분명하게 안내할 필요가 있다.

남은 일:

- 첫 진입용 hero/empty state 정리
- “무엇을 먼저 해야 하는지”를 1-2-3 단계로 더 직관적으로 표현
- starter별 추천 use case를 더 명확히 노출

완료 기준:

- 처음 들어온 사용자가 별도 설명 없이도 다음 행동을 이해할 수 있다

---

### 2.2 비개발자 친화적 용어 정리

현재 UI에는 여전히 내부 구현 냄새가 나는 용어가 남아 있을 가능성이 크다.

예:

- `handlerKey`
- `outputKey`
- `binding`
- `input mapping`

남은 일:

- 고급 용어를 사용자 친화적 라벨로 바꾸기
- 필요한 경우 tooltip/help text 제공
- 내부 용어는 가능한 한 secondary 정보로 숨기기

완료 기준:

- 비개발자도 각 필드가 무엇을 의미하는지 대략 이해할 수 있다

---

### 2.3 Chatbot sandbox 완성도 강화

현재 sandbox는 작동하지만, 실제 챗봇 느낌을 더 살릴 필요가 있다.

남은 일:

- user/assistant 흐름 시각 강화
- 선택된 템플릿과 preview 결과 관계를 더 자연스럽게 보여주기
- 실패/partial/fallback도 챗봇 흐름 안에서 읽히게 만들기

완료 기준:

- 사용자가 sandbox를 보면 “실제 챗봇에서 이렇게 보이겠구나”를 직관적으로 이해한다

---

### 2.4 Publish 설명과 안전성 강화

현재 publish-style action은 있지만, release step으로서의 설명이 더 필요하다.

남은 일:

- publish 전 체크리스트 명확화
- publish가 실제로 무엇을 의미하는지 설명 강화
- publish readiness 상태를 더 명확히 표시

완료 기준:

- 사용자가 publish 전에 어떤 조건을 확인해야 하는지 혼동하지 않는다

---

### 2.5 Diagnostics 표면 마감

recent activity는 있지만, diagnostics surface가 더 읽기 쉬워야 한다.

남은 일:

- preview / simulate / publish 결과를 한눈에 볼 수 있게 정리
- 최근 warning / missingRequired / fallback 이력을 더 읽기 쉽게 요약
- “무엇을 고쳐야 하는지”에 가까운 메시지 제공

완료 기준:

- 사용자가 실패 이력을 보고 바로 다음 수정 방향을 이해할 수 있다

---

## 3. 권장 진행 순서

1. 온보딩 첫인상 정리
2. 용어 정리
3. sandbox 완성도 강화
4. publish 설명 강화
5. diagnostics 표면 마감

---

## 4. Phase 종료 기준

이 문서의 항목이 완료되면, 이번 phase는 닫아도 된다.

종료 기준:

- 첫 진입한 사용자가 starter 선택부터 publish까지 흐름을 이해한다
- 비개발자도 주요 설정 필드 의미를 이해한다
- sandbox가 실제 챗봇 경험을 충분히 대체한다
- publish가 무슨 의미인지 설명된다
- diagnostics가 수정 방향까지 안내한다

---

## 5. 한 줄 결론

`이 문서는 기능이 아니라 제품 완성도를 마무리하기 위한 polish backlog이며, 이 항목들이 채워지면 현재 A2UI chatbot builder phase는 닫아도 된다.`
