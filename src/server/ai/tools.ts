import { tool } from 'ai';
import { z } from 'zod';
import {
  getIncident,
  getIncidentEvents,
  getIncidentEvidence,
  getDeployment,
  getDeploymentDiffs,
  getDeploymentRiskChecks,
  getRollbackPlan,
  getRollbackSteps,
  getJobRun,
  getJobRunEvents,
  getAuditLogs,
  getService,
  getAllIncidents,
  getAllDeployments,
  getAllJobRuns,
  getAllJobTemplates,
  getCurrentScenarioId,
} from '@/server/db';

const ACTIVE_INCIDENT_STATUSES = new Set(['open', 'investigating', 'mitigated']);
const DEPLOYMENT_REFERENCE_ALIASES = new Set([
  'latest',
  'latest_deployment',
  'recent',
  'recent_deployment',
  'current',
  'current_deployment',
]);
const INCIDENT_REFERENCE_ALIASES = new Set([
  'latest',
  'latest_incident',
  'recent',
  'recent_incident',
  'active_incident',
  'current',
  'current_incident',
]);
const JOB_REFERENCE_ALIASES = new Set([
  'latest',
  'latest_job',
  'recent',
  'recent_job',
  'current',
  'current_job',
]);

const SCENARIO_DEFAULT_ENTITIES: Record<
  string,
  {
    deploymentId?: string;
    incidentId?: string;
    jobRunId?: string;
  }
> = {
  'checkout-5xx': {
    deploymentId: 'dep_checkout_prod_42',
    incidentId: 'inc_checkout_prod_01',
  },
  'billing-backfill': {
    incidentId: 'inc_billing_prod_07',
    jobRunId: 'job_billing_backfill_01',
  },
  'healthy-rollout': {
    deploymentId: 'dep_search_stg_17',
  },
  'incident-handover': {
    deploymentId: 'dep_auth_prod_38',
    incidentId: 'inc_auth_prod_05',
  },
};

function normalizeReference(value: string) {
  return value.trim().toLowerCase();
}

function getScenarioDefaults() {
  return SCENARIO_DEFAULT_ENTITIES[getCurrentScenarioId()] ?? {};
}

function resolveDeploymentReference(deploymentId: string) {
  const normalized = normalizeReference(deploymentId);
  if (getDeployment(deploymentId)) {
    return deploymentId;
  }
  if (!DEPLOYMENT_REFERENCE_ALIASES.has(normalized)) {
    return deploymentId;
  }

  const scenarioDeploymentId = getScenarioDefaults().deploymentId;
  if (scenarioDeploymentId && getDeployment(scenarioDeploymentId)) {
    return scenarioDeploymentId;
  }

  const activeIncidentLinkedDeploymentId = (
    getAllIncidents() as Array<Record<string, unknown>>
  )
    .find(
      (incident) =>
        ACTIVE_INCIDENT_STATUSES.has(String(incident['status'] ?? '')) &&
        typeof incident['linked_deployment_id'] === 'string' &&
        String(incident['linked_deployment_id']).length > 0 &&
        Boolean(getDeployment(String(incident['linked_deployment_id']))),
    )
    ?.['linked_deployment_id'];

  if (typeof activeIncidentLinkedDeploymentId === 'string') {
    return activeIncidentLinkedDeploymentId;
  }

  const recentDeployments = getAllDeployments() as Array<Record<string, unknown>>;
  const attentionDeployment = recentDeployments.find((deployment) =>
    ['failed', 'rolled_back', 'running', 'pending'].includes(
      String(deployment['status'] ?? ''),
    ),
  );

  return String(attentionDeployment?.['id'] ?? recentDeployments[0]?.['id'] ?? deploymentId);
}

function resolveIncidentReference(incidentId: string) {
  const normalized = normalizeReference(incidentId);
  if (getIncident(incidentId)) {
    return incidentId;
  }
  if (!INCIDENT_REFERENCE_ALIASES.has(normalized)) {
    return incidentId;
  }

  const scenarioIncidentId = getScenarioDefaults().incidentId;
  if (scenarioIncidentId && getIncident(scenarioIncidentId)) {
    return scenarioIncidentId;
  }

  const incidents = getAllIncidents() as Array<Record<string, unknown>>;
  const activeIncident = incidents.find((incident) =>
    ACTIVE_INCIDENT_STATUSES.has(String(incident['status'] ?? '')),
  );

  return String(activeIncident?.['id'] ?? incidents[0]?.['id'] ?? incidentId);
}

function resolveJobRunReference(jobRunId: string) {
  const normalized = normalizeReference(jobRunId);
  if (getJobRun(jobRunId)) {
    return jobRunId;
  }
  if (!JOB_REFERENCE_ALIASES.has(normalized)) {
    return jobRunId;
  }

  const scenarioJobRunId = getScenarioDefaults().jobRunId;
  if (scenarioJobRunId && getJobRun(scenarioJobRunId)) {
    return scenarioJobRunId;
  }

  const jobRuns = getAllJobRuns() as Array<Record<string, unknown>>;
  const activeJobRun = jobRuns.find((jobRun) =>
    ['draft', 'dry_run_ready', 'approved', 'running'].includes(
      String(jobRun['status'] ?? ''),
    ),
  );

  return String(activeJobRun?.['id'] ?? jobRuns[0]?.['id'] ?? jobRunId);
}

// ─── getIncidentDetail ───

export const getIncidentDetail = tool({
  description:
    '특정 인시던트의 상세 정보를 조회합니다. 인시던트 기본 정보, 이벤트 이력(타임라인), 수집된 증거(에러율, 로그, 메트릭, 트레이스 등)를 함께 반환합니다.',
  inputSchema: z.object({
    incidentId: z.string().describe('조회할 인시던트의 ID. latest, active_incident 같은 별칭도 허용'),
  }),
  execute: async ({ incidentId }: { incidentId: string }) => {
    const resolvedIncidentId = resolveIncidentReference(incidentId);
    const incident = getIncident(resolvedIncidentId);
    if (!incident) {
      return { error: `인시던트를 찾을 수 없습니다: ${incidentId}` };
    }
    const events = getIncidentEvents(resolvedIncidentId);
    const evidence = getIncidentEvidence(resolvedIncidentId);

    return {
      resolvedIncidentId,
      incident,
      events,
      evidence: (evidence as Array<Record<string, unknown>>).map((e) => ({
        ...e,
        contentParsed: (() => {
          try {
            return JSON.parse(e['content'] as string);
          } catch {
            return e['content'];
          }
        })(),
      })),
      summary: {
        totalEvents: (events as unknown[]).length,
        totalEvidence: (evidence as unknown[]).length,
        evidenceTypes: [
          ...new Set((evidence as Array<{ type: string }>).map((e) => e.type)),
        ],
      },
    };
  },
});

// ─── getDeploymentDetail ───

export const getDeploymentDetail = tool({
  description:
    '특정 배포의 상세 정보를 조회합니다. 배포 기본 정보, 코드 변경 diff, 위험 체크 결과, 롤백 계획을 함께 반환합니다.',
  inputSchema: z.object({
    deploymentId: z.string().describe('조회할 배포의 ID. latest, recent_deployment 같은 별칭도 허용'),
  }),
  execute: async ({ deploymentId }: { deploymentId: string }) => {
    const resolvedDeploymentId = resolveDeploymentReference(deploymentId);
    const deployment = getDeployment(resolvedDeploymentId);
    if (!deployment) {
      return { error: `배포를 찾을 수 없습니다: ${deploymentId}` };
    }
    const diffs = getDeploymentDiffs(resolvedDeploymentId) as Array<{
      change_type: string;
      additions: number;
      deletions: number;
    }>;
    const riskChecks = getDeploymentRiskChecks(resolvedDeploymentId) as Array<{
      status: string;
    }>;
    const rollbackPlan = getRollbackPlan(resolvedDeploymentId) as
      | Record<string, unknown>
      | undefined;
    const rollbackSteps = rollbackPlan
      ? getRollbackSteps(rollbackPlan['id'] as string)
      : [];

    const riskSummary = {
      pass: riskChecks.filter((r) => r.status === 'pass').length,
      warn: riskChecks.filter((r) => r.status === 'warn').length,
      fail: riskChecks.filter((r) => r.status === 'fail').length,
    };

    return {
      resolvedDeploymentId,
      deployment,
      diffs,
      riskChecks,
      riskSummary,
      rollbackPlan: rollbackPlan
        ? {
            ...rollbackPlan,
            steps: rollbackSteps,
            dryRunResultParsed: rollbackPlan['dry_run_result']
              ? (() => {
                  try {
                    return JSON.parse(rollbackPlan['dry_run_result'] as string);
                  } catch {
                    return rollbackPlan['dry_run_result'];
                  }
                })()
              : null,
          }
        : null,
      changeSummary: {
        totalFiles: diffs.length,
        added: diffs.filter((d) => d.change_type === 'added').length,
        modified: diffs.filter((d) => d.change_type === 'modified').length,
        deleted: diffs.filter((d) => d.change_type === 'deleted').length,
        totalAdditions: diffs.reduce((sum, d) => sum + d.additions, 0),
        totalDeletions: diffs.reduce((sum, d) => sum + d.deletions, 0),
      },
    };
  },
});

// ─── getDeploymentRisks ───

export const getDeploymentRisks = tool({
  description:
    '특정 배포의 위험 체크 결과만 빠르게 조회합니다. 각 체크 항목의 통과/경고/실패 여부와 상세 내용을 반환합니다.',
  inputSchema: z.object({
    deploymentId: z.string().describe('위험 체크를 조회할 배포의 ID. latest, recent_deployment 같은 별칭도 허용'),
  }),
  execute: async ({ deploymentId }: { deploymentId: string }) => {
    const resolvedDeploymentId = resolveDeploymentReference(deploymentId);
    const deployment = getDeployment(resolvedDeploymentId);
    if (!deployment) {
      return { error: `배포를 찾을 수 없습니다: ${deploymentId}` };
    }
    const riskChecks = getDeploymentRiskChecks(resolvedDeploymentId) as Array<{
      status: string;
      check_name: string;
      detail: string;
    }>;

    const grouped = {
      fail: riskChecks.filter((r) => r.status === 'fail'),
      warn: riskChecks.filter((r) => r.status === 'warn'),
      pass: riskChecks.filter((r) => r.status === 'pass'),
    };

    const overallRisk =
      grouped.fail.length > 0
        ? 'HIGH'
        : grouped.warn.length > 2
          ? 'MEDIUM'
          : grouped.warn.length > 0
            ? 'LOW'
            : 'NONE';

    return {
      deploymentId: resolvedDeploymentId,
      requestedDeploymentId: deploymentId,
      deploymentVersion: (deployment as Record<string, unknown>)['version'],
      overallRisk,
      riskChecks,
      grouped,
      summary: {
        total: riskChecks.length,
        pass: grouped.pass.length,
        warn: grouped.warn.length,
        fail: grouped.fail.length,
      },
    };
  },
});

// ─── suggestRollback ───

export const suggestRollback = tool({
  description:
    '배포의 위험도를 종합 분석하여 롤백 권고안을 생성합니다. 실패한 위험 체크, 인시던트 연관성, 현재 배포 상태를 고려하여 롤백 여부와 이유를 분석합니다.',
  inputSchema: z.object({
    deploymentId: z.string().describe('롤백 권고를 분석할 배포의 ID. latest, recent_deployment 같은 별칭도 허용'),
  }),
  execute: async ({ deploymentId }: { deploymentId: string }) => {
    const resolvedDeploymentId = resolveDeploymentReference(deploymentId);
    const deployment = getDeployment(resolvedDeploymentId) as
      | Record<string, unknown>
      | undefined;
    if (!deployment) {
      return { error: `배포를 찾을 수 없습니다: ${deploymentId}` };
    }

    const riskChecks = getDeploymentRiskChecks(resolvedDeploymentId) as Array<{
      status: string;
      check_name: string;
      detail: string;
    }>;
    const diffs = getDeploymentDiffs(resolvedDeploymentId) as Array<{
      change_type: string;
      file_path: string;
      additions: number;
      deletions: number;
    }>;
    const rollbackPlan = getRollbackPlan(resolvedDeploymentId) as
      | Record<string, unknown>
      | undefined;

    const linkedIncidents = (getAllIncidents() as Array<Record<string, unknown>>).filter(
      (i) => i['linked_deployment_id'] === resolvedDeploymentId,
    );

    const failedChecks = riskChecks.filter((r) => r.status === 'fail');
    const warnChecks = riskChecks.filter((r) => r.status === 'warn');

    const rollbackFactors: string[] = [];
    const holdFactors: string[] = [];
    const reasons: string[] = [];

    if (failedChecks.length > 0) {
      rollbackFactors.push(
        `위험 체크 실패 항목 ${failedChecks.length}개: ${failedChecks
          .map((c) => c.check_name)
          .join(', ')}`,
      );
    }
    if (warnChecks.length > 2) {
      rollbackFactors.push(`위험 경고 항목 ${warnChecks.length}개 누적`);
    }
    if (linkedIncidents.length > 0) {
      rollbackFactors.push(
        `연관 인시던트 ${linkedIncidents.length}개 활성화 중`,
      );
    }
    if (deployment['status'] === 'failed') {
      rollbackFactors.push('배포 상태가 이미 실패(failed)');
    }

    const totalChanges = diffs.reduce(
      (sum, d) => sum + d.additions + d.deletions,
      0,
    );
    if (totalChanges < 50 && failedChecks.length === 0) {
      holdFactors.push('변경 규모가 작아 위험도 낮음');
    }
    if (
      deployment['status'] === 'succeeded' &&
      failedChecks.length === 0
    ) {
      holdFactors.push('배포가 성공적으로 완료됨');
    }
    if (rollbackPlan && rollbackPlan['status'] === 'approved') {
      reasons.push('승인된 롤백 계획이 이미 존재하여 즉시 실행 가능');
    }

    const shouldRollback =
      rollbackFactors.length > holdFactors.length || failedChecks.length > 0;
    const urgency =
      failedChecks.length > 0 && linkedIncidents.length > 0
        ? 'IMMEDIATE'
        : failedChecks.length > 0
          ? 'HIGH'
          : warnChecks.length > 2
            ? 'MEDIUM'
            : 'LOW';

    return {
      deploymentId: resolvedDeploymentId,
      requestedDeploymentId: deploymentId,
      recommendation: shouldRollback ? 'ROLLBACK' : 'HOLD',
      urgency,
      reasoning: {
        rollbackFactors,
        holdFactors,
        additionalNotes: reasons,
      },
      deployment: {
        status: deployment['status'],
        version: deployment['version'],
        previousVersion: deployment['previous_version'],
        environment: deployment['environment'],
        rolloutPercent: deployment['rollout_percent'],
      },
      riskSummary: {
        fail: failedChecks.length,
        warn: warnChecks.length,
        pass: riskChecks.filter((r) => r.status === 'pass').length,
        failedCheckNames: failedChecks.map((c) => c.check_name),
      },
      linkedIncidentsCount: linkedIncidents.length,
      rollbackPlanStatus: rollbackPlan ? rollbackPlan['status'] : null,
      nextSteps: shouldRollback
        ? [
            rollbackPlan
              ? '기존 롤백 계획 검토 및 승인 요청'
              : '롤백 계획 생성',
            '롤백 dry-run 실행 (필수)',
            '권한 있는 담당자(release_manager)에게 승인 요청',
            '승인 후 롤백 실행',
            '롤백 완료 후 서비스 상태 모니터링',
          ]
        : [
            '현재 배포 상태 지속 모니터링',
            '경고 항목 원인 파악 및 개선',
            '필요시 추가 위험 분석 수행',
          ],
    };
  },
});

// ─── getJobDetail ───

export const getJobDetail = tool({
  description:
    '특정 잡 실행의 상세 정보를 조회합니다. 잡 실행 기본 정보, 스펙, dry-run 결과, 실행 이벤트 이력을 반환합니다.',
  inputSchema: z.object({
    jobRunId: z.string().describe('조회할 잡 실행의 ID. latest_job, current_job 같은 별칭도 허용'),
  }),
  execute: async ({ jobRunId }: { jobRunId: string }) => {
    const resolvedJobRunId = resolveJobRunReference(jobRunId);
    const jobRun = getJobRun(resolvedJobRunId) as Record<string, unknown> | undefined;
    if (!jobRun) {
      return { error: `잡 실행을 찾을 수 없습니다: ${jobRunId}` };
    }
    const events = getJobRunEvents(resolvedJobRunId);

    return {
      resolvedJobRunId,
      jobRun: {
        ...jobRun,
        specParsed: (() => {
          try {
            return JSON.parse(jobRun['spec'] as string);
          } catch {
            return jobRun['spec'];
          }
        })(),
        dryRunResultParsed: jobRun['dry_run_result']
          ? (() => {
              try {
                return JSON.parse(jobRun['dry_run_result'] as string);
              } catch {
                return jobRun['dry_run_result'];
              }
            })()
          : null,
      },
      events,
      summary: {
        totalEvents: (events as unknown[]).length,
        eventTypes: [
          ...new Set(
            (events as Array<{ type: string }>).map((e) => e.type),
          ),
        ],
        progress: jobRun['progress'],
        currentStatus: jobRun['status'],
        hasDryRun: jobRun['dry_run_result'] !== null,
        isApproved: jobRun['approved_by'] !== null,
      },
    };
  },
});

// ─── getRecentAuditLogs ───

export const getRecentAuditLogs = tool({
  description:
    '최근 감사 로그를 조회합니다. 특정 대상 타입(target_type)과 대상 ID(target_id)로 필터링할 수 있으며, 조회 건수를 지정할 수 있습니다.',
  inputSchema: z.object({
    targetType: z
      .string()
      .optional()
      .describe(
        '필터링할 대상 타입 (예: incident, deployment, job_run, rollback_plan, report)',
      ),
    targetId: z.string().optional().describe('필터링할 대상 ID'),
    limit: z
      .number()
      .min(1)
      .max(200)
      .default(50)
      .describe('조회할 최대 건수 (기본값: 50, 최대: 200)'),
  }),
  execute: async ({
    targetType,
    targetId,
    limit,
  }: {
    targetType?: string;
    targetId?: string;
    limit: number;
  }) => {
    const logs = getAuditLogs({ targetType, targetId, limit });

    const actionTypeCounts: Record<string, number> = {};
    const resultCounts = { success: 0, failure: 0, denied: 0 };

    for (const log of logs as Array<{ action_type: string; result: string }>) {
      actionTypeCounts[log.action_type] =
        (actionTypeCounts[log.action_type] ?? 0) + 1;
      if (log.result === 'success') resultCounts.success++;
      else if (log.result === 'failure') resultCounts.failure++;
      else if (log.result === 'denied') resultCounts.denied++;
    }

    return {
      logs,
      totalCount: (logs as unknown[]).length,
      summary: {
        actionTypeCounts,
        resultCounts,
        hasFailures: resultCounts.failure > 0 || resultCounts.denied > 0,
      },
    };
  },
});

// ─── getServiceStatus ───

export const getServiceStatus = tool({
  description:
    '특정 서비스의 현재 상태를 조회합니다. 서비스 기본 정보, 활성 인시던트, 최근 배포 이력을 함께 반환합니다.',
  inputSchema: z.object({
    serviceId: z.string().describe('조회할 서비스의 ID'),
  }),
  execute: async ({ serviceId }: { serviceId: string }) => {
    const service = getService(serviceId);
    if (!service) {
      return { error: `서비스를 찾을 수 없습니다: ${serviceId}` };
    }

    const activeIncidents = (
      getAllIncidents({ serviceId }) as Array<Record<string, unknown>>
    ).filter(
      (i) => i['status'] !== 'closed' && i['status'] !== 'resolved',
    );

    const recentDeployments = (
      getAllDeployments({ serviceId }) as Array<Record<string, unknown>>
    ).slice(0, 5);

    const latestDeployment = recentDeployments[0];

    const healthStatus = activeIncidents.some(
      (i) => i['severity'] === 'critical',
    )
      ? 'CRITICAL'
      : activeIncidents.some((i) => i['severity'] === 'high')
        ? 'DEGRADED'
        : activeIncidents.length > 0
          ? 'WARNING'
          : latestDeployment?.['status'] === 'failed'
            ? 'DEGRADED'
            : 'HEALTHY';

    return {
      service,
      healthStatus,
      activeIncidents,
      recentDeployments,
      summary: {
        activeIncidentCount: activeIncidents.length,
        criticalIncidents: activeIncidents.filter(
          (i) => i['severity'] === 'critical',
        ).length,
        latestDeploymentStatus: latestDeployment?.['status'] ?? 'none',
        latestDeploymentVersion: latestDeployment?.['version'] ?? null,
      },
    };
  },
});

// ─── analyzeIncident ───

export const analyzeIncident = tool({
  description:
    '인시던트를 종합 분석합니다. 수집된 증거와 이벤트를 기반으로 근본 원인 가설, 심각도 평가, 권고 조치를 구조화된 형태로 반환합니다. AI가 추가 분석을 수행하기 위한 데이터를 수집합니다.',
  inputSchema: z.object({
    incidentId: z.string().describe('분석할 인시던트의 ID. latest_incident, active_incident 같은 별칭도 허용'),
  }),
  execute: async ({ incidentId }: { incidentId: string }) => {
    const resolvedIncidentId = resolveIncidentReference(incidentId);
    const incident = getIncident(resolvedIncidentId) as
      | Record<string, unknown>
      | undefined;
    if (!incident) {
      return { error: `인시던트를 찾을 수 없습니다: ${incidentId}` };
    }

    const events = getIncidentEvents(resolvedIncidentId) as Array<{
      action: string;
      detail: string;
      created_at: string;
      actor_id: string;
    }>;
    const evidence = getIncidentEvidence(resolvedIncidentId) as Array<{
      type: string;
      title: string;
      content: string;
      created_at: string;
    }>;

    const parsedEvidence = evidence.map((e) => ({
      ...e,
      contentParsed: (() => {
        try {
          return JSON.parse(e.content);
        } catch {
          return e.content;
        }
      })(),
    }));

    const errorRateEvidence = parsedEvidence.filter(
      (e) => e.type === 'error_rate',
    );
    const logEvidence = parsedEvidence.filter((e) => e.type === 'log_sample');
    const traceEvidence = parsedEvidence.filter((e) => e.type === 'trace');
    const configDiffEvidence = parsedEvidence.filter(
      (e) => e.type === 'config_diff',
    );
    const metricEvidence = parsedEvidence.filter(
      (e) => e.type === 'metric_chart',
    );

    // events are ordered DESC so last item = first in time, first item = latest
    const firstEvent = events[events.length - 1];
    const lastEvent = events[0];
    const durationMs =
      firstEvent && lastEvent
        ? new Date(lastEvent.created_at).getTime() -
          new Date(firstEvent.created_at).getTime()
        : 0;
    const durationMinutes = Math.round(durationMs / 60000);

    const rootCauseSignals: string[] = [];
    if (configDiffEvidence.length > 0) {
      rootCauseSignals.push(
        '설정 변경 감지됨 - 최근 설정 변경이 원인일 수 있음',
      );
    }
    if (errorRateEvidence.length > 0) {
      rootCauseSignals.push(
        `에러율 이상 감지됨 (${errorRateEvidence.length}개 증거)`,
      );
    }
    if (traceEvidence.length > 0) {
      rootCauseSignals.push(
        `분산 트레이스 이상 감지됨 (${traceEvidence.length}개 증거)`,
      );
    }
    if (incident['linked_deployment_id']) {
      rootCauseSignals.push(
        `연관 배포 존재: ${incident['linked_deployment_id']} - 배포와의 연관성 검토 필요`,
      );
    }

    const severityFactors: string[] = [];
    if (incident['environment'] === 'production') {
      severityFactors.push('프로덕션 환경 - 실제 사용자 영향 있음');
    }
    if (
      incident['severity'] === 'critical' ||
      incident['severity'] === 'high'
    ) {
      severityFactors.push(
        `현재 심각도: ${incident['severity']} - 즉각적인 대응 필요`,
      );
    }
    if (incident['status'] === 'open') {
      severityFactors.push('아직 조사 시작 전 - 즉시 담당자 배정 필요');
    }

    const nextSteps: string[] = [];
    if (!incident['assignee_id']) {
      nextSteps.push('담당자 배정 (현재 미배정 상태)');
    }
    if (incident['linked_deployment_id']) {
      nextSteps.push(
        `연관 배포(${incident['linked_deployment_id']}) 위험 체크 결과 확인`,
      );
      nextSteps.push('배포와의 인과관계 분석 - 롤백 여부 검토');
    }
    if (configDiffEvidence.length > 0) {
      nextSteps.push('설정 변경 내역 상세 검토 - 설정 롤백 가능성 평가');
    }
    if (logEvidence.length > 0) {
      nextSteps.push(
        '로그 샘플 분석 - 에러 패턴 및 스택 트레이스 검토',
      );
    }
    nextSteps.push('모니터링 강화 및 알림 임계값 조정');
    if (incident['status'] === 'investigating') {
      nextSteps.push('완화 조치(mitigation) 적용 후 에러율 변화 관찰');
    }

    return {
      resolvedIncidentId,
      incident,
      analysis: {
        rootCauseHypotheses: rootCauseSignals,
        severityAssessment: {
          currentSeverity: incident['severity'],
          severityFactors,
          severityAppropriate:
            severityFactors.length <= 1
              ? 'LIKELY_APPROPRIATE'
              : 'REVIEW_NEEDED',
        },
        timeline: {
          firstEvent: firstEvent?.created_at ?? (incident['created_at'] as string),
          latestEvent: lastEvent?.created_at ?? (incident['updated_at'] as string),
          durationMinutes,
          totalEvents: events.length,
        },
        evidenceSummary: {
          total: evidence.length,
          byType: {
            error_rate: errorRateEvidence.length,
            log_sample: logEvidence.length,
            metric_chart: metricEvidence.length,
            trace: traceEvidence.length,
            config_diff: configDiffEvidence.length,
          },
          hasConfigChanges: configDiffEvidence.length > 0,
          hasDeploymentLink: Boolean(incident['linked_deployment_id']),
        },
        recommendedNextSteps: nextSteps,
      },
      rawData: {
        events,
        parsedEvidence,
      },
    };
  },
});

// ─── renderRollbackCard ───

export const renderRollbackCard = tool({
  description:
    '배포의 롤백 판단 요약 카드를 렌더링합니다. 배포 정보, 위험 체크 결과, 롤백 계획을 시각화된 A2UI 카드로 반환합니다.',
  inputSchema: z.object({
    deploymentId: z.string().describe('롤백 카드를 렌더링할 배포의 ID. latest, recent_deployment 같은 별칭도 허용'),
  }),
  execute: async ({ deploymentId }: { deploymentId: string }) => {
    const resolvedDeploymentId = resolveDeploymentReference(deploymentId);
    const deployment = getDeployment(resolvedDeploymentId) as Record<string, unknown> | undefined;
    if (!deployment) {
      return { error: `배포를 찾을 수 없습니다: ${deploymentId}` };
    }

    const riskChecks = getDeploymentRiskChecks(resolvedDeploymentId) as Array<Record<string, unknown>>;
    const rollbackPlan = getRollbackPlan(resolvedDeploymentId) as Record<string, unknown> | undefined;

    return {
      type: 'a2ui_render' as const,
      cardType: 'rollback_summary',
      cardData: {
        deployment,
        riskChecks,
        rollbackPlan: rollbackPlan ?? null,
      },
    };
  },
});

// ─── renderEvidenceCard ───

export const renderEvidenceCard = tool({
  description:
    '인시던트의 증거 비교 분석 카드를 렌더링합니다. 인시던트 정보와 수집된 증거를 시각화된 A2UI 카드로 반환합니다.',
  inputSchema: z.object({
    incidentId: z.string().describe('증거 카드를 렌더링할 인시던트의 ID. latest_incident, active_incident 같은 별칭도 허용'),
  }),
  execute: async ({ incidentId }: { incidentId: string }) => {
    const resolvedIncidentId = resolveIncidentReference(incidentId);
    const incident = getIncident(resolvedIncidentId) as Record<string, unknown> | undefined;
    if (!incident) {
      return { error: `인시던트를 찾을 수 없습니다: ${incidentId}` };
    }

    const evidence = getIncidentEvidence(resolvedIncidentId) as Array<Record<string, unknown>>;

    return {
      type: 'a2ui_render' as const,
      cardType: 'evidence_comparison',
      cardData: {
        incident,
        evidence,
      },
    };
  },
});

// ─── renderJobReviewCard ───

export const renderJobReviewCard = tool({
  description:
    '잡 실행의 스펙 검토 카드를 렌더링합니다. Job spec, 템플릿 정보, dry-run 결과를 시각화된 A2UI 카드로 반환합니다.',
  inputSchema: z.object({
    jobRunId: z.string().describe('Job spec 검토 카드를 렌더링할 잡 실행의 ID. latest_job, current_job 같은 별칭도 허용'),
  }),
  execute: async ({ jobRunId }: { jobRunId: string }) => {
    const resolvedJobRunId = resolveJobRunReference(jobRunId);
    const jobRun = getJobRun(resolvedJobRunId) as Record<string, unknown> | undefined;
    if (!jobRun) {
      return { error: `잡 실행을 찾을 수 없습니다: ${jobRunId}` };
    }

    const specParsed = (() => {
      try {
        return JSON.parse(jobRun['spec'] as string);
      } catch {
        return jobRun['spec'];
      }
    })();

    const dryRunResultParsed = jobRun['dry_run_result']
      ? (() => {
          try {
            return JSON.parse(jobRun['dry_run_result'] as string);
          } catch {
            return jobRun['dry_run_result'];
          }
        })()
      : null;

    // Find matching template by template_id
    const templates = getAllJobTemplates() as Array<Record<string, unknown>>;
    const template = templates.find((t) => t['id'] === jobRun['template_id']) ?? null;

    return {
      type: 'a2ui_render' as const,
      cardType: 'job_spec_review',
      cardData: {
        jobRun: {
          ...jobRun,
          specParsed,
          dryRunResultParsed,
        },
        template,
        dryRunResult: dryRunResultParsed,
      },
    };
  },
});

// ─── renderReportTemplateCard ───

export const renderReportTemplateCard = tool({
  description:
    '인시던트 보고서 템플릿 카드를 렌더링합니다. 보고서 유형에 따른 섹션 구성을 시각화된 A2UI 카드로 반환합니다.',
  inputSchema: z.object({
    incidentId: z.string().describe('보고서 대상 인시던트의 ID. latest_incident, active_incident 같은 별칭도 허용'),
    reportType: z
      .enum(['incident_postmortem', 'deployment_review', 'weekly_ops', 'default'])
      .default('incident_postmortem')
      .describe(
        '보고서 유형 (incident_postmortem | deployment_review | weekly_ops | default)',
      ),
  }),
  execute: async ({
    incidentId,
    reportType,
  }: {
    incidentId: string;
    reportType: 'incident_postmortem' | 'deployment_review' | 'weekly_ops' | 'default';
  }) => {
    const resolvedIncidentId = resolveIncidentReference(incidentId);
    const incident = getIncident(resolvedIncidentId) as Record<string, unknown> | undefined;
    if (!incident) {
      return { error: `인시던트를 찾을 수 없습니다: ${incidentId}` };
    }

    return {
      type: 'a2ui_render' as const,
      cardType: 'report_template',
      cardData: {
        incident,
        reportType,
      },
    };
  },
});

// ─── renderDryRunStepperCard ───

export const renderDryRunStepperCard = tool({
  description:
    '배포 롤백의 dry-run 단계별 진행 상황을 시각화한 A2UI 카드를 렌더링합니다. 각 단계의 완료/진행/대기 상태를 스텝퍼 형태로 표시합니다.',
  inputSchema: z.object({
    deploymentId: z.string().describe('dry-run 카드를 렌더링할 배포의 ID. latest, recent_deployment 같은 별칭도 허용'),
  }),
  execute: async ({ deploymentId }: { deploymentId: string }) => {
    const resolvedDeploymentId = resolveDeploymentReference(deploymentId);
    const deployment = getDeployment(resolvedDeploymentId) as Record<string, unknown> | undefined;
    if (!deployment) {
      return { error: `배포를 찾을 수 없습니다: ${deploymentId}` };
    }

    const rollbackPlan = getRollbackPlan(resolvedDeploymentId) as Record<string, unknown> | undefined;
    if (!rollbackPlan) {
      return { error: `롤백 계획을 찾을 수 없습니다: ${deploymentId}` };
    }

    const steps = getRollbackSteps(rollbackPlan['id'] as string) as Array<Record<string, unknown>>;

    return {
      type: 'a2ui_render' as const,
      cardType: 'dry_run_stepper',
      cardData: {
        rollbackPlan,
        steps,
      },
    };
  },
});

// ─── renderConfirmCard ───

export const renderConfirmCard = tool({
  description:
    '위험한 작업(롤백 실행, Job 실행, 인시던트 종료) 전에 최종 확인을 위한 A2UI 카드를 렌더링합니다. 체크리스트와 확인 버튼을 포함합니다.',
  inputSchema: z.object({
    actionType: z.enum(['rollback', 'job_execute', 'incident_close']).describe('확인할 작업 유형'),
    targetId: z.string().describe('작업 대상 ID (배포 ID, Job ID, 또는 인시던트 ID)'),
  }),
  execute: async ({ actionType, targetId }: { actionType: 'rollback' | 'job_execute' | 'incident_close'; targetId: string }) => {
    let entity: Record<string, unknown> = {};
    let checks: Array<{ label: string; required: boolean }> = [];
    const context: Record<string, string> = { targetId, actionType };

    if (actionType === 'rollback') {
      const resolvedTargetId = resolveDeploymentReference(targetId);
      const deployment = getDeployment(resolvedTargetId) as Record<string, unknown> | undefined;
      if (!deployment) {
        return { error: `배포를 찾을 수 없습니다: ${targetId}` };
      }
      const rollbackPlan = getRollbackPlan(resolvedTargetId) as Record<string, unknown> | undefined;
      entity = {
        id: deployment['id'],
        version: deployment['version'],
        service_id: deployment['service_id'],
        environment: deployment['environment'],
        previous_version: deployment['previous_version'],
        plan_status: rollbackPlan?.['status'] ?? '없음',
      };
      checks = [
        { label: 'Dry-run이 성공적으로 완료됨', required: true },
        { label: 'Release Manager 승인 획득', required: true },
        { label: '서비스 모니터링 대시보드 확인', required: true },
        { label: '롤백 후 검증 계획 수립', required: false },
        { label: '관련 팀에 롤백 사전 공지', required: false },
      ];
      context.deploymentId = resolvedTargetId;
      context.planId = String(rollbackPlan?.['id'] ?? '');
    } else if (actionType === 'job_execute') {
      const resolvedTargetId = resolveJobRunReference(targetId);
      const jobRun = getJobRun(resolvedTargetId) as Record<string, unknown> | undefined;
      if (!jobRun) {
        return { error: `Job 실행을 찾을 수 없습니다: ${targetId}` };
      }
      entity = {
        id: jobRun['id'],
        template_id: jobRun['template_id'],
        status: jobRun['status'],
        environment: jobRun['environment'] ?? 'production',
      };
      checks = [
        { label: 'Dry-run 결과 확인 완료', required: true },
        { label: 'Job spec 파라미터 검증', required: true },
        { label: '프로덕션 환경 승인 획득', required: true },
        { label: '실행 중 모니터링 담당자 지정', required: false },
      ];
      context.jobRunId = resolvedTargetId;
    } else {
      const resolvedTargetId = resolveIncidentReference(targetId);
      const incident = getIncident(resolvedTargetId) as Record<string, unknown> | undefined;
      if (!incident) {
        return { error: `인시던트를 찾을 수 없습니다: ${targetId}` };
      }
      entity = {
        id: incident['id'],
        title: incident['title'],
        severity: incident['severity'],
        service_id: incident['service_id'],
        status: incident['status'],
      };
      checks = [
        { label: '근본 원인이 식별되고 문서화됨', required: true },
        { label: '영향받은 서비스 정상 복구 확인', required: true },
        { label: '재발 방지 조치 계획 수립', required: true },
        { label: '포스트모템 보고서 작성', required: false },
        { label: '관련 팀 사후 공유', required: false },
      ];
      context.incidentId = resolvedTargetId;
    }

    return {
      type: 'a2ui_render' as const,
      cardType: 'confirm_action',
      cardData: {
        actionType,
        entity,
        checks,
        context,
      },
    };
  },
});

// ─── Exported tools object ───

export const aiTools = {
  getIncidentDetail,
  getDeploymentDetail,
  getDeploymentRisks,
  suggestRollback,
  getJobDetail,
  getRecentAuditLogs,
  getServiceStatus,
  analyzeIncident,
  renderRollbackCard,
  renderEvidenceCard,
  renderDryRunStepperCard,
  renderConfirmCard,
  renderJobReviewCard,
  renderReportTemplateCard,
};
