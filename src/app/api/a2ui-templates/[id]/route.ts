import { NextRequest, NextResponse } from "next/server";
import {
  clearA2UITemplateOverride,
  getA2UITemplate,
  getCurrentScenarioId,
  replaceA2UITemplateDecisionInputs,
  replaceA2UITemplateRulesByType,
  updateA2UITemplateEnabled,
  updateA2UITemplatePromptHint,
  upsertA2UITemplateOverride,
} from "@/server/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const template = getA2UITemplate(id);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const body = await req.json();
    const currentScenarioId = getCurrentScenarioId();
    const updates: Record<string, unknown> = {};

    if (typeof body?.isEnabled === "boolean") {
      updateA2UITemplateEnabled(id, body.isEnabled);
      updates["isEnabled"] = body.isEnabled;
    }

    if (Array.isArray(body?.keywords)) {
      replaceA2UITemplateRulesByType(id, "keyword", body.keywords);
      updates["keywords"] = body.keywords;
    }

    if (Array.isArray(body?.allowedPages)) {
      replaceA2UITemplateRulesByType(id, "page", body.allowedPages);
      updates["allowedPages"] = body.allowedPages;
    }

    if (Array.isArray(body?.allowedRoles)) {
      replaceA2UITemplateRulesByType(id, "role", body.allowedRoles);
      updates["allowedRoles"] = body.allowedRoles;
    }

    if (typeof body?.promptHint === "string") {
      updateA2UITemplatePromptHint(id, body.promptHint);
      updates["promptHint"] = body.promptHint;
    }

    if (Array.isArray(body?.decisionInputs)) {
      replaceA2UITemplateDecisionInputs(
        id,
        body.decisionInputs.map(
          (
            input: {
              input_key?: string;
              label?: string;
              description?: string;
              required?: boolean;
              source?: string;
              default_value?: string | null;
              priority?: number;
            },
            index: number,
          ) => ({
            input_key: String(input.input_key ?? ""),
            label: String(input.label ?? ""),
            description: String(input.description ?? ""),
            required: Boolean(input.required),
            source: String(input.source ?? "derived"),
            default_value: input.default_value ?? null,
            priority: typeof input.priority === "number" ? input.priority : (index + 1) * 10,
          }),
        ),
      );
      updates["decisionInputs"] = body.decisionInputs;
    }

    if ("scenarioEnabled" in body) {
      const scenarioId =
        typeof body?.scenarioId === "string" && body.scenarioId.trim().length > 0
          ? body.scenarioId.trim()
          : currentScenarioId;

      if (body.scenarioEnabled === null) {
        clearA2UITemplateOverride(id, "scenario", scenarioId);
        updates["scenarioEnabled"] = null;
      } else if (typeof body.scenarioEnabled === "boolean") {
        upsertA2UITemplateOverride(
          id,
          "scenario",
          scenarioId,
          body.scenarioEnabled,
        );
        updates["scenarioEnabled"] = body.scenarioEnabled;
      }
    }

    return NextResponse.json({
      success: true,
      template: getA2UITemplate(id),
      updates,
    });
  } catch (err) {
    console.error("[PATCH /api/a2ui-templates/[id]]", err);
    return NextResponse.json(
      { error: "Failed to update A2UI template" },
      { status: 500 },
    );
  }
}
