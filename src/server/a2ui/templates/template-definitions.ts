import { SEED_A2UI_TEMPLATES } from "@/server/ai/template-config";
import type { A2UITemplateDef } from "./template-types";

const SEED_TEMPLATE_MAP = Object.fromEntries(
  SEED_A2UI_TEMPLATES.map((template) => [template.id, template]),
);

export const TEMPLATE_DEFINITIONS: A2UITemplateDef[] = [
  {
    id: "tpl_rollback_summary",
    name: SEED_TEMPLATE_MAP["tpl_rollback_summary"].name,
    description: SEED_TEMPLATE_MAP["tpl_rollback_summary"].description,
    cardType: "rollback_summary",
    requiredBindings: [
      "tpl_rollback_summary.deployment",
      "tpl_rollback_summary.riskChecks",
    ],
    optionalBindings: [
      "tpl_rollback_summary.rollbackPlan",
      "tpl_rollback_summary.relatedIncidents",
      "tpl_rollback_summary.deploymentDiffs",
      "tpl_rollback_summary.recentAuditLogs",
      "tpl_rollback_summary.approvalStatus",
    ],
    fallbackPolicy: { mode: "text_fallback" },
  },
  {
    id: "tpl_evidence_comparison",
    name: SEED_TEMPLATE_MAP["tpl_evidence_comparison"].name,
    description: SEED_TEMPLATE_MAP["tpl_evidence_comparison"].description,
    cardType: "evidence_comparison",
    requiredBindings: [
      "tpl_evidence_comparison.incident",
      "tpl_evidence_comparison.evidence",
    ],
    optionalBindings: [
      "tpl_evidence_comparison.incidentEvents",
      "tpl_evidence_comparison.linkedDeployment",
      "tpl_evidence_comparison.linkedDeploymentDiffs",
      "tpl_evidence_comparison.recentAuditLogs",
      "tpl_evidence_comparison.rootCauseHints",
      "tpl_evidence_comparison.nextActions",
    ],
    fallbackPolicy: { mode: "text_fallback" },
  },
  {
    id: "tpl_dry_run_stepper",
    name: SEED_TEMPLATE_MAP["tpl_dry_run_stepper"].name,
    description: SEED_TEMPLATE_MAP["tpl_dry_run_stepper"].description,
    cardType: "dry_run_stepper",
    requiredBindings: [
      "tpl_dry_run_stepper.rollbackPlan",
      "tpl_dry_run_stepper.steps",
    ],
    optionalBindings: [
      "tpl_dry_run_stepper.deployment",
      "tpl_dry_run_stepper.riskChecks",
      "tpl_dry_run_stepper.dryRunSummary",
    ],
    fallbackPolicy: {
      mode: "fallback_template",
      fallbackTemplateId: "tpl_rollback_summary",
    },
  },
  {
    id: "tpl_confirm_action",
    name: SEED_TEMPLATE_MAP["tpl_confirm_action"].name,
    description: SEED_TEMPLATE_MAP["tpl_confirm_action"].description,
    cardType: "confirm_action",
    requiredBindings: [
      "tpl_confirm_action.actionType",
      "tpl_confirm_action.entity",
      "tpl_confirm_action.checks",
      "tpl_confirm_action.context",
    ],
    optionalBindings: [
      "tpl_confirm_action.recentAuditLogs",
      "tpl_confirm_action.recentRelatedEvents",
      "tpl_confirm_action.approvalStatus",
      "tpl_confirm_action.policyHints",
    ],
    fallbackPolicy: { mode: "text_fallback" },
  },
  {
    id: "tpl_job_spec_review",
    name: SEED_TEMPLATE_MAP["tpl_job_spec_review"].name,
    description: SEED_TEMPLATE_MAP["tpl_job_spec_review"].description,
    cardType: "job_spec_review",
    requiredBindings: [
      "tpl_job_spec_review.jobRun",
    ],
    optionalBindings: [
      "tpl_job_spec_review.template",
      "tpl_job_spec_review.dryRunResult",
      "tpl_job_spec_review.jobRunEvents",
      "tpl_job_spec_review.dependencySummary",
      "tpl_job_spec_review.rerunHints",
    ],
    fallbackPolicy: { mode: "text_fallback" },
  },
  {
    id: "tpl_report_template",
    name: SEED_TEMPLATE_MAP["tpl_report_template"].name,
    description: SEED_TEMPLATE_MAP["tpl_report_template"].description,
    cardType: "report_template",
    requiredBindings: [
      "tpl_report_template.incident",
      "tpl_report_template.reportType",
    ],
    optionalBindings: [
      "tpl_report_template.incidentEvents",
      "tpl_report_template.evidenceSummary",
      "tpl_report_template.recentAuditLogs",
      "tpl_report_template.pendingActions",
    ],
    fallbackPolicy: { mode: "text_fallback" },
  },
];

export function getTemplateDefinition(templateId: string) {
  return TEMPLATE_DEFINITIONS.find((template) => template.id === templateId) ?? null;
}
