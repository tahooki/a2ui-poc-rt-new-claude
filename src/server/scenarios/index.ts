import Database from 'better-sqlite3';

import { seed as seedCheckout5xx } from './checkout-5xx';
import { seed as seedBillingBackfill } from './billing-backfill';
import { seed as seedHealthyRollout } from './healthy-rollout';
import { seed as seedIncidentHandover } from './incident-handover';
import { verifyScenario, verifyAllScenarios, printResults, scenarioSpecs } from './verify';

// ─── Scenario Registry ────────────────────────────────────────────────────────

export type ScenarioId =
  | 'checkout-5xx'
  | 'billing-backfill'
  | 'healthy-rollout'
  | 'incident-handover';

interface ScenarioDescriptor {
  id: ScenarioId;
  title: string;
  description: string;
  seed: (db: Database.Database) => void;
}

export const scenarios: Record<ScenarioId, ScenarioDescriptor> = {
  'checkout-5xx': {
    id: 'checkout-5xx',
    title: 'checkout 서비스 5xx 에러 급증 → 롤백',
    description:
      'checkout-service production 5xx 에러율 23.4% 급증. v2.4.1 배포 실패. ' +
      'v2.3.8 롤백 플랜 draft 상태. 인시던트 조사 → 롤백 → 포스트모템 전체 데모 흐름.',
    seed: seedCheckout5xx,
  },
  'billing-backfill': {
    id: 'billing-backfill',
    title: '파트너 Quota 동기화 실패 → Backfill Job',
    description:
      '48시간 quota 동기화 실패. backfill job draft 상태. ' +
      'Dry-run → RM 승인 → 실행 Job 플로우 데모.',
    seed: seedBillingBackfill,
  },
  'healthy-rollout': {
    id: 'healthy-rollout',
    title: 'search 서비스 staging 정상 배포',
    description:
      'search-service v3.1.0 staging 60% rollout 진행 중. ' +
      'risk checks 전부 pass. 인시던트 없음. 정상 상태 데모.',
    seed: seedHealthyRollout,
  },
  'incident-handover': {
    id: 'incident-handover',
    title: 'auth 서비스 장애 mitigated → 핸드오버 + Postmortem',
    description:
      'auth-service JWT 알고리즘 장애 mitigated 완료. ' +
      '핸드오버 + postmortem 보고서 draft 상태. ' +
      '챗봇 지원 보고서 작성 데모.',
    seed: seedIncidentHandover,
  },
};

// ─── Load Functions ───────────────────────────────────────────────────────────

/**
 * 단일 시나리오를 DB에 적재한다.
 * - `INSERT OR IGNORE` 전략을 사용하므로 중복 실행 시 기존 데이터는 유지된다.
 * - 완전 초기화 후 재적재가 필요하면 `resetDatabase()` 후 호출한다.
 *
 * @param scenarioId  적재할 시나리오 ID
 * @param db          better-sqlite3 Database 인스턴스
 */
export function loadScenario(
  scenarioId: ScenarioId | string,
  db: Database.Database,
): void {
  const scenario = scenarios[scenarioId as ScenarioId];
  if (!scenario) {
    throw new Error(
      `알 수 없는 시나리오: "${scenarioId}". 가능한 값: ${Object.keys(scenarios).join(', ')}`,
    );
  }

  console.log(`[scenario] loading "${scenarioId}"...`);

  // 트랜잭션으로 묶어서 원자적으로 적재
  const loadTransaction = db.transaction(() => {
    scenario.seed(db);
  });

  loadTransaction();

  console.log(`[scenario] "${scenarioId}" 적재 완료`);
}

/**
 * 모든 시나리오를 순서대로 DB에 적재한다.
 * 공통 operators/services 는 `INSERT OR IGNORE`로 한 번만 삽입된다.
 */
export function loadAllScenarios(db: Database.Database): void {
  const order: ScenarioId[] = [
    'checkout-5xx',
    'billing-backfill',
    'healthy-rollout',
    'incident-handover',
  ];

  console.log('[scenario] 전체 시나리오 적재 시작...');
  for (const id of order) {
    loadScenario(id, db);
  }
  console.log('[scenario] 전체 시나리오 적재 완료');
}

// ─── Verify re-exports ────────────────────────────────────────────────────────

export { verifyScenario, verifyAllScenarios, printResults, scenarioSpecs };

// ─── Scenario metadata helper ─────────────────────────────────────────────────

export function listScenarios(): Array<{
  id: ScenarioId;
  title: string;
  description: string;
}> {
  return Object.values(scenarios).map(({ id, title, description }) => ({
    id,
    title,
    description,
  }));
}
