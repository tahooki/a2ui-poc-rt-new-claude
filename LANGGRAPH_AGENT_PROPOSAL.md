# LangGraph 기반 AI Copilot Agent 전환 기획서

## 1. 배경

현재 챗봇 구조는 다음과 같습니다.

- 프론트: `useChat()` 기반 `ChatPanel`
- API: `/api/chat`
- 오케스트레이션: `streamText()` + 단일 `system prompt`
- 실행 단위: `aiTools`에 모인 tool 집합
- UI 액션: A2UI 카드 렌더 + `/api/a2ui-action`

이 구조는 데모 단계에서는 충분하지만, 아래 한계가 있습니다.

- 도구 추가/제거가 `tools.ts` 단일 파일 중심이라 점점 비대해짐
- 페이지별/도메인별 책임이 명확하게 분리되지 않음
- "분석 -> 검증 -> 승인 대기 -> 실행" 같은 상태 있는 흐름을 코드로 표현하기 어려움
- Human-in-the-loop 승인/재개를 자연스럽게 넣기 어려움
- 후속적으로 agent를 여러 개 붙이거나 빼는 확장성이 낮음

따라서 프론트의 현재 UX는 유지하되, 백엔드 챗봇 오케스트레이션을 LangGraph 기반의 agent runtime으로 재구성하는 것이 적절합니다.

## 2. 목표

### 목표

- 챗봇을 "단일 LLM 호출기"가 아니라 "상태 있는 agent runtime"으로 전환
- 기능을 모듈 단위로 붙였다 뗄 수 있는 구조 확보
- 도메인별 agent 또는 subgraph를 독립적으로 추가 가능하게 설계
- 승인, 검토, 재시도, 재개 같은 운영 워크플로우를 graph state로 관리
- A2UI 카드와 LangGraph interrupt를 연결해 승인형 agent UX 구현

### 비목표

- 지금 당장 전체 챗봇을 multi-agent로 과도하게 분산하지 않음
- 프론트 UI를 전면 개편하지 않음
- 현재 SQLite 기반 데모 도메인 모델을 먼저 버리지 않음

## 3. 왜 LangGraph인가

LangGraph 공식 문서 기준으로 이번 요구와 맞는 지점은 명확합니다.

- graph는 작업을 discrete node로 나누고 shared state를 읽고 쓰는 방식으로 설계됨
- subgraph를 별도 state schema로 구성할 수 있어 agent별 내부 상태를 분리하기 좋음
- checkpointer + thread_id를 통해 대화/실행 상태를 이어갈 수 있음
- interrupt를 통해 승인, 보완 입력, human review를 대기 상태로 전환할 수 있음
- persistence는 memory, time-travel, fault-tolerance 관점에서 운영형 workflow에 적합함

이 특성은 현재 프로젝트의 핵심 요구인 아래 항목과 맞물립니다.

- 인시던트 분석 agent
- 배포 리스크 평가 agent
- 롤백 승인 대기 agent
- 보고서 초안 생성 agent
- A2UI 카드 기반 human approval loop

## 4. 권장 방향 한 줄 요약

`useChat`와 A2UI는 유지하고, `/api/chat` 뒤의 오케스트레이션을 LangGraph graph runtime으로 교체한다.

즉, 프론트 transport는 유지하고 백엔드를 아래처럼 바꿉니다.

- 현재: `ChatPanel -> /api/chat -> streamText + aiTools`
- 목표: `ChatPanel -> /api/chat -> LangGraph Supervisor Graph -> Domain Subgraphs/Tools -> A2UI/Interrupt`

## 5. 목표 아키텍처

### 5.1 상위 구조

```text
ChatPanel / useChat
  -> /api/chat
    -> chat runtime adapter
      -> supervisor graph
        -> context resolver
        -> router node
        -> domain subgraph
        -> approval / interrupt node
        -> response composer
      -> UI stream adapter
```

### 5.2 레이어 분리

#### A. Transport Layer

책임:

- `/api/chat` 요청 수신
- UI message <-> graph state 변환
- graph stream 결과를 현재 `useChat` 응답 형식으로 반환

유지 대상:

- `ChatPanel`
- thread/message 저장 UI 흐름
- A2UI 카드 렌더링 컴포넌트

#### B. Graph Runtime Layer

책임:

- supervisor graph 실행
- node routing
- interrupt/resume 처리
- checkpoint, memory, execution state 관리

신규 디렉터리 예시:

```text
src/server/agent/
  graph/
    index.ts
    state.ts
    runtime.ts
    router.ts
    streaming.ts
  registry/
    agents.ts
    tools.ts
    cards.ts
  subgraphs/
    incidents.ts
    deployments.ts
    rollback.ts
    jobs.ts
    reports.ts
  memory/
    checkpoints.ts
    store.ts
  interrupts/
    approval.ts
    resume.ts
```

#### C. Domain Capability Layer

책임:

- 각 도메인별 tool 묶음 제공
- subgraph별 state schema 정의
- A2UI 카드 출력 계약 정의

핵심 원칙:

- "도메인별 도구 묶음"과 "도메인별 그래프"를 같이 둔다
- supervisor는 붙였다 뗄 수 있는 capability registry만 본다
- 특정 capability를 꺼도 전체 graph는 유지된다

## 6. 추천 Graph 구조

### 6.1 Supervisor Graph

최상위 graph는 아래 node만 가집니다.

1. `hydrateContext`
2. `classifyIntent`
3. `routeCapability`
4. `runCapabilitySubgraph`
5. `approvalGate`
6. `composeResponse`
7. `emitUIArtifacts`

역할은 다음과 같습니다.

- `hydrateContext`: 현재 page, operator, selected entity, thread metadata를 state에 적재
- `classifyIntent`: 질문을 읽고 조회/분석/실행준비/승인대기/보고서작성 등으로 분류
- `routeCapability`: 어느 도메인 subgraph를 탈지 결정
- `runCapabilitySubgraph`: incidents/deployments/jobs/reports 중 하나 실행
- `approvalGate`: 위험 작업이면 interrupt 또는 confirm card 생성
- `composeResponse`: 최종 자연어 응답 생성
- `emitUIArtifacts`: A2UI 카드, audit hint, next actions를 UI payload로 반환

### 6.2 Domain Subgraphs

초기 권장 subgraph는 5개입니다.

- `incidentInvestigatorGraph`
- `deploymentRiskGraph`
- `rollbackAdvisorGraph`
- `jobOperatorGraph`
- `reportDraftGraph`

각 subgraph는 자기 state를 독립적으로 가질 수 있어야 합니다.

예:

- incidents: `incidentId`, `evidence`, `timeline`, `analysis`
- deployments: `deploymentId`, `riskChecks`, `diffs`, `rollbackPlan`
- jobs: `jobId`, `jobSpec`, `dryRunResult`, `approvalNeeded`
- reports: `reportId`, `sections`, `actionItems`, `draftType`
- rollback: `deploymentId`, `rollbackDecision`, `approvalPayload`, `executionPlan`

## 7. "붙이고 뺄 수 있는 구조"의 핵심 설계

핵심은 graph 자체보다 registry 계약입니다.

### 7.1 Capability Module 계약

각 모듈은 아래 계약을 따릅니다.

```ts
interface CapabilityModule {
  id: string;
  enabled: boolean;
  matchers: string[];
  tools: ToolSet;
  buildSubgraph: () => CompiledStateGraph;
  buildCards?: () => CardRegistry;
  canHandle: (state: AgentState) => boolean;
}
```

이렇게 하면 다음이 가능해집니다.

- 배포 agent만 끄기
- 보고서 agent만 교체하기
- 특정 고객/환경에서 일부 capability만 켜기
- supervisor는 registry에서 활성 모듈만 로드하기

### 7.2 Tool Registry 분리

현재 `src/server/ai/tools.ts`는 하나의 대형 파일입니다.

목표는 아래처럼 분리하는 것입니다.

```text
src/server/agent/tools/
  incidents.ts
  deployments.ts
  rollback.ts
  jobs.ts
  reports.ts
  shared.ts
```

그리고 최종 조합은 registry에서 수행합니다.

```ts
const enabledTools = capabilityRegistry
  .filter((m) => m.enabled)
  .flatMap((m) => m.tools);
```

### 7.3 Card Registry 분리

A2UI 카드도 capability별로 분리합니다.

- incident capability -> evidence card
- deployment capability -> rollback summary / dry-run stepper
- report capability -> report template
- shared capability -> confirm action

이렇게 해야 tool 결과와 UI artifact가 같은 모듈 안에서 진화할 수 있습니다.

## 8. 권장 State Schema

최상위 graph state 예시는 아래 수준이 적절합니다.

```ts
interface AgentState {
  threadId: string;
  messages: UIMessage[];
  page: string;
  operatorId: string;
  operatorRole: string;
  selectedEntityId?: string;

  intent?: "query" | "analyze" | "recommend" | "prepare_action" | "request_approval";
  targetDomain?: "incidents" | "deployments" | "jobs" | "reports" | "audit";
  targetEntityId?: string;

  facts: Record<string, unknown>;
  artifacts: Array<{
    type: "text" | "a2ui_card" | "interrupt" | "audit_hint";
    payload: unknown;
  }>;
  approvals: Array<{
    type: string;
    status: "pending" | "approved" | "rejected";
    payload: unknown;
  }>;
  errors: Array<{
    code: string;
    message: string;
    retriable: boolean;
  }>;
}
```

원칙은 다음과 같습니다.

- raw data 중심으로 state를 저장
- 포맷된 문장은 마지막 `composeResponse`에서만 생성
- 카드 payload와 interrupt payload는 별도 artifact로 저장
- operator role과 permission은 항상 state에 포함

## 9. Interrupt / 승인 구조

이 프로젝트에서 LangGraph를 도입하는 가장 큰 이유 중 하나는 승인 대기입니다.

### 9.1 필요한 인터럽트 유형

- 롤백 실행 승인
- Job 실행 승인
- 인시던트 종료 승인
- 보고서 확정 전 리뷰 요청
- missing input 보완 요청

### 9.2 UX 방향

권장 방식은 2단계입니다.

1. 먼저 A2UI confirm card를 렌더링
2. 실제 실행 직전에는 LangGraph interrupt 상태로 진입

이렇게 하면 다음 장점이 있습니다.

- 사용자는 카드에서 확인 정보를 구조적으로 검토
- 승인 후에는 graph state가 pause/resume 가능한 형태로 유지
- 브라우저 새로고침이나 중간 이탈 후에도 재개 설계가 가능

### 9.3 API 구조 제안

- `POST /api/chat`: 일반 graph invoke/stream
- `POST /api/chat/resume`: interrupt 재개
- `GET /api/chat/threads/:id/runs`: run 상태 조회
- `GET /api/chat/threads/:id/pending-actions`: 현재 대기 중 interrupt 조회

## 10. Memory / Persistence 전략

### 10.1 단기 메모리

현재 `chat_threads`, `chat_messages`는 유지합니다.

LangGraph 관점에서는 이것을 "채팅 기록 저장"으로 보고, graph checkpoint는 별도 관리합니다.

### 10.2 체크포인트 전략

선택지는 두 가지입니다.

#### 옵션 A. 권장

graph checkpoint는 LangGraph 권장 방식대로 별도 저장소를 둡니다.

- dev/demo: in-memory 또는 간단 adapter
- production: durable checkpointer

장점:

- interrupt, retry, resume, time-travel이 자연스럽다
- LangGraph 개념과 맞는다

단점:

- 저장소가 하나 더 생길 수 있다

#### 옵션 B. 데모 친화형

현재 SQLite에 `agent_runs`, `agent_checkpoints`, `agent_interrupts` 테이블을 추가해 adapter를 만든다.

장점:

- 데모 환경이 단순하다

단점:

- LangGraph 공식 기본 경로보다 유지보수 비용이 높다

### 10.3 추천 결론

이 프로젝트는 데모와 설계 검증이 목적이므로 1차는 SQLite adapter 허용이 가능하지만, 실제 운영형으로 갈 생각이면 Postgres 기반 checkpointer/store로 옮길 수 있게 abstraction을 먼저 두는 편이 맞습니다.

## 11. 현재 코드 기준 권장 리팩터링 방향

### 11.1 유지할 것

- `ChatPanel`
- `ChatMessage`
- A2UI renderer
- `/api/a2ui-action`
- 현재 도메인 DB 함수

### 11.2 교체할 것

- `/api/chat/route.ts`
- `system-prompt.ts`의 단일 긴 프롬프트 구조
- `tools.ts`의 대형 단일 registry 구조

### 11.3 점진적 마이그레이션

#### Phase 1. Graph 껍데기 도입

- LangGraph supervisor graph만 도입
- 내부 실행은 기존 tool 함수 재사용
- 현재 `/api/chat` 응답 형식 유지

#### Phase 2. Capability 분리

- incidents/deployments/jobs/reports tool 분리
- domain subgraph 도입
- router node 추가

#### Phase 3. 승인형 workflow 도입

- interrupt/resume API 추가
- confirm card와 interrupt 연결
- 실행 전 승인 흐름을 graph state로 보존

#### Phase 4. 장기 메모리/실행 이력

- operator별 memory
- 서비스별 과거 incident pattern 검색
- report drafting context reuse

## 12. 추천 MVP 범위

처음부터 full multi-agent로 가지 말고, 아래 범위만 해도 충분합니다.

### MVP

- supervisor graph 1개
- subgraph 2개: `deploymentRiskGraph`, `reportDraftGraph`
- interrupt 1개: `rollback approval`
- registry 기반 tool/card 모듈 분리

이유:

- 현재 데모 핵심가치가 가장 잘 드러나는 영역이 배포 리스크와 보고서 초안
- A2UI 카드와 approval flow를 가장 자연스럽게 보여줄 수 있음
- incidents/jobs까지 한 번에 넣으면 구조만 복잡해질 위험이 큼

## 13. 성공 기준

아래가 되면 agent 전환이 성공한 것으로 봅니다.

- 새 capability 모듈 1개 추가 시 supervisor 코드를 거의 안 건드린다
- 특정 capability를 feature flag로 끌 수 있다
- 승인 대기 상태를 페이지 새로고침 이후에도 재개할 수 있다
- A2UI confirm card -> interrupt -> resume -> 실행 완료 흐름이 한 스레드에 연결된다
- tool 호출 로그, graph node 진행 상태, 최종 응답이 run 단위로 추적된다

## 14. 예상 리스크

### 리스크 1. 과도한 multi-agent화

너무 많은 subgraph를 초기에 만들면 오히려 디버깅이 어려워집니다.

대응:

- supervisor + 2 subgraph부터 시작

### 리스크 2. 메시지 스트리밍 통합 난이도

현재는 ai-sdk의 `toUIMessageStreamResponse()`가 간단한데, LangGraph streaming과 맞추려면 adapter가 필요합니다.

대응:

- 초기에 "graph 결과 -> ai-sdk UI message part" 변환 계층을 별도 파일로 분리

### 리스크 3. 저장소 이원화

chat history와 graph checkpoint가 분리되면 조회 경로가 복잡해질 수 있습니다.

대응:

- `threadId`, `runId`, `checkpointId` 매핑 테이블을 명시적으로 둔다

## 15. 최종 제안

이 프로젝트는 LangGraph를 "챗봇을 더 똑똑하게 만드는 라이브러리"로 보기보다, "운영형 상태 머신을 agent runtime으로 치환하는 도구"로 도입하는 것이 맞습니다.

정리하면:

- 프론트는 그대로 둔다
- 백엔드 `/api/chat`을 graph entrypoint로 바꾼다
- capability registry를 기준으로 도메인 agent를 붙였다 뗄 수 있게 한다
- A2UI confirm card와 LangGraph interrupt를 연결해 approval loop를 만든다
- 초기 MVP는 deployment/report 중심으로 작게 시작한다

## 16. 다음 액션 제안

바로 이어서 할 일은 아래 순서가 적절합니다.

1. `src/server/agent/` 디렉터리 스캐폴드 생성
2. `AgentState` 초안 정의
3. capability registry 인터페이스 정의
4. 기존 `suggestRollback`, `renderRollbackCard`, `renderReportTemplateCard`를 첫 모듈로 분리
5. `/api/chat`을 `supervisorGraph.invoke()` 형태로 교체
6. `rollback approval` interrupt/resume API 설계

## 17. 참고 자료

아래 내용은 LangGraph 공식 JavaScript 문서를 기준으로 정리했습니다.

- Thinking in LangGraph: <https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph>
- Subgraphs: <https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs>
- Memory: <https://docs.langchain.com/oss/javascript/langgraph/add-memory>
- Interrupts: <https://docs.langchain.com/oss/javascript/langgraph/interrupts>
- Persistence: <https://docs.langchain.com/oss/javascript/langgraph/persistence>
