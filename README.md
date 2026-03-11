# DevOps Ops Console

Next.js 기반의 데모용 운영 콘솔입니다. 인시던트 대응, 배포 확인, 롤백 실행, 잡 실행, 보고서 작성, AI Copilot 흐름을 시나리오 데이터로 검증할 수 있습니다.

## Quick Start

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 을 열면 `/dashboard`로 진입합니다.

## Scenario Data

개발 서버가 실행 중인 상태에서 별도 터미널로 시나리오 데이터를 로드합니다.

```bash
npm run scenario:reset
npm run scenario:load -- --all
npm run scenario:verify -- --all
```

`scenario-cli`는 기본적으로 `http://127.0.0.1:3000/api/admin`을 사용합니다. 다른 포트를 쓰면 `BASE_URL`을 지정하세요.

```bash
BASE_URL=http://127.0.0.1:3001 npm run scenario:load -- --all
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
