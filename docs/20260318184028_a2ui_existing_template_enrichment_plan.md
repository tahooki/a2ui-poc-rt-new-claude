# A2UI Existing Template Enrichment Plan

## 문서 목적

이 문서는 현재 이미 존재하는 6개의 A2UI 템플릿을 기준으로,
새 템플릿을 추가하지 않고도 DevOps에서 더 가치 있는 화면이 되도록 보강하기 위한 계획 문서다.

이 문서는 다음 질문에 답한다.

- 현재 템플릿별로 무엇이 부족한가
- 어떤 데이터를 더 붙여야 하는가
- 어떤 UX를 더 보여줘야 하는가
- 어떤 순서로 보강해야 하는가

본 문서에서는 템플릿 개수 증가(A)는 제외하고,
기존 템플릿의 `workflow/context/data richness` 강화만 다룬다.

---

## 1. 대상 템플릿

현재 보강 대상은 다음 6개다.

- `tpl_rollback_summary`
- `tpl_evidence_comparison`
- `tpl_dry_run_stepper`
- `tpl_confirm_action`
- `tpl_job_spec_review`
- `tpl_report_template`

---

## 2. 템플릿별 부족점과 보강 방향

## 2.1 tpl_rollback_summary

### 현재 상태

현재는 주로 다음 데이터만 사용한다.

- deployment
- riskChecks
- rollbackPlan

### 부족한 점

- 승인 상태가 없음
- 관련 incident 문맥이 없음
- 최근 감사/변경 이력이 없음
- diff나 실패 원인 요약이 직접적으로 안 붙어 있음

### 보강 방향

추가 데이터:

- relatedIncidents
- deploymentDiffs
- recentAuditLogs
- approvalStatus

UX 보강:

- rollback 이유 요약
- 승인 상태 배지
- 관련 incident 링크/요약
- 최근 감사 로그 또는 최근 액션 타임라인

---

## 2.2 tpl_evidence_comparison

### 현재 상태

현재는 주로 다음 데이터만 사용한다.

- incident
- evidence

### 부족한 점

- 최근 이벤트 흐름이 없음
- 관련 deployment/change context가 없음
- “그래서 지금 무엇을 해야 하는가”가 약함

### 보강 방향

추가 데이터:

- incidentEvents
- linkedDeployment
- recentAuditLogs

UX 보강:

- evidence 아래에 timeline 요약
- 관련 deployment context
- root cause hint / next action 요약

---

## 2.3 tpl_dry_run_stepper

### 현재 상태

현재는 주로 다음 데이터만 사용한다.

- rollbackPlan
- rollbackSteps

### 부족한 점

- dry-run 전체 성공/실패 맥락이 약함
- 어떤 단계가 왜 막혔는지 보조 정보가 부족함
- step 외부의 배포 상태/리스크 요약이 없음

### 보강 방향

추가 데이터:

- deployment
- riskChecks summary
- dryRunResult summary

UX 보강:

- 상단 요약 배너
- 실패 단계 원인 설명
- rollback summary로 돌아갈 수 있는 연결감 강화

---

## 2.4 tpl_confirm_action

### 현재 상태

현재는 `rollback`, `job_execute`, `incident_close`를 하나의 범용 카드로 처리한다.

### 부족한 점

- 목적별로 필요한 문맥이 다름
- approval / policy / audit 문맥이 얕음
- 범용 구조라 사용자 입장에서 “무슨 작업용인지” 직관이 약할 수 있음

### 보강 방향

추가 데이터:

- recentAuditLogs
- recentRelatedEvents
- approvalStatus
- policyHints

UX 보강:

- actionType에 따라 제목/설명/체크리스트 가중치 차별화
- 승인 상태/정책 설명 영역 추가
- 최근 관련 액션 로그 표시

---

## 2.5 tpl_job_spec_review

### 현재 상태

현재는 주로 다음 데이터만 사용한다.

- jobRun
- template
- dryRunResult

### 부족한 점

- dependency 상태가 없음
- rerun 판단 재료가 부족함
- 최근 실행 이벤트 흐름이 약함
- partition / batch window / 영향 범위 맥락이 없음

### 보강 방향

추가 데이터:

- jobRunEvents
- dependencySummary
- rerunHints

UX 보강:

- 최근 실행 timeline
- rerun 추천/주의 사항
- dependency 상태 요약

---

## 2.6 tpl_report_template

### 현재 상태

현재는 주로 다음 데이터만 사용한다.

- incident
- reportType

### 부족한 점

- handoff/report/audit 용 문맥이 약함
- 관련 evidence나 action 요약이 없음
- “이 보고서가 왜 지금 필요한가” 맥락이 없음

### 보강 방향

추가 데이터:

- incidentEvents
- evidenceSummary
- recentAuditLogs
- pendingActions

UX 보강:

- 보고서 목적 요약
- 포함 추천 섹션
- 최근 이벤트/증거/후속 액션 요약

---

## 3. 공통 보강 전략

템플릿마다 별도 하드코딩으로 키우는 대신,
공통 데이터 패턴을 먼저 정리해서 재사용한다.

공통 패턴:

- `recentAuditLogs`
- `recentEvents`
- `relatedIncidents`
- `relatedDeployment`
- `approvalStatus`
- `policyHints`
- `nextActions`

즉 각 템플릿은 기존 핵심 데이터에
공통 문맥 조각을 붙이는 방식으로 보강한다.

---

## 4. 권장 구현 순서

### 1단계

`tpl_rollback_summary` 보강

이유:

- 현재 가장 가치가 크고
- 승인/감사/incident 문맥을 붙이면 효과가 큼

### 2단계

`tpl_evidence_comparison` 보강

이유:

- incident triage에 더 가까워지게 만들 수 있음

### 3단계

`tpl_job_spec_review` 보강

이유:

- dry-run 이후 실행 판단에 직접 영향을 줌

### 4단계

`tpl_confirm_action` 보강

이유:

- policy/approval/audit 문맥을 붙이면 범용 카드가 더 실무적이 됨

### 5단계

`tpl_dry_run_stepper`, `tpl_report_template` 보강

이유:

- 이미 방향은 맞고, 부가 문맥 강화가 중심이기 때문

---

## 5. 구현 원칙

- 새 템플릿을 만들지 않는다
- 기존 템플릿의 binding/source만 강화한다
- 가능한 한 공통 source를 재사용한다
- preview/test/sandbox에서 보강된 문맥이 바로 보이게 해야 한다
- UI는 더 복잡해지기보다 더 결정 가능해져야 한다

---

## 6. 완료 기준

이번 보강의 완료 기준은 다음과 같다.

- `tpl_rollback_summary`가 승인/incident/audit 문맥을 포함한다
- `tpl_evidence_comparison`가 timeline/change context를 포함한다
- `tpl_job_spec_review`가 dependency/events/rerun 판단 정보를 포함한다
- `tpl_confirm_action`가 policy/approval/audit 문맥을 더 잘 설명한다
- `tpl_report_template`가 handoff/report 문맥을 담는다
- 각 템플릿은 preview/sandbox에서 현재보다 더 “workflow 단위 화면”처럼 보인다

---

## 7. 한 줄 결론

`이번 단계에서는 새 템플릿을 늘리지 않고, 기존 6개 템플릿에 승인/감사/이벤트/연관 엔티티 같은 운영 문맥을 더 붙여서, 카드 수준을 넘는 workflow 템플릿으로 끌어올리는 것을 목표로 한다.`
