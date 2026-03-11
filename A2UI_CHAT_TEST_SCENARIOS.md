# A2UI Chat Test Scenarios

채팅에서 바로 복붙해서 A2UI 렌더링을 확인할 수 있는 질문 목록입니다.

## 사용 방법

- 가능하면 질문에 맞는 페이지에서 테스트합니다.
- `Exact Match` 문구는 질문 리스트 기반 강제 라우팅이 걸립니다.
- `Keyword Match` 문구는 템플릿 키워드 기반 강제 라우팅이 걸립니다.
- 기대 결과는 텍스트 응답이 아니라 A2UI 카드입니다.

## Checkout 5xx

### Deployments Page

Expected card types:
- `rollback_summary`
- `dry_run_stepper`
- `confirm_action`

Exact Match:
- `checkout 배포 리스크를 요약하고 롤백해야 하는지 카드로 보여줘`
- `롤백 dry-run 단계 진행 상황을 stepper로 보여줘`
- `롤백 실행 전에 확인해야 할 체크리스트 카드로 보여줘`

Keyword Match:
- `배포 리스크 카드로 요약해줘`
- `롤백 stepper로 보여줘`
- `dry-run 단계 카드로 보여줘`
- `롤백 체크리스트 카드로 보여줘`

### Incidents Page

Expected card types:
- `evidence_comparison`

Exact Match:
- `현재 인시던트의 로그, 메트릭, trace 증거 비교 카드로 보여줘`

Keyword Match:
- `현재 장애 증거 카드로 보여줘`
- `로그 메트릭 trace 증거 비교 카드로 보여줘`
- `인시던트 증거 비교 카드로 보여줘`

## Billing Backfill

### Jobs Page

Expected card types:
- `job_spec_review`
- `confirm_action`

Exact Match:
- `이 backfill job spec 검토 카드로 보여줘`
- `잡 실행 전에 확인해야 할 체크리스트 카드로 보여줘`

Keyword Match:
- `job spec 검토 카드로 보여줘`
- `backfill 잡 검토 카드로 보여줘`
- `잡 실행 체크리스트 카드로 보여줘`

## Healthy Rollout

### Deployments Page

Expected card types:
- `rollback_summary`
- `confirm_action`

Exact Match:
- `현재 search staging 배포 리스크를 카드로 요약해줘`
- `이 배포를 계속 진행하기 전에 확인해야 할 체크리스트 카드로 보여줘`

Keyword Match:
- `staging 배포 리스크 카드로 보여줘`
- `현재 배포 리스크 카드로 요약해줘`
- `배포 진행 전 체크리스트 카드로 보여줘`

## Incident Handover

### Reports Page

Expected card types:
- `report_template`

Exact Match:
- `postmortem 초안 템플릿 카드로 보여줘`

Keyword Match:
- `보고서 템플릿 카드로 보여줘`
- `handover 템플릿 카드로 보여줘`
- `postmortem 카드로 보여줘`

### Incidents Page

Expected card types:
- `evidence_comparison`
- `confirm_action`

Exact Match:
- `현재 장애 증거를 비교 분석하는 카드로 보여줘`
- `이 인시던트를 닫기 전에 확인해야 할 체크리스트 카드로 보여줘`

Keyword Match:
- `현재 장애 증거 카드로 보여줘`
- `인시던트 종료 체크리스트 카드로 보여줘`
- `증거 비교 카드로 보여줘`

## 빠른 확인용 6개

- `checkout 배포 리스크를 요약하고 롤백해야 하는지 카드로 보여줘`
- `현재 장애 증거 카드로 보여줘`
- `롤백 dry-run 단계 진행 상황을 stepper로 보여줘`
- `이 backfill job spec 검토 카드로 보여줘`
- `잡 실행 전에 확인해야 할 체크리스트 카드로 보여줘`
- `postmortem 초안 템플릿 카드로 보여줘`

## 실패 시 체크

- 현재 페이지가 질문 의도와 맞는지 확인
- 템플릿이 `/templates`에서 활성화되어 있는지 확인
- demo 데이터가 필요한 경우 `npm run test:a2ui` 또는 reset 후 재시도
- Exact Match 문구로 먼저 확인한 뒤 Keyword Match 문구를 테스트
