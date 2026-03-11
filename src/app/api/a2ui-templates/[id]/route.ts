import { NextRequest, NextResponse } from "next/server";
import {
  clearA2UITemplateOverride,
  getA2UITemplate,
  getCurrentScenarioId,
  updateA2UITemplateEnabled,
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
