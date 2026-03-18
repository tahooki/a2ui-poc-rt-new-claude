import {
  getA2UIDataSourceOverrides,
  getAllIncidents,
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
  getRollbackPlan,
  getRollbackSteps,
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
