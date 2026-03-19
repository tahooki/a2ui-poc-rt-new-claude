# A2UI Deployment Cards UX/UI Plan

## Document Goal

This document defines the UX/UI design for three deployment-focused A2UI cards that are worth surfacing inside the chat copilot:

- Quick Deploy Launchpad
- Deployment Approval Inbox
- Rollback Action Card

The goal is to move from idea-level discussion into a build-ready product design plan. This is not an API spec. It explains what the user should see, why the card exists, how interaction should feel, and how the UI should map onto A2UI primitives already used in this repo.

## Why These Three Cards

These cards were selected because they satisfy all of the following:

- The action is common enough in DevOps workflows to deserve a shortcut.
- The user can complete the action with little or no manual typing.
- The card can produce an immediate state change after a button press.
- The experience is better than a long text response in a narrow chat surface.

The current product already supports deployment detail lookup and rollback-plan execution flow, but it does not yet support a deployment request inbox or a quick deploy creation flow. This document intentionally separates:

- What can be layered on top of existing capability now
- What requires new backend support before the card becomes real

## Product Positioning

These cards should not behave like mini dashboards. They should behave like small operational control surfaces.

Bad fit:

- Long explanation
- Too many tabs
- Dense detail-first layouts
- Large freeform input forms

Good fit:

- Clear status headline
- One dominant action
- One or two secondary actions
- Short, high-signal summary rows
- Immediate UI feedback after click

## Shared UX Principles

### 1. Action Before Analysis

Each card must answer one practical question first:

- Can I start this deployment?
- Can I approve this deployment?
- Which deployment should I roll back?

Context exists to support the action, not to compete with it.

### 2. Minimal Input

If the user has to type multiple values, the workflow belongs on a full page, not in chat.

Card input rules:

- Default to zero required text inputs
- Allow at most one optional comment field
- Prefer selection from existing entities over new manual entry

### 3. Immediate Visible Feedback

When the user clicks a button, something in the card must visibly change even in preview mode.

Examples:

- Status chip updates
- A new step becomes active
- A row moves from pending to approved
- A rollback candidate becomes executed or unavailable

### 4. Narrow-Surface Readability

The card must work inside a narrow chat drawer and inside the template preview workspace.

UI implications:

- One visual headline
- Short summary rows
- Buttons grouped at the bottom or per row
- Do not rely on wide tables

### 5. Low-Chrome AI-Native Style

Using the `ui-ux-pro-max` guidance, the best applicable direction for this product is:

- AI-native, minimal chrome
- flat control surfaces
- quick status recognition
- visible focus states
- motion limited to state feedback and reveal transitions

The design system should feel operational and calm rather than decorative.

## Shared Visual Language

All three cards should share a common structure so the user instantly recognizes "this is an executable ops card."

### Shared Anatomy

1. Eyebrow label
2. Action headline
3. Short operational summary
4. Two to five key info rows
5. Main action region
6. Optional secondary context list

### Shared Status Language

- `대기`: no action taken yet
- `준비됨`: safe to continue
- `승인 대기`: blocked on human decision
- `진행 중`: user or system action is underway
- `완료`: action finished successfully
- `보류`: intentionally held
- `실패`: action failed and needs intervention

### Shared Interaction Patterns

- Row-level primary action for list cards
- Footer primary action for single-entity cards
- Secondary action always visually lighter than primary
- Destructive actions never appear alone without adjacent context

### Shared A2UI Primitive Palette

The current bridge supports these well:

- `Card`
- `Column`
- `Row`
- `Text`
- `Icon`
- `Button`
- `List`
- `Tabs`
- `CheckBox`

Design should stay inside this palette to avoid fighting the current renderer.

## Card 1: Quick Deploy Launchpad

## Product Intent

Let an operator start a new deployment from an existing successful deployment with almost no manual input.

This card is not "create a deployment from scratch." It is "launch a near-identical deployment quickly."

## Primary User

- `release_manager`
- `ops_engineer`

## Trigger Phrases

- "checkout 다시 배포해줘"
- "최근 성공 배포 기준으로 새 배포 시작"
- "payment staging 재배포"

## Core Job To Be Done

"I want to take a known-good baseline and start a new deployment without going through a long form."

## Why It Belongs In A2UI

This is not just informational. It is a short operational launch flow:

- pick baseline
- confirm defaults
- request approval or launch

That sequence is significantly better as a card than as a text-only response.

## Defaulting Rules

The card should auto-fill from:

1. selected deployment in current page context
2. latest successful deployment for that service/environment
3. latest successful deployment for that service across environments

If defaults are unavailable, the card should degrade into a suggestion card and route the user to the deployments page.

## Input Strategy

The user should not be required to type:

- image tag
- service id
- rollout strategy
- environment name

Optional inputs:

- one-line deploy note
- environment override only if clearly necessary

## Information Shown

- Service
- Environment
- Baseline version
- Last successful deploy time
- Suggested rollout strategy
- Recent risk summary
- Requested by

## Main Actions

- `초안 생성`
- `승인 요청`
- `즉시 시작`
- `상세 설정으로 이동`

## State Model

- `suggested`
- `draft_created`
- `approval_requested`
- `approved`
- `started`
- `failed`

## UX Flow

1. User asks to redeploy a service.
2. Card appears with auto-filled baseline.
3. User sees a simple summary and one dominant action.
4. After click, the card updates in place:
   `초안 생성` -> draft badge appears
   `승인 요청` -> status changes to approval pending
   `즉시 시작` -> rollout status changes to running

## Wireframe

```text
[A2UI · 간단 배포 시작]
새 배포 시작
최근 성공 배포를 기준으로 자동 채운 배포 초안입니다.

서비스        checkout-service
환경          production
기준 버전      v2.4.1
전략          canary 10 -> 50 -> 100
최근 체크      통과 4 / 경고 1 / 실패 0

[초안 생성]  [승인 요청]  [즉시 시작]
```

## A2UI Layout Mapping

- Root: `Card`
- Main stack: `Column`
- Summary fields: repeated `Row(left label, right value)`
- Action bar: `Row` with 3 `Button`s
- Optional note input is intentionally excluded from first version

## Guardrails

- `즉시 시작` only visible to allowed roles
- If risk summary includes fail count, default primary action becomes `승인 요청`
- If baseline deployment is not succeeded, card should not offer immediate start

## Empty/Error/Edge States

- No recent successful baseline:
  show explanation + `배포 페이지로 이동`
- Multiple likely baselines:
  show top 3 candidates as a short list with `선택`
- Permission denied:
  show locked state and allow only `초안 생성`

## Success Criteria

- User can start the flow with zero required typing
- Card reduces the need to visit the deployment creation page for repeat deploys

## Card 2: Deployment Approval Inbox

## Product Intent

Provide an approval queue inside the copilot so approvers can review and decide quickly.

## Primary User

- `release_manager`
- secondary viewer: `ops_engineer`

## Trigger Phrases

- "승인 대기 배포 보여줘"
- "지금 내가 승인해야 하는 배포 뭐 있어?"
- "pending deployment approvals"

## Core Job To Be Done

"I want to clear my deployment approval queue without opening each request separately."

## Why It Belongs In A2UI

This is exactly the kind of inbox pattern where list rows plus immediate actions outperform text. The user wants to scan and decide, not read a report.

## Card Type Concept

This is a list-first card, not a detail-first card.

The card should surface 3 to 5 approval candidates, each with enough information to decide or escalate.

## Information Shown Per Row

- Service
- Environment
- Version
- Requestor
- Requested time
- Risk summary
- Change size summary
- Recent failure/rollback indicator

## Main Actions Per Row

- `승인`
- `보류`
- `상세 보기`

## Secondary Filters

Optional lightweight filters at the top:

- environment
- service
- sort by recency or risk

These should be defaults-first and may be omitted from v1 if they add too much complexity.

## State Model

- `approval_pending`
- `approved`
- `held`
- `expired`

## UX Flow

1. User asks for approval queue.
2. Card shows pending deployment requests sorted by urgency.
3. User clicks `승인` on one row.
4. That row changes state immediately:
   badge changes
   button disappears or becomes disabled
   a follow-up status note appears

## Wireframe

```text
[A2UI · 배포 승인 Inbox]
승인 대기 배포
지금 처리할 수 있는 배포 요청 4건

- checkout / production / v2.5.0
  요청자: minji / 통과 4 경고 1 실패 0 / 12분 전
  [승인] [보류] [상세 보기]

- auth / staging / v1.9.2
  요청자: seungho / 통과 5 경고 0 실패 0 / 27분 전
  [승인] [보류] [상세 보기]
```

## A2UI Layout Mapping

- Root: `Card`
- Candidate list: `Column`
- Each candidate: `Column` containing summary text rows and a button row
- Optional top header chips can be rendered as simple `Text` + `Button` combinations if filtering is needed

## Guardrails

- `승인` hidden or disabled for unauthorized roles
- If fail count > 0, the row should visually downgrade and nudge toward `상세 보기`
- `보류` should request or attach a short reason when backend support exists

## Empty/Error States

- No approvals pending:
  show calm empty state with "현재 승인 대기 배포가 없습니다."
- Data unavailable:
  show a retry or page-link action

## Success Criteria

- Approver can clear at least one request directly from chat
- Approval queue is faster to process than opening multiple deployment pages

## Card 3: Rollback Action Card

## Product Intent

Show rollback-ready deployment candidates for a given service and let the operator choose one to roll back immediately.

## Primary User

- `release_manager`
- `ops_engineer`
- emergency use by `oncall_engineer` if policy permits

## Trigger Phrases

- "checkout 롤백하고 싶어"
- "payment 서비스 롤백 후보 보여줘"
- "rollback 가능한 배포 목록"

## Core Job To Be Done

"I do not need another summary card. I need to see which deployment I can roll back right now and act on it."

## Why It Belongs In A2UI

Rollback in an incident is selection plus execution. A list of candidates with row-level action buttons is the strongest fit for the chat surface.

## Candidate Selection Rules

The card should prefer:

1. recent deployments for the selected service
2. deployments in the active incident environment
3. deployments that have a previous version
4. deployments not already rolled back

The card does not need to "decide whether rollback is wise." It needs to make rollback choice fast.

## Information Shown Per Candidate

- Service
- Current version
- Previous version
- Environment
- Deployment status
- Deployment time
- Recent risk signal summary

## Main Actions Per Row

- `롤백`
- `상세 보기`

Optional later action:

- `롤백 계획 생성`

if the backend requires an intermediate step.

## State Model

- `candidate`
- `rollback_requested`
- `executed`
- `unavailable`

## UX Flow

1. User asks to roll back a service.
2. Card displays recent rollback-capable candidates.
3. User clicks `롤백`.
4. The selected row transitions immediately:
   status changes
   action button disables
   row message confirms rollback request or execution

## Wireframe

```text
[A2UI · 롤백 실행]
checkout-service 롤백 후보
즉시 되돌릴 수 있는 최근 배포 후보입니다.

- production / 현재 v2.4.1 / 이전 v2.3.8 / failed / 14분 전
  최근 신호: 에러율 증가, 경고 2개
  [롤백] [상세 보기]

- production / 현재 v2.4.0 / 이전 v2.3.8 / succeeded / 52분 전
  최근 신호: 경고 없음
  [롤백] [상세 보기]
```

## A2UI Layout Mapping

- Root: `Card`
- Candidate rows: `Column`
- Row metadata: `Text` blocks with short labels
- Row action group: `Row` of `Button`s

## Guardrails

- Always show `현재 버전 -> 이전 버전`
- Disable rollback for candidates with no previous version
- Mark already rolled-back items as unavailable
- Show environment prominently to avoid production/staging confusion

## Empty/Error States

- No valid rollback candidates:
  show "롤백 가능한 배포 후보가 없습니다."
- Candidate exists but permissions do not:
  show locked state and `상세 보기` only

## Success Criteria

- User can choose a rollback target without reading a long explanation
- Rollback action is discoverable and low-friction in an incident context

## Shared Conversation Design

These three cards should behave like a deployment lifecycle trio:

- Start deployment
- Approve deployment
- Roll back deployment

The chat system should prefer them when the user's intent is clearly action-oriented and low-input.

Good examples:

- "checkout 다시 배포"
- "내 승인 대기 배포 보여줘"
- "auth 롤백할 배포 보여줘"

Bad examples:

- "최근 배포 요약해줘"
- "배포 이력 분석해줘"

Those are better served by normal text or page navigation.

## Preview Requirements

The template preview must not be passive. Even before backend integration is complete, the preview should simulate visible state transitions:

- start draft -> requested approval
- approval pending -> approved
- rollback candidate -> executed

Without that, the card looks like a static summary and loses its product value.

## Current Platform Readiness

### Ready Now

- Rollback action concepts
- Deployment detail lookup
- A2UI action plumbing
- Existing card renderer and preview workspace

### Partial

- Approval concepts exist for rollback and jobs, but not for deployment requests as a first-class inbox

### Missing

- Deployment request / draft entity
- Deployment approval queue
- Rollback candidate list data source

## Recommended Delivery Order

1. Rollback Action Card
2. Deployment Approval Inbox
3. Quick Deploy Launchpad

This order maximizes visible value while minimizing backend expansion early on.

## Open Product Questions

- Is deployment approval a distinct object from deployment creation in this product?
- Should "quick deploy" create a draft or start immediately by default?
- Can on-call engineers execute rollback directly, or only request it?
- How many approval candidates should the inbox show before linking out?
- Should rollback always create a plan first, or can the card support one-click rollback?

