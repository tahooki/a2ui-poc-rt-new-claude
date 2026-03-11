import type { OperatorRole } from "@/types/domain";

export type A2UITemplateCategory =
  | "deployments"
  | "incidents"
  | "jobs"
  | "reports"
  | "workflow";

export type TemplateDecisionInputSource = "user" | "context" | "derived";

export type A2UITemplateToolName =
  | "renderRollbackCard"
  | "renderEvidenceCard"
  | "renderDryRunStepperCard"
  | "renderConfirmCard"
  | "renderJobReviewCard"
  | "renderReportTemplateCard";

export interface SeedTemplateDecisionInputDefinition {
  key: string;
  label: string;
  description: string;
  required: boolean;
  source: TemplateDecisionInputSource;
  defaultValue?: string;
  priority?: number;
}

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
  decisionInputs?: SeedTemplateDecisionInputDefinition[];
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
    decisionInputs: [
      {
        key: "riskTolerance",
        label: "리스크 허용 수준",
        description:
          "운영자가 허용 가능한 배포 리스크 수준 (보수적/중간/공격적)",
        required: false,
        source: "user",
        defaultValue: "보수적",
        priority: 10,
      },
      {
        key: "selectedDeploymentId",
        label: "선택된 배포 ID",
        description: "현재 페이지 컨텍스트에서 선택된 배포 식별자",
        required: false,
        source: "context",
        priority: 20,
      },
      {
        key: "riskSignalSummary",
        label: "위험 시그널 요약",
        description: "질문 텍스트에서 감지한 위험 관련 키워드/시그널",
        required: false,
        source: "derived",
        priority: 30,
      },
    ],
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
    decisionInputs: [
      {
        key: "analysisDepth",
        label: "분석 깊이",
        description: "간단 비교 / 상세 분석 중 원하는 분석 깊이",
        required: false,
        source: "user",
        defaultValue: "상세 분석",
        priority: 10,
      },
      {
        key: "selectedIncidentId",
        label: "선택된 인시던트 ID",
        description: "현재 페이지 컨텍스트에서 선택된 인시던트 식별자",
        required: false,
        source: "context",
        priority: 20,
      },
      {
        key: "evidenceSignals",
        label: "증거 시그널",
        description: "질문에서 감지한 로그/메트릭/트레이스/설정 관련 단서",
        required: false,
        source: "derived",
        priority: 30,
      },
    ],
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
    decisionInputs: [
      {
        key: "stepFocus",
        label: "확인할 단계 범위",
        description: "전체 단계 또는 특정 단계만 보고 싶은지",
        required: false,
        source: "user",
        defaultValue: "전체 단계",
        priority: 10,
      },
      {
        key: "selectedDeploymentId",
        label: "선택된 배포 ID",
        description: "현재 페이지 컨텍스트에서 선택된 배포 식별자",
        required: false,
        source: "context",
        priority: 20,
      },
      {
        key: "stepperSignals",
        label: "스텝퍼 시그널",
        description: "질문에서 감지한 단계/진행률/검증 요청 신호",
        required: false,
        source: "derived",
        priority: 30,
      },
    ],
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
    decisionInputs: [
      {
        key: "actionGoal",
        label: "작업 목표",
        description: "실행 전에 확인하려는 작업의 목적",
        required: false,
        source: "user",
        priority: 10,
      },
      {
        key: "selectedEntityId",
        label: "선택된 엔티티 ID",
        description: "현재 페이지 컨텍스트에서 선택된 엔티티 식별자",
        required: false,
        source: "context",
        priority: 20,
      },
      {
        key: "confirmationSignals",
        label: "확인 요청 시그널",
        description: "질문에서 감지한 확인/승인/체크리스트 관련 신호",
        required: false,
        source: "derived",
        priority: 30,
      },
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
    decisionInputs: [
      {
        key: "validationFocus",
        label: "검토 포인트",
        description: "파라미터/스케줄/리소스 등 중점 검토 항목",
        required: false,
        source: "user",
        priority: 10,
      },
      {
        key: "selectedJobRunId",
        label: "선택된 Job Run ID",
        description: "현재 페이지 컨텍스트에서 선택된 Job 실행 식별자",
        required: false,
        source: "context",
        priority: 20,
      },
      {
        key: "jobReviewSignals",
        label: "잡 검토 시그널",
        description: "질문에서 감지한 잡/스펙/dry-run 관련 신호",
        required: false,
        source: "derived",
        priority: 30,
      },
    ],
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
    decisionInputs: [
      {
        key: "reportAudience",
        label: "보고 대상",
        description: "보고서를 읽는 주요 대상 (운영팀/리더십/교대조)",
        required: false,
        source: "user",
        priority: 10,
      },
      {
        key: "selectedIncidentId",
        label: "선택된 인시던트 ID",
        description: "현재 페이지 컨텍스트에서 선택된 인시던트 식별자",
        required: false,
        source: "context",
        priority: 20,
      },
      {
        key: "reportSignals",
        label: "리포트 시그널",
        description: "질문에서 감지한 postmortem/handover/update 의도",
        required: false,
        source: "derived",
        priority: 30,
      },
    ],
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
