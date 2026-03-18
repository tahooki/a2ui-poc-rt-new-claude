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
