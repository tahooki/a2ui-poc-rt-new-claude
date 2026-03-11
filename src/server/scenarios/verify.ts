import Database from 'better-sqlite3';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScenarioSpec {
  id: string;
  description: string;
  expectedEntities: {
    incidents?: string[];
    deployments?: string[];
    rollbackPlans?: string[];
    jobRuns?: string[];
    jobTemplates?: string[];
    reports?: string[];
    services?: string[];
    operators?: string[];
  };
  expectedStates: {
    [entityId: string]: {
      table: string;
      field: string;
      value: string | number;
    };
  };
  expectedCounts: {
    incidents?: number;
    activeIncidents?: number;          // status IN (open, investigating)
    deployments?: number;
    jobTemplates?: number;
    jobRuns?: number;
    reports?: number;
    reportSections?: { reportId: string; min: number };
    reportActionItems?: { reportId: string; min: number };
    rollbackSteps?: { planId: string; min: number };
    minAuditLogs?: number;
    minIncidentEvents?: { incidentId: string; min: number };
    minEvidence?: { incidentId: string; min: number };
    allPassRiskChecks?: string;        // deploymentId: 전부 pass 여부 확인
    noFailRiskChecks?: string;         // deploymentId: fail 없음 확인
  };
}

interface VerifyResult {
  scenarioId: string;
  passed: boolean;
  checks: CheckResult[];
  summary: string;
}

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

// ─── Scenario Definitions ─────────────────────────────────────────────────────

const scenarioSpecs: Record<string, ScenarioSpec> = {
  'checkout-5xx': {
    id: 'checkout-5xx',
    description: 'checkout 서비스 5xx 에러 급증, v2.4.1 실패 배포, v2.3.8 롤백 준비',
    expectedEntities: {
      operators: [
        'op_jungsoo_kim',
        'op_minji_lee',
        'op_seungho_park',
        'op_yuna_choi',
      ],
      services: ['svc_checkout'],
      incidents: ['inc_checkout_prod_01'],
      deployments: ['dep_checkout_prod_42', 'dep_checkout_prod_41'],
      rollbackPlans: ['rbp_checkout_42_01'],
    },
    expectedStates: {
      inc_checkout_prod_01: {
        table: 'incidents',
        field: 'status',
        value: 'investigating',
      },
      dep_checkout_prod_42: {
        table: 'deployments',
        field: 'status',
        value: 'failed',
      },
      rbp_checkout_42_01: {
        table: 'rollback_plans',
        field: 'status',
        value: 'draft',
      },
      dep_checkout_prod_41: {
        table: 'deployments',
        field: 'status',
        value: 'succeeded',
      },
    },
    expectedCounts: {
      activeIncidents: 1,
      minAuditLogs: 6,
      minIncidentEvents: { incidentId: 'inc_checkout_prod_01', min: 5 },
      minEvidence: { incidentId: 'inc_checkout_prod_01', min: 4 },
      rollbackSteps: { planId: 'rbp_checkout_42_01', min: 5 },
    },
  },

  'billing-backfill': {
    id: 'billing-backfill',
    description: '파트너 quota 동기화 실패, backfill job draft 상태',
    expectedEntities: {
      operators: ['op_seungho_park', 'op_minji_lee'],
      services: ['svc_billing'],
      incidents: ['inc_billing_prod_07'],
      jobTemplates: ['jt_billing_quota_backfill'],
      jobRuns: ['job_billing_backfill_01'],
    },
    expectedStates: {
      inc_billing_prod_07: {
        table: 'incidents',
        field: 'status',
        value: 'investigating',
      },
      job_billing_backfill_01: {
        table: 'job_runs',
        field: 'status',
        value: 'draft',
      },
    },
    expectedCounts: {
      jobTemplates: 3,
      minAuditLogs: 2,
      minIncidentEvents: { incidentId: 'inc_billing_prod_07', min: 3 },
    },
  },

  'healthy-rollout': {
    id: 'healthy-rollout',
    description: 'staging search 서비스 v3.1.0 정상 배포, 인시던트 없음',
    expectedEntities: {
      services: ['svc_search'],
      deployments: ['dep_search_stg_17', 'dep_search_stg_16'],
    },
    expectedStates: {
      dep_search_stg_17: {
        table: 'deployments',
        field: 'status',
        value: 'running',
      },
      dep_search_stg_16: {
        table: 'deployments',
        field: 'status',
        value: 'succeeded',
      },
    },
    expectedCounts: {
      activeIncidents: 0,
      minAuditLogs: 2,
      allPassRiskChecks: 'dep_search_stg_17',
    },
  },

  'incident-handover': {
    id: 'incident-handover',
    description: 'auth 서비스 장애 mitigated, 핸드오버+postmortem 보고서 draft',
    expectedEntities: {
      services: ['svc_auth'],
      incidents: ['inc_auth_prod_05'],
      deployments: ['dep_auth_prod_38'],
      rollbackPlans: ['rbp_auth_38_01'],
      reports: ['rep_auth_05_handover', 'rep_auth_05_postmortem'],
    },
    expectedStates: {
      inc_auth_prod_05: {
        table: 'incidents',
        field: 'status',
        value: 'mitigated',
      },
      dep_auth_prod_38: {
        table: 'deployments',
        field: 'status',
        value: 'rolled_back',
      },
      rbp_auth_38_01: {
        table: 'rollback_plans',
        field: 'status',
        value: 'executed',
      },
      rep_auth_05_handover: {
        table: 'reports',
        field: 'status',
        value: 'draft',
      },
      rep_auth_05_postmortem: {
        table: 'reports',
        field: 'status',
        value: 'draft',
      },
    },
    expectedCounts: {
      reports: 2,
      reportSections: { reportId: 'rep_auth_05_handover', min: 3 },
      reportActionItems: { reportId: 'rep_auth_05_handover', min: 4 },
      rollbackSteps: { planId: 'rbp_auth_38_01', min: 3 },
      minAuditLogs: 7,
      minIncidentEvents: { incidentId: 'inc_auth_prod_05', min: 7 },
      minEvidence: { incidentId: 'inc_auth_prod_05', min: 2 },
    },
  },
};

// ─── Core verify function ─────────────────────────────────────────────────────

/**
 * 특정 시나리오의 DB 상태를 검증한다.
 * @param scenarioId  'checkout-5xx' | 'billing-backfill' | 'healthy-rollout' | 'incident-handover'
 * @param db          better-sqlite3 Database 인스턴스
 * @returns           VerifyResult (passed, 개별 check 목록, 요약 메시지)
 */
export function verifyScenario(
  scenarioId: string,
  db: Database.Database,
): VerifyResult {
  const spec = scenarioSpecs[scenarioId];
  if (!spec) {
    return {
      scenarioId,
      passed: false,
      checks: [],
      summary: `알 수 없는 시나리오: "${scenarioId}". 가능한 값: ${Object.keys(scenarioSpecs).join(', ')}`,
    };
  }

  const checks: CheckResult[] = [];

  // ── 1. 엔티티 존재 확인 ──────────────────────────────────────────────────

  const tableMap: Record<string, string> = {
    operators: 'operators',
    services: 'services',
    incidents: 'incidents',
    deployments: 'deployments',
    rollbackPlans: 'rollback_plans',
    jobRuns: 'job_runs',
    jobTemplates: 'job_templates',
    reports: 'reports',
  };

  for (const [entityKey, ids] of Object.entries(spec.expectedEntities)) {
    if (!ids) continue;
    const tableName = tableMap[entityKey];
    for (const id of ids) {
      const row = db.prepare(`SELECT id FROM ${tableName} WHERE id = ?`).get(id);
      checks.push({
        name: `엔티티 존재: ${tableName}.${id}`,
        passed: row !== undefined,
        detail: row !== undefined
          ? `${tableName}에서 id="${id}" 확인됨`
          : `${tableName}에서 id="${id}" 를 찾을 수 없음`,
      });
    }
  }

  // ── 2. 상태(필드) 검증 ───────────────────────────────────────────────────

  for (const [entityId, expectation] of Object.entries(spec.expectedStates)) {
    const row = db
      .prepare(`SELECT ${expectation.field} FROM ${expectation.table} WHERE id = ?`)
      .get(entityId) as Record<string, string | number> | undefined;

    const actual = row ? row[expectation.field] : undefined;
    const passed = actual === expectation.value;
    checks.push({
      name: `상태 확인: ${expectation.table}.${entityId}.${expectation.field}`,
      passed,
      detail: passed
        ? `기대값 "${expectation.value}" 일치`
        : `기대값 "${expectation.value}" ≠ 실제값 "${actual}"`,
    });
  }

  // ── 3. 카운트 검증 ───────────────────────────────────────────────────────

  const counts = spec.expectedCounts;

  if (counts.incidents !== undefined) {
    const actual = (
      db.prepare('SELECT COUNT(*) as c FROM incidents').get() as { c: number }
    ).c;
    const passed = actual === counts.incidents;
    checks.push({
      name: '인시던트 총 건수',
      passed,
      detail: `기대: ${counts.incidents}, 실제: ${actual}`,
    });
  }

  if (counts.activeIncidents !== undefined) {
    // Scope to services belonging to this scenario
    const scenarioServices = spec.expectedEntities.services ?? [];
    let actual: number;
    if (scenarioServices.length > 0) {
      const placeholders = scenarioServices.map(() => '?').join(',');
      actual = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM incidents WHERE status IN ('open','investigating') AND service_id IN (${placeholders})`,
          )
          .get(...scenarioServices) as { c: number }
      ).c;
    } else {
      actual = (
        db
          .prepare(
            "SELECT COUNT(*) as c FROM incidents WHERE status IN ('open','investigating')",
          )
          .get() as { c: number }
      ).c;
    }
    const passed = actual === counts.activeIncidents;
    checks.push({
      name: '활성 인시던트 건수 (open/investigating)',
      passed,
      detail: `기대: ${counts.activeIncidents}, 실제: ${actual}${scenarioServices.length > 0 ? ` (서비스: ${scenarioServices.join(', ')})` : ''}`,
    });
  }

  if (counts.deployments !== undefined) {
    const actual = (
      db.prepare('SELECT COUNT(*) as c FROM deployments').get() as { c: number }
    ).c;
    const passed = actual === counts.deployments;
    checks.push({
      name: '배포 총 건수',
      passed,
      detail: `기대: ${counts.deployments}, 실제: ${actual}`,
    });
  }

  if (counts.jobTemplates !== undefined) {
    const actual = (
      db.prepare('SELECT COUNT(*) as c FROM job_templates').get() as { c: number }
    ).c;
    const passed = actual === counts.jobTemplates;
    checks.push({
      name: 'Job 템플릿 총 건수',
      passed,
      detail: `기대: ${counts.jobTemplates}, 실제: ${actual}`,
    });
  }

  if (counts.jobRuns !== undefined) {
    const actual = (
      db.prepare('SELECT COUNT(*) as c FROM job_runs').get() as { c: number }
    ).c;
    const passed = actual === counts.jobRuns;
    checks.push({
      name: 'Job Run 총 건수',
      passed,
      detail: `기대: ${counts.jobRuns}, 실제: ${actual}`,
    });
  }

  if (counts.reports !== undefined) {
    const actual = (
      db.prepare('SELECT COUNT(*) as c FROM reports').get() as { c: number }
    ).c;
    const passed = actual === counts.reports;
    checks.push({
      name: '보고서 총 건수',
      passed,
      detail: `기대: ${counts.reports}, 실제: ${actual}`,
    });
  }

  if (counts.minAuditLogs !== undefined) {
    const actual = (
      db.prepare('SELECT COUNT(*) as c FROM audit_logs').get() as { c: number }
    ).c;
    const passed = actual >= counts.minAuditLogs;
    checks.push({
      name: '감사 로그 최소 건수',
      passed,
      detail: `기대: ≥${counts.minAuditLogs}, 실제: ${actual}`,
    });
  }

  if (counts.minIncidentEvents) {
    const { incidentId, min } = counts.minIncidentEvents;
    const actual = (
      db
        .prepare('SELECT COUNT(*) as c FROM incident_events WHERE incident_id = ?')
        .get(incidentId) as { c: number }
    ).c;
    const passed = actual >= min;
    checks.push({
      name: `인시던트 이벤트 최소 건수 (${incidentId})`,
      passed,
      detail: `기대: ≥${min}, 실제: ${actual}`,
    });
  }

  if (counts.minEvidence) {
    const { incidentId, min } = counts.minEvidence;
    const actual = (
      db
        .prepare(
          'SELECT COUNT(*) as c FROM incident_evidence WHERE incident_id = ?',
        )
        .get(incidentId) as { c: number }
    ).c;
    const passed = actual >= min;
    checks.push({
      name: `인시던트 Evidence 최소 건수 (${incidentId})`,
      passed,
      detail: `기대: ≥${min}, 실제: ${actual}`,
    });
  }

  if (counts.reportSections) {
    const { reportId, min } = counts.reportSections;
    const actual = (
      db
        .prepare('SELECT COUNT(*) as c FROM report_sections WHERE report_id = ?')
        .get(reportId) as { c: number }
    ).c;
    const passed = actual >= min;
    checks.push({
      name: `보고서 섹션 최소 건수 (${reportId})`,
      passed,
      detail: `기대: ≥${min}, 실제: ${actual}`,
    });
  }

  if (counts.reportActionItems) {
    const { reportId, min } = counts.reportActionItems;
    const actual = (
      db
        .prepare(
          'SELECT COUNT(*) as c FROM report_action_items WHERE report_id = ?',
        )
        .get(reportId) as { c: number }
    ).c;
    const passed = actual >= min;
    checks.push({
      name: `보고서 Action Items 최소 건수 (${reportId})`,
      passed,
      detail: `기대: ≥${min}, 실제: ${actual}`,
    });
  }

  if (counts.rollbackSteps) {
    const { planId, min } = counts.rollbackSteps;
    const actual = (
      db
        .prepare(
          'SELECT COUNT(*) as c FROM rollback_steps WHERE rollback_plan_id = ?',
        )
        .get(planId) as { c: number }
    ).c;
    const passed = actual >= min;
    checks.push({
      name: `롤백 Step 최소 건수 (${planId})`,
      passed,
      detail: `기대: ≥${min}, 실제: ${actual}`,
    });
  }

  if (counts.allPassRiskChecks) {
    const deploymentId = counts.allPassRiskChecks;
    const total = (
      db
        .prepare(
          'SELECT COUNT(*) as c FROM deployment_risk_checks WHERE deployment_id = ?',
        )
        .get(deploymentId) as { c: number }
    ).c;
    const passed_count = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM deployment_risk_checks WHERE deployment_id = ? AND status = 'pass'",
        )
        .get(deploymentId) as { c: number }
    ).c;
    const passed = total > 0 && total === passed_count;
    checks.push({
      name: `Risk Checks 전체 pass (${deploymentId})`,
      passed,
      detail: `전체 ${total}건 중 pass ${passed_count}건`,
    });
  }

  if (counts.noFailRiskChecks) {
    const deploymentId = counts.noFailRiskChecks;
    const fail_count = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM deployment_risk_checks WHERE deployment_id = ? AND status = 'fail'",
        )
        .get(deploymentId) as { c: number }
    ).c;
    const passed = fail_count === 0;
    checks.push({
      name: `Risk Checks fail 없음 (${deploymentId})`,
      passed,
      detail: `fail 건수: ${fail_count}`,
    });
  }

  // ── 결과 집계 ────────────────────────────────────────────────────────────

  const totalChecks = checks.length;
  const passedChecks = checks.filter((c) => c.passed).length;
  const allPassed = totalChecks > 0 && passedChecks === totalChecks;

  return {
    scenarioId,
    passed: allPassed,
    checks,
    summary: `[${scenarioId}] ${allPassed ? '✓ 전체 통과' : '✗ 실패 있음'} — ${passedChecks}/${totalChecks} 통과`,
  };
}

/**
 * 모든 시나리오를 한번에 검증한다.
 */
export function verifyAllScenarios(db: Database.Database): VerifyResult[] {
  return Object.keys(scenarioSpecs).map((id) => verifyScenario(id, db));
}

/**
 * CLI 실행 시 결과를 콘솔에 출력한다.
 * 사용: npx ts-node scenarios/verify.ts [scenarioId]
 */
export function printResults(results: VerifyResult[]): void {
  for (const result of results) {
    console.log('\n' + '─'.repeat(60));
    console.log(result.summary);
    console.log('─'.repeat(60));
    for (const check of result.checks) {
      const icon = check.passed ? '  ✓' : '  ✗';
      console.log(`${icon}  ${check.name}`);
      if (!check.passed) {
        console.log(`     └─ ${check.detail}`);
      }
    }
  }

  const allPassed = results.every((r) => r.passed);
  const passedScenarios = results.filter((r) => r.passed).length;
  console.log('\n' + '═'.repeat(60));
  console.log(
    `최종: ${allPassed ? '전체 통과' : '실패 있음'} — ${passedScenarios}/${results.length} 시나리오 통과`,
  );
  console.log('═'.repeat(60) + '\n');

  if (!allPassed) {
    process.exit(1);
  }
}

// ─── Scenario spec export (index.ts 등에서 활용 가능) ─────────────────────────

export { scenarioSpecs };
export type { ScenarioSpec, VerifyResult, CheckResult };
