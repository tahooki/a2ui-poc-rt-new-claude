import { getA2UIBindingOverrides } from "@/server/db";
import type { TemplateBindingDef } from "./binding-types";

export const TEMPLATE_BINDINGS: TemplateBindingDef[] = [
  {
    id: "tpl_rollback_summary.deployment",
    templateId: "tpl_rollback_summary",
    slot: "detail",
    sourceId: "deployment.detail",
    required: true,
    inputMapping: { deploymentId: "$args.deploymentId" },
    outputKey: "deployment",
  },
  {
    id: "tpl_rollback_summary.riskChecks",
    templateId: "tpl_rollback_summary",
    slot: "evidence",
    sourceId: "deployment.riskChecks",
    required: true,
    inputMapping: { deploymentId: "$args.deploymentId" },
    outputKey: "riskChecks",
  },
  {
    id: "tpl_rollback_summary.rollbackPlan",
    templateId: "tpl_rollback_summary",
    slot: "related",
    sourceId: "deployment.rollbackPlan",
    required: false,
    inputMapping: { deploymentId: "$args.deploymentId" },
    outputKey: "rollbackPlan",
  },
  {
    id: "tpl_rollback_summary.relatedIncidents",
    templateId: "tpl_rollback_summary",
    slot: "related",
    sourceId: "deployment.relatedIncidents",
    required: false,
    inputMapping: { deploymentId: "$args.deploymentId" },
    outputKey: "relatedIncidents",
  },
  {
    id: "tpl_rollback_summary.deploymentDiffs",
    templateId: "tpl_rollback_summary",
    slot: "related",
    sourceId: "deployment.diffs",
    required: false,
    inputMapping: { deploymentId: "$args.deploymentId" },
    outputKey: "deploymentDiffs",
  },
  {
    id: "tpl_rollback_summary.recentAuditLogs",
    templateId: "tpl_rollback_summary",
    slot: "related",
    sourceId: "deployment.recentAuditLogs",
    required: false,
    inputMapping: { deploymentId: "$args.deploymentId" },
    outputKey: "recentAuditLogs",
  },
  {
    id: "tpl_rollback_summary.approvalStatus",
    templateId: "tpl_rollback_summary",
    slot: "approvals",
    sourceId: "deployment.approvalStatus",
    required: false,
    inputMapping: { deploymentId: "$args.deploymentId" },
    outputKey: "approvalStatus",
  },
  {
    id: "tpl_rollback_action.candidates",
    templateId: "tpl_rollback_action",
    slot: "list",
    sourceId: "deployment.rollbackCandidates",
    required: true,
    inputMapping: { deploymentId: "$args.deploymentId" },
    outputKey: "candidates",
  },
  {
    id: "tpl_deployment_approval_inbox.requests",
    templateId: "tpl_deployment_approval_inbox",
    slot: "list",
    sourceId: "deployment.approvalQueue",
    required: true,
    inputMapping: {
      actorId: "$session.actorId",
      actorRole: "$session.actorRole",
    },
    outputKey: "requests",
  },
  {
    id: "tpl_quick_deploy_launchpad.baseline",
    templateId: "tpl_quick_deploy_launchpad",
    slot: "detail",
    sourceId: "deployment.quickLaunchBaseline",
    required: true,
    inputMapping: {
      deploymentId: "$args.deploymentId",
      actorId: "$session.actorId",
      actorRole: "$session.actorRole",
    },
    outputKey: "baseline",
  },
  {
    id: "tpl_evidence_comparison.incident",
    templateId: "tpl_evidence_comparison",
    slot: "detail",
    sourceId: "incident.detail",
    required: true,
    inputMapping: { incidentId: "$args.incidentId" },
    outputKey: "incident",
  },
  {
    id: "tpl_evidence_comparison.evidence",
    templateId: "tpl_evidence_comparison",
    slot: "evidence",
    sourceId: "incident.evidence",
    required: true,
    inputMapping: { incidentId: "$args.incidentId" },
    outputKey: "evidence",
  },
  {
    id: "tpl_evidence_comparison.incidentEvents",
    templateId: "tpl_evidence_comparison",
    slot: "events",
    sourceId: "incident.events",
    required: false,
    inputMapping: { incidentId: "$args.incidentId" },
    outputKey: "incidentEvents",
  },
  {
    id: "tpl_evidence_comparison.linkedDeployment",
    templateId: "tpl_evidence_comparison",
    slot: "related",
    sourceId: "incident.linkedDeployment",
    required: false,
    inputMapping: { incidentId: "$args.incidentId" },
    outputKey: "linkedDeployment",
  },
  {
    id: "tpl_evidence_comparison.linkedDeploymentDiffs",
    templateId: "tpl_evidence_comparison",
    slot: "related",
    sourceId: "incident.linkedDeploymentDiffs",
    required: false,
    inputMapping: { incidentId: "$args.incidentId" },
    outputKey: "linkedDeploymentDiffs",
  },
  {
    id: "tpl_evidence_comparison.recentAuditLogs",
    templateId: "tpl_evidence_comparison",
    slot: "related",
    sourceId: "incident.recentAuditLogs",
    required: false,
    inputMapping: { incidentId: "$args.incidentId" },
    outputKey: "recentAuditLogs",
  },
  {
    id: "tpl_evidence_comparison.rootCauseHints",
    templateId: "tpl_evidence_comparison",
    slot: "related",
    sourceId: "incident.rootCauseHints",
    required: false,
    inputMapping: { incidentId: "$args.incidentId" },
    outputKey: "rootCauseHints",
  },
  {
    id: "tpl_evidence_comparison.nextActions",
    templateId: "tpl_evidence_comparison",
    slot: "actions",
    sourceId: "incident.nextActions",
    required: false,
    inputMapping: { incidentId: "$args.incidentId" },
    outputKey: "nextActions",
  },
  {
    id: "tpl_dry_run_stepper.rollbackPlan",
    templateId: "tpl_dry_run_stepper",
    slot: "detail",
    sourceId: "deployment.rollbackPlanRequired",
    required: true,
    inputMapping: { deploymentId: "$args.deploymentId" },
    outputKey: "rollbackPlan",
  },
  {
    id: "tpl_dry_run_stepper.steps",
    templateId: "tpl_dry_run_stepper",
    slot: "events",
    sourceId: "deployment.rollbackSteps",
    required: true,
    inputMapping: { deploymentId: "$args.deploymentId" },
    outputKey: "steps",
  },
  {
    id: "tpl_dry_run_stepper.deployment",
    templateId: "tpl_dry_run_stepper",
    slot: "related",
    sourceId: "deployment.detail",
    required: false,
    inputMapping: { deploymentId: "$args.deploymentId" },
    outputKey: "deployment",
  },
  {
    id: "tpl_dry_run_stepper.riskChecks",
    templateId: "tpl_dry_run_stepper",
    slot: "related",
    sourceId: "deployment.riskChecks",
    required: false,
    inputMapping: { deploymentId: "$args.deploymentId" },
    outputKey: "riskChecks",
  },
  {
    id: "tpl_dry_run_stepper.dryRunSummary",
    templateId: "tpl_dry_run_stepper",
    slot: "related",
    sourceId: "deployment.dryRunSummary",
    required: false,
    inputMapping: { deploymentId: "$args.deploymentId" },
    outputKey: "dryRunSummary",
  },
  {
    id: "tpl_confirm_action.actionType",
    templateId: "tpl_confirm_action",
    slot: "actions",
    sourceId: "workflow.actionType",
    required: true,
    inputMapping: { actionType: "$args.actionType" },
    outputKey: "actionType",
  },
  {
    id: "tpl_confirm_action.entity",
    templateId: "tpl_confirm_action",
    slot: "detail",
    sourceId: "workflow.confirmEntity",
    required: true,
    inputMapping: {
      actionType: "$args.actionType",
      targetId: "$args.targetId",
    },
    outputKey: "entity",
  },
  {
    id: "tpl_confirm_action.checks",
    templateId: "tpl_confirm_action",
    slot: "approvals",
    sourceId: "workflow.confirmChecks",
    required: true,
    inputMapping: {
      actionType: "$args.actionType",
      targetId: "$args.targetId",
    },
    outputKey: "checks",
  },
  {
    id: "tpl_confirm_action.context",
    templateId: "tpl_confirm_action",
    slot: "related",
    sourceId: "workflow.confirmContext",
    required: true,
    inputMapping: {
      actionType: "$args.actionType",
      targetId: "$args.targetId",
    },
    outputKey: "context",
  },
  {
    id: "tpl_confirm_action.recentAuditLogs",
    templateId: "tpl_confirm_action",
    slot: "related",
    sourceId: "workflow.recentAuditLogs",
    required: false,
    inputMapping: {
      actionType: "$args.actionType",
      targetId: "$args.targetId",
    },
    outputKey: "recentAuditLogs",
  },
  {
    id: "tpl_confirm_action.recentRelatedEvents",
    templateId: "tpl_confirm_action",
    slot: "events",
    sourceId: "workflow.recentRelatedEvents",
    required: false,
    inputMapping: {
      actionType: "$args.actionType",
      targetId: "$args.targetId",
    },
    outputKey: "recentRelatedEvents",
  },
  {
    id: "tpl_confirm_action.approvalStatus",
    templateId: "tpl_confirm_action",
    slot: "approvals",
    sourceId: "workflow.approvalStatus",
    required: false,
    inputMapping: {
      actionType: "$args.actionType",
      targetId: "$args.targetId",
    },
    outputKey: "approvalStatus",
  },
  {
    id: "tpl_confirm_action.policyHints",
    templateId: "tpl_confirm_action",
    slot: "approvals",
    sourceId: "workflow.policyHints",
    required: false,
    inputMapping: {
      actionType: "$args.actionType",
      targetId: "$args.targetId",
    },
    outputKey: "policyHints",
  },
  {
    id: "tpl_job_spec_review.jobRun",
    templateId: "tpl_job_spec_review",
    slot: "detail",
    sourceId: "job.runDetail",
    required: true,
    inputMapping: { jobRunId: "$args.jobRunId" },
    outputKey: "jobRun",
  },
  {
    id: "tpl_job_spec_review.template",
    templateId: "tpl_job_spec_review",
    slot: "related",
    sourceId: "job.template",
    required: false,
    inputMapping: { jobRunId: "$args.jobRunId" },
    outputKey: "template",
  },
  {
    id: "tpl_job_spec_review.dryRunResult",
    templateId: "tpl_job_spec_review",
    slot: "metrics",
    sourceId: "job.dryRunResult",
    required: false,
    inputMapping: { jobRunId: "$args.jobRunId" },
    outputKey: "dryRunResult",
  },
  {
    id: "tpl_job_spec_review.jobRunEvents",
    templateId: "tpl_job_spec_review",
    slot: "events",
    sourceId: "job.runEvents",
    required: false,
    inputMapping: { jobRunId: "$args.jobRunId" },
    outputKey: "jobRunEvents",
  },
  {
    id: "tpl_job_spec_review.dependencySummary",
    templateId: "tpl_job_spec_review",
    slot: "related",
    sourceId: "job.dependencySummary",
    required: false,
    inputMapping: { jobRunId: "$args.jobRunId" },
    outputKey: "dependencySummary",
  },
  {
    id: "tpl_job_spec_review.rerunHints",
    templateId: "tpl_job_spec_review",
    slot: "actions",
    sourceId: "job.rerunHints",
    required: false,
    inputMapping: { jobRunId: "$args.jobRunId" },
    outputKey: "rerunHints",
  },
  {
    id: "tpl_report_template.incident",
    templateId: "tpl_report_template",
    slot: "detail",
    sourceId: "incident.detail",
    required: true,
    inputMapping: { incidentId: "$args.incidentId" },
    outputKey: "incident",
  },
  {
    id: "tpl_report_template.reportType",
    templateId: "tpl_report_template",
    slot: "report",
    sourceId: "report.type",
    required: true,
    inputMapping: { reportType: "$args.reportType" },
    outputKey: "reportType",
  },
  {
    id: "tpl_report_template.incidentEvents",
    templateId: "tpl_report_template",
    slot: "events",
    sourceId: "incident.events",
    required: false,
    inputMapping: { incidentId: "$args.incidentId" },
    outputKey: "incidentEvents",
  },
  {
    id: "tpl_report_template.evidenceSummary",
    templateId: "tpl_report_template",
    slot: "evidence",
    sourceId: "incident.evidenceSummary",
    required: false,
    inputMapping: { incidentId: "$args.incidentId" },
    outputKey: "evidenceSummary",
  },
  {
    id: "tpl_report_template.recentAuditLogs",
    templateId: "tpl_report_template",
    slot: "related",
    sourceId: "incident.recentAuditLogs",
    required: false,
    inputMapping: { incidentId: "$args.incidentId" },
    outputKey: "recentAuditLogs",
  },
  {
    id: "tpl_report_template.pendingActions",
    templateId: "tpl_report_template",
    slot: "actions",
    sourceId: "incident.pendingActions",
    required: false,
    inputMapping: { incidentId: "$args.incidentId" },
    outputKey: "pendingActions",
  },
];

function parseMapping(value: unknown) {
  if (typeof value !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([key, item]) => [
            key,
            String(item),
          ]),
        )
      : {};
  } catch {
    return {};
  }
}

function mergeBindingOverride(
  binding: TemplateBindingDef,
  override: Record<string, unknown> | undefined,
): TemplateBindingDef {
  if (!override) {
    return binding;
  }

  return {
    ...binding,
    sourceId: String(override["source_id"] ?? binding.sourceId),
    slot: String(override["slot"] ?? binding.slot) as TemplateBindingDef["slot"],
    required:
      typeof override["required"] === "number"
        ? Number(override["required"]) === 1
        : binding.required,
    outputKey: String(override["output_key"] ?? binding.outputKey),
    inputMapping:
      typeof override["input_mapping"] === "string"
        ? parseMapping(override["input_mapping"])
        : binding.inputMapping,
  };
}

export function listBindingsForTemplate(templateId: string) {
  const overrides = getA2UIBindingOverrides(templateId).reduce<Record<string, Record<string, unknown>>>(
    (acc, item) => {
      acc[String(item["binding_id"] ?? "")] = item;
      return acc;
    },
    {},
  );

  return TEMPLATE_BINDINGS
    .filter((binding) => binding.templateId === templateId)
    .map((binding) => mergeBindingOverride(binding, overrides[binding.id]));
}

export function getBindingDefinition(bindingId: string) {
  const binding = TEMPLATE_BINDINGS.find((item) => item.id === bindingId) ?? null;
  if (!binding) {
    return null;
  }

  const override = getA2UIBindingOverrides(binding.templateId).find(
    (item) => String(item["binding_id"] ?? "") === bindingId,
  );

  return mergeBindingOverride(binding, override);
}
