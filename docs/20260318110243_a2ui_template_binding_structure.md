# A2UI Template Binding 최소 구현 문서

## 문서 목적

이 문서는 template-first A2UI를 구현하기 위해
지금 바로 필요한 최소 구조만 정리한 구현 문서다.

이 문서의 범위는 다음 6개로 제한한다.

- template
- binding
- source
- executor
- binder
- required fallback

이 문서는 확장 논의는 다루지 않는다.

- admin 편집 UI
- DB/seed source of truth 전환
- cache 고도화
- auth policy 확장
- 복잡한 expression 문법

위 항목은 이후 문서로 다룬다.

---

## 1. 최소 구조 결론

template-first 구조에서도 템플릿이 직접 API를 호출하면 안 된다.

반드시 아래 구조로 나눈다.

`template -> binding -> source -> executor -> binder -> cardData -> render`

각 계층의 책임은 다음과 같다.

- template
  - 어떤 화면을 만들지 정의
- binding
  - 템플릿이 필요한 데이터 슬롯을 source에 연결
- source
  - 데이터를 어디서 가져올지 정의
- executor
  - source를 실제로 호출
- binder
  - 실행 결과를 `cardData`로 묶음
- required fallback
  - 필수 데이터 실패 시 어떻게 처리할지 정의

---

## 2. Template

### 역할

- 어떤 A2UI 템플릿을 제공할지 정의
- 템플릿의 목적을 정의
- 템플릿이 어떤 binding을 필요로 하는지 정의
- 템플릿 실패 시 fallback 정책을 정의

### 최소 타입

```ts
type TemplateFallbackPolicy =
  | { mode: "partial_allowed" }
  | { mode: "fallback_template"; fallbackTemplateId: string }
  | { mode: "text_fallback" };

interface A2UITemplateDef {
  id: string;
  name: string;
  description: string;
  cardType: string;
  requiredBindings: string[];
  optionalBindings: string[];
  fallbackPolicy: TemplateFallbackPolicy;
}
```

### 규칙

- 템플릿은 source URL을 직접 알면 안 된다
- 템플릿은 binding id만 안다
- 템플릿은 fallback 정책을 반드시 가진다

---

## 3. Binding

### 역할

- 템플릿의 논리 슬롯을 실제 source에 연결
- source 호출 시 필요한 입력 매핑을 정의
- source 실행 결과가 `cardData`의 어느 key로 들어갈지 정의

### 최소 타입

```ts
type TemplateSlot =
  | "list"
  | "detail"
  | "metrics"
  | "events"
  | "evidence"
  | "approvals"
  | "related"
  | "actions"
  | "report"
  | "runbook";

interface TemplateBindingDef {
  id: string;
  templateId: string;
  slot: TemplateSlot;
  sourceId: string;
  required: boolean;
  inputMapping: Record<string, string>;
  outputKey: string;
}
```

### 최소 expression 규칙

초기 구현에서는 `inputMapping` 표현식을 아래만 허용한다.

- 상수 문자열
- `$args.<name>`
- `$context.<name>`
- `$session.<name>`

예:

```json
{
  "incidentId": "$args.incidentId",
  "actorId": "$session.actorId",
  "environment": "production"
}
```

### 규칙

- `slot`은 enum으로 고정한다
- `outputKey`가 `cardData` key의 source of truth다
- binding은 URL이나 handler를 직접 가지지 않는다

---

## 4. Source

### 역할

- 실제 데이터를 어디서 가져올지 정의
- DB, 내부 API, 외부 HTTP 중 어느 종류인지 정의
- 최소 요청 구성을 정의

### 최소 타입

```ts
interface DataSourceDef {
  id: string;
  kind: "internal_db" | "internal_api" | "external_http";
  method?: "GET" | "POST" | "PATCH";
  url?: string;
  handlerKey?: string;
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  bodyMapping?: Record<string, string>;
  resultPath?: string;
  timeoutMs: number;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}
```

### 규칙

- `internal_db`
  - `handlerKey` 사용
- `internal_api`, `external_http`
  - `url` 사용
- URL은 source에만 존재
- 템플릿과 binding은 URL을 직접 모른다

---

## 5. Executor

### 역할

- binding과 source를 읽고 실제 데이터를 호출
- 입력값을 해석
- path/query/body를 구성
- 응답을 파싱
- `resultPath`를 적용
- input/output schema를 검증

### 최소 구현 책임

1. binding 조회
2. source 조회
3. `inputMapping` 해석
4. source 실행
5. schema validation
6. 결과 반환

### 규칙

- 템플릿 렌더 함수 안에서 직접 fetch하지 않는다
- source 실행 실패는 성공/실패 결과로 정규화한다
- `required` 여부는 executor가 아니라 binder/fallback에서 최종 판정한다

---

## 6. Binder

### 역할

- executor 결과를 slot별로 모은다
- 각 binding의 `outputKey`를 기준으로 `cardData`를 만든다
- 필수/선택 결과를 구분한다

### 최소 타입

```ts
interface BuiltTemplateData {
  templateId: string;
  cardType: string;
  cardData: Record<string, unknown>;
  missingRequired: string[];
  warnings: string[];
}
```

### 규칙

- `outputKey`를 기준으로 `cardData`를 만든다
- binding이 required인데 결과가 없으면 `missingRequired`에 넣는다
- optional binding 실패는 `warnings`에 넣는다

예:

```ts
{
  binding: {
    slot: "detail",
    outputKey: "incident"
  }
}
```

이면 결과는 반드시 `cardData.incident`에 들어간다.

---

## 7. Required Fallback

### 목적

필수 데이터가 없을 때 템플릿 동작을 통일하기 위해 필요한 최소 규칙이다.

### 최소 규칙

- required binding 실패 + fallbackPolicy=`partial_allowed`
  - partial render 허용
  - `missingRequired`와 warning을 노출

- required binding 실패 + fallbackPolicy=`fallback_template`
  - 지정된 fallback 템플릿으로 전환

- required binding 실패 + fallbackPolicy=`text_fallback`
  - 일반 텍스트 응답으로 전환

### 규칙

- 모든 템플릿은 fallbackPolicy를 반드시 가져야 한다
- fallback은 템플릿 정의 기준으로만 동작한다
- 템플릿마다 제각각 실패 처리 로직을 구현하지 않는다

---

## 8. 최소 실행 흐름

최소 실행 흐름은 다음과 같다.

1. 챗봇이 템플릿 선택
2. 템플릿의 binding 목록 조회
3. binding이 가리키는 source 조회
4. executor가 source 호출
5. binder가 결과를 `cardData`로 조립
6. 필수 데이터 누락 시 fallbackPolicy 적용
7. 템플릿 렌더

---

## 9. 지금 바로 만들 파일

최소 구현 기준 추천 파일:

- `src/server/a2ui/templates/template-types.ts`
- `src/server/a2ui/templates/template-definitions.ts`
- `src/server/a2ui/bindings/binding-types.ts`
- `src/server/a2ui/bindings/binding-definitions.ts`
- `src/server/a2ui/data-sources/source-types.ts`
- `src/server/a2ui/data-sources/source-definitions.ts`
- `src/server/a2ui/execution/execute-data-source.ts`
- `src/server/a2ui/execution/resolve-input-mapping.ts`
- `src/server/a2ui/execution/validate-source-io.ts`
- `src/server/a2ui/render/build-template-card-data.ts`

---

## 10. 한 줄 결론

`지금 당장 구현해야 하는 최소 구조는 template, binding, source, executor, binder, required fallback이며, 이 6개만 고정해도 template-first A2UI의 데이터 호출과 렌더 흐름을 안정적으로 만들 수 있다.`
