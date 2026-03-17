# A2UI Template-First 기준 후속 개발 정리

## 문서 목적

이 문서는 A2UI의 방향을 `scene 중심 제품`이 아니라 `template 중심 제품`으로 볼 때,
앞으로 무엇을 더 개발해야 하는지를 정리한 후속 개발 문서다.

이 문서는 다음 질문에 답한다.

- 현재 템플릿 축에서 이미 준비된 것은 무엇인가
- 템플릿 제품으로 보려면 무엇이 아직 부족한가
- 앞으로 어떤 순서로 개발해야 하는가

---

## 1. 현재 상태 요약

현재 코드베이스에는 템플릿 중심 구조의 뼈대가 이미 존재한다.

이미 존재하는 요소:

- 템플릿 seed 정의
  - `src/server/ai/template-config.ts`
- 템플릿 가용성/활성화 판단 로직
  - `src/server/ai/template-service.ts`
- 템플릿 관리 화면
  - `src/app/(admin)/templates/page.tsx`
- 템플릿 관련 DB 스키마
  - `src/server/db.ts`
- 템플릿 질문 smoke 카탈로그
  - `src/server/scenarios/a2ui-question-catalog.ts`
- 일부 관리형 템플릿 실행 구조
  - `src/server/ai/managed-template-config.ts`
  - `src/server/ai/managed-template-execution.ts`

즉 템플릿 중심 제품으로 가기 위한 기반 자체는 이미 상당 부분 들어와 있다.

다만 현재 구조는 아직 `카드/도구 중심 구현`에 가깝고, `관리형 템플릿 제품`으로 보기에는 부족한 부분이 남아 있다.

---

## 2. 템플릿 중심 제품으로 보기 위해 부족한 점

### 2.1 템플릿이 아직 제품 단위가 아니라 카드/도구 단위임

현재 템플릿 정의는 내부 구현 이름과 카드 타입 중심이다.

예:

- `renderRollbackCard`
- `renderConfirmCard`
- `renderJobReviewCard`

하지만 템플릿 제품으로 가려면 사용자 기준의 이름과 목적이 전면에 나와야 한다.

예:

- `Incident Triage`
- `Rollback Decision`
- `Execution Check`
- `Job Review`
- `Postmortem Draft`

즉 템플릿을 `도구 호출 단위`가 아니라 `제품 starter 단위`로 다시 정의해야 한다.

---

### 2.2 템플릿별 데이터 계약이 제품 표면에 드러나지 않음

현재는 템플릿별로 다음 정보는 어느 정도 있다.

- 키워드
- 허용 페이지
- 허용 역할
- decision inputs

하지만 템플릿 중심 제품에 더 중요한 것은 다음이다.

- 이 템플릿이 실제로 어떤 데이터를 필요로 하는가
- 어떤 필드가 반드시 있어야 하는가
- 어떤 데이터가 없으면 degraded/fallback 되는가
- 어떤 응답 구조를 기대하는가

즉 템플릿마다 `데이터 계약`이 제품 수준에서 명시되어야 한다.

---

### 2.3 관리형 템플릿 실행 범위가 너무 좁음

현재 관리형 템플릿 실행 구조는 존재하지만, 사실상 `tpl_rollback_summary` 중심으로만 구현되어 있다.

즉 앞으로는 모든 핵심 템플릿을 다음 구조로 확장해야 한다.

- template args 정의
- data requirement 정의
- data source 연결
- input mapping
- output validation
- 최종 card data 생성

즉 템플릿을 코드 안에 하드코딩된 카드 렌더 함수가 아니라, `관리형 실행 가능한 제품 단위`로 확대해야 한다.

---

### 2.4 데이터소스 실행기가 아직 실제 제품 수준이 아님

현재 데이터소스 타입 정의는 다음을 포함한다.

- `internal_db`
- `internal_api`
- `external_http`

하지만 실제 실행기는 현재 `internal_db`만 지원한다.

이 말은 곧:

- 외부 API 기반 템플릿
- 내부 서비스 API 기반 템플릿
- 실제 연동형 템플릿

이 아직 제품 수준으로는 준비되지 않았다는 뜻이다.

따라서 템플릿 중심 제품으로 가려면 가장 중요한 핵심은 다음이다.

- `internal_api` 실행기 구현
- `external_http` 실행기 구현
- auth policy 처리
- timeout / cache / retry
- resultPath 및 output validation

---

### 2.5 현재 템플릿 관리 화면은 rule editor에 가깝고 preview builder는 아님

현재 `/templates` 페이지에서는 다음 작업이 가능하다.

- 키워드 수정
- 허용 페이지/역할 수정
- prompt hint 수정
- decision input 수정

하지만 템플릿 중심 제품에 더 필요한 건 다음이다.

- 샘플 JSON 붙여넣기
- API URL 테스트
- 템플릿 preview
- 어떤 데이터가 부족한지 표시
- 왜 이 템플릿이 선택되는지 설명

즉 현재 화면은 `운영자용 rule 편집기`에 가깝고, 앞으로는 `template builder + preview studio`로 확장되어야 한다.

---

### 2.6 챗봇 경로가 아직 template-first 제품 구조로 명확히 정리되어 있지 않음

현재 `/api/chat`은 다음 두 경로가 공존한다.

- 템플릿 선택 경로
- generic scene fallback 경로

template-first로 갈 경우 역할을 더 명확히 해야 한다.

- 템플릿 선택은 주 경로
- generic scene은 내부 fallback 또는 실험 경로

즉 챗봇 응답 구조도 template-first 제품 철학에 맞게 정리되어야 한다.

---

### 2.7 템플릿 테스트는 더 확장되어야 함

현재 smoke는 질문 -> 기대 tool -> 기대 card type 수준까지는 잘 커버한다.

하지만 템플릿 제품으로 가려면 추가로 다음을 검증해야 한다.

- 필수 데이터 누락
- 잘못된 schema 응답
- 외부 API 실패
- 인증 실패
- degraded/fallback 응답
- 템플릿 비활성 상태
- 권한 mismatch

즉 `정상 케이스 중심 smoke`에서 `제품 운영 품질 검증`으로 테스트가 확장되어야 한다.

---

### 2.8 서비스별 템플릿 팩 전략이 없음

현재 템플릿은 개별 카드 중심으로 흩어져 있다.

하지만 template-first 제품이라면 사용자에게는 템플릿 하나하나보다 다음처럼 묶어서 보여주는 것이 더 자연스럽다.

- DevOps Pack
- Incident Pack
- Job Ops Pack
- Reporting Pack

즉 템플릿을 개별 구현 단위로만 두지 말고, `서비스별/업무별 팩`으로 재패키징해야 한다.

---

## 3. 앞으로 해야 할 개발 항목

### 3.1 템플릿을 starter/product unit 기준으로 재정의

해야 할 일:

- 내부 tool/card 이름이 아니라 사용자용 템플릿 이름으로 재정의
- 템플릿 목적과 사용 상황을 제품 문구로 정리
- 카테고리도 카드 단위가 아니라 업무/서비스 단위 관점으로 정리

---

### 3.2 템플릿별 데이터 계약 문서화 및 구조화

해야 할 일:

- 템플릿별 필수 데이터 정의
- 선택 데이터 정의
- 필수 필드 정의
- 실패/대체 동작 정의
- preview에 표시할 validation 결과 정의

---

### 3.3 관리형 템플릿 실행 구조를 모든 핵심 템플릿으로 확장

우선 대상:

- `tpl_rollback_summary`
- `tpl_evidence_comparison`
- `tpl_dry_run_stepper`
- `tpl_confirm_action`
- `tpl_job_spec_review`
- `tpl_report_template`

해야 할 일:

- template args 정의
- data requirement 정의
- managed execution 연결
- output validation 연결

---

### 3.4 데이터소스 실행기 확장

가장 우선순위 높은 작업 중 하나다.

구현 대상:

- `internal_api`
- `external_http`

포함해야 하는 것:

- 인증 정책
- 요청 헤더 처리
- timeout
- retry
- cache policy
- resultPath
- output schema validation

---

### 3.5 `/templates` 화면을 preview 중심으로 재설계

현재는 편집 중심 UI다.

앞으로 추가해야 할 것:

- 샘플 JSON 입력
- API URL 테스트
- 템플릿 preview
- 필수 데이터 missing 표시
- selection explanation
- validation 결과 표시

즉 템플릿 관리 화면을 실제로는 `template builder / preview studio`로 바꿔야 한다.

---

### 3.6 챗봇 라우팅을 template-first 기준으로 정리

해야 할 일:

- 템플릿 선택 경로를 명확한 주 경로로 유지
- generic scene 응답은 내부 fallback으로 위치 조정
- 로그/진단도 템플릿 선택 관점에서 정리

---

### 3.7 템플릿 운영 테스트 확장

해야 할 일:

- 필수 데이터 누락 케이스
- API 실패 케이스
- auth 실패 케이스
- disabled template 케이스
- degraded/fallback 케이스
- role/page mismatch 케이스

즉 테스트 목표를 `카드가 나온다`에서 `제품처럼 운영 가능하다`로 올려야 한다.

---

### 3.8 서비스별 템플릿 팩 정의

예시:

- DevOps Incident Pack
- Deployment Recovery Pack
- Job Execution Pack
- Reporting & Handoff Pack

해야 할 일:

- 어떤 템플릿을 어떤 팩으로 묶을지 정의
- 서비스별 기본 제공 세트 정의
- 향후 타겟 서비스별 확장 전략 정의

---

## 4. 권장 개발 순서

### 1단계

관리형 템플릿 구조 확장

- 전 템플릿 managed execution화
- data requirement 정리

### 2단계

데이터소스 실행기 확장

- `internal_api`
- `external_http`

### 3단계

템플릿 preview/builder 화면 구현

- 샘플 JSON
- API 테스트
- validation
- preview

### 4단계

챗봇 template-first 경로 정리

- template 주 경로
- scene fallback 축소/정리

### 5단계

서비스별 템플릿 팩 정의 및 패키징

---

## 5. 최종 요약

template 기준으로 더 해야 하는 핵심은 `카드 종류를 더 만드는 것`이 아니다.

핵심은 다음과 같다.

- 템플릿을 제품 단위 starter로 재정의하고
- 템플릿마다 데이터 계약을 명확히 하고
- 외부/내부 API를 실제로 호출할 수 있는 데이터소스 실행기를 만들고
- preview 가능한 템플릿 빌더를 제공하고
- 챗봇 경로를 template-first 기준으로 정리하는 것

한 줄로 요약하면:

`앞으로 필요한 것은 새로운 scene을 더 만드는 것이 아니라, 현재 템플릿 축을 실제 연동과 preview까지 포함하는 관리형 템플릿 플랫폼으로 완성하는 일이다.`
