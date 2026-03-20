# DevOps Ops Console

Next.js 기반의 데모용 운영 콘솔입니다. 인시던트 대응, 배포 확인, 롤백 실행, 잡 실행, 보고서 작성, AI Copilot 흐름을 시나리오 데이터로 검증할 수 있습니다.

## Quick Start

```bash
npm install
# Optional: copy env only if you want live AI responses
cp .env.example .env.local
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 을 열면 `/dashboard`로 진입합니다.

첫 API 접근 시 `data/ops-console.db`가 자동 생성되고, 스키마와 데모 시나리오 데이터가 자동 시드됩니다.
즉 새로 클론한 뒤에는 별도 데이터 로드 없이 바로 화면을 확인할 수 있습니다.

## Scenario Data

아래 명령은 자동 시드 이후 데이터를 다시 초기화하거나 검증할 때만 사용합니다.

```bash
npm run scenario:reset
npm run scenario:load -- --all
npm run scenario:verify -- --all
```

`scenario-cli`는 기본적으로 `http://127.0.0.1:3000/api/admin`을 사용합니다. 다른 포트를 쓰면 `BASE_URL`을 지정하세요.

```bash
BASE_URL=http://127.0.0.1:3001 npm run scenario:load -- --all
```

`OPENAI_API_KEY` 또는 `AI_API_KEY`가 없으면 Copilot은 데모용 fallback 응답으로 동작합니다.

## AI Provider Configuration

기본값은 OpenAI (`gpt-4o-mini`) 이지만, 권장 방식은 OpenRouter 같은 OpenAI 호환 API를 연결해서 모델을 유연하게 바꾸는 것입니다.

OpenRouter에서 Qwen 계열 모델을 쓸 때:

```bash
AI_API_KEY=your_openrouter_api_key_here
AI_MODEL=qwen/qwen3-coder
AI_BASE_URL=https://openrouter.ai/api/v1
AI_PROVIDER_NAME=openrouter
AI_HEADERS_JSON='{"HTTP-Referer":"http://localhost:3000","X-Title":"DevOps Ops Console"}'
```

OpenRouter에서는 모델 ID를 보통 `provider/model` 형식으로 사용하므로, 실제 지원 모델명은 OpenRouter 모델 목록에서 확인해 그대로 넣는 편이 안전합니다.

OpenAI를 그대로 쓸 때:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

다른 OpenAI 호환 엔드포인트도 같은 방식으로 연결할 수 있습니다.

```bash
AI_API_KEY=your_provider_api_key_here
AI_MODEL=your-model-id
AI_BASE_URL=https://your-provider.example/v1
AI_PROVIDER_NAME=your-provider-name
```

## Verification

```bash
npm run lint
npm run build
npm run test:smoke
```

`test:smoke`는 Playwright로 핵심 사용자 흐름을 검증합니다.

- Dashboard 로드
- AI Copilot 패널 열기
- Incident 상태 전환
- Job Dry-run/Approve/Execute/Abort
- Report 편집 및 Export
- Deployment Rollback
- Audit Log 확인

## Documents

- 상세 데모 플로우: `DEMO_GUIDE.md`
- 구현 계획/시나리오 설계: `CLAUDE_PLAN.md`
