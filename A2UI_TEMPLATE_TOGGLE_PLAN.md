# A2UI 템플릿 토글 관리 개발 계획서

## 목적

현재 프로젝트는 AI가 서버 툴을 호출하면, 서버가 정해진 `cardType`과 `cardData`를 반환하고 프런트가 이를 A2UI로 렌더링하는 구조다.

이번 작업의 목표는 이 구조를 유지하면서 다음을 가능하게 만드는 것이다.

1. 여러 A2UI 템플릿을 등록해둘 수 있다.
2. Admin 관리 페이지에서 템플릿별 노출 여부를 켜고 끌 수 있다.
3. 특정 시나리오에서만 보이게 하거나, 특정 페이지에서만 보이게 할 수 있다.
4. 사용자의 자연어 요청이 들어왔을 때, 현재 활성화된 템플릿만 후보로 사용해 AI가 선택하게 할 수 있다.
5. 비활성화된 템플릿은 AI가 요청하더라도 렌더되지 않게 서버에서 차단한다.

이 문서는 기능 설계, DB 반영, 초기 데이터 적재, Admin UI, API, 테스트, 단계별 구현 계획을 정리한다.

---

## 현재 구조 요약

### 현재 동작 방식

1. `/api/chat`에서 LLM이 `aiTools`를 사용한다.
2. 특정 툴이 `{ type: "a2ui_render", cardType, cardData }`를 반환한다.
3. 채팅 메시지 렌더러가 이 payload를 감지한다.
4. `A2UICardRenderer`가 `cardType`에 맞는 빌더를 선택한다.
5. `A2UIViewer`가 최종 JSON을 렌더한다.

### 현재 구조의 한계

1. 템플릿이 코드에 하드코딩되어 있다.
2. Admin에서 노출 여부를 제어할 수 없다.
3. 시나리오별 활성/비활성 정책이 없다.
4. AI가 사용할 수 있는 템플릿 후보를 운영자가 통제할 수 없다.
5. 지금의 `scenario`는 seed/load 개념이지, 앱 런타임에서 참조하는 `currentScenario` 개념이 아니다.

---

## 제품 요구사항

### 핵심 요구사항

1. A2UI 템플릿을 여러 개 등록 가능해야 한다.
2. Admin에서 템플릿을 활성화/비활성화할 수 있어야 한다.
3. 전역 토글과 시나리오별 토글을 둘 다 지원해야 한다.
4. 필요하면 페이지별, 역할별 제한도 지원할 수 있어야 한다.
5. AI는 활성 템플릿만 후보로 삼아 선택해야 한다.
6. 비활성 템플릿은 서버에서 차단해야 한다.
7. 현재 제공 중인 템플릿들의 초기값도 DB에 적재 가능해야 한다.
8. 기존 seed/초기 데이터 적재 흐름도 이 구조를 반영하도록 수정 가능해야 한다.

### 비목표

1. LLM이 raw A2UI JSON을 직접 생성하게 만들지 않는다.
2. 사용자 정의 템플릿 편집기를 이번 1차 범위에 넣지 않는다.
3. 복잡한 멀티에이전트 오케스트레이션은 도입하지 않는다.

---

## 권장 아키텍처

### 핵심 원칙

LLM은 템플릿을 "선택"만 한다.
실제 A2UI JSON 생성은 서버의 검증된 빌더가 담당한다.

이렇게 해야 하는 이유는 다음과 같다.

1. 템플릿 안정성 확보
2. 액션 이름과 context 검증 가능
3. 권한 제어 가능
4. 비활성 템플릿 차단 용이
5. 프런트 렌더러 재사용 가능

### 런타임 흐름

1. Admin이 현재 활성 시나리오를 지정한다.
2. Admin이 템플릿 노출 정책을 관리한다.
3. 사용자가 채팅 요청을 보낸다.
4. 서버가 현재 컨텍스트를 기준으로 활성 템플릿 후보를 조회한다.
5. 후보를 LLM에 알려주거나 서버 룰로 1차 필터링한다.
6. LLM이 템플릿을 선택한다.
7. 서버가 선택된 템플릿의 빌더를 호출한다.
8. 프런트는 기존과 동일하게 `A2UIViewer`로 렌더한다.

---

## DB 설계

### 1. 런타임 시나리오 상태

현재는 시나리오를 적재할 수만 있고, 앱이 "지금 어떤 시나리오를 기준으로 동작 중인지" 저장하지 않는다.

이를 위해 앱 런타임 상태를 저장하는 테이블을 추가한다.

```sql
CREATE TABLE IF NOT EXISTS app_runtime_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

초기 사용 예:

- `key = 'current_scenario_id'`
- `value = 'checkout-5xx'`

### 2. A2UI 템플릿 메타데이터

```sql
CREATE TABLE IF NOT EXISTS a2ui_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  card_type TEXT NOT NULL,
  builder_key TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

설명:

- `card_type`: 현재 프런트가 이해하는 카드 타입
- `builder_key`: 서버가 어떤 빌더를 쓸지 식별하는 키
- `is_enabled`: 전역 기본 활성 여부

### 3. 템플릿 노출 규칙

```sql
CREATE TABLE IF NOT EXISTS a2ui_template_rules (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES a2ui_templates(id),
  rule_type TEXT NOT NULL CHECK(rule_type IN ('keyword','prompt_hint','page','role')),
  rule_value TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

설명:

- `keyword`: 예: `롤백`, `증거`, `postmortem`
- `prompt_hint`: LLM에게 줄 운영 설명
- `page`: 예: `deployments`, `incidents`
- `role`: 예: `release_manager`

### 4. 템플릿 활성화 오버라이드

```sql
CREATE TABLE IF NOT EXISTS a2ui_template_overrides (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES a2ui_templates(id),
  scope_type TEXT NOT NULL CHECK(scope_type IN ('global','scenario','page','role')),
  scope_value TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

예시:

- 전역 비활성화
  - `scope_type = 'global'`
  - `scope_value = '*'`
- 특정 시나리오에서만 비활성화
  - `scope_type = 'scenario'`
  - `scope_value = 'healthy-rollout'`

### 5. 선택 로그

운영 관찰용으로 선택 로그를 남기는 것을 권장한다.

```sql
CREATE TABLE IF NOT EXISTS a2ui_template_selection_logs (
  id TEXT PRIMARY KEY,
  template_id TEXT REFERENCES a2ui_templates(id),
  thread_id TEXT,
  page TEXT NOT NULL,
  scenario_id TEXT,
  operator_id TEXT,
  user_message TEXT NOT NULL DEFAULT '',
  selection_reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('selected','blocked','fallback')) DEFAULT 'selected',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 초기 데이터 적재 전략

### 원칙

초기 데이터는 코드 하드코딩만 하지 않고 DB에 적재 가능해야 한다.
또한 기존 scenario seed 로직이 이 초기 데이터를 함께 넣을 수 있어야 한다.

### 1. 공통 초기 템플릿 seed 함수 추가

신규 파일 예시:

- `src/server/seeds/a2ui-templates.ts`

이 파일에서 다음을 담당한다.

1. 기본 템플릿 메타데이터 삽입
2. 템플릿 규칙 삽입
3. 기본 오버라이드 삽입
4. `current_scenario_id` 기본값 세팅

### 2. 초기 적재 대상 템플릿

현재 제공 중인 템플릿을 우선 초기 데이터로 등록한다.

1. `rollback_summary`
2. `evidence_comparison`
3. `dry_run_stepper`
4. `confirm_action`
5. `job_spec_review`
6. `report_template`

예시 메타데이터:

```ts
[
  {
    id: 'tpl_rollback_summary',
    name: '롤백 판단 요약',
    description: '배포 위험도와 롤백 계획 요약 카드',
    cardType: 'rollback_summary',
    builderKey: 'rollback_summary',
    category: 'deployments',
    isEnabled: 1,
  },
  {
    id: 'tpl_evidence_comparison',
    name: '인시던트 증거 비교',
    description: '인시던트 증거 및 분석 결과 카드',
    cardType: 'evidence_comparison',
    builderKey: 'evidence_comparison',
    category: 'incidents',
    isEnabled: 1,
  },
]
```

### 3. 기존 시나리오 seed 흐름 수정

현재 각 시나리오 seed는 도메인 데이터만 적재한다.
이를 다음 두 단계로 분리한다.

1. 공통 seed
   - operators
   - services
   - a2ui template metadata
   - app runtime defaults
2. 시나리오 seed
   - incidents
   - deployments
   - jobs
   - reports
   - scenario-specific overrides

### 4. 시나리오별 템플릿 override 초기값

시나리오 특성에 따라 일부 템플릿의 기본 상태를 달리 줄 수 있다.

예시:

- `healthy-rollout`
  - `evidence_comparison` 비활성화
  - `report_template` 비활성화
- `billing-backfill`
  - `job_spec_review` 활성화
  - `confirm_action` 활성화
- `incident-handover`
  - `report_template` 활성화
  - `rollback_summary` 비활성화

이 값들은 시나리오 seed에서 `a2ui_template_overrides`에 같이 넣는다.

### 5. reset/load/verify 흐름 수정

`/api/admin`에서 `reset`, `load`, `verify`를 지원하고 있으므로, 다음이 필요하다.

1. `reset`
   - DB 초기화 후 공통 템플릿 seed가 다시 들어와야 한다.
2. `load scenario`
   - 시나리오 데이터와 시나리오별 템플릿 override를 같이 적재해야 한다.
3. `verify`
   - 템플릿 메타데이터, 오버라이드, current scenario까지 검증 가능해야 한다.

---

## Admin 관리 페이지 설계

### 라우트

- `/templates`

### 사이드바 메뉴 추가

기존 Navigation에 다음 항목 추가:

- `A2UI Templates`

### 화면 구성

#### 1. 헤더 영역

표시 정보:

1. 현재 활성 시나리오
2. 전체 템플릿 수
3. 현재 활성 템플릿 수
4. 전역 비활성 템플릿 수

헤더 액션:

1. 시나리오 선택 드롭다운
2. 전체 새로고침
3. 초기값 복원

#### 2. 좌측 목록 패널

컬럼:

1. 템플릿 이름
2. 카테고리
3. 전역 상태
4. 현재 시나리오 상태
5. 사용 가능한 페이지

필터:

1. 전체
2. enabled
3. disabled
4. category
5. page

#### 3. 우측 상세 패널

표시 항목:

1. 템플릿 설명
2. `card_type`
3. `builder_key`
4. 트리거 키워드
5. prompt hints
6. 적용 페이지/역할
7. 현재 오버라이드 목록
8. 미리보기

#### 4. 편집 액션

1. 전역 활성/비활성 토글
2. 현재 시나리오에서 활성/비활성 토글
3. 특정 페이지에서만 사용 설정
4. 특정 역할에서만 사용 설정
5. prompt hint 수정
6. keyword rule 추가/삭제

---

## 서버 로직 설계

### 템플릿 레지스트리

지금의 `switch(cardType)` 구조를 다음처럼 점진적으로 감싼다.

```ts
type TemplateRegistryItem = {
  builderKey: string;
  cardType: string;
  build: (cardData: Record<string, unknown>) => A2UICardDef | null;
};
```

초기에는 기존 빌더를 그대로 registry에 등록하고, 프런트는 registry를 통해 렌더한다.

### 활성 템플릿 해석 함수

신규 서비스 함수 예시:

- `getCurrentScenarioId()`
- `listTemplates()`
- `getTemplateRules(templateId)`
- `resolveTemplateAvailability({ templateId, page, role, scenarioId })`
- `listAvailableTemplates({ page, role, scenarioId })`

### 템플릿 선택 정책

1차 구현 권장 순서:

1. 페이지와 역할로 서버 룰 필터링
2. keyword rule 기반 후보 좁히기
3. 후보 목록을 LLM에 전달
4. LLM이 후보 중 하나 선택
5. 서버가 최종 enabled 상태를 다시 검증

이중 검증이 필요한 이유:

1. 비활성 템플릿 강제 차단
2. 프롬프트 흔들림 방지
3. 운영자 설정 우선 보장

### 차단 정책

비활성 템플릿이 선택되면:

1. `blocked` 로그를 남긴다.
2. 텍스트 fallback 응답을 준다.
3. 필요하면 대체 후보를 재선택한다.

---

## API 설계

### Admin용 API

#### `GET /api/a2ui-templates`

목적:

- 템플릿 목록 조회
- 필터 조건 조회

응답:

- templates
- currentScenarioId
- counts

#### `GET /api/a2ui-templates/:id`

목적:

- 템플릿 상세 조회
- rules, overrides 포함

#### `PATCH /api/a2ui-templates/:id`

목적:

- 전역 enabled 상태 변경
- 메타데이터 수정

#### `POST /api/a2ui-templates/:id/rules`

목적:

- keyword/prompt_hint/page/role rule 추가

#### `DELETE /api/a2ui-templates/:id/rules/:ruleId`

목적:

- rule 삭제

#### `PATCH /api/a2ui-templates/:id/overrides`

목적:

- 특정 scope에 대한 enabled 상태 변경

#### `GET /api/runtime/scenario`

목적:

- 현재 활성 시나리오 조회

#### `PATCH /api/runtime/scenario`

목적:

- 현재 활성 시나리오 변경

### Chat 런타임 연계 API 변경

`/api/chat`에서 context에 다음을 포함하도록 확장한다.

```ts
{
  page,
  operatorId,
  operatorRole,
  selectedEntityId,
  scenarioId
}
```

---

## 프런트엔드 구현 계획

### 신규 페이지

- `src/app/(admin)/templates/page.tsx`

### 신규 컴포넌트

- `src/components/admin/template-list.tsx`
- `src/components/admin/template-detail.tsx`
- `src/components/admin/template-preview.tsx`
- `src/components/admin/scenario-selector.tsx`

### 상태 관리

초기에는 서버 fetch 기반으로 충분하다.
복잡한 클라이언트 상태 라이브러리는 1차 범위에서 불필요하다.

### 미리보기 전략

초기에는 실데이터 미리보기 대신 샘플 payload 기반 미리보기를 제공한다.
이후 필요하면 시나리오 데이터 기반 미리보기로 확장한다.

---

## 시나리오와 템플릿의 관계

### 왜 `currentScenario`가 필요한가

지금의 시나리오는 DB seed 단위이기 때문에, 채팅 런타임이 "현재 무엇을 데모 중인지" 알지 못한다.
템플릿 토글이 시나리오별로 동작하려면 런타임 기준 시나리오가 반드시 필요하다.

### 권장 규칙

1. `load scenario`는 시나리오 데이터를 적재한다.
2. `set current scenario`는 현재 데모 기준을 바꾼다.
3. 둘은 같은 값일 수도 있지만, 개념상 분리한다.

이렇게 해야 나중에:

1. 여러 시나리오 데이터를 같이 적재하고
2. 현재 보여줄 UX만 시나리오별로 바꾸는 구조도 가능하다.

---

## 마이그레이션 계획

### 1차 마이그레이션

1. 신규 테이블 생성
   - `app_runtime_state`
   - `a2ui_templates`
   - `a2ui_template_rules`
   - `a2ui_template_overrides`
   - `a2ui_template_selection_logs`
2. 공통 seed 함수 추가
3. 기존 scenario load 흐름에 공통 seed 연결

### 2차 마이그레이션

1. 기존 하드코딩 카드 정의를 registry 기반으로 래핑
2. Admin 관리 페이지 추가
3. 현재 시나리오 선택 API 추가

### 3차 마이그레이션

1. `/api/chat`에 템플릿 후보 계산 로직 추가
2. 템플릿 차단 정책 적용
3. 선택 로그 추가

---

## 테스트 계획

### 단위 테스트

1. 템플릿 availability 계산
2. override 우선순위 계산
3. current scenario 조회/변경
4. 차단된 템플릿 렌더 차단

### 통합 테스트

1. 시나리오 전환 시 템플릿 목록 상태 반영
2. 전역 비활성 템플릿이 chat 후보에서 제외
3. 시나리오 비활성 템플릿이 해당 시나리오에서 렌더되지 않음
4. enabled 변경 후 Admin 화면과 Chat 런타임이 일관되게 동작

### 스모크 테스트

1. `/templates` 진입 가능
2. 템플릿 토글 가능
3. 시나리오 변경 가능
4. 기존 카드 렌더링 회귀 없음
5. A2UI 버튼 액션 회귀 없음

### verify 확장

기존 scenario verify에 다음 체크를 추가한다.

1. 템플릿 기본 row 존재 여부
2. 시나리오 override row 존재 여부
3. `current_scenario_id` 유효성
4. 핵심 템플릿 활성 상태 기대치

---

## 구현 순서

### Phase 1. 데이터 모델 정비

1. DB 스키마 추가
2. query helper 추가
3. 공통 seed 함수 추가
4. 기존 scenario seed 연결

### Phase 2. Admin 관리 페이지

1. 사이드바 메뉴 추가
2. 템플릿 목록/상세 UI 구현
3. 시나리오 선택 UI 구현
4. 토글 API 연결

### Phase 3. 런타임 연계

1. chat context에 scenarioId 주입
2. 템플릿 후보 계산 로직 추가
3. 비활성 템플릿 차단
4. 선택 로그 기록

### Phase 4. 검증 및 정리

1. verify 확장
2. smoke test 보강
3. seed/reset/load 문서 업데이트

---

## LangGraph 필요 여부

### 결론

현재 범위에서는 필요 없다.

### 이유

이번 요구사항의 핵심은 다음 네 가지다.

1. 템플릿 메타데이터 저장
2. 활성/비활성 정책 관리
3. 시나리오별 노출 제어
4. AI의 템플릿 선택을 제한

이 문제는 `DB + API + 정책 필터링 + 기존 LLM tool 호출`로 충분히 해결된다.

### LangGraph가 필요한 경우

다음과 같은 요구가 커지면 다시 검토할 수 있다.

1. 여러 에이전트가 서로 역할을 나눠 판단해야 함
2. 승인 플로우가 긴 상태 머신으로 복잡해짐
3. human-in-the-loop 분기가 많이 생김
4. 대화 중 장기 워크플로를 여러 단계 저장/재개해야 함

현재는 과한 선택이다.

---

## 리스크와 대응

### 리스크 1. 하드코딩 구조와 DB 메타데이터의 이중 관리

대응:

초기에는 `DB 메타데이터 + code registry` 병행 구조로 간다.
템플릿의 렌더 정의 자체를 DB로 완전히 옮기려 하지 않는다.

### 리스크 2. 시나리오 개념 혼선

대응:

`seed scenario`와 `current scenario`를 개념적으로 분리한다.

### 리스크 3. AI가 잘못된 템플릿을 선택

대응:

1. 서버 룰로 후보를 먼저 줄인다.
2. 비활성 템플릿은 최종 서버 검증에서 차단한다.
3. 선택 로그를 남겨 튜닝한다.

### 리스크 4. Admin에서 설정했는데 채팅 반영이 늦는 문제

대응:

1. 템플릿 조회는 캐시 없이 시작
2. 변경 시 즉시 재조회
3. 필요 시 이후 캐시 무효화 전략 추가

---

## 산출물

이 개발 완료 시 다음 산출물이 생긴다.

1. 신규 DB 테이블 및 query helper
2. 공통 A2UI 템플릿 seed 로직
3. 시나리오별 템플릿 override seed 로직
4. `/templates` Admin 관리 페이지
5. 현재 시나리오 선택 기능
6. Chat 런타임의 템플릿 활성 정책 반영
7. verify 및 smoke test 확장

---

## 권장 시작점

가장 먼저 할 일은 아래 세 가지다.

1. `app_runtime_state`, `a2ui_templates`, `a2ui_template_overrides` 테이블 추가
2. 공통 A2UI 템플릿 seed 함수 작성
3. `/templates` 관리 페이지의 읽기 전용 목록 화면부터 구현

이 세 가지가 되면 이후 토글, 시나리오 연계, LLM 후보 제한은 비교적 안전하게 확장할 수 있다.
