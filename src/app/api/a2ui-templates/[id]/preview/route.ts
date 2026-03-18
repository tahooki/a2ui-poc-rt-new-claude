import { NextRequest, NextResponse } from "next/server";
import { getA2UITemplate, getCurrentScenarioId, logA2UITemplateSelection } from "@/server/db";
import { renderTemplatePreview } from "@/server/a2ui";
import { A2UI_SCENARIO_QUESTION_CASES } from "@/server/scenarios/a2ui-question-catalog";

function resolvePreviewArgs(input: {
  templateToolName: string;
  currentScenarioId: string;
  bodyArgs?: Record<string, unknown>;
  sampleCaseId?: string;
}) {
  if (input.bodyArgs && Object.keys(input.bodyArgs).length > 0) {
    return Object.fromEntries(
      Object.entries(input.bodyArgs).map(([key, value]) => [key, String(value ?? "")]),
    );
  }

  const sampleCase = A2UI_SCENARIO_QUESTION_CASES.find((questionCase) => {
    if (questionCase.expectedToolName !== input.templateToolName) {
      return false;
    }
    if (input.sampleCaseId) {
      return questionCase.id === input.sampleCaseId;
    }
    return questionCase.scenarioId === input.currentScenarioId;
  });

  if (!sampleCase) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(sampleCase.toolArgs).map(([key, value]) => [key, String(value ?? "")]),
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const template = getA2UITemplate(id);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const args = resolvePreviewArgs({
      templateToolName: String(template["tool_name"] ?? ""),
      currentScenarioId: getCurrentScenarioId(),
      bodyArgs: body?.args,
      sampleCaseId:
        typeof body?.sampleCaseId === "string" && body.sampleCaseId.trim().length > 0
          ? body.sampleCaseId.trim()
          : undefined,
    });

    const context =
      body?.context && typeof body.context === "object"
        ? {
            page: typeof body.context.page === "string" ? body.context.page : undefined,
            selectedEntityId:
              typeof body.context.selectedEntityId === "string"
                ? body.context.selectedEntityId
                : undefined,
            actorId:
              typeof body.context.actorId === "string" ? body.context.actorId : undefined,
            actorRole:
              typeof body.context.actorRole === "string" ? body.context.actorRole : undefined,
          }
        : undefined;

    const preview = await renderTemplatePreview({
      templateId: id,
      args,
      context,
      missingLabel: String(template["name"] ?? id),
    });

    logA2UITemplateSelection({
      templateId: id,
      page: "templates",
      scenarioId: getCurrentScenarioId(),
      operatorId:
        typeof body?.context?.actorId === "string" ? body.context.actorId : null,
      userMessage: `[preview] ${String(template["name"] ?? id)}`,
      selectionReason:
        preview.fallback === null
          ? "admin template preview success"
          : `admin template preview with fallback: ${preview.fallback}`,
      decisionPayload: {
        args,
        diagnostics: {
          missingRequired: preview.missingRequired,
          warnings: preview.warnings,
          fallback: preview.fallback,
          fallbackTemplateId: preview.fallbackTemplateId,
        },
      },
      status:
        preview.fallback === "text_fallback" && "error" in preview.output
          ? "fallback"
          : "selected",
    });

    return NextResponse.json({
      success: !("error" in preview.output),
      template: {
        id: String(template["id"] ?? id),
        name: String(template["name"] ?? id),
        cardType: String(template["card_type"] ?? ""),
        toolName: String(template["tool_name"] ?? ""),
      },
      args,
      preview: preview.output,
      diagnostics: {
        missingRequired: preview.missingRequired,
        warnings: preview.warnings,
        fallback: preview.fallback,
        fallbackTemplateId: preview.fallbackTemplateId,
      },
    });
  } catch (err) {
    console.error("[POST /api/a2ui-templates/[id]/preview]", err);
    return NextResponse.json(
      { error: "Failed to preview template" },
      { status: 500 },
    );
  }
}
