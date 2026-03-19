import {
  getA2UIDataSourceOverrides,
  getAllIncidents,
  getAllDeployments,
  getAllDeploymentRequests,
  getAllJobTemplates,
  getDeployment,
  getDeploymentDiffs,
  getDeploymentRiskChecks,
  getAuditLogs,
  getIncident,
  getIncidentEvents,
  getIncidentEvidence,
  getJobRun,
  getJobRunEvents,
  getLatestDeploymentRequestForBaseline,
  getService,
  getRollbackPlan,
  getRollbackSteps,
  getOperator,
} from "@/server/db";
import type { DataSourceDef } from "./source-types";

function parseJsonString(value: unknown) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const ACTIVE_INCIDENT_STATUSES = new Set(["open", "investigating", "mitigated"]);

function asText(value: unknown, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : fallback;
}

function toTimestamp(value: unknown) {
  const text = asText(value, "");
  if (!text) {
    return 0;
  }

  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function summarizeChecks(checks: Array<Record<string, unknown>>) {
  const failed = checks
    .filter((check) => String(check["status"] ?? "") === "fail")
    .map((check) => asText(check["check_name"], "검사"));
  const warned = checks
    .filter((check) => String(check["status"] ?? "") === "warn")
    .map((check) => asText(check["check_name"], "검사"));

  return {
    failed,
    warned,
    summary:
      failed.length > 0
        ? `실패 ${failed.length}개: ${failed.slice(0, 2).join(", ")}`
        : warned.length > 0
          ? `경고 ${warned.length}개: ${warned.slice(0, 2).join(", ")}`
          : "위험 체크 모두 통과",
  };
}

function getActiveIncidentContext(serviceId: string) {
  const incidents = (getAllIncidents({ serviceId }) as Array<Record<string, unknown>>).filter(
    (incident) => ACTIVE_INCIDENT_STATUSES.has(String(incident["status"] ?? "")),
  );

  const environment = asText(incidents[0]?.["environment"], "");
  return {
    count: incidents.length,
    environment,
    incidents,
  };
}

function calculateRollbackCandidateScore(input: {
  deployment: Record<string, unknown>;
  activeIncidentEnvironment: string;
  activeIncidentCount: number;
  planStatus: string;
}) {
  const status = asText(input.deployment["status"], "");
  const previousVersion = asText(input.deployment["previous_version"], "");
  const environment = asText(input.deployment["environment"], "");
  const createdAt = toTimestamp(input.deployment["created_at"]);

  let score = 0;
  if (status === "failed") score += 500;
  else if (status === "running") score += 400;
  else if (status === "pending") score += 300;
  else if (status === "succeeded") score += 200;
  else if (status === "rolled_back") score -= 1000;

  if (previousVersion) score += 120;
  if (input.activeIncidentEnvironment && environment === input.activeIncidentEnvironment) score += 80;
  if (input.activeIncidentCount > 0) score += 30;
  if (input.planStatus === "approved") score += 40;
  else if (input.planStatus === "draft") score -= 10;

  if (createdAt > 0) {
    score += Math.max(0, 120 - Math.min(120, Math.floor((Date.now() - createdAt) / 86400000)));
  }

  return score;
}

function buildRollbackCandidate(
  deployment: Record<string, unknown>,
  options: {
    serviceName: string;
    activeIncidentEnvironment: string;
    activeIncidentCount: number;
    anchorDeploymentId: string;
    anchorPreviousVersion: string;
  },
) {
  const deploymentId = asText(deployment["id"], "");
  const serviceId = asText(deployment["service_id"], "");
  const environment = asText(deployment["environment"], "");
  const version = asText(deployment["version"], "");
  const previousVersion = asText(deployment["previous_version"], "");
  const rollbackPlan = getRollbackPlan(deploymentId) as Record<string, unknown> | undefined;
  const riskChecks = getDeploymentRiskChecks(deploymentId) as Array<Record<string, unknown>>;
  const { failed, warned, summary } = summarizeChecks(riskChecks);
  const planStatus = asText(rollbackPlan?.["status"], "");
  const hasPreviousVersion = previousVersion.length > 0;
  const isAlreadyRolledBack = asText(deployment["status"], "") === "rolled_back";
  const isPrimaryTarget = deploymentId === options.anchorDeploymentId;
  const isDirectRecoveryTarget = version === options.anchorPreviousVersion;
  const rollbackable = isPrimaryTarget && hasPreviousVersion && !isAlreadyRolledBack;

  const signals: string[] = [];
  if (options.activeIncidentCount > 0 && options.activeIncidentEnvironment === environment) {
    signals.push(`활성 인시던트 환경 일치`);
  } else if (options.activeIncidentCount > 0) {
    signals.push(`활성 인시던트 ${options.activeIncidentCount}건`);
  }
  if (failed.length > 0) {
    signals.push(`실패 체크 ${failed.slice(0, 2).join(", ")}`);
  } else if (warned.length > 0) {
    signals.push(`경고 체크 ${warned.slice(0, 2).join(", ")}`);
  } else {
    signals.push("위험 체크 통과");
  }
  if (planStatus) {
    signals.push(`롤백 계획 ${planStatus}`);
  }
  if (!hasPreviousVersion) {
    signals.push("이전 버전 없음");
  }
  if (isAlreadyRolledBack) {
    signals.push("이미 롤백됨");
  }

  const candidateRole = isPrimaryTarget
    ? "current_target"
    : isDirectRecoveryTarget
      ? "recovery_target"
      : "history";

  return {
    id: deploymentId,
    deployment_id: deploymentId,
    service_id: serviceId,
    service: options.serviceName,
    service_name: options.serviceName,
    environment,
    env: environment,
    version,
    current_version: version,
    previous_version: previousVersion,
    previousVersion,
    status: asText(deployment["status"], ""),
    candidate_role: candidateRole,
    primary_candidate: isPrimaryTarget,
    available: rollbackable,
    rollbackable,
    plan_id: rollbackPlan?.["id"] ?? null,
    rollback_plan_id: rollbackPlan?.["id"] ?? null,
    plan_status: planStatus || null,
    recentSignals: signals,
    signalSummary: signals.join(" · "),
    deployed_at: asText(deployment["updated_at"], asText(deployment["created_at"], "")),
    created_at: asText(deployment["created_at"], ""),
    updated_at: asText(deployment["updated_at"], ""),
    rankScore: calculateRollbackCandidateScore({
      deployment,
      activeIncidentEnvironment: options.activeIncidentEnvironment,
      activeIncidentCount: options.activeIncidentCount,
      planStatus,
    }),
    riskSummary: summary,
  };
}

function getRollbackCandidatesForDeployment(deploymentId: string) {
  const deployment = getDeployment(deploymentId) as Record<string, unknown> | undefined;
  if (!deployment) {
    return [];
  }

  const serviceId = asText(deployment["service_id"], "");
  const service = getService(serviceId) as Record<string, unknown> | undefined;
  const serviceName = asText(service?.["name"], serviceId);
  const activeIncidentContext = getActiveIncidentContext(serviceId);
  const anchorPreviousVersion = asText(deployment["previous_version"], "");
  const deployments = (getAllDeployments({ serviceId }) as Array<Record<string, unknown>>)
    .slice(0, 12)
    .map((item) =>
      buildRollbackCandidate(item, {
        serviceName,
        activeIncidentEnvironment: activeIncidentContext.environment,
        activeIncidentCount: activeIncidentContext.count,
        anchorDeploymentId: deploymentId,
        anchorPreviousVersion,
      }),
    )
    .sort((left, right) => {
      const leftPrimary = left.primary_candidate ? 1 : 0;
      const rightPrimary = right.primary_candidate ? 1 : 0;
      if (rightPrimary !== leftPrimary) {
        return rightPrimary - leftPrimary;
      }
      const leftRecovery = left.candidate_role === "recovery_target" ? 1 : 0;
      const rightRecovery = right.candidate_role === "recovery_target" ? 1 : 0;
      if (rightRecovery !== leftRecovery) {
        return rightRecovery - leftRecovery;
      }
      if (right.rankScore !== left.rankScore) {
        return right.rankScore - left.rankScore;
      }
      return toTimestamp(right.created_at) - toTimestamp(left.created_at);
    });

  return deployments.slice(0, 4);
}

function summarizeChangeCounts(deploymentId: string) {
  const diffs = getDeploymentDiffs(deploymentId) as Array<Record<string, unknown>>;
  return {
    totalFiles: diffs.length,
    additions: diffs.reduce((sum, diff) => sum + Number(diff["additions"] ?? 0), 0),
    deletions: diffs.reduce((sum, diff) => sum + Number(diff["deletions"] ?? 0), 0),
  };
}

function getQuickDeployBaseline(input: { deploymentId: string; actorId: string }) {
  const deployment = getDeployment(input.deploymentId) as Record<string, unknown> | undefined;
  if (!deployment) {
    return null;
  }

  const serviceId = asText(deployment["service_id"], "");
  const service = getService(serviceId) as Record<string, unknown> | undefined;
  const operator = getOperator(input.actorId) as Record<string, unknown> | undefined;
  const riskChecks = getDeploymentRiskChecks(input.deploymentId) as Array<Record<string, unknown>>;
  const { summary, failed, warned } = summarizeChecks(riskChecks);
  const recentSuccessful = (getAllDeployments({
    serviceId,
    environment: asText(deployment["environment"], ""),
    status: "succeeded",
  }) as Array<Record<string, unknown>>)[0];
  const latestRequest = getLatestDeploymentRequestForBaseline(input.deploymentId) as
    | Record<string, unknown>
    | undefined;

  return {
    baseline_deployment_id: input.deploymentId,
    service_id: serviceId,
    service_name: asText(service?.["name"], serviceId),
    environment: asText(deployment["environment"], ""),
    baseline_version: asText(deployment["version"], ""),
    previous_version: asText(deployment["previous_version"], ""),
    baseline_status: asText(deployment["status"], ""),
    suggested_strategy: "canary 10 -> 50 -> 100",
    recent_risk_summary: summary,
    riskSummary: {
      pass: riskChecks.filter((item) => String(item["status"] ?? "") === "pass").length,
      warn: warned.length,
      fail: failed.length,
    },
    last_successful_deployed_at: asText(
      recentSuccessful?.["updated_at"],
      asText(recentSuccessful?.["created_at"], ""),
    ),
    requested_by: asText(operator?.["name"], asText(operator?.["id"], input.actorId)),
    latest_request_status: asText(latestRequest?.["status"], ""),
    latest_request_id: asText(latestRequest?.["id"], ""),
    approvalRequired: warned.length > 0 || failed.length > 0,
    canImmediateStart:
      ["release_manager", "ops_engineer"].includes(asText(operator?.["role"], "")) &&
      asText(deployment["status"], "") === "succeeded" &&
      failed.length === 0,
  };
}

function getDeploymentApprovalQueue(input: { actorId: string; actorRole: string }) {
  if (!["release_manager", "ops_engineer"].includes(input.actorRole)) {
    return [];
  }

  const requests = getAllDeploymentRequests({
    status: "approval_requested",
    limit: 4,
  }) as Array<Record<string, unknown>>;

  return requests.map((request) => {
    const baselineDeploymentId = asText(request["baseline_deployment_id"], "");
    const deployment = getDeployment(baselineDeploymentId) as Record<string, unknown> | undefined;
    const serviceId = asText(request["service_id"], asText(deployment?.["service_id"], ""));
    const service = getService(serviceId) as Record<string, unknown> | undefined;
    const requester = getOperator(asText(request["requested_by"], "")) as Record<string, unknown> | undefined;
    const riskChecks = baselineDeploymentId
      ? (getDeploymentRiskChecks(baselineDeploymentId) as Array<Record<string, unknown>>)
      : [];
    const { failed, warned, summary } = summarizeChecks(riskChecks);
    const changeCounts = baselineDeploymentId
      ? summarizeChangeCounts(baselineDeploymentId)
      : { totalFiles: 0, additions: 0, deletions: 0 };

    const recentRollback = (getAllDeployments({
      serviceId,
      environment: asText(request["environment"], ""),
    }) as Array<Record<string, unknown>>).find(
      (item) => asText(item["status"], "") === "rolled_back",
    );

    const recentSignals = [
      summary,
      changeCounts.totalFiles > 0
        ? `파일 ${changeCounts.totalFiles}개 · +${changeCounts.additions} / -${changeCounts.deletions}`
        : "변경 요약 없음",
      recentRollback ? "최근 롤백 이력 있음" : "최근 롤백 이력 없음",
    ].filter(Boolean);

    return {
      id: asText(request["id"], ""),
      request_id: asText(request["id"], ""),
      service_id: serviceId,
      service_name: asText(service?.["name"], serviceId),
      environment: asText(request["environment"], ""),
      target_version: asText(request["target_version"], asText(deployment?.["version"], "")),
      baseline_deployment_id: baselineDeploymentId,
      baseline_version: asText(deployment?.["version"], ""),
      requested_by: asText(request["requested_by"], ""),
      requested_by_name: asText(requester?.["name"], asText(request["requested_by"], "")),
      requested_at: asText(request["created_at"], ""),
      status: asText(request["status"], "approval_requested"),
      recentSignals,
      signalSummary: recentSignals.join(" · "),
      riskSummary: summary,
      risk_fail_count: failed.length,
      risk_warn_count: warned.length,
      changeSummary: `파일 ${changeCounts.totalFiles}개`,
      approvable: input.actorRole === "release_manager" || input.actorRole === "ops_engineer",
    };
  });
}

type InternalHandler = (input: Record<string, string>) => unknown;

export const INTERNAL_SOURCE_HANDLERS: Record<string, InternalHandler> = {
  "deployment.detail": ({ deploymentId }) =>
    (getDeployment(deploymentId) as Record<string, unknown> | undefined) ?? null,
  "deployment.riskChecks": ({ deploymentId }) =>
    getDeploymentRiskChecks(deploymentId) as Array<Record<string, unknown>>,
  "deployment.rollbackPlan": ({ deploymentId }) =>
    (getRollbackPlan(deploymentId) as Record<string, unknown> | undefined) ?? null,
  "deployment.relatedIncidents": ({ deploymentId }) =>
    (getAllIncidents() as Array<Record<string, unknown>>).filter(
      (incident) => String(incident["linked_deployment_id"] ?? "") === deploymentId,
    ),
  "deployment.diffs": ({ deploymentId }) =>
    getDeploymentDiffs(deploymentId) as Array<Record<string, unknown>>,
  "deployment.recentAuditLogs": ({ deploymentId }) => {
    const rollbackPlan = getRollbackPlan(deploymentId) as Record<string, unknown> | undefined;
    const deploymentLogs = getAuditLogs({
      targetType: "deployment",
      targetId: deploymentId,
      limit: 4,
    }) as Array<Record<string, unknown>>;
    const rollbackLogs = rollbackPlan
      ? (getAuditLogs({
          targetType: "rollback_plan",
          targetId: String(rollbackPlan["id"] ?? ""),
          limit: 4,
        }) as Array<Record<string, unknown>>)
      : [];

    return [...deploymentLogs, ...rollbackLogs]
      .sort((left, right) =>
        String(right["created_at"] ?? "").localeCompare(String(left["created_at"] ?? "")),
      )
      .slice(0, 4);
  },
  "deployment.approvalStatus": ({ deploymentId }) => {
    const rollbackPlan = getRollbackPlan(deploymentId) as Record<string, unknown> | undefined;
    if (!rollbackPlan) {
      return {
        status: "not_requested",
        approved_by: null,
        message: "아직 롤백 계획이 생성되지 않았습니다.",
      };
    }

    const status = String(rollbackPlan["status"] ?? "draft");
    return {
      status,
      approved_by: rollbackPlan["approved_by"] ?? null,
      message:
        status === "approved"
          ? "승인이 완료되었습니다."
          : status === "dry_run_ready" || status === "dry_run_passed"
            ? "Dry-run 이후 승인 대기 상태입니다."
            : "승인 전 단계입니다.",
    };
  },
  "deployment.rollbackPlanRequired": ({ deploymentId }) => {
    const rollbackPlan = getRollbackPlan(deploymentId) as Record<string, unknown> | undefined;
    if (!rollbackPlan) {
      throw new Error(`롤백 계획을 찾을 수 없습니다: ${deploymentId}`);
    }
    return rollbackPlan;
  },
  "deployment.rollbackSteps": ({ deploymentId }) => {
    const rollbackPlan = getRollbackPlan(deploymentId) as Record<string, unknown> | undefined;
    if (!rollbackPlan) {
      throw new Error(`롤백 계획을 찾을 수 없습니다: ${deploymentId}`);
    }
    return getRollbackSteps(String(rollbackPlan["id"] ?? "")) as Array<Record<string, unknown>>;
  },
  "deployment.dryRunSummary": ({ deploymentId }) => {
    const rollbackPlan = getRollbackPlan(deploymentId) as Record<string, unknown> | undefined;
    const dryRunResult = parseJsonString(rollbackPlan?.["dry_run_result"]);
    if (dryRunResult && typeof dryRunResult === "object") {
      return dryRunResult;
    }
    return {
      result: rollbackPlan ? "pending" : "missing",
      message: rollbackPlan
        ? "Dry-run 결과가 아직 기록되지 않았습니다."
        : "롤백 계획이 아직 생성되지 않았습니다.",
    };
  },
  "deployment.rollbackCandidates": ({ deploymentId }) =>
    getRollbackCandidatesForDeployment(deploymentId) as Array<Record<string, unknown>>,
  "deployment.quickLaunchBaseline": ({ deploymentId, actorId }) =>
    (getQuickDeployBaseline({ deploymentId, actorId }) as Record<string, unknown> | null),
  "deployment.approvalQueue": ({ actorId, actorRole }) =>
    getDeploymentApprovalQueue({ actorId, actorRole }) as Array<Record<string, unknown>>,
  "incident.detail": ({ incidentId }) =>
    (getIncident(incidentId) as Record<string, unknown> | undefined) ?? null,
  "incident.evidence": ({ incidentId }) =>
    getIncidentEvidence(incidentId) as Array<Record<string, unknown>>,
  "incident.events": ({ incidentId }) =>
    getIncidentEvents(incidentId) as Array<Record<string, unknown>>,
  "incident.linkedDeployment": ({ incidentId }) => {
    const incident = getIncident(incidentId) as Record<string, unknown> | undefined;
    const deploymentId = String(incident?.["linked_deployment_id"] ?? "");
    if (!deploymentId) {
      return null;
    }
    return (getDeployment(deploymentId) as Record<string, unknown> | undefined) ?? null;
  },
  "incident.linkedDeploymentDiffs": ({ incidentId }) => {
    const incident = getIncident(incidentId) as Record<string, unknown> | undefined;
    const deploymentId = String(incident?.["linked_deployment_id"] ?? "");
    if (!deploymentId) {
      return [];
    }
    return getDeploymentDiffs(deploymentId) as Array<Record<string, unknown>>;
  },
  "incident.recentAuditLogs": ({ incidentId }) =>
    getAuditLogs({
      targetType: "incident",
      targetId: incidentId,
      limit: 4,
    }) as Array<Record<string, unknown>>,
  "incident.rootCauseHints": ({ incidentId }) => {
    const incident = getIncident(incidentId) as Record<string, unknown> | undefined;
    const evidence = getIncidentEvidence(incidentId) as Array<Record<string, unknown>>;
    const hints: string[] = [];

    if (String(incident?.["linked_deployment_id"] ?? "").length > 0) {
      hints.push("최근 배포와 연결된 장애입니다. 배포 변경점 확인이 필요합니다.");
    }
    if (evidence.some((item) => String(item["type"] ?? "") === "config_diff")) {
      hints.push("설정 변경 증거가 있어 구성 차이 검토가 필요합니다.");
    }
    if (evidence.some((item) => String(item["type"] ?? "") === "error_rate")) {
      hints.push("에러율 관련 증거가 있어 서비스 이상 징후가 명확합니다.");
    }
    if (hints.length === 0) {
      hints.push("최근 이벤트와 증거를 함께 비교해 원인 후보를 좁히세요.");
    }

    return hints.slice(0, 3);
  },
  "incident.nextActions": ({ incidentId }) => {
    const incident = getIncident(incidentId) as Record<string, unknown> | undefined;
    const actions: string[] = [];
    if (String(incident?.["status"] ?? "") === "open") {
      actions.push("담당자를 지정하고 초기 조사 상태로 전환하세요.");
    }
    if (String(incident?.["linked_deployment_id"] ?? "").length > 0) {
      actions.push("연결된 배포의 위험 체크와 변경 사항을 확인하세요.");
    }
    actions.push("핵심 증거 2~3개를 근거로 다음 대응 조치를 정리하세요.");
    return actions.slice(0, 3);
  },
  "incident.evidenceSummary": ({ incidentId }) => {
    const evidence = getIncidentEvidence(incidentId) as Array<Record<string, unknown>>;
    const byType = evidence.reduce<Record<string, number>>((acc, item) => {
      const type = String(item["type"] ?? "other");
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {});
    return {
      total: evidence.length,
      byType,
    };
  },
  "incident.pendingActions": ({ incidentId }) => {
    const incident = getIncident(incidentId) as Record<string, unknown> | undefined;
    const status = String(incident?.["status"] ?? "open");
    if (status === "resolved" || status === "closed") {
      return ["사후 보고와 공유를 완료했는지 확인하세요."];
    }
    return [
      "핵심 증거를 바탕으로 다음 조치를 결정하세요.",
      "관련 팀과 현재 상태를 공유하세요.",
    ];
  },
  "job.runDetail": ({ jobRunId }) => {
    const jobRun = getJobRun(jobRunId) as Record<string, unknown> | undefined;
    if (!jobRun) {
      return null;
    }

    const specParsed = parseJsonString(jobRun["spec"]);
    const dryRunResultParsed = parseJsonString(jobRun["dry_run_result"]);

    return {
      ...jobRun,
      specParsed,
      dryRunResultParsed,
    };
  },
  "job.template": ({ jobRunId }) => {
    const jobRun = getJobRun(jobRunId) as Record<string, unknown> | undefined;
    if (!jobRun) {
      return null;
    }
    const templates = getAllJobTemplates() as Array<Record<string, unknown>>;
    return templates.find((template) => template["id"] === jobRun["template_id"]) ?? null;
  },
  "job.dryRunResult": ({ jobRunId }) => {
    const jobRun = getJobRun(jobRunId) as Record<string, unknown> | undefined;
    if (!jobRun) {
      return null;
    }
    return parseJsonString(jobRun["dry_run_result"]);
  },
  "job.runEvents": ({ jobRunId }) =>
    getJobRunEvents(jobRunId) as Array<Record<string, unknown>>,
  "job.dependencySummary": ({ jobRunId }) => {
    const jobRun = getJobRun(jobRunId) as Record<string, unknown> | undefined;
    if (!jobRun) {
      return null;
    }
    const spec = parseJsonString(jobRun["spec"]);
    const dependencies =
      spec && typeof spec === "object" && Array.isArray((spec as Record<string, unknown>)["dependencies"])
        ? ((spec as Record<string, unknown>)["dependencies"] as Array<unknown>).map(String)
        : [];
    return {
      dependencyCount: dependencies.length,
      dependencies: dependencies.slice(0, 5),
      readiness:
        dependencies.length === 0
          ? "의존성 없음"
          : "의존성 확인 필요",
    };
  },
  "job.rerunHints": ({ jobRunId }) => {
    const jobRun = getJobRun(jobRunId) as Record<string, unknown> | undefined;
    if (!jobRun) {
      return [];
    }
    const hints: string[] = [];
    if (String(jobRun["status"] ?? "") === "failed") {
      hints.push("실패 원인 로그를 확인한 뒤 같은 파라미터 재실행 여부를 판단하세요.");
    }
    if (jobRun["dry_run_result"]) {
      hints.push("Dry-run 결과와 실제 환경 차이를 비교하세요.");
    }
    hints.push("실행 창구와 영향 범위를 다시 확인한 뒤 rerun 하세요.");
    return hints.slice(0, 3);
  },
  "workflow.actionType": ({ actionType }) => actionType,
  "workflow.confirmEntity": ({ actionType, targetId }) => {
    if (actionType === "rollback") {
      const deployment = getDeployment(targetId) as Record<string, unknown> | undefined;
      const rollbackPlan = getRollbackPlan(targetId) as Record<string, unknown> | undefined;
      if (!deployment) {
        return null;
      }
      return {
        id: deployment["id"],
        version: deployment["version"],
        service_id: deployment["service_id"],
        environment: deployment["environment"],
        previous_version: deployment["previous_version"],
        plan_status: rollbackPlan?.["status"] ?? "없음",
      };
    }

    if (actionType === "job_execute") {
      const jobRun = getJobRun(targetId) as Record<string, unknown> | undefined;
      if (!jobRun) {
        return null;
      }
      return {
        id: jobRun["id"],
        template_id: jobRun["template_id"],
        status: jobRun["status"],
        environment: jobRun["environment"] ?? "production",
      };
    }

    const incident = getIncident(targetId) as Record<string, unknown> | undefined;
    if (!incident) {
      return null;
    }
    return {
      id: incident["id"],
      title: incident["title"],
      severity: incident["severity"],
      service_id: incident["service_id"],
      status: incident["status"],
    };
  },
  "workflow.confirmChecks": ({ actionType }) => {
    if (actionType === "rollback") {
      return [
        { label: "Dry-run이 성공적으로 완료됨", required: true },
        { label: "Release Manager 승인 획득", required: true },
        { label: "서비스 모니터링 대시보드 확인", required: true },
        { label: "롤백 후 검증 계획 수립", required: false },
        { label: "관련 팀에 롤백 사전 공지", required: false },
      ];
    }

    if (actionType === "job_execute") {
      return [
        { label: "Dry-run 결과 확인 완료", required: true },
        { label: "Job spec 파라미터 검증", required: true },
        { label: "프로덕션 환경 승인 획득", required: true },
        { label: "실행 중 모니터링 담당자 지정", required: false },
      ];
    }

    return [
      { label: "근본 원인이 식별되고 문서화됨", required: true },
      { label: "영향받은 서비스 정상 복구 확인", required: true },
      { label: "재발 방지 조치 계획 수립", required: true },
      { label: "포스트모템 보고서 작성", required: false },
      { label: "관련 팀 사후 공유", required: false },
    ];
  },
  "workflow.confirmContext": ({ actionType, targetId }) => {
    const context: Record<string, string> = {
      actionType,
      targetId,
    };

    if (actionType === "rollback") {
      const rollbackPlan = getRollbackPlan(targetId) as Record<string, unknown> | undefined;
      context.deploymentId = targetId;
      context.planId = String(rollbackPlan?.["id"] ?? "");
    } else if (actionType === "job_execute") {
      context.jobRunId = targetId;
    } else {
      context.incidentId = targetId;
    }

    return context;
  },
  "workflow.recentAuditLogs": ({ actionType, targetId }) => {
    if (actionType === "rollback") {
      const rollbackPlan = getRollbackPlan(targetId) as Record<string, unknown> | undefined;
      return [
        ...(getAuditLogs({
          targetType: "deployment",
          targetId,
          limit: 2,
        }) as Array<Record<string, unknown>>),
        ...(rollbackPlan
          ? (getAuditLogs({
              targetType: "rollback_plan",
              targetId: String(rollbackPlan["id"] ?? ""),
              limit: 2,
            }) as Array<Record<string, unknown>>)
          : []),
      ].slice(0, 4);
    }

    if (actionType === "job_execute") {
      return getAuditLogs({
        targetType: "job_run",
        targetId,
        limit: 4,
      }) as Array<Record<string, unknown>>;
    }

    return getAuditLogs({
      targetType: "incident",
      targetId,
      limit: 4,
    }) as Array<Record<string, unknown>>;
  },
  "workflow.recentRelatedEvents": ({ actionType, targetId }) => {
    if (actionType === "rollback") {
      const rollbackPlan = getRollbackPlan(targetId) as Record<string, unknown> | undefined;
      if (!rollbackPlan) {
        return [];
      }
      return getRollbackSteps(String(rollbackPlan["id"] ?? "")) as Array<Record<string, unknown>>;
    }

    if (actionType === "job_execute") {
      return getJobRunEvents(targetId) as Array<Record<string, unknown>>;
    }

    return getIncidentEvents(targetId) as Array<Record<string, unknown>>;
  },
  "workflow.approvalStatus": ({ actionType, targetId }) => {
    if (actionType === "rollback") {
      const rollbackPlan = getRollbackPlan(targetId) as Record<string, unknown> | undefined;
      return {
        status: String(rollbackPlan?.["status"] ?? "draft"),
        approvedBy: rollbackPlan?.["approved_by"] ?? null,
      };
    }
    if (actionType === "job_execute") {
      const jobRun = getJobRun(targetId) as Record<string, unknown> | undefined;
      return {
        status: String(jobRun?.["status"] ?? "draft"),
        approvedBy: jobRun?.["approved_by"] ?? null,
      };
    }
    return {
      status: "not_required",
      approvedBy: null,
    };
  },
  "workflow.policyHints": ({ actionType }) => {
    if (actionType === "rollback") {
      return [
        "Dry-run 완료 후 승인된 계획만 실행할 수 있습니다.",
        "승인 상태와 최근 감사 이력을 함께 확인하세요.",
      ];
    }
    if (actionType === "job_execute") {
      return [
        "Dry-run 결과와 dependency 상태를 먼저 확인하세요.",
        "승인자와 모니터링 담당자를 명확히 지정하세요.",
      ];
    }
    return [
      "종료 전 근본 원인과 후속 조치가 문서화되었는지 확인하세요.",
      "사후 공유와 보고서 초안이 준비되었는지 확인하세요.",
    ];
  },
  "report.type": ({ reportType }) => reportType,
};

export const DATA_SOURCE_DEFINITIONS: DataSourceDef[] = [
  {
    id: "deployment.detail",
    kind: "internal_db",
    handlerKey: "deployment.detail",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["deploymentId"] },
    outputSchema: { type: "object", nullable: true },
  },
  {
    id: "deployment.riskChecks",
    kind: "internal_db",
    handlerKey: "deployment.riskChecks",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["deploymentId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "deployment.rollbackPlan",
    kind: "internal_db",
    handlerKey: "deployment.rollbackPlan",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["deploymentId"] },
    outputSchema: { type: "object", nullable: true },
  },
  {
    id: "deployment.relatedIncidents",
    kind: "internal_db",
    handlerKey: "deployment.relatedIncidents",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["deploymentId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "deployment.diffs",
    kind: "internal_db",
    handlerKey: "deployment.diffs",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["deploymentId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "deployment.recentAuditLogs",
    kind: "internal_db",
    handlerKey: "deployment.recentAuditLogs",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["deploymentId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "deployment.approvalStatus",
    kind: "internal_db",
    handlerKey: "deployment.approvalStatus",
    timeoutMs: 1000,
    inputSchema: { type: "object", required: ["deploymentId"] },
    outputSchema: { type: "object" },
  },
  {
    id: "deployment.rollbackPlanRequired",
    kind: "internal_db",
    handlerKey: "deployment.rollbackPlanRequired",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["deploymentId"] },
    outputSchema: { type: "object" },
  },
  {
    id: "deployment.rollbackSteps",
    kind: "internal_db",
    handlerKey: "deployment.rollbackSteps",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["deploymentId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "deployment.dryRunSummary",
    kind: "internal_db",
    handlerKey: "deployment.dryRunSummary",
    timeoutMs: 1000,
    inputSchema: { type: "object", required: ["deploymentId"] },
    outputSchema: { type: "object" },
  },
  {
    id: "deployment.rollbackCandidates",
    kind: "internal_db",
    handlerKey: "deployment.rollbackCandidates",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["deploymentId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "deployment.quickLaunchBaseline",
    kind: "internal_db",
    handlerKey: "deployment.quickLaunchBaseline",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["deploymentId", "actorId"] },
    outputSchema: { type: "object", nullable: true },
  },
  {
    id: "deployment.approvalQueue",
    kind: "internal_db",
    handlerKey: "deployment.approvalQueue",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["actorId", "actorRole"] },
    outputSchema: { type: "array" },
  },
  {
    id: "incident.detail",
    kind: "internal_db",
    handlerKey: "incident.detail",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["incidentId"] },
    outputSchema: { type: "object", nullable: true },
  },
  {
    id: "incident.evidence",
    kind: "internal_db",
    handlerKey: "incident.evidence",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["incidentId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "incident.events",
    kind: "internal_db",
    handlerKey: "incident.events",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["incidentId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "incident.linkedDeployment",
    kind: "internal_db",
    handlerKey: "incident.linkedDeployment",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["incidentId"] },
    outputSchema: { type: "object", nullable: true },
  },
  {
    id: "incident.linkedDeploymentDiffs",
    kind: "internal_db",
    handlerKey: "incident.linkedDeploymentDiffs",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["incidentId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "incident.recentAuditLogs",
    kind: "internal_db",
    handlerKey: "incident.recentAuditLogs",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["incidentId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "incident.rootCauseHints",
    kind: "internal_db",
    handlerKey: "incident.rootCauseHints",
    timeoutMs: 1000,
    inputSchema: { type: "object", required: ["incidentId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "incident.nextActions",
    kind: "internal_db",
    handlerKey: "incident.nextActions",
    timeoutMs: 1000,
    inputSchema: { type: "object", required: ["incidentId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "incident.evidenceSummary",
    kind: "internal_db",
    handlerKey: "incident.evidenceSummary",
    timeoutMs: 1000,
    inputSchema: { type: "object", required: ["incidentId"] },
    outputSchema: { type: "object" },
  },
  {
    id: "incident.pendingActions",
    kind: "internal_db",
    handlerKey: "incident.pendingActions",
    timeoutMs: 1000,
    inputSchema: { type: "object", required: ["incidentId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "job.runDetail",
    kind: "internal_db",
    handlerKey: "job.runDetail",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["jobRunId"] },
    outputSchema: { type: "object", nullable: true },
  },
  {
    id: "job.template",
    kind: "internal_db",
    handlerKey: "job.template",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["jobRunId"] },
    outputSchema: { type: "object", nullable: true },
  },
  {
    id: "job.dryRunResult",
    kind: "internal_db",
    handlerKey: "job.dryRunResult",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["jobRunId"] },
    outputSchema: { nullable: true },
  },
  {
    id: "job.runEvents",
    kind: "internal_db",
    handlerKey: "job.runEvents",
    timeoutMs: 1500,
    inputSchema: { type: "object", required: ["jobRunId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "job.dependencySummary",
    kind: "internal_db",
    handlerKey: "job.dependencySummary",
    timeoutMs: 1000,
    inputSchema: { type: "object", required: ["jobRunId"] },
    outputSchema: { type: "object", nullable: true },
  },
  {
    id: "job.rerunHints",
    kind: "internal_db",
    handlerKey: "job.rerunHints",
    timeoutMs: 1000,
    inputSchema: { type: "object", required: ["jobRunId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "workflow.actionType",
    kind: "internal_db",
    handlerKey: "workflow.actionType",
    timeoutMs: 500,
    inputSchema: { type: "object", required: ["actionType"] },
    outputSchema: {},
  },
  {
    id: "workflow.confirmEntity",
    kind: "internal_db",
    handlerKey: "workflow.confirmEntity",
    timeoutMs: 1000,
    inputSchema: { type: "object", required: ["actionType", "targetId"] },
    outputSchema: { type: "object", nullable: true },
  },
  {
    id: "workflow.confirmChecks",
    kind: "internal_db",
    handlerKey: "workflow.confirmChecks",
    timeoutMs: 1000,
    inputSchema: { type: "object", required: ["actionType", "targetId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "workflow.confirmContext",
    kind: "internal_db",
    handlerKey: "workflow.confirmContext",
    timeoutMs: 1000,
    inputSchema: { type: "object", required: ["actionType", "targetId"] },
    outputSchema: { type: "object" },
  },
  {
    id: "workflow.recentAuditLogs",
    kind: "internal_db",
    handlerKey: "workflow.recentAuditLogs",
    timeoutMs: 1000,
    inputSchema: { type: "object", required: ["actionType", "targetId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "workflow.recentRelatedEvents",
    kind: "internal_db",
    handlerKey: "workflow.recentRelatedEvents",
    timeoutMs: 1000,
    inputSchema: { type: "object", required: ["actionType", "targetId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "workflow.approvalStatus",
    kind: "internal_db",
    handlerKey: "workflow.approvalStatus",
    timeoutMs: 1000,
    inputSchema: { type: "object", required: ["actionType", "targetId"] },
    outputSchema: { type: "object" },
  },
  {
    id: "workflow.policyHints",
    kind: "internal_db",
    handlerKey: "workflow.policyHints",
    timeoutMs: 1000,
    inputSchema: { type: "object", required: ["actionType", "targetId"] },
    outputSchema: { type: "array" },
  },
  {
    id: "report.type",
    kind: "internal_db",
    handlerKey: "report.type",
    timeoutMs: 500,
    inputSchema: { type: "object", required: ["reportType"] },
    outputSchema: {},
  },
];

function parseStringRecord(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, item]) => [
        key,
        String(item),
      ]),
    );
  } catch {
    return undefined;
  }
}

function parseSchema(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function mergeSourceOverride(
  source: DataSourceDef,
  override: Record<string, unknown> | undefined,
): DataSourceDef {
  if (!override) {
    return source;
  }

  return {
    ...source,
    kind: String(override["kind"] ?? source.kind) as DataSourceDef["kind"],
    method:
      override["method"] === null || override["method"] === undefined
        ? source.method
        : (String(override["method"]) as DataSourceDef["method"]),
    url:
      override["url"] === null || override["url"] === undefined
        ? source.url
        : String(override["url"]),
    handlerKey:
      override["handler_key"] === null || override["handler_key"] === undefined
        ? source.handlerKey
        : String(override["handler_key"]),
    pathParams: parseStringRecord(override["path_params"]) ?? source.pathParams,
    queryParams: parseStringRecord(override["query_params"]) ?? source.queryParams,
    bodyMapping: parseStringRecord(override["body_mapping"]) ?? source.bodyMapping,
    resultPath:
      override["result_path"] === null || override["result_path"] === undefined
        ? source.resultPath
        : String(override["result_path"]),
    timeoutMs:
      typeof override["timeout_ms"] === "number"
        ? Number(override["timeout_ms"])
        : source.timeoutMs,
    inputSchema: parseSchema(override["input_schema"]) ?? source.inputSchema,
    outputSchema: parseSchema(override["output_schema"]) ?? source.outputSchema,
  };
}

export function getDataSourceDefinition(sourceId: string) {
  const source = DATA_SOURCE_DEFINITIONS.find((item) => item.id === sourceId) ?? null;
  if (!source) {
    return null;
  }

  const override = getA2UIDataSourceOverrides(sourceId)[0];
  return mergeSourceOverride(source, override);
}
