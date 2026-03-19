# Quick Deploy Pipeline 개발 문서

## 문서 목적

현재 `간단 배포 시작` 카드는 "자동 채운 요약 카드"에 가까워서, 사용자가 기대하는
"이미지 생성 -> 배포 실행 -> 결과 확인" 흐름을 충분히 전달하지 못한다.

이 문서는 `quick_deploy_launchpad`를 실제 배포 파이프라인처럼 보이고 동작하는
3단계 A2UI 카드로 재설계하기 위한 개발 기준 문서다.

목표는 다음과 같다.

- 여러 페이지를 오가던 배포 흐름을 챗봇 안의 A2UI 카드 하나로 압축한다.
- Step 1, 2, 3이 분명한 절차형 카드로 바꾼다.
- POC 수준에서 실제 배포 시스템처럼 보이는 최소 데이터 모델과 상태 전이를 만든다.
- `배포 승인 Inbox`, `롤백 실행` 카드와 자연스럽게 연결되도록 한다.

---

## 핵심 결론

`간단 배포 시작`은 2단계가 아니라 아래 3단계로 가야 한다.

1. 도커 빌드 / 이미지 생성
2. 해당 이미지로 배포 실행
3. 결과 확인

즉, 이 카드는 더 이상 "launchpad"라기보다는
`quick deploy pipeline card` 성격으로 동작해야 한다.

단, 기존 카드 ID와 템플릿 시스템과의 호환을 위해
POC에서는 `cardType: quick_deploy_launchpad` 이름은 유지할 수 있다.

---

## 문제 정의

현재 카드의 문제는 다음과 같다.

- Step이라는 문구는 보이지만 실제로는 정보 요약 카드처럼 느껴진다.
- 버튼을 눌러도 사용자는 "다음 단계로 넘어갔다"는 인지를 명확히 하지 못한다.
- "무엇을 배포하는지"와 "어떻게 배포하는지"와 "결과가 어떤지"가 분리되어 있지 않다.
- 이미지/아티팩트 개체가 없어 "도커 이미지를 만든 뒤 그걸로 배포한다"는 흐름이 표현되지 않는다.

즉, 지금 구조는 `배포 요청 생성` 중심이고,
원하는 구조는 `배포 파이프라인 진행` 중심이다.

---

## 범위

### 이번 문서 범위에 포함

- Quick Deploy Pipeline 카드
- 최소 데이터 모델 추가
- A2UI 액션 설계
- 템플릿/데이터소스/시나리오 시드 설계
- 결과 확인용 progress bar 방향

### 이번 문서 범위에 제외

- 실제 Docker build 연동
- 실제 ECR/ECS/EKS/CodeDeploy 연동
- 승인 프로세스 통합

승인 프로세스는 별도 `배포 승인 Inbox` 카드에서 담당한다.
Quick Deploy Pipeline 카드는 POC 기준으로 승인 단계를 제외하고
즉시 배포 흐름만 보여준다.

---

## 제품적 목표

사용자는 다음을 한 카드에서 끝낼 수 있어야 한다.

- 어떤 기준 배포를 바탕으로 배포할지 확인
- 그 기준으로 새 이미지가 생성되었는지 확인
- 그 이미지로 배포가 시작되었는지 확인
- 배포 진행률과 결과를 확인

즉 이 카드는 "폼"이 아니라 "실행형 마이크로 파이프라인"이어야 한다.

---

## UX 합의안

카드는 세로로 이어지는 3개의 step card로 구성한다.

### Step 1. 이미지 생성

보여줄 것:

- 기준 서비스
- 기준 버전
- 대상 환경
- 생성될 이미지 태그
- 현재 build 상태

버튼:

- `이미지 생성`

상태:

- `대기`
- `생성 중`
- `이미지 준비 완료`
- `실패`

### Step 2. 배포 실행

보여줄 것:

- 사용할 이미지 태그
- 배포 전략
- 롤아웃 방식
- 현재 deploy 상태

버튼:

- `배포 시작`

상태:

- `대기`
- `배포 중`
- `실패`
- `완료`

### Step 3. 결과 확인

보여줄 것:

- progress bar
- 현재 퍼센트
- 현재 단계 문구
- 성공/실패 여부
- 실패 시 다음 액션

버튼:

- `상세 보기`
- 실패 시 `롤백 후보 보기`

상태:

- `0%`
- `10%`
- `50%`
- `100%`
- `성공`
- `실패`

---

## 추천 사용자 플로우

1. 사용자가 "checkout 다시 배포"라고 요청한다.
2. 카드가 최근 성공 배포를 기준으로 열린다.
3. Step 1에서 `이미지 생성`을 누른다.
4. Step 1 상태가 `이미지 준비 완료`로 바뀐다.
5. Step 2에서 `배포 시작` 버튼이 활성화된다.
6. Step 2를 누르면 Step 3이 열리며 progress bar가 움직인다.
7. 성공 시 `배포 완료`, 실패 시 `롤백 후보 보기`를 노출한다.

---

## 제안 데이터 모델

현재 구조에 최소한 다음 2개 개체를 추가한다.

### 1. deployment_artifacts

역할:

- 배포 가능한 이미지/아티팩트 자체를 나타냄
- Step 1의 결과물

제안 스키마:

```sql
CREATE TABLE deployment_artifacts (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id),
  source_deployment_id TEXT REFERENCES deployments(id),
  source_version TEXT NOT NULL,
  image_uri TEXT NOT NULL,
  image_tag TEXT NOT NULL,
  git_sha TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('pending','building','ready','failed')) DEFAULT 'pending',
  created_by TEXT NOT NULL REFERENCES operators(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 2. deployment_runs

역할:

- Step 2와 Step 3을 담당하는 배포 실행 단위
- 어떤 artifact를 어떤 환경에 어떤 전략으로 배포 중인지 표현

제안 스키마:

```sql
CREATE TABLE deployment_runs (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES deployment_artifacts(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  environment TEXT NOT NULL CHECK(environment IN ('production','staging','development')),
  strategy TEXT NOT NULL DEFAULT 'canary_10_50_100',
  status TEXT NOT NULL CHECK(status IN ('pending','deploying','verifying','succeeded','failed','rolled_back')) DEFAULT 'pending',
  progress_percent INTEGER NOT NULL DEFAULT 0,
  current_stage TEXT NOT NULL DEFAULT 'pending',
  started_by TEXT NOT NULL REFERENCES operators(id),
  result_deployment_id TEXT REFERENCES deployments(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 3. deployment_run_events

역할:

- progress bar와 현재 단계 문구를 만들기 위한 이벤트 로그

제안 스키마:

```sql
CREATE TABLE deployment_run_events (
  id TEXT PRIMARY KEY,
  deployment_run_id TEXT NOT NULL REFERENCES deployment_runs(id),
  stage TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  progress_percent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
```

---

## 기존 테이블과의 관계

- `deployments`: 최종 배포 결과 레코드
- `deployment_artifacts`: 배포에 사용할 이미지
- `deployment_runs`: 진행 중 파이프라인
- `deployment_requests`: 별도 승인 inbox용으로 유지

즉,

- quick deploy pipeline은 `artifact + run`
- approval inbox는 `deployment_requests`
- rollback card는 `deployments + rollback_plans`

이렇게 역할을 나눈다.

---

## 상태 머신

### Artifact 상태

```text
pending -> building -> ready
pending -> building -> failed
```

### Deploy Run 상태

```text
pending -> deploying -> verifying -> succeeded
pending -> deploying -> failed
pending -> deploying -> verifying -> failed
failed -> rolled_back
```

### Progress 규칙

예시:

- `pending`: 0
- `artifact ready`: 20
- `deploying canary 10%`: 40
- `deploying canary 50%`: 70
- `verifying`: 85
- `succeeded`: 100
- `failed`: 마지막 진행률 유지

---

## A2UI 카드 데이터 계약

`quick_deploy_launchpad`의 cardData는 다음 구조를 목표로 한다.

```ts
{
  pipeline: {
    serviceId: string
    serviceName: string
    environment: string
    sourceDeploymentId: string
    sourceVersion: string
    strategy: string
    state: "pending" | "artifact_ready" | "deploying" | "succeeded" | "failed"
  },
  artifact: {
    id: string | null
    imageTag: string
    imageUri: string
    status: "pending" | "building" | "ready" | "failed"
  },
  deployRun: {
    id: string | null
    status: "pending" | "deploying" | "verifying" | "succeeded" | "failed"
    progressPercent: number
    currentStage: string
    lastMessage: string
  },
  runEvents: Array<{
    stage: string
    detail: string
    progressPercent: number
  }>
}
```

---

## A2UI 액션 설계

### Step 1

- `build_deploy_artifact`

입력 context:

```ts
{
  baselineDeploymentId,
  serviceId,
  environment,
  sourceVersion
}
```

### Step 2

- `start_deploy_run`

입력 context:

```ts
{
  artifactId,
  serviceId,
  environment,
  strategy
}
```

### Step 3

- `refresh_deploy_status`
- `open_deployments_page`
- `open_rollback_candidates`

입력 context:

```ts
{
  deployRunId,
  deploymentId,
  serviceId
}
```

---

## API 제안

### 1. Artifact 생성

```http
POST /api/deployment-artifacts
```

body:

```json
{
  "sourceDeploymentId": "dep_checkout_prod_41",
  "actorId": "op_seungho_park"
}
```

response:

```json
{
  "id": "artifact_checkout_001",
  "status": "ready",
  "imageTag": "checkout:v2.3.8-r1",
  "imageUri": "registry.local/checkout:v2.3.8-r1"
}
```

### 2. 배포 실행 시작

```http
POST /api/deployment-runs
```

body:

```json
{
  "artifactId": "artifact_checkout_001",
  "environment": "production",
  "strategy": "canary_10_50_100",
  "actorId": "op_seungho_park"
}
```

### 3. 배포 진행 조회

```http
GET /api/deployment-runs/:id
```

### 4. 배포 이벤트 조회

```http
GET /api/deployment-runs/:id/events
```

---

## 내부 Data Source 제안

새로운 internal handler:

- `deployment.quickPipelineBaseline`
- `deployment.quickPipelineArtifact`
- `deployment.quickPipelineRun`
- `deployment.quickPipelineEvents`

각각 역할:

- baseline: 기준 배포 정보
- artifact: Step 1 결과
- run: Step 2/3 현재 상태
- events: progress 표시용 이벤트

---

## 템플릿/바인딩 변경 방향

현 `tpl_quick_deploy_launchpad`를 유지하되, binding을 재구성한다.

현재:

- baseline 1개 중심

변경 후:

- `baseline`
- `artifact`
- `deployRun`
- `runEvents`

필수 여부:

- baseline: 필수
- artifact: 선택
- deployRun: 선택
- runEvents: 선택

---

## Progress Bar 구현 메모

현재 공용 A2UI bridge에는 범용 progress component가 없다.

POC에서는 두 가지 중 하나를 선택한다.

### 옵션 A. quick deploy 카드 전용 progress strip

- `A2UICardRenderer` 또는 `a2ui-bridge`에서 quick deploy 카드 전용 progress UI를 렌더
- 장점: 빠름
- 단점: 카드 특화 구현

### 옵션 B. A2UI bridge에 경량 progress primitive 추가

- 프로젝트 전용 helper로 progress 바 조합 지원
- 장점: 재사용 가능
- 단점: 작업량 증가

POC 추천:

- 옵션 A 먼저

즉, `quick_deploy_launchpad` 카드에서만 progress bar를 별도 스타일로 구현한다.

---

## 시나리오 시드 추가

`checkout-5xx`에 최소 다음을 추가한다.

- `artifact_checkout_prod_41_rebuild`
- `deploy_run_checkout_prod_41_redeploy`
- `deployment_run_events` 4~5개

예시 이벤트:

1. image ready
2. canary 10% start
3. canary 50% expand
4. health check passed
5. rollout complete

또는 실패 케이스:

1. image ready
2. canary 10% start
3. error rate spike
4. deployment failed

---

## 화면 설계 메모

### 상단 헤더

- 작은 요약만 유지
- 핵심은 "현재 파이프라인 어느 단계냐"

### Step 1 카드

- 기준 배포 2~3개 핵심 정보만
- 버튼 1개: `이미지 생성`

### Step 2 카드

- artifact ready일 때만 활성화
- 버튼 1개: `배포 시작`

### Step 3 카드

- progress bar
- 현재 단계
- 최근 이벤트 2~3개
- 성공/실패 배지
- 실패 시 `롤백 후보 보기`

중요:

정보행은 최소화해야 한다.
지금처럼 서비스/환경/버전/전략/체크/요청자 전부 펼쳐놓으면
step-flow가 아니라 summary card처럼 보인다.

---

## 구현 순서

1. `deployment_artifacts`, `deployment_runs`, `deployment_run_events` 테이블 추가
2. db helper 추가
3. 시나리오 seed 추가
4. a2ui data source handler 추가
5. quick deploy template binding 변경
6. quick deploy card UI를 3-step 구조로 전면 재배치
7. preview local interaction과 실제 action 연결
8. smoke test 시나리오 추가

---

## 수용 기준

아래를 만족하면 완료로 본다.

- `간단 배포 시작` 카드가 3개의 명확한 step을 가진다
- Step 1 버튼을 눌러야 Step 2가 열린다
- Step 2 버튼을 눌러야 Step 3이 meaningful 하게 바뀐다
- Step 3에 progress bar가 보인다
- 결과 확인 단계에서 성공/실패가 구분된다
- 실패 시 rollback card로 이어질 수 있다
- 사용자 입장에서 이 카드를 보면 "아, 이미지 만들고 배포하고 결과를 본다"가 즉시 이해된다

---

## 현재 판단

이 기능은 지금 코드베이스에서 구현 가능하다.
다만 UI만 바꿔서는 안 되고, 최소한 artifact/run/event 모델이 필요하다.

즉 작업량은 "중간 정도"이며,
단순 카드 수정이 아니라 `POC용 미니 배포 파이프라인`을 추가하는 작업으로 본다.

