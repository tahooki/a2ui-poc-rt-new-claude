# A2UI 템플릿 재판단(2-Step) + 판단근거 입력/출력 스키마 수정 계획서

## 1) 목적

현재 `a2ui` 템플릿 선택은
- 규칙 기반 강제 선택(질문 exact/keyword)
- 모델의 툴 호출 유도
의 혼합 구조다.

이번 수정의 목표는 아래 3가지를 안정적으로 추가하는 것이다.

1. 대화 흐름 중 **템플릿 재판단 단계(2-step decision)**를 `ai-sdk`로 명시적으로 실행한다.
2. 템플릿별 **판단 근거 input**(근거 필드)을 수집하고, 이를 agent prompt에 함께 전달한다.
3. 최종 출력을 **A2UI Renderer 입력 스키마**로 표준화해 프런트가 그대로 렌더링 가능하게 만든다.

---

## 2) 현재 구조 기준점

핵심 파일 기준 현재 흐름은 다음과 같다.

- `src/app/api/chat/route.ts`
  - `listEnabledA2UITemplates()`로 후보를 계산
  - 일부 질문은 강제 매핑(`findForcedA2UIQuestionCase` / `findForcedA2UITemplate`)
  - 그 외에는 `streamText()`에서 모델이 툴 호출
- `src/server/ai/template-service.ts`
  - 템플릿/룰/오버라이드 기반 가용성 계산
  - prompt guidance 문자열 생성
- `src/server/ai/tools.ts`
  - `render*Card` 툴이 `{ type: "a2ui_render", cardType, cardData }` 반환
- `src/components/chat/chat-message.tsx`
  - `a2ui_render` payload를 감지해 `<A2UICardRenderer />`에 전달

즉, 렌더 경로는 이미 안정적이며, 이번 변경은 **"선택 전 재판단" + "판단근거 입출력"** 레이어를 추가하는 형태가 가장 안전하다.

---

## 3) 목표 아키텍처 (권장)

### 3-1. 2-Step 템플릿 판단 파이프라인

1. Step A: 규칙 기반 후보 필터
- page/role/scenario/enable 상태로 후보 템플릿 리스트 산출
- 기존 `listEnabledA2UITemplates()` 재사용

2. Step B: AI 재판단 (`generateObject` 권장)
- 입력: 사용자 질문 + 컨텍스트 + 템플릿별 판단근거 input 묶음
- 출력: `selectedTemplateId`, `confidence`, `reasoning`, `requiredInputs`, `missingInputs`
- 안전장치: 후보 외 템플릿 선택 시 무효 처리 후 fallback

3. Step C: 선택 템플릿 tool 실행
- `buildTemplateToolArgs()`로 실행 인자 생성
- `render*Card` 툴 호출

4. Step D: Renderer 표준 payload 반환
- 기존 `cardType`, `cardData`는 유지
- decision metadata를 함께 포함

---

## 4) 데이터 계약 (입력/출력 스키마)

## 4-1. 템플릿 판단 근거 Input 스키마

템플릿이 필요로 하는 판단근거를 DB/설정에서 정의하고, 런타임에 수집한다.

```ts
interface TemplateDecisionInputField {
  key: string;                       // 예: riskTolerance, urgency, targetEntity
  label: string;                     // UI 표시용
  description: string;               // agent prompt 문맥용
  required: boolean;
  source: "user" | "context" | "derived";
  defaultValue?: string;
}

interface TemplateDecisionInputBundle {
  templateId: string;
  templateName: string;
  toolName: string;
  promptHint: string;
  decisionInputs: TemplateDecisionInputField[];
  collected: Record<string, string | number | boolean | null>;
}
```

## 4-2. AI 재판단 Output 스키마 (`generateObject`)

```ts
interface TemplateDecisionResult {
  selectedTemplateId: string | null;
  confidence: number;                // 0~1
  decisionReason: string;            // 핵심 근거 요약
  matchedSignals: string[];          // 선택 근거 신호
  rejectedTemplateIds: string[];     // 제외한 후보
  missingInputs: string[];           // 부족한 판단근거 key
  shouldAskFollowUp: boolean;
  followUpQuestion?: string;
}
```

## 4-3. Renderer 표준 Payload 스키마

기존 하위호환을 유지하면서 확장한다.

```ts
interface A2UIRenderEnvelope {
  type: "a2ui_render";
  renderer: {
    name: "A2UICardRenderer";
    version: "v1";
    schema: "A2UIRenderEnvelope/v1";
  };
  template: {
    templateId: string;
    toolName: string;
    cardType: string;
  };
  decision: {
    strategy: "rule+ai_second_pass";
    confidence: number;
    decisionReason: string;
    matchedSignals: string[];
    missingInputs: string[];
    collectedInputs: Record<string, unknown>;
  };
  cardType: string;                  // 기존 호환
  cardData: Record<string, unknown>; // 기존 호환
}
```

`chat-message`는 기존처럼 `type/cardType/cardData`만으로도 렌더되므로, 점진 도입이 가능하다.

---

## 5) 파일 단위 수정 계획

## 5-1. 서버: Decision 계층 신설

신규 파일(권장):
- `src/server/ai/template-decision.ts`

역할:
- 후보 템플릿 + 판단근거 input을 하나로 묶은 `DecisionContext` 생성
- `generateObject`로 `TemplateDecisionResult` 생성
- 정책 검증(허용 후보 여부, confidence cutoff 등)

핵심 함수:
- `buildTemplateDecisionContext(params)`
- `decideTemplateWithAI(params)`
- `validateDecisionOrFallback(params)`

## 5-2. 서버: 템플릿 서비스 확장

수정 파일:
- `src/server/ai/template-service.ts`

변경:
- `A2UITemplateAvailability`에 `decisionInputs` 필드 추가
- `buildTemplatePromptGuidance()`를 "선택 가이드" + "근거 input 요약"까지 확장

## 5-3. 서버: Chat Route 오케스트레이션 변경

수정 파일:
- `src/app/api/chat/route.ts`

변경 포인트:
1. 기존 강제 질문 매핑(`findForcedA2UIQuestionCase`)은 테스트 안정성을 위해 유지
2. 강제 매핑이 아닐 때, `hasA2UIIntent(userText)`면 `decideTemplateWithAI()` 실행
3. `missingInputs`가 있고 `shouldAskFollowUp=true`면 보충 질문 텍스트 응답
4. 선택 템플릿 확정 시 tool 실행 후 `A2UIRenderEnvelope`로 반환
5. 선택 로그에 `decision payload` 저장

## 5-4. 서버: Tool 출력 계약 통일

수정 파일:
- `src/server/ai/tools.ts`

변경:
- 기존 `{ type, cardType, cardData }` 유지
- `chat/route`에서 `decision`, `template`, `renderer`를 덧씌워 최종 envelope 생성
- 필요 시 공통 헬퍼 `attachDecisionMetadata(result, decisionCtx)` 추가

## 5-5. DB/Seed: 판단근거 input 저장 구조

수정 파일:
- `src/server/db.ts`
- `src/server/ai/template-config.ts`

권장 스키마 추가:

```sql
CREATE TABLE IF NOT EXISTS a2ui_template_decision_inputs (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES a2ui_templates(id),
  input_key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  required INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK(source IN ('user','context','derived')),
  default_value TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

추가 권장:
- `a2ui_template_selection_logs`에 `decision_payload TEXT` 컬럼 추가

```sql
ALTER TABLE a2ui_template_selection_logs ADD COLUMN decision_payload TEXT;
```

Seed 반영:
- `SEED_A2UI_TEMPLATES`에 템플릿별 `decisionInputs` 정의 추가

## 5-6. Admin 템플릿 화면 확장 (선택)

수정 파일:
- `src/app/(admin)/templates/page.tsx`
- `src/app/api/a2ui-templates/route.ts`
- `src/app/api/a2ui-templates/[id]/route.ts`

변경:
- 템플릿 상세 패널에 "Decision Inputs" 섹션 추가
- read-only 1차 반영 후, 필요하면 편집 API 추가

## 5-7. 프런트 렌더러/채팅 표시 확장

수정 파일:
- `src/components/chat/chat-message.tsx`

변경:
- `a2ui_render` payload의 `decision`/`template` 존재 시 접이식 "선택 근거" UI 노출
- `A2UICardRenderer` 호출 계약은 그대로 유지

---

## 6) 단계별 실행 순서 (권장)

Phase 1. 서버 내부 재판단 도입 (UI 변경 없음)
- `template-decision.ts` 추가
- `chat/route.ts`에서 2-step decision 적용
- 렌더는 기존과 동일

Phase 2. 판단근거 input 저장/조회
- DB 테이블/seed 추가
- `template-service`에서 decisionInputs 조회 포함

Phase 3. 출력 스키마 확장 + 로그 고도화
- `A2UIRenderEnvelope`로 표준화
- selection log에 decision_payload 기록

Phase 4. Admin/Chat 가시화
- Admin 템플릿 페이지에 decisionInputs 표시
- Chat UI에서 선택 근거 접이식 노출

---

## 7) 테스트/검증 계획

1. 단위 테스트
- 후보 필터 정확도(page/role/scenario)
- decision output schema 검증(zod)
- 후보 외 template 선택 방어 로직

2. 통합 테스트 (`/api/chat`)
- A2UI 의도 질문에서 2-step decision 후 `a2ui_render` 반환
- `missingInputs` 발생 시 follow-up 질문 반환
- 비의도 질문에서는 기존 `streamText` 경로 유지

3. 회귀 테스트
- `npm run test:a2ui` 시 기존 expected cardType 유지
- 강제 매핑 질문(Exact Match) 정상 동작

4. 관찰 지표
- 템플릿 선택 성공률
- fallback 비율
- 평균 판단 confidence
- follow-up 질문 발생률

---

## 8) 리스크 및 대응

1. 응답 지연 증가(재판단 LLM 1회 추가)
- 대응: A2UI 의도 질문에서만 2-step 실행
- 대응: 후보가 1개일 때는 재판단 생략

2. 잘못된 템플릿 선택
- 대응: rule filter + candidate whitelist 강제
- 대응: confidence 임계치 미달 시 텍스트 fallback

3. 스키마 호환성
- 대응: `cardType/cardData`는 절대 제거하지 않고 확장 필드만 추가

---

## 9) 완료 조건 (Definition of Done)

1. A2UI 의도 질문에서 템플릿 선택이 `rule + ai second pass`로 동작한다.
2. 템플릿별 판단근거 input이 수집되어 agent prompt에 포함된다.
3. 응답이 `A2UIRenderEnvelope` 형식으로 반환되고 기존 렌더러에서 정상 렌더된다.
4. 선택 이유/근거가 로그로 남고 디버깅 가능하다.
5. 기존 A2UI smoke 시나리오가 모두 통과한다.
