export type TemplateSlot =
  | "list"
  | "detail"
  | "metrics"
  | "events"
  | "evidence"
  | "approvals"
  | "related"
  | "actions"
  | "report"
  | "runbook";

export interface TemplateBindingDef {
  id: string;
  templateId: string;
  slot: TemplateSlot;
  sourceId: string;
  required: boolean;
  inputMapping: Record<string, string>;
  outputKey: string;
}

