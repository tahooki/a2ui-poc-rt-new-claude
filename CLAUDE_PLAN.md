# Claude Plan — DevOps Ops Console 완전 새 구축

---

## 이 프로젝트가 증명해야 하는 것

**"AI가 운영 업무를 구조적으로 개선할 수 있다"**를 하나의 작동하는 제품으로 보여준다.

데모를 보는 사람이 체크아웃 장애 시나리오를 처음부터 끝까지 따라가면서:
1. 어드민에서 장애를 확인하고 배포를 조사한다
2. 챗봇에게 "이거 롤백해야 해?"라고 물으면 현재 데이터를 읽고 답한다
3. 챗봇 대화 안에서 A2UI 카드가 나타나 리스크 체크, 승인, 실행을 구조화한다

세 층이 하나의 연결된 경험으로 작동하는 것을 증명한다.

---

## 구축 방침

### 완전 새로 만든다

기존 코드를 보완하는 것이 아니라 처음부터 다시 짠다.
기존 docs의 시나리오 정의와 도메인 설계는 참고하되, 코드는 새로 작성한다.

### 기술 선택

| 항목 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **Next.js (App Router)** | SSR + API Route 단일 앱 |
| DB | **SQLite (better-sqlite3)** | 파일 하나로 seed/reset, 외부 의존성 없음 |
| 챗봇 SDK | **Vercel AI SDK (ai)** | OpenAI 연동을 표준화된 스트리밍/tool-call 인터페이스로 처리 |
| LLM | **OpenAI** (기존 API 키 활용) | `.env.local`에 `OPENAI_API_KEY` 존재 |
| A2UI 렌더러 | **Google A2UI Lit Renderer** 원본 사용 | `github.com/google/A2UI` → `renderers/lit` + `renderers/web_core` |
| A2UI 에이전트 | **Google A2UI Agent SDK** 원본 사용 | `github.com/google/A2UI` → `agent_sdks/` |
| UI | **shadcn/ui + Tailwind CSS** | CLI 기반 primitive 도입 |
| 차트 | **recharts** | 최소 차트 (line, area) |

### 핵심 제약

- A2UI의 Google 코드는 **그대로 사용**한다. 재구현하지 않는다.
- 챗봇은 **ai-sdk**로 만든다. raw OpenAI SDK 직접 호출이 아니라 `ai` 패키지의 `streamText`, `generateText`, tool 시스템을 사용한다.
- 시나리오는 **자동 검증 가능**해야 한다. seed 후 기대 상태를 코드로 확인할 수 있어야 한다.

---

## 프로젝트 구조

```
/
├── app/
│   ├── (admin)/
│   │   ├── dashboard/page.tsx
│   │   ├── incidents/page.tsx
│   │   ├── deployments/page.tsx
│   │   ├── jobs/page.tsx
│   │   ├── reports/page.tsx
│   │   └── audit/page.tsx
│   ├── api/
│   │   ├── incidents/          # Product API
│   │   ├── deployments/
│   │   ├── jobs/
│   │   ├── reports/
│   │   ├── audit-logs/
│   │   ├── operators/
│   │   ├── chat/               # AI Chat API (ai-sdk route handler)
│   │   └── admin/              # Scenario reset/load
│   └── layout.tsx
├── src/
│   ├── components/
│   │   ├── ui/                 # shadcn primitives
│   │   ├── admin/              # 어드민 전용 조합 컴포넌트
│   │   ├── chat/               # 챗봇 UI
│   │   └── a2ui/               # A2UI host/bridge 컴포넌트
│   ├── server/
│   │   ├── db.ts               # SQLite 스키마 + 쿼리 + seed
│   │   ├── domain/             # 비즈니스 로직 (상태 전이, 권한, 감사)
│   │   └── ai/                 # ai-sdk 설정, tools 정의, system prompt
│   ├── lib/
│   │   └── a2ui-bridge.ts      # Google A2UI ↔ React 연결
│   └── types/
│       └── domain.ts
├── vendor/
│   └── google-a2ui/            # upstream 원본 그대로
│       ├── renderer/           # renderers/lit + renderers/web_core
│       └── agent/              # agent_sdks/
├── scenarios/
│   ├── checkout-5xx.ts         # 시나리오 seed 데이터
│   ├── billing-backfill.ts
│   ├── healthy-rollout.ts
│   ├── incident-handover.ts
│   └── verify.ts               # 시나리오 검증 스크립트
└── docs/
```

---

## 1층: DevOps Admin

### 만들어야 하는 화면

**Dashboard** — 운영 상황실
- 활성 인시던트 보드 (가장 위험한 1건을 hero로)
- 배포 리스크 현황
- 최근 감사 로그 피드
- 서비스 상태 차트 (recharts line/area)

**Incidents** — 장애 조사 워크스페이스
- 인시던트 목록 + 필터 (severity, status, service, env)
- 선택 시 상세 패널: alert group, evidence, timeline, linked deployment
- 상태 전이: `open → investigating → mitigated → resolved → closed`
- assignee 변경, 상태 업데이트 (reason 필수)

**Deployments** — 배포 판단 화면
- 배포 목록 (실패/활성 상단, 성공 이력 하단)
- 상세: diff viewer, risk checks, rollout %
- 롤백 플로우: plan 생성 → dry-run → 승인(RM만) → 실행
- 롤백 실행 시 인시던트 자동 mitigated 전이

**Jobs** — 운영 작업 실행기
- 템플릿 기반 job 생성 (backfill, cleanup, replay)
- spec editor → dry-run (sample rows, 예상 건수, 비용) → 승인 → 실행/중단
- 상태: `draft → dry_run_ready → approved → running → done/failed/aborted`

**Reports** — 보고서 작성
- 인시던트 업데이트, 핸드오버, 포스트모템
- section editor + action items + timeline 참조
- finalize → export (markdown/json)

**Audit Log** — 감사 추적
- 모든 mutation 기록: actor, action, target, reason, result, timestamp

### 도메인 규칙

**역할 4개:** On-call Engineer, Release Manager, Operations Engineer, Support/Incident Lead

**승인 규칙:**
- Production 롤백 실행 → Release Manager 승인 필수
- Production job 실행 → 승인 필수
- 모든 job 실행 → dry-run 선행 필수
- 인시던트 close → Support 또는 RM만

**감사 로그:**
- 모든 상태 변경에 `{ requestId, actorId, actorRole, actionType, targetType, targetId, reason, result, createdAt }` 기록

### SQLite 스키마

```
공통:     operators, services, meta
인시던트: incidents, incident_events, incident_evidence
배포:     deployments, deployment_diffs, deployment_risk_checks,
          rollback_plans, rollback_steps
작업:     job_templates, job_runs, job_run_events
보고서:   reports, report_sections, report_action_items, report_exports
감사:     audit_logs
챗봇:     chat_threads, chat_messages, chat_context_snapshots
```

---

## 2층: AI Copilot (ai-sdk)

### 핵심: Vercel AI SDK 사용

기존 코드는 OpenAI SDK를 직접 호출했다. 새 구축에서는 **`ai` 패키지** (Vercel AI SDK)를 사용한다.

```
npm install ai @ai-sdk/openai
```

**왜 ai-sdk인가:**
- `streamText()` — 스트리밍 응답을 표준 인터페이스로 처리
- `tool()` — LLM tool-call을 선언적으로 정의
- `useChat()` — 클라이언트 React hook으로 대화 상태 관리
- Next.js App Router와 네이티브 통합 (Route Handler로 SSE)

### 서버: API Route Handler

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages, context } = await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: buildSystemPrompt(context),  // 현재 페이지/엔티티 기반
    messages,
    tools: {
      getIncidentDetail: tool({ ... }),
      getDeploymentRisks: tool({ ... }),
      suggestRollback: tool({ ... }),
      getJobDryRunResult: tool({ ... }),
      // A2UI 렌더 이벤트를 반환하는 tool
      renderA2UICard: tool({ ... }),
    },
  });

  return result.toDataStreamResponse();
}
```

### 클라이언트: useChat hook

```typescript
// src/components/chat/chat-panel.tsx
import { useChat } from '@ai-sdk/react';

function ChatPanel({ pageContext }) {
  const { messages, input, handleSubmit, isLoading, stop, reload } = useChat({
    api: '/api/chat',
    body: { context: pageContext },  // 현재 페이지 컨텍스트 자동 전송
  });
  // ...
}
```

### 챗봇이 할 수 있는 것

**읽기 (tool-call로 DB 조회):**
- 현재 선택된 인시던트/배포/job 상세 데이터
- evidence, timeline, diff, risk checks
- 최근 감사 로그
- job dry-run 결과

**제안:**
- 원인 분석 요약
- 롤백 필요성 판단
- dry-run 먼저 하라고 안내
- 보고서 초안 제안
- 추천 질문 (페이지별 한국어)

**연결:**
- A2UI 카드 렌더 (3층과 연결)
- 제품 UI 딥링크

**하지 않는 것:**
- 승인 없이 실행
- dry-run 없이 실행
- 감사 로그 없이 상태 변경

### 챗봇 SQLite 저장

대화 이력은 SQLite에 저장해 refresh 후 복원:
- `chat_threads` — page, selectedEntityId별 대화 스레드
- `chat_messages` — role, content, status (pending/streaming/completed/failed)
- `chat_context_snapshots` — 대화 시점의 페이지 상태 스냅샷

---

## 3층: Google A2UI 통합

### 핵심: Google 코드를 그대로 쓴다

A2UI를 재구현하지 않는다. Google 저장소의 Lit renderer와 agent SDK를 vendor에 넣고 그대로 사용한다.

**Upstream:**
- Repo: `https://github.com/google/A2UI`
- Commit: `b0a2c94ffc7253d498e812e96ad3ecf76aaa8052`
- Renderer: `renderers/lit` + `renderers/web_core`
- Agent: `agent_sdks/`

### A2UI가 하는 일

챗봇이 텍스트로 "롤백을 검토하세요"라고 말하는 대신, **구조화된 UI 카드**를 대화 안에 삽입한다:

- **Evidence 비교 테이블** — 인시던트 조사 시
- **Rollback Summary Card** — 리스크 체크, diff 요약, 승인 상태
- **Dry-run Stepper** — 단계별 실행 확인
- **Confirm Modal** — 최종 실행 전 확인
- **Job Spec Form** — 파라미터 입력 + 검증
- **Report Template** — 섹션 구조 자동 생성

### 기술 연결

```
ai-sdk tool-call → A2UI event 생성 → Lit Renderer가 웹컴포넌트로 렌더
                                    ↓
                              사용자 action 클릭
                                    ↓
                        a2ui-bridge가 React로 전달
                                    ↓
                     동일한 domain 서비스 호출 → SQLite 반영 → audit log
```

**a2ui-bridge** (`src/lib/a2ui-bridge.ts`):
- Google Lit web component를 React 안에서 호스팅
- A2UI action event → 도메인 서비스 호출로 정규화
- 렌더 실패 시 텍스트 fallback

### ai-sdk tool로 A2UI 이벤트 반환

```typescript
tools: {
  renderRollbackCard: tool({
    description: '롤백 판단을 위한 구조화된 UI 카드를 보여준다',
    parameters: z.object({ deploymentId: z.string() }),
    execute: async ({ deploymentId }) => {
      const deployment = getDeployment(deploymentId);
      const risks = getRiskChecks(deploymentId);
      // A2UI 렌더 이벤트 형식으로 반환
      return {
        type: 'a2ui_render',
        node: 'rollback_summary_card',
        data: { deployment, risks, approvalState: ... }
      };
    }
  }),
}
```

챗봇 UI에서 tool result에 `type: 'a2ui_render'`가 있으면 텍스트 대신 A2UI Lit 컴포넌트를 마운트한다.

---

## 테스트 시나리오

### 시나리오 1: `checkout-5xx` — 장애 조사 → 롤백 실행

**설정:**
- checkout 서비스 production에 5xx 에러 급증
- 최근 배포(v2.4.1)가 실패 상태
- evidence: error rate 차트, guest cart 관련 에러 시그니처
- rollback candidate 존재 (v2.3.8로 복구 가능)

**시나리오 흐름:**
```
1. Dashboard 진입 → 활성 인시던트 1건 확인
2. Incidents → inc_checkout_prod_01 선택
3. Evidence 탭에서 에러 패턴 확인
4. Linked deployment (dep_checkout_prod_42) 확인
5. Deployments → diff viewer로 변경 사항 확인
6. Risk checks 확인 (config 변경 1건 warning)
7. 챗봇: "이거 롤백해야 해?"
   → 챗봇이 현재 인시던트+배포 데이터를 읽고 롤백 권고
   → A2UI: Rollback Summary Card 표시
8. Rollback dry-run 실행
9. Release Manager로 전환 → 승인
10. 롤백 실행 → deployment rolled_back, incident mitigated
11. Reports → postmortem 초안 작성
```

**검증 포인트:**
- [ ] incident 상태: open → investigating → mitigated
- [ ] deployment 상태: failed → rolled_back
- [ ] rollback_plan 상태: draft → dry_run_ready → approved → executed
- [ ] audit_log에 모든 action 기록 (최소 6건)
- [ ] 챗봇이 현재 인시던트 context를 읽고 답함
- [ ] A2UI rollback card가 렌더되고 action이 DB에 반영됨

### 시나리오 2: `billing-backfill` — 배치 작업 실행

**설정:**
- billing 파트너 quota 동기화 실패
- backfill job 필요 (2일치 데이터)
- customer impact 낮지만 운영 부담 높음

**시나리오 흐름:**
```
1. Jobs → billing_partner_backfill 템플릿 선택
2. Spec 입력: fromDate, toDate, targetMerchantIds
3. Dry-run 실행 → sample rows, 예상 건수, 비용 확인
4. 챗봇: "이 job spec 맞는지 확인해줘"
   → A2UI: Job Spec Review Card 표시
5. Production이므로 승인 필요 → RM으로 전환 → 승인
6. Execute → running → progress tick → done
7. 결과 확인
```

**검증 포인트:**
- [ ] job 상태: draft → dry_run_ready → approved → running → done
- [ ] dry-run 시 sample rows 생성
- [ ] production job에 approval 레코드 존재
- [ ] job_run_events에 progress 기록
- [ ] 챗봇이 job spec context를 읽고 검토 답변
- [ ] A2UI job spec card가 렌더되고 파라미터가 정확함

### 시나리오 3: `healthy-rollout` — 정상 배포 확인

**설정:**
- staging 환경에 search 서비스 v3.1.0 배포
- risk checks 전부 pass
- 인시던트 없음

**시나리오 흐름:**
```
1. Dashboard 진입 → 특이 사항 없음
2. Deployments → 정상 진행 중인 배포 확인
3. Risk checks all pass
4. 챗봇: "지금 배포 상태 어때?"
   → "정상 진행 중, 특이 사항 없음" 응답
5. 별도 조치 불필요
```

**검증 포인트:**
- [ ] 인시던트 0건 활성
- [ ] deployment 상태: running → succeeded
- [ ] risk checks 전부 pass
- [ ] 챗봇이 "정상" 판단을 정확히 전달

### 시나리오 4: `incident-handover` — 보고서 작성

**설정:**
- 이미 mitigated된 인시던트
- 교대 근무 핸드오버 + postmortem 작성 필요

**시나리오 흐름:**
```
1. Incidents → mitigated 상태의 인시던트 확인
2. Reports → 새 핸드오버 보고서 생성 (인시던트 링크)
3. 섹션 추가: 현재 상태, 원인 요약, 남은 작업
4. Action items 추가
5. 챗봇: "postmortem 초안 만들어줘"
   → A2UI: Report Template Card (섹션 구조 제안)
6. 보고서 finalize → export (markdown)
```

**검증 포인트:**
- [ ] report 상태: draft → reviewed → finalized → exported
- [ ] report_sections에 최소 3개 섹션
- [ ] report_action_items에 최소 2개 항목
- [ ] report_exports에 export 이력
- [ ] 챗봇이 인시던트 데이터 기반 postmortem 초안 제안
- [ ] A2UI report template card 렌더

---

## 시나리오 자동 검증

각 시나리오는 seed 후 기대 상태를 코드로 검증할 수 있어야 한다.

```typescript
// scenarios/verify.ts
export function verifyScenario(scenarioId: string, db: Database) {
  const scenario = scenarios[scenarioId];

  // 엔티티 존재 확인
  for (const id of scenario.expectedEntities.incidents) {
    assert(db.getIncident(id) !== null);
  }

  // 상태 확인
  assert(db.getIncident(scenario.defaultSelection.id).status === scenario.expectedState.incidentStatus);

  // row count 확인
  assert(db.countIncidents() === scenario.expectedCounts.incidents);

  // audit baseline 확인
  assert(db.countAuditLogs() >= scenario.expectedCounts.minAuditLogs);
}
```

시나리오 관리 명령:
```bash
npm run scenario:load checkout-5xx     # seed 데이터 로드
npm run scenario:verify checkout-5xx   # 기대 상태 검증
npm run scenario:reset                 # DB 초기화 + 재로드
```

---

## 구축 순서

### Step 1: 프로젝트 골격

- Next.js App Router 초기화
- SQLite 스키마 작성 + migration
- shadcn/ui init + 필수 primitive 추가
- 앱 셸 (sidebar nav, header, operator switcher)
- 4개 시나리오 seed 데이터 작성

### Step 2: 어드민 화면 6개

- Dashboard (운영 상황 요약)
- Incidents (조사 워크스페이스)
- Deployments (배포 판단 + 롤백 플로우)
- Jobs (작업 실행기)
- Reports (보고서 작성)
- Audit Log (감사 추적)

각 화면에서 상태 전이, 권한 체크, 감사 로그가 작동해야 한다.

### Step 3: AI Copilot

- `ai` + `@ai-sdk/openai` 설치
- API route handler (`/api/chat`)
- system prompt (페이지 컨텍스트 기반)
- tools 정의 (DB 조회, 상태 분석, 제안 생성)
- 클라이언트 `useChat` hook
- 플로팅 챗봇 패널 UI
- thread/message SQLite 저장

### Step 4: A2UI 통합

- Google A2UI upstream 코드 vendor에 반입
- Lit renderer를 Next.js에서 로드 (dynamic import, SSR 제외)
- a2ui-bridge: Lit web component ↔ React lifecycle 연결
- ai-sdk tool에 A2UI 렌더 이벤트 반환 추가
- 챗봇 메시지에 A2UI 카드 렌더링
- A2UI action → domain 서비스 호출 → SQLite 반영

### Step 5: 시나리오 테스트

- 4개 시나리오 전체 흐름 수동 검증
- `scenario:verify` 자동 검증 스크립트
- 각 시나리오의 검증 포인트 전부 통과 확인

---

## 성공 기준

데모에서 `checkout-5xx` 시나리오를 처음부터 끝까지 실행했을 때:

1. **어드민 자체가 작동한다** — 인시던트 조사, 배포 확인, 롤백 실행, 보고서 작성이 전부 된다
2. **챗봇이 맥락을 안다** — "이거 롤백해야 해?"에 현재 데이터 기반으로 답한다
3. **A2UI가 행동을 구조화한다** — 대화 안에서 리스크 카드, 승인 체크리스트, 실행 버튼이 나타난다
4. **전체가 하나의 DB로 연결된다** — 어드민/챗봇/A2UI 어디서 action을 하든 같은 SQLite에 반영되고 audit log가 남는다
5. **시나리오를 반복 재현할 수 있다** — reset 한 번이면 처음 상태로 돌아간다
