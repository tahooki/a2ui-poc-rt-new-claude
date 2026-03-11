# checkout-5xx 시나리오 데모 가이드

checkout-service 5xx 장애 발생부터 롤백 실행, 포스트모텀 작성까지의 전체 대응 흐름을 시연하는 가이드입니다.

---

## 데모 준비

### 1. 개발 서버 실행

```bash
npm run dev
```

서버가 정상 기동되면 http://localhost:3000 에 접속합니다. 자동으로 `/dashboard`로 리다이렉트됩니다.

### 2. 데이터 초기화 및 시나리오 로드

서버가 실행 중인 상태에서 **별도 터미널**을 열고 다음 명령어를 순서대로 실행합니다.

```bash
# 기존 데이터 초기화
npm run scenario:reset

# checkout-5xx 시나리오 데이터 로드
npm run scenario:load checkout-5xx
```

> 주의: scenario CLI는 `http://127.0.0.1:3000/api/admin` 에 요청을 보내기 때문에, 반드시 dev 서버가 먼저 실행되어 있어야 합니다.

### 3. 운영자(Operator) 확인

화면 우측 상단의 **Operator Switcher**에서 운영자를 선택할 수 있습니다. 데모 중 역할 전환이 필요합니다.

| 역할 | 설명 | 언제 사용하는지 |
|------|------|----------------|
| On-call Engineer | 당직 엔지니어 | 인시던트 조사, 초기 대응 |
| Release Manager | 릴리스 매니저 | 롤백 승인, 인시던트 종료 |
| Ops Engineer | 운영 엔지니어 | 롤백 계획 생성, dry-run 실행 |
| Support Lead | 서포트 리드 | 인시던트 종료, 보고서 작성 |

---

## 시나리오: checkout-service 5xx 장애 대응

### Step 1. Dashboard에서 상황 파악

**이동**: 좌측 사이드바에서 **Dashboard** 클릭 (또는 http://localhost:3000/dashboard)

**화면에 보여야 하는 것**:
- **Active Incidents**: 1건 (빨간색 카드)
- **Failed Deployments**: 1건 (주황색 카드)
- **Critical Incident** 섹션: `checkout-service` 관련 인시던트가 `CRITICAL` 심각도로 표시
- **Linked Deployment** 박스: `v2.4.1` 배포가 `failed` 상태로 표시
- **Deployment Risk Overview**: 배포 목록에서 `checkout-service v2.4.1`이 빨간 점(failed)으로 표시

**데모 포인트**:
- Dashboard 한 화면에서 현재 시스템의 전체 상태를 즉시 파악할 수 있음
- Critical Incident와 Failed Deployment가 자동으로 연결(linked)되어 있어 상관관계가 명확함
- Recent Audit Log에서 최근 운영 활동 이력도 확인 가능

---

### Step 2. AI Copilot으로 시스템 상태 요약 받기

**이동**: 화면 우측 상단의 **말풍선 아이콘** (MessageSquare) 클릭 → AI Copilot 패널 열림

**수행할 작업**:
1. AI Copilot 패널이 열리면 추천 질문 중 **"현재 시스템 상태를 요약해줘"** 클릭
2. (또는 직접 입력)

**화면에 보여야 하는 것**:
- AI가 현재 활성 인시던트 수, 실패한 배포 현황, 주의가 필요한 항목을 텍스트로 요약
- checkout-service에 critical 인시던트가 있고, v2.4.1 배포가 실패했다는 정보가 포함

**데모 포인트**:
- AI Copilot은 현재 보고 있는 페이지의 컨텍스트를 자동으로 인식함
- 페이지마다 추천 질문이 달라짐 (Dashboard, Incidents, Deployments 등 페이지별로 다른 질문 제안)
- OpenAI API 키가 없어도 로컬 데이터 기반 fallback 응답이 동작함

---

### Step 3. Incidents 페이지에서 인시던트 상세 확인

**이동**: 좌측 사이드바에서 **Incidents** 클릭 (또는 Dashboard의 Active Incidents 카드 클릭)

**수행할 작업**:
1. 인시던트 목록에서 **checkout-service** 관련 인시던트 클릭
2. 우측 상세 패널이 열림

**화면에 보여야 하는 것**:
- **헤더**: 인시던트 제목, `CRITICAL` 심각도 배지, 현재 상태 배지 (open 또는 investigating)
- **Info Grid**: Service(`checkout-service`), Environment(`production`), Linked Deployment ID
- **Evidence 탭**: 에러율 차트, 로그 샘플, 설정 변경 내역 등의 증거 목록
  - 각 증거 항목을 클릭하면 펼쳐져서 상세 내용(JSON) 확인 가능
- **Timeline 탭**: 인시던트 이벤트 이력 (생성, 상태 변경 등)
- **Status Update 영역**: 다음 상태로 전환할 수 있는 버튼

**데모 포인트**:
- Master-Detail 레이아웃으로 목록과 상세를 동시에 확인
- Evidence(증거)가 유형별로 구조화되어 있음 (error_rate, log_sample, metric_chart, trace, config_diff)
- 인시던트 상태는 `open → investigating → mitigated → resolved → closed` 순서로만 전환 가능 (비즈니스 룰)
- Linked Deployment ID로 배포와의 연관관계 추적 가능

**추가 작업 (선택)**:
- 운영자가 On-call Engineer인 상태에서, Reason 입력 후 **"Start Investigating"** 버튼 클릭
- 상태가 `open` → `investigating`으로 전환됨

---

### Step 4. 챗봇에서 인시던트 관련 배포 확인

**수행할 작업**:
1. AI Copilot 패널에서 **"이 인시던트 관련 배포를 확인해줘"** 또는 **"실패한 배포가 있어?"** 입력

**화면에 보여야 하는 것**:
- AI가 `getDeploymentDetail` 또는 `getServiceStatus` tool을 호출하여 checkout-service의 최근 배포 정보를 분석
- v2.4.1 배포가 failed 상태이고, 이전 버전(v2.3.8)으로 롤백 가능하다는 정보가 포함
- Risk Check 결과 (warning 항목 등)도 함께 보여줄 수 있음

**데모 포인트**:
- AI Copilot이 단순 텍스트 응답뿐 아니라 내부 tool을 호출하여 실시간 데이터를 조회함
- 인시던트와 배포의 연관관계를 AI가 자동으로 파악하고 분석 결과를 제공

---

### Step 5. Deployments 페이지에서 실패한 배포 확인

**이동**: 좌측 사이드바에서 **Deployments** 클릭

**수행할 작업**:
1. 배포 목록에서 **checkout-service v2.4.1** (failed 상태) 클릭
2. 우측 상세 패널에서 3개의 탭 확인:
   - **Diffs 탭**: 코드 변경 내역 (파일별 추가/삭제 라인, diff 내용)
   - **Risk Checks 탭**: 위험 체크 결과 (pass/warn/fail 항목별 확인)
   - **Rollback 탭**: 롤백 계획 관리

**화면에 보여야 하는 것**:
- 배포 헤더: `v2.4.1 / checkout-service / production / failed` 상태
- Rollout Progress: 0% 또는 실패 시점의 퍼센트
- Diffs: 변경된 파일 목록과 코드 diff (+ 초록색, - 빨간색)
- Risk Checks: warning 항목이 있음 (예: config 변경 관련)
- Rollback 탭: 아직 롤백 계획이 없거나, 시나리오에 포함된 초기 draft 상태

**데모 포인트**:
- 코드 변경과 리스크 분석을 한 화면에서 확인할 수 있음
- Risk Check의 pass/warn/fail 시각적 구분이 명확
- 롤백이 필요한 배포를 식별하고 즉시 계획을 수립할 수 있는 워크플로우

---

### Step 6. 챗봇에서 롤백 권고 및 A2UI 카드 확인

**수행할 작업**:
1. AI Copilot 패널에서 **"롤백해야 할까?"** 또는 **"이 배포 롤백이 필요해?"** 입력

**화면에 보여야 하는 것**:
- AI가 `suggestRollback` tool을 호출하여 종합 분석 수행
- **롤백 권고(ROLLBACK)** 판단과 함께 이유를 제시:
  - 배포 상태가 failed
  - 연관 인시던트가 활성 상태
  - Risk Check warning 항목 존재
- `renderRollbackCard` tool 호출 시 **A2UI 롤백 판단 요약 카드**가 채팅 내에 렌더링됨
  - 카드 상단: "A2UI - 롤백 판단 요약" 라벨
  - 배포 정보, 리스크 체크 결과, 롤백 계획 상태가 시각화
  - 카드 내 액션 버튼 (Dry-run 실행 등)이 포함될 수 있음

**데모 포인트**:
- **A2UI (Agentic-to-UI)**: AI의 분석 결과가 단순 텍스트가 아니라 인터랙티브 UI 카드로 렌더링됨
- 카드 내 버튼을 클릭하면 실제 API가 호출되어 DB 상태가 변경됨 (A2UI Action)
- AI가 컨텍스트에 맞는 적절한 카드 유형을 자동으로 선택하여 보여줌
- 카드 유형: rollback_summary, evidence_comparison, dry_run_stepper, confirm_action, job_spec_review, report_template

---

### Step 7. Rollback 실행 플로우: Dry-Run → Approve → Execute

이 단계는 Deployments 페이지의 Rollback 탭에서 수행합니다. **운영자 역할 전환이 필요합니다.**

#### 7-1. 롤백 계획 생성 (Ops Engineer)

**운영자 전환**: 우측 상단 Operator Switcher → **Ops Engineer** 또는 **Release Manager** 선택

**수행할 작업**:
1. Deployments → checkout-service v2.4.1 선택 → **Rollback** 탭 클릭
2. Target Version: `v2.3.8` (이전 안정 버전) 입력
3. Reason: `checkout 5xx 장애 대응 롤백` 입력
4. **"Create Rollback Plan"** 버튼 클릭

**화면에 보여야 하는 것**:
- 롤백 계획이 `draft` 상태로 생성됨
- Steps 목록: 트래픽 라우팅 중지 → 이미지 롤백 → 헬스 체크 → 트래픽 복구 (4단계)
- 모든 step이 `pending` 상태

#### 7-2. Dry-Run 실행

**수행할 작업**:
1. **"Run Dry-Run"** 버튼 클릭

**화면에 보여야 하는 것**:
- 롤백 계획 상태가 `draft` → `dry_run_ready`로 변경
- **Dry-Run Result** 박스 표시: Steps checked 수, Result: `pass`, Notes 확인
- "Dry run completed successfully. No issues detected." 메시지

#### 7-3. 승인 (Release Manager)

**운영자 전환**: 우측 상단 Operator Switcher → **Release Manager** 선택

> 중요: Approve 버튼은 `release_manager` 역할에서만 표시됩니다.

**수행할 작업**:
1. **"Approve"** 버튼 클릭

**화면에 보여야 하는 것**:
- 롤백 계획 상태가 `dry_run_ready` → `approved`로 변경
- `Approved by` 필드에 Release Manager ID가 표시
- **"Execute Rollback"** 버튼이 빨간색(destructive)으로 표시됨

#### 7-4. 롤백 실행

**수행할 작업**:
1. **"Execute Rollback"** 버튼 클릭 (빨간색 버튼)

**화면에 보여야 하는 것**:
- 롤백 계획 상태가 `approved` → `executed`
- 모든 rollback step이 `done` 상태로 변경
- 배포 상태가 `failed` → `rolled_back`으로 변경
- 배포 목록에서 해당 배포의 상태 배지가 `rolled back` (주황색)으로 변경

**데모 포인트**:
- 롤백은 반드시 **draft → dry_run_ready → approved → executed** 순서를 따라야 함
- Dry-Run으로 사전 검증, Release Manager 승인 후에만 실행 가능 (안전 장치)
- 역할 기반 접근 제어(RBAC): 승인은 release_manager만, 실행은 release_manager 또는 ops_engineer만 가능
- 모든 액션이 audit log에 기록됨

---

### Step 8. Incidents에서 상태 전환: Mitigated → Resolved

**이동**: 좌측 사이드바에서 **Incidents** 클릭

**운영자**: On-call Engineer 또는 Ops Engineer

**수행할 작업**:
1. checkout-service 인시던트 클릭하여 상세 패널 열기
2. 현재 상태가 `investigating`인 경우:
   - Reason 입력: `v2.3.8로 롤백 완료, 에러율 정상 복구 확인`
   - **"Mark Mitigated"** 버튼 클릭
3. 상태가 `mitigated`로 변경된 후:
   - Reason 입력: `서비스 정상화 확인, 모니터링 안정`
   - **"Mark Resolved"** 버튼 클릭

**화면에 보여야 하는 것**:
- 상태 배지가 순서대로 변경: `investigating` → `mitigated` → `resolved`
- Timeline 탭에 각 상태 변경 이벤트가 시간순으로 기록
- Status Update 영역의 버튼이 다음 전환 가능 상태로 자동 변경

**데모 포인트**:
- 인시던트 상태는 정해진 순서(open → investigating → mitigated → resolved → closed)로만 전환 가능
- 상태 변경 시 반드시 reason(사유)을 입력해야 함
- 모든 상태 변경은 Timeline에 이벤트로 기록되고, Audit Log에도 남음
- closed로의 전환은 support_lead 또는 release_manager 역할만 가능

---

### Step 9. Reports에서 포스트모텀 작성

**이동**: 좌측 사이드바에서 **Reports** 클릭

**수행할 작업**:

#### 방법 A: AI Copilot을 통한 보고서 생성
1. AI Copilot 패널에서: **"이 인시던트에 대한 포스트모텀 보고서를 만들어줘"** 입력
2. AI가 `renderReportTemplateCard` tool을 호출하여 **A2UI 보고서 템플릿 카드**를 렌더링
3. 카드 내 버튼으로 보고서 자동 생성 가능

#### 방법 B: Reports 페이지에서 직접 편집
1. 시나리오 로드 시 생성된 보고서를 목록에서 선택
2. **Sections** 영역에서 섹션 추가/편집:
   - "Summary" 섹션: 장애 개요
   - "Root Cause" 섹션: 근본 원인 (v2.4.1 배포의 guest cart 관련 코드 변경)
   - "Timeline" 섹션: 장애 타임라인
   - "Action Items" 섹션: 재발 방지 조치
3. **Save** 버튼으로 섹션 저장
4. **Action Items** 영역에서 후속 조치 항목 추가:
   - 예: "배포 전 체크아웃 플로우 E2E 테스트 추가"
   - 예: "에러율 임계값 알림 조정"
5. 보고서 상태 전환: **"Mark Reviewed"** → **"Finalize"** → Export (MD/JSON)

**화면에 보여야 하는 것**:
- 보고서 목록 (좌측): 유형(Postmortem/Incident Update/Handover) 배지, 상태(Draft/Reviewed/Finalized) 배지
- 보고서 상세 (우측): 섹션 편집기, 액션 아이템 체크리스트, Export 버튼

**데모 포인트**:
- 보고서도 상태 머신으로 관리됨 (draft → reviewed → finalized → exported)
- Markdown/JSON 포맷으로 Export 가능
- AI Copilot이 인시던트 데이터를 기반으로 보고서 템플릿을 자동 제안

---

### Step 10. Audit Log에서 전체 행동 기록 확인

**이동**: 좌측 사이드바에서 **Audit Log** 클릭

**화면에 보여야 하는 것**:
- 전체 데모 과정에서 발생한 모든 액션이 시간 역순으로 표시
- 각 로그 항목:
  - **Time**: 상대적 시간 (e.g., "2 minutes ago")
  - **Actor**: 작업을 수행한 운영자 ID
  - **Role**: 운영자 역할 (oncall_engineer, release_manager 등)
  - **Action**: 수행한 작업 유형 (incident_update, rollback_plan_create, rollback_dry_run, rollback_approve, rollback_execute 등)
  - **Target**: 대상 엔티티 (incident, rollback_plan, deployment 등)
  - **Reason**: 작업 사유
  - **Result**: 결과 (success/failure/denied)

**예상되는 로그 항목** (시간 역순):
1. `rollback_execute` - rollback_plan - success
2. `rollback_approve` - rollback_plan - success
3. `rollback_dry_run` - rollback_plan - success
4. `rollback_plan_create` - rollback_plan - success
5. `incident_update` - incident - success (상태 변경들)
6. 시나리오 로드 시 생성된 초기 이벤트들

**수행할 작업**:
1. **Filter by action** 필드에 `rollback` 입력 → 롤백 관련 로그만 필터링
2. **Filter by actor** 필드에 운영자 ID 입력 → 특정 운영자의 활동만 필터링
3. **Clear** 버튼으로 필터 초기화

**데모 포인트**:
- 모든 운영 행위가 감사 추적(audit trail) 가능
- 누가(actor), 무엇을(action), 어떤 대상에(target), 왜(reason), 결과가 어떠했는지(result)가 완전히 기록됨
- 권한 부족으로 거부된 작업도 `denied`로 기록됨 (예: oncall_engineer가 인시던트 close 시도)
- 필터링으로 특정 작업이나 특정 운영자의 활동 이력을 빠르게 추적 가능

---

## 데모 시 강조할 핵심 메시지

### 1. AI + UI의 결합 (A2UI)
- AI Copilot이 단순 텍스트 응답이 아니라 **인터랙티브 UI 카드**를 렌더링
- 카드 내 버튼 클릭으로 실제 운영 작업(롤백, 상태 변경 등)이 실행됨
- 총 6가지 카드 유형: 롤백 판단 요약, 증거 비교, Dry-Run 스텝퍼, 실행 확인, Job Spec 검토, 보고서 템플릿

### 2. 안전한 운영 워크플로우
- 모든 주요 작업에 상태 머신(state machine) 적용
- 롤백: draft → dry_run_ready → approved → executed
- 인시던트: open → investigating → mitigated → resolved → closed
- Dry-Run으로 사전 검증, 승인 후 실행의 안전 장치

### 3. 역할 기반 접근 제어 (RBAC)
- 운영자 역할에 따라 수행 가능한 작업이 제한됨
- Release Manager만 롤백 승인 가능
- Support Lead / Release Manager만 인시던트 종료 가능
- 권한 거부 시 Audit Log에 `denied`로 기록

### 4. 완전한 감사 추적 (Audit Trail)
- 모든 운영 행위가 Audit Log에 자동 기록
- AI Copilot의 A2UI 카드 액션도 audit log에 기록됨
- 사후 분석과 컴플라이언스에 활용 가능

---

## 트러블슈팅

| 증상 | 원인 및 해결 |
|------|-------------|
| scenario:load 실행 시 "Error: fetch failed" | dev 서버가 실행 중인지 확인 (`npm run dev`) |
| Dashboard에 데이터가 없음 | `npm run scenario:reset` 후 `npm run scenario:load checkout-5xx` 재실행 |
| AI Copilot 응답이 로컬 요약만 나옴 | 정상 동작. OpenAI API 키 없이도 로컬 데이터 기반 fallback 응답 제공 |
| Approve 버튼이 안 보임 | Operator Switcher에서 **Release Manager**로 전환 |
| 인시던트 상태 전환 실패 | 올바른 순서(open→investigating→mitigated→resolved→closed)인지 확인, reason 입력 필수 |
| "Role is not permitted" 에러 | 현재 운영자 역할이 해당 작업 권한이 있는지 확인 후 역할 전환 |
