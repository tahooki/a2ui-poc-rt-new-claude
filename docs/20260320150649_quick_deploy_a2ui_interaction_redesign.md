# Quick Deploy A2UI 즉시 반응 UX 재설계

## 문서 목적

이 문서는 현재 `quick_deploy_launchpad` A2UI 카드가 왜 "버튼을 눌러도 바로 바뀌지 않는 것처럼" 느껴지는지 코드 수준에서 설명하고, 실제 수정 시 어떤 파일의 어떤 로직을 어떻게 바꿀지 구현 단위로 설계한다.

목표는 다음 5가지를 구현 가능한 수준으로 명확히 만드는 것이다.

1. 데모 초기화 버튼
2. Step 잠금/해제 강화
3. 진짜 progress bar 표현
4. 완료 버튼을 완료 배지로 교체
5. 실패 시 rollback card inline handoff

---

## 현재 구조 요약

현재 quick deploy 카드의 데이터 흐름은 아래와 같다.

1. AI tool 또는 템플릿 preview가 `tpl_quick_deploy_launchpad`를 렌더링한다.
2. 템플릿 바인딩이 baseline deployment, artifact, deployRun, runEvents를 DB에서 읽는다.
3. `buildQuickDeployLaunchpadCard()`가 이 데이터를 바탕으로 A2UI JSON 컴포넌트를 생성한다.
4. 사용자가 카드 버튼을 누르면 `/api/a2ui-action`이 액션을 처리한다.
5. 처리 결과는 새 A2UI assistant message로 채팅에 append 된다.

관련 파일:

- [src/lib/a2ui-bridge.ts](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/lib/a2ui-bridge.ts)
- [src/app/api/a2ui-action/route.ts](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/app/api/a2ui-action/route.ts)
- [src/components/chat/chat-panel.tsx](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/components/chat/chat-panel.tsx)
- [src/server/a2ui/render/render-template-preview.ts](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/server/a2ui/render/render-template-preview.ts)
- [src/server/a2ui/bindings/binding-definitions.ts](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/server/a2ui/bindings/binding-definitions.ts)

---

## 현재 코드가 실제로 하는 일

### 1. 카드 렌더링

`buildQuickDeployLaunchpadCard()`는 baseline, artifact, deployRun, runEvents를 받아 quick deploy 카드를 만든다.

핵심 위치:

- [src/lib/a2ui-bridge.ts:2389](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/lib/a2ui-bridge.ts#L2389)

이 함수는 현재 다음 특징을 가진다.

- Step 1, Step 2, Step 3를 항상 모두 렌더링한다.
- 현재 단계만 강조하는 구조가 없다.
- 이전 단계 완료 후 다음 단계가 "열리는" 구조가 아니다.
- progress는 `renderQuickDeployProgressBar()`가 만드는 ASCII 텍스트다.
- 실패 시 rollback은 quick deploy 카드 내부가 아니라 별도 action으로 분리된다.

문제 코드:

- [src/lib/a2ui-bridge.ts:2761](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/lib/a2ui-bridge.ts#L2761)
  - `mkList('launch_steps_list', ['launch_step_1_card', 'launch_step_2_card', 'launch_step_3_card'], 'vertical')`
- [src/lib/a2ui-bridge.ts:2362](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/lib/a2ui-bridge.ts#L2362)
  - ASCII progress 문자열 생성

### 2. 버튼 클릭 후 상태 변경

버튼 액션은 `/api/a2ui-action`에서 처리한다.

핵심 위치:

- [src/app/api/a2ui-action/route.ts:364](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/app/api/a2ui-action/route.ts#L364) `build_deploy_artifact`
- [src/app/api/a2ui-action/route.ts:403](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/app/api/a2ui-action/route.ts#L403) `start_deploy_run`
- [src/app/api/a2ui-action/route.ts:494](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/app/api/a2ui-action/route.ts#L494) `refresh_deploy_status`
- [src/app/api/a2ui-action/route.ts:557](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/app/api/a2ui-action/route.ts#L557) `open_rollback_candidates`

실제로는 상태가 바뀐다.

- artifact 생성 시 artifact row가 DB에 생긴다.
- deploy run 시작 시 deployment, deployment_run, deployment_run_event가 생긴다.
- refresh 시 progress가 `10 -> 40 -> 70 -> 85 -> 100` 으로 올라간다.

즉, 백엔드 상태 변화 자체는 있다.

### 3. 채팅에 반영되는 방식

액션 성공 시 `handleA2UIAction()`이 새 assistant message를 하나 더 append 한다.

핵심 위치:

- [src/components/chat/chat-panel.tsx:390](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/components/chat/chat-panel.tsx#L390)
- [src/components/chat/chat-panel.tsx:421](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/components/chat/chat-panel.tsx#L421)

현재 구조의 특징:

- 기존 interactive preview를 대체하지 않고 새 메시지를 추가한다.
- reset 후에도 예전 카드 메시지가 채팅에 남아 있을 수 있다.
- 사용자는 "새 카드가 생겼다"보다 "원래 카드가 안 바뀌었다"로 받아들일 가능성이 높다.

---

## 현재 UX가 약하게 느껴지는 이유

### 원인 1. Step 잠금이 없다

지금은 Step 1 이전에도 Step 2가 보이고, Step 2 이전에도 Step 3이 펼쳐진다.

영향:

- 이전 단계가 다음 단계를 "열어준다"는 인식이 없다.
- 클릭 후 정보 구조가 크게 변하지 않는다.

### 원인 2. 완료 상태가 버튼 중심이다

Step 1 완료 후에도 사용자는 "이미지 생성 버튼이 다시 보이는 카드"를 본다.

영향:

- 버튼이 사라지지 않으니 완료 인지가 약하다.
- "무언가 끝났다"는 시각적 확정이 없다.

### 원인 3. Progress가 실제 막대가 아니라 텍스트다

현재는 다음 문자열만 변한다.

```txt
[======----------] 40%
```

영향:

- 큰 화면 변화가 아니라 텍스트 값 변경처럼 느껴진다.
- 단계별 jump 감각이 약하다.

### 원인 4. 현재 단계 강조가 없다

현재 active step, completed step, locked step의 레이아웃 차이가 작다.

영향:

- 무엇이 지금 진행 중인지 한눈에 안 들어온다.
- 사용자는 모든 단계가 비슷하게 보인다고 느낀다.

### 원인 5. 실패 handoff가 별도 카드로 분리된다

실패 시 `open_rollback_candidates`는 quick deploy 흐름 안에서 이어지는 것이 아니라 별도 rollback 카드 메시지를 연다.

영향:

- 실패 -> 복구의 연속 흐름이 끊긴다.
- "다음 해야 할 일"이 inline으로 보이지 않는다.

### 원인 6. reset이 preview state를 정리하지 않는다

DB reset만 하고 채팅 카드 preview는 남는다.

영향:

- 리셋 후에도 이전 상태 카드가 보인다.
- 사용자는 "상태가 안 맞는다"고 느낀다.

---

## 수정 방향 요약

이번 수정은 단순 스타일 변경이 아니라 상태 표현 모델을 다시 세워야 한다.

핵심 전략:

1. quick deploy UI 상태를 별도로 계산한다.
2. Step card를 `locked`, `current`, `complete` 세 상태로 나눈다.
3. active step만 확장한다.
4. 완료 버튼을 제거하고 완료 배지/완료 요약으로 대체한다.
5. progress를 컴포넌트 구조의 막대로 바꾼다.
6. 실패 시 quick deploy 카드 내부에서 rollback handoff를 이어붙인다.
7. reset 시 DB와 chat preview state를 함께 비운다.

---

## 파일별 상세 설계

## A. `src/lib/a2ui-bridge.ts`

### 현재 역할

quick deploy A2UI card JSON을 생성한다.

### 현재 문제

- UI 상태 계산과 렌더링이 한 함수에 섞여 있다.
- Step별 분기 로직이 거의 없다.
- 시각 상태 표현이 텍스트 위주다.

### 변경 목표

`buildQuickDeployLaunchpadCard()` 내부를 아래 3단계로 분리한다.

1. raw cardData 정규화
2. UI state derivation
3. 상태별 step component 생성

### 추가할 헬퍼 제안

```ts
interface QuickDeployUiState {
  overallState: "idle" | "artifact_ready" | "deploying" | "verifying" | "failed" | "succeeded";
  progressPercent: number;
  currentStage: string;
  activeStep: 1 | 2 | 3;
  step1: {
    status: "locked" | "current" | "complete";
    showAction: boolean;
    showCompletedBadge: boolean;
  };
  step2: {
    status: "locked" | "current" | "complete";
    showAction: boolean;
    showCompletedBadge: boolean;
  };
  step3: {
    status: "locked" | "current" | "complete";
    expanded: boolean;
    showRefreshAction: boolean;
    showRollbackHandoff: boolean;
  };
}

function deriveQuickDeployUiState(input: {
  artifactStatus: string;
  runStatus: string;
  progressPercent: number;
  currentStage: string;
}): QuickDeployUiState
```

### 상태 계산 규칙

#### Step 1

- artifact 없음 또는 `pending`이면 `current`
- artifact `ready`이면 `complete`

#### Step 2

- artifact 준비 전이면 `locked`
- artifact 준비 후 run 없음이면 `current`
- run이 `deploying` 이상이면 `complete`

주의:

Step 2의 "complete"는 배포 실행 버튼을 눌러 run이 시작된 시점 기준이다. 배포의 최종 성공 여부는 Step 3가 표현한다.

#### Step 3

- run 없음이면 `locked`
- run 있으면 `current`
- 최종 상태가 `succeeded` 또는 `failed`이면 `complete`

#### Active step

- Step 1 current면 `1`
- Step 2 current면 `2`
- run이 있으면 `3`

### 렌더 분리 제안

아래 함수들로 분해한다.

```ts
function buildQuickDeployHeader(...)
function buildQuickDeployStep1(...)
function buildQuickDeployStep2(...)
function buildQuickDeployStep3(...)
function buildQuickDeployCompactStep(...)
function buildQuickDeployProgressComponents(...)
function buildQuickDeployRollbackHandoff(...)
```

### 구체 수정 포인트

#### 1. Step list를 항상 모두 확장하지 않기

현재:

- [src/lib/a2ui-bridge.ts:2761](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/lib/a2ui-bridge.ts#L2761)

수정:

- `launch_step_1_card`, `launch_step_2_card`, `launch_step_3_card`는 유지
- 단, 각 카드 내부 child를 상태별로 바꾼다
- `locked`와 `complete`는 compact 구조
- `current`만 expanded 구조

예시:

```ts
const step1RootId = ui.step1.status === "current"
  ? "launch_step_1_expanded"
  : "launch_step_1_compact";
```

#### 2. 완료 버튼을 완료 배지로 대체

현재:

- artifact ready 이후에도 `이미지 재생성` 버튼이 남는다.
- [src/lib/a2ui-bridge.ts:2556](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/lib/a2ui-bridge.ts#L2556)

수정:

- Step 1 complete면 버튼 제거
- 대신 아래 요소를 렌더

```ts
mkIcon("launch_step_1_done_icon", "check_circle")
mkText("launch_step_1_done_label", "완료", "caption")
mkText("launch_step_1_done_desc", "배포 가능한 이미지가 준비되었습니다.", "caption")
```

Step 2도 동일하게 처리:

- run 시작 이후 `배포 시작` 버튼 제거
- `배포 실행됨` 배지와 시작 시각/전략을 compact summary로 노출

#### 3. Progress bar를 컴포넌트화

현재:

- [src/lib/a2ui-bridge.ts:2362](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/lib/a2ui-bridge.ts#L2362)

수정:

ASCII 문자열 함수 제거 또는 deprecated 처리.

대신:

```ts
function buildQuickDeployProgressComponents(
  prefix: string,
  progressPercent: number,
  currentStage: string,
): { components: A2UIComponent[]; rootId: string }
```

표현 규칙:

- 상단: `현재 단계`, `85%`
- 중단: track + fill
- 하단: `artifact ready`, `canary 10`, `canary 50`, `verifying`, `done` 중 현재 단계 텍스트

주의:

A2UI의 레이아웃 제약상 CSS width transition 같은 정교한 애니메이션이 안 되더라도, 적어도 막대형 블록 구조와 퍼센트 텍스트를 동시에 보여주는 방향으로 만든다.

#### 4. Step 3를 잠금/확장 구조로 변경

현재:

- Step 3 내용과 액션이 항상 전부 렌더된다.
- [src/lib/a2ui-bridge.ts:2667](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/lib/a2ui-bridge.ts#L2667)

수정:

- run이 없으면 compact locked view만 노출
- 예:

```ts
Step 3
결과 확인
배포가 시작되면 진행률과 이벤트가 여기에 표시됩니다.
```

- run이 생기면 expanded view로 바뀜
- 이 전환이 사용자가 가장 크게 느껴야 할 UI 변화다

#### 5. 실패 시 rollback inline handoff slot 추가

quick deploy `cardData`에 optional field 추가:

```ts
rollbackPreview?: {
  deploymentId: string;
  serviceId: string;
  environment: string;
  candidates: Array<Record<string, unknown>>;
}
```

Step 3에서 아래 조건이면 inline handoff 렌더:

- `overallState === "failed"`
- `rollbackPreview` 존재

표현:

- 실패 요약
- `즉시 롤백 검토` 메시지
- primary candidate 1개 강조
- `이 배포 롤백` 버튼
- 필요 시 `상세 보기`

이때 별도 메시지 카드가 아니라 Step 3 아래에 이어 붙인다.

---

## B. `src/app/api/a2ui-action/route.ts`

### 현재 역할

카드 액션을 받아 DB를 업데이트하고 일부 경우 preview를 생성한다.

### 현재 문제

- quick deploy 액션별 반환 payload가 일관되지 않다.
- 일부 액션은 DB row data만 반환하고, 일부는 preview output을 반환한다.
- rollback 후보 보기만 preview를 다시 렌더링한다.

### 변경 목표

quick deploy 관련 액션은 모두 "항상 최신 quick deploy preview"를 반환하도록 통일한다.

### 추가할 공통 헬퍼 제안

```ts
async function renderQuickDeployLaunchpadPreview(input: {
  baselineDeploymentId: string;
  actorId: string;
  rollbackPreview?: Record<string, unknown> | null;
  uiHints?: Record<string, unknown>;
}) {
  const operator = getOperator(input.actorId) as Record<string, unknown> | undefined;

  const preview = await renderTemplatePreview({
    templateId: "tpl_quick_deploy_launchpad",
    args: {
      deploymentId: input.baselineDeploymentId,
    },
    context: {
      actorId: input.actorId,
      actorRole: String(operator?.["role"] ?? "ops_engineer"),
      page: "deployments",
    },
    missingLabel: "간단 배포 시작",
  });

  // preview.output.cardData에 rollbackPreview, uiHints를 합쳐서 반환
  return preview.output;
}
```

### 액션별 수정안

#### 1. `build_deploy_artifact`

현재:

- artifact를 만들고 plain object를 반환

수정:

- artifact 생성 후 `renderQuickDeployLaunchpadPreview()` 호출
- `uiHints`:

```ts
{
  focusStep: 2,
  flashCompletedStep: 1,
  collapseCompletedSteps: true,
}
```

기대 효과:

- Step 1이 완료 상태로 바뀜
- Step 2가 펼쳐짐

#### 2. `start_deploy_run`

현재:

- deployment + run + event 생성 후 plain object 반환

수정:

- run 생성 후 preview를 즉시 다시 렌더
- `uiHints`:

```ts
{
  focusStep: 3,
  flashCompletedStep: 2,
  collapseCompletedSteps: true,
}
```

기대 효과:

- Step 2가 완료 compact로 접힘
- Step 3가 확장됨

#### 3. `refresh_deploy_status`

현재:

- progress를 한 단계 올리고 plain object 반환

수정:

- 상태 업데이트 후 preview 반환
- `uiHints`:

```ts
{
  focusStep: 3,
  animateProgress: true,
}
```

추가 고려:

현재 `quickDeployProgressStep()`은 실패 branch가 없다.

- [src/app/api/a2ui-action/route.ts:115](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/app/api/a2ui-action/route.ts#L115)

필요 시 실패 데모를 위해 조건 기반 실패 전이 추가 가능:

```ts
if (ctx.forceFail === "true" || someScenarioFlag) {
  return { progress: 85, stage: "verifying", status: "failed", detail: "검증 실패로 롤백 검토가 필요합니다." };
}
```

#### 4. `open_rollback_candidates`

현재:

- rollback_action 카드 preview를 새로 반환

수정:

- rollback candidate data를 생성
- quick deploy preview를 다시 렌더링
- 그 payload 안에 `rollbackPreview`를 병합해서 반환

즉, 반환 `cardType`은 `rollback_action`이 아니라 `quick_deploy_launchpad` 유지

기대 효과:

- quick deploy 카드가 접히고 rollback handoff가 같은 흐름 안에 나타남

### quick deploy 액션 결과 통일 원칙

이후 quick deploy 관련 액션은 모두 다음 형태를 반환해야 한다.

```ts
{
  message: string;
  data: {
    type: "a2ui_render";
    cardType: "quick_deploy_launchpad";
    cardData: Record<string, unknown>;
  };
}
```

---

## C. `src/components/chat/chat-panel.tsx`

### 현재 역할

A2UI 액션 결과를 받아 assistant message로 채팅에 추가한다.

### 현재 문제

- 기존 interactive preview를 대체하지 않고 계속 append 한다.
- reset 후에도 예전 preview들이 남는다.

### 변경 목표

1. quick deploy 같은 interactive card는 "최신 상태 카드"로 취급할 수 있어야 한다.
2. 데모 초기화 시 chat preview state도 함께 정리되어야 한다.

### 수정안 1. replace-in-place 전략

현재:

- [src/components/chat/chat-panel.tsx:421](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/components/chat/chat-panel.tsx#L421)

수정:

- 새 assistant message를 append 하기 전에
- 가장 최근의 동일 카드 type interactive message를 찾아 교체하는 옵션 추가

예시 설계:

```ts
function replaceLatestA2UIMessage(
  messages: UIMessage[],
  nextMessage: UIMessage,
  cardType: string,
): UIMessage[]
```

교체 기준:

- 최근 assistant message 중 `dynamic-tool`
- output type이 `a2ui_render`
- cardType이 동일
- quick deploy / rollback handoff 계열인 경우

장점:

- 사용자가 "같은 카드가 업데이트됨"으로 느낀다.

주의:

이 방식은 전체 chat history를 덮어쓰는 것이 아니라 최신 interactive preview만 교체해야 한다.

### 수정안 2. 데모 초기화 액션 추가

ChatPanel에 reset helper 추가:

```ts
function resetInteractiveChatState() {
  threadIdRef.current = null;
  savedMessageIdsRef.current = new Set();
  setMessages([]);
  setScenarioSuggestions(null);
}
```

이 reset helper는 아래 액션에서 재사용한다.

- 데모 초기화 버튼 클릭
- 필요 시 scenario 변경 직후

---

## D. 데모 초기화 버튼 설계

### 목표

사용자가 "DB는 초기화됐는데 화면은 안 바뀜"을 느끼지 않게 한다.

### 구현 위치 후보

1. `src/components/chat/chat-panel.tsx` 상단 toolbar
2. `src/components/admin/header.tsx`

권장:

- chat panel 상단에 두는 것이 가장 직접적이다.
- 이유: 문제가 되는 preview state가 chat 안에 남기 때문

### 동작 설계

버튼 클릭 시 순서:

1. `/api/admin`에 `action: "reset"` 요청
2. 성공 시 `resetInteractiveChatState()` 호출
3. 현재 page suggestions 재요청
4. 필요하면 사용자에게 "데모가 초기화되었습니다" 시스템 메시지 1개만 추가

의사코드:

```ts
async function handleDemoReset() {
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "reset" }),
  });

  if (!res.ok) throw new Error(...);

  resetInteractiveChatState();
}
```

---

## 데이터 모델 변경 제안

현재 quick deploy cardData는 대략 다음 필드를 가진다.

```ts
{
  pipeline: {...},
  artifact: {...},
  deployRun: {...},
  runEvents: [...]
}
```

수정 후에는 UI 파생 상태와 handoff state를 명시적으로 포함한다.

```ts
{
  pipeline: {
    serviceId: string;
    serviceName: string;
    environment: string;
    sourceDeploymentId: string;
    sourceVersion: string;
    strategy: string;
    state: string;
    progressPercent: number;
    currentStage: string;
    lastMessage: string;
  };
  artifact: {
    id: string | null;
    imageTag: string;
    imageUri: string;
    status: string;
  };
  deployRun: {
    id: string | null;
    status: string;
    progressPercent: number;
    currentStage: string;
    lastMessage: string;
    resultDeploymentId: string | null;
  };
  runEvents: Array<{
    stage: string;
    detail: string;
    progressPercent: number;
  }>;
  uiHints?: {
    focusStep?: 1 | 2 | 3;
    flashCompletedStep?: 1 | 2 | 3;
    collapseCompletedSteps?: boolean;
    animateProgress?: boolean;
  };
  rollbackPreview?: {
    deploymentId: string;
    serviceId: string;
    environment: string;
    candidates: Array<Record<string, unknown>>;
  } | null;
}
```

---

## 실제 변경 순서

## 1단계. UI 상태 파생 함수 도입

수정 파일:

- [src/lib/a2ui-bridge.ts](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/lib/a2ui-bridge.ts)

작업:

- `deriveQuickDeployUiState()` 추가
- raw 상태값 계산부와 렌더링 분리

완료 기준:

- quick deploy 카드가 `locked/current/complete`를 계산할 수 있음

## 2단계. Step card 구조 재작성

수정 파일:

- [src/lib/a2ui-bridge.ts](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/lib/a2ui-bridge.ts)

작업:

- Step 1 compact/expanded
- Step 2 compact/expanded
- Step 3 compact/expanded
- active step만 상세 표시

완료 기준:

- artifact 생성 후 Step 2가 visibly 열림
- deploy 시작 후 Step 3가 visibly 열림

## 3단계. Progress component 교체

수정 파일:

- [src/lib/a2ui-bridge.ts](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/lib/a2ui-bridge.ts)

작업:

- ASCII progress 제거
- 막대형 progress component 도입

완료 기준:

- `10, 40, 70, 85, 100` 전이가 한눈에 구분됨

## 4단계. quick deploy 액션 반환 통일

수정 파일:

- [src/app/api/a2ui-action/route.ts](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/app/api/a2ui-action/route.ts)

작업:

- `renderQuickDeployLaunchpadPreview()` 헬퍼 추가
- `build_deploy_artifact`, `start_deploy_run`, `refresh_deploy_status`, `open_rollback_candidates` 수정

완료 기준:

- quick deploy 액션은 모두 동일 카드 타입으로 최신 preview 반환

## 5단계. rollback inline handoff

수정 파일:

- [src/app/api/a2ui-action/route.ts](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/app/api/a2ui-action/route.ts)
- [src/lib/a2ui-bridge.ts](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/lib/a2ui-bridge.ts)

작업:

- rollback candidate fetch 결과를 quick deploy cardData에 주입
- Step 3 아래 inline render

완료 기준:

- 실패 시 rollback card가 별도 메시지가 아니라 같은 카드 흐름 아래 나타남

## 6단계. 데모 초기화 버튼

수정 파일:

- [src/components/chat/chat-panel.tsx](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/components/chat/chat-panel.tsx)
- 필요 시 [src/components/admin/header.tsx](/Users/tahooki/Documents/git/a2ui-poc-rt-new-claude/src/components/admin/header.tsx)

작업:

- reset 버튼 추가
- DB reset + preview state clear 묶기

완료 기준:

- 초기화 후 이전 preview가 남지 않음

---

## 리스크 및 주의점

### 1. A2UI 컴포넌트 표현 한계

progress bar를 HTML/CSS처럼 자유롭게 만들 수 없을 수 있다.

대응:

- 완전한 애니메이션보다 "큰 레이아웃 변화"를 우선한다.
- 퍼센트 숫자, 현재 단계 텍스트, step expand/collapse로 체감을 보강한다.

### 2. 채팅 message 교체 로직의 부작용

최근 interactive message 교체 시 대화 히스토리가 흐려질 수 있다.

대응:

- quick deploy card에만 opt-in 적용
- 일반 tool result는 기존처럼 append 유지

### 3. rollback handoff와 기존 rollback_action 카드의 관계

inline handoff를 넣더라도 기존 `rollback_action` 카드 자체는 유지할 필요가 있다.

이유:

- AI가 직접 "롤백 실행 카드 보여줘"라고 요청받는 경우는 여전히 별도 카드가 유효하다.

정리:

- quick deploy 실패 flow에서는 inline handoff
- 독립적인 rollback render tool은 그대로 유지

---

## 구현 완료 후 기대 UX

### 이미지 생성 클릭

- Step 1 버튼 사라짐
- Step 1 완료 배지 표시
- Step 2 카드 확장
- 상단 상태가 `이미지 준비 완료 · 40%` 수준으로 크게 갱신

### 배포 시작 클릭

- Step 2 버튼 사라짐
- Step 2 compact 완료 카드로 전환
- Step 3가 확장되며 progress와 이벤트가 나타남

### 상태 갱신 클릭

- progress bar 증가
- 현재 단계 텍스트 갱신
- 최근 이벤트 추가

### 실패 후 롤백 후보 보기 클릭

- quick deploy Step 3 아래에 rollback handoff 등장
- 현재 실패 배포와 복구 후보가 inline으로 보임

### 데모 초기화 클릭

- DB reset
- chat preview clear
- 사용자 입장에서 "완전히 처음 상태"로 돌아감

---

## 결론

현재 문제는 "버튼을 눌러도 실제 상태가 안 바뀌는가"가 아니라, "상태가 바뀌어도 카드 구조가 그 변화를 과장해서 보여주지 못하는가"에 가깝다.

따라서 수정의 핵심은 단순 스타일 polish가 아니라 다음 두 가지다.

1. quick deploy card에 명시적인 UI 상태 모델을 도입한다.
2. 액션 결과를 항상 최신 interactive preview로 되돌려준다.

이 두 축을 먼저 정리하면, 이후의 progress 개선, 완료 배지, inline rollback, 데모 초기화는 모두 자연스럽게 이어진다.
