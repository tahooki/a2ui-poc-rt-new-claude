import {
  getA2UIDataSourceOverrides,
  getAllJobTemplates,
  getDeployment,
  getDeploymentRiskChecks,
  getIncident,
  getIncidentEvidence,
  getJobRun,
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
  "incident.detail": ({ incidentId }) =>
    (getIncident(incidentId) as Record<string, unknown> | undefined) ?? null,
  "incident.evidence": ({ incidentId }) =>
    getIncidentEvidence(incidentId) as Array<Record<string, unknown>>,
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
