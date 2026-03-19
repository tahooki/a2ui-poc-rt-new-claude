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
  | "renderRollbackActionCard"
  | "renderDeploymentApprovalInboxCard"
  | "renderQuickDeployLaunchpadCard"
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
    id: "tpl_rollback_action",
    name: "롤백 실행",
    description: "롤백 가능한 배포 후보를 보여주고 즉시 열람/실행하는 A2UI 카드",
    cardType: "rollback_action",
    builderKey: "rollback_action",
    toolName: "renderRollbackActionCard",
    category: "deployments",
    isEnabledByDefault: true,
    promptHint:
      "롤백 후보 목록, 바로 실행 가능한 배포, 상세 열람이 필요할 때 사용",
    keywords: ["롤백 후보", "rollback candidate", "롤백 실행", "rollback 가능", "되돌릴 배포"],
    allowedPages: ["dashboard", "deployments", "incidents"],
    allowedRoles: ["oncall_engineer", "release_manager", "ops_engineer"],
    decisionInputs: [
      {
        key: "selectedDeploymentId",
        label: "선택된 배포 ID",
        description: "현재 페이지 컨텍스트에서 선택된 배포 식별자",
        required: false,
        source: "context",
        priority: 10,
      },
      {
        key: "rollbackSignals",
        label: "롤백 시그널",
        description: "질문에서 감지한 롤백 후보/실행/목록 관련 신호",
        required: false,
        source: "derived",
        priority: 20,
      },
    ],
  },
  {
    id: "tpl_deployment_approval_inbox",
    name: "배포 승인 Inbox",
    description: "승인 대기 중인 배포 요청을 빠르게 검토하고 승인/보류하는 A2UI 카드",
    cardType: "deployment_approval_inbox",
    builderKey: "deployment_approval_inbox",
    toolName: "renderDeploymentApprovalInboxCard",
    category: "deployments",
    isEnabledByDefault: true,
    promptHint:
      "승인 대기 중인 배포 요청 목록을 보여주고 바로 승인/보류할 때 사용",
    keywords: ["승인 대기 배포", "배포 승인", "approval queue", "승인 inbox", "pending deployment", "배포 대기중인 리스트"],
    allowedPages: ["dashboard", "deployments"],
    allowedRoles: ["release_manager", "ops_engineer"],
    decisionInputs: [
      {
        key: "approvalScope",
        label: "승인 범위",
        description: "특정 서비스만 볼지 전체 승인 대기를 볼지",
        required: true,
        source: "user",
        defaultValue: "전체 승인 대기",
        priority: 5,
      },
      {
        key: "selectedDeploymentId",
        label: "선택된 배포 ID",
        description: "현재 페이지 컨텍스트에서 선택된 배포 식별자",
        required: false,
        source: "context",
        priority: 20,
      },
    ],
  },
  {
    id: "tpl_quick_deploy_launchpad",
    name: "간단 배포 시작",
    description: "이미지 생성 → 배포 실행 → 결과 확인까지 이어지는 3단계 quick deploy 파이프라인 A2UI 카드",
    cardType: "quick_deploy_launchpad",
    builderKey: "quick_deploy_launchpad",
    toolName: "renderQuickDeployLaunchpadCard",
    category: "deployments",
    isEnabledByDefault: true,
    promptHint:
      "이전 성공 배포를 기준으로 이미지를 만들고 즉시 배포를 시작해 결과를 확인할 때 사용. 승인 단계는 제외한다",
    keywords: ["간단 배포", "빠른 배포", "재배포", "다시 배포", "quick deploy", "이미지 생성", "배포 시작", "결과 확인"],
    allowedPages: ["dashboard", "deployments"],
    allowedRoles: ["release_manager", "ops_engineer"],
    decisionInputs: [
      {
        key: "selectedDeploymentId",
        label: "선택된 배포 ID",
        description: "현재 페이지 컨텍스트에서 선택된 배포 식별자",
        required: false,
        source: "context",
        priority: 10,
      },
      {
        key: "deployIntentSignals",
        label: "배포 실행 시그널",
        description: "질문에서 감지한 재배포/빠른 배포/이전 배포 관련 신호",
        required: false,
        source: "derived",
        priority: 20,
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

export const VISIBLE_A2UI_TEMPLATE_IDS = [
  "tpl_dry_run_stepper",
  "tpl_rollback_action",
  "tpl_quick_deploy_launchpad",
  "tpl_deployment_approval_inbox",
] as const;

function buildAllEnabledTemplateDefaults() {
  return SEED_A2UI_TEMPLATES.map((template) => ({
    templateId: template.id,
    enabled: VISIBLE_A2UI_TEMPLATE_IDS.includes(
      template.id as (typeof VISIBLE_A2UI_TEMPLATE_IDS)[number],
    ),
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
