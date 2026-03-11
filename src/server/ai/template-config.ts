import type { OperatorRole } from "@/types/domain";

export type A2UITemplateCategory =
  | "deployments"
  | "incidents"
  | "jobs"
  | "reports"
  | "workflow";

export type A2UITemplateToolName =
  | "renderRollbackCard"
  | "renderEvidenceCard"
  | "renderDryRunStepperCard"
  | "renderConfirmCard"
  | "renderJobReviewCard"
  | "renderReportTemplateCard";

export interface SeedA2UITemplateDefinition {
  id: string;
  name: string;
  description: string;
  cardType: string;
  builderKey: string;
  toolName: A2UITemplateToolName;
  category: A2UITemplateCategory;
  isEnabledByDefault: boolean;
  promptHint: string;
  keywords: string[];
  allowedPages: string[];
  allowedRoles?: OperatorRole[];
}

export const SEED_A2UI_TEMPLATES: SeedA2UITemplateDefinition[] = [
  {
    id: "tpl_rollback_summary",
    name: "롤백 판단 요약",
    description: "배포 위험도와 롤백 계획을 요약하는 A2UI 카드",
    cardType: "rollback_summary",
    builderKey: "rollback_summary",
    toolName: "renderRollbackCard",
    category: "deployments",
    isEnabledByDefault: true,
    promptHint:
      "배포 리스크, 롤백 여부, 실패한 위험 체크, 현재 배포 상태를 설명할 때 사용",
    keywords: ["롤백", "rollback", "배포 위험", "리스크", "실패한 배포"],
    allowedPages: ["dashboard", "deployments"],
  },
  {
    id: "tpl_evidence_comparison",
    name: "인시던트 증거 비교",
    description: "인시던트 증거와 분석 결과를 비교하는 A2UI 카드",
    cardType: "evidence_comparison",
    builderKey: "evidence_comparison",
    toolName: "renderEvidenceCard",
    category: "incidents",
    isEnabledByDefault: true,
    promptHint:
      "인시던트의 로그, 메트릭, 트레이스, 설정 차이 등 증거를 비교 분석할 때 사용",
    keywords: ["증거", "evidence", "로그", "메트릭", "trace", "원인 분석"],
    allowedPages: ["dashboard", "incidents"],
  },
  {
    id: "tpl_dry_run_stepper",
    name: "Dry-run 단계 진행",
    description: "롤백 dry-run 단계를 순서대로 보여주는 A2UI 카드",
    cardType: "dry_run_stepper",
    builderKey: "dry_run_stepper",
    toolName: "renderDryRunStepperCard",
    category: "deployments",
    isEnabledByDefault: true,
    promptHint:
      "dry-run 단계별 진행 상황, 검증 순서, 다음 단계 안내가 필요할 때 사용",
    keywords: ["dry-run", "드라이런", "단계", "스텝", "진행 상황"],
    allowedPages: ["deployments"],
  },
  {
    id: "tpl_confirm_action",
    name: "실행 확인 카드",
    description: "위험한 작업 전 최종 체크리스트를 보여주는 A2UI 카드",
    cardType: "confirm_action",
    builderKey: "confirm_action",
    toolName: "renderConfirmCard",
    category: "workflow",
    isEnabledByDefault: true,
    promptHint:
      "실행 전 체크리스트, 승인 요건, 최종 확인이 필요한 경우 사용",
    keywords: ["확인", "승인", "실행 전", "체크리스트", "confirm"],
    allowedPages: ["deployments", "jobs", "incidents"],
    allowedRoles: [
      "oncall_engineer",
      "release_manager",
      "ops_engineer",
      "support_lead",
    ],
  },
  {
    id: "tpl_job_spec_review",
    name: "Job Spec 검토",
    description: "잡 스펙과 dry-run 결과를 검토하는 A2UI 카드",
    cardType: "job_spec_review",
    builderKey: "job_spec_review",
    toolName: "renderJobReviewCard",
    category: "jobs",
    isEnabledByDefault: true,
    promptHint:
      "job spec 검토, dry-run 결과 확인, 실행 전 파라미터 검증 요청에 사용",
    keywords: ["job spec", "잡 스펙", "backfill", "dry-run 결과", "파라미터 검토"],
    allowedPages: ["dashboard", "jobs"],
  },
  {
    id: "tpl_report_template",
    name: "보고서 템플릿",
    description: "보고서 초안 구조를 제안하는 A2UI 카드",
    cardType: "report_template",
    builderKey: "report_template",
    toolName: "renderReportTemplateCard",
    category: "reports",
    isEnabledByDefault: true,
    promptHint:
      "postmortem, handover, incident update 문서 구조가 필요할 때 사용",
    keywords: ["보고서", "postmortem", "handover", "템플릿", "초안"],
    allowedPages: ["dashboard", "incidents", "reports"],
  },
];

export const TEMPLATE_ID_BY_TOOL_NAME = Object.fromEntries(
  SEED_A2UI_TEMPLATES.map((template) => [template.toolName, template.id]),
) as Record<A2UITemplateToolName, string>;

export const TEMPLATE_BY_ID = Object.fromEntries(
  SEED_A2UI_TEMPLATES.map((template) => [template.id, template]),
) as Record<string, SeedA2UITemplateDefinition>;

export const DEFAULT_RUNTIME_SCENARIO_ID = "checkout-5xx";

export const CORE_AI_TOOL_NAMES = [
  "getIncidentDetail",
  "getDeploymentDetail",
  "getDeploymentRisks",
  "suggestRollback",
  "getJobDetail",
  "getRecentAuditLogs",
  "getServiceStatus",
  "analyzeIncident",
] as const;

function buildAllEnabledTemplateDefaults() {
  return SEED_A2UI_TEMPLATES.map((template) => ({
    templateId: template.id,
    enabled: true,
  }));
}

export const SCENARIO_TEMPLATE_DEFAULTS: Record<
  string,
  Array<{ templateId: string; enabled: boolean }>
> = {
  "checkout-5xx": buildAllEnabledTemplateDefaults(),
  "billing-backfill": buildAllEnabledTemplateDefaults(),
  "healthy-rollout": buildAllEnabledTemplateDefaults(),
  "incident-handover": buildAllEnabledTemplateDefaults(),
};
