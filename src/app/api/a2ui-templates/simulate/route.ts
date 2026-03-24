import { NextRequest, NextResponse } from "next/server";
import { getA2UITemplateByToolName, getCurrentScenarioId, logA2UITemplateSelection } from "@/server/db";
import { renderTemplatePreview } from "@/server/a2ui";
import { listEnabledA2UITemplates } from "@/server/ai/template-service";
import { A2UI_SCENARIO_QUESTION_CASES } from "@/server/scenarios/a2ui-question-catalog";

function resolvePreviewArgs(input: {
  toolName: string;
  templateId: string;
  scenarioId: string;
  question: string;
}) {
  const exactCase =
    A2UI_SCENARIO_QUESTION_CASES.find(
      (questionCase) =>
        questionCase.scenarioId === input.scenarioId &&
        questionCase.expectedToolName === input.toolName &&
        questionCase.question.trim() === input.question.trim(),
    ) ??
    A2UI_SCENARIO_QUESTION_CASES.find(
      (questionCase) =>
        questionCase.scenarioId === input.scenarioId &&
        questionCase.expectedToolName === input.toolName,
    );

  if (!exactCase) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(exactCase.toolArgs).map(([key, value]) => [key, String(value ?? "")]),
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const page = typeof body?.page === "string" ? body.page : "dashboard";
    const role = typeof body?.role === "string" ? body.role : "ops_engineer";
    const scenarioId =
      typeof body?.scenarioId === "string" && body.scenarioId.trim().length > 0
        ? body.scenarioId.trim()
        : getCurrentScenarioId();

    if (!question) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const forcedTemplateId =
      typeof body?.templateId === "string" && body.templateId.trim().length > 0
        ? body.templateId.trim()
        : null;

    const candidates = listEnabledA2UITemplates(
      {
        page,
        role,
        scenarioId,
      },
      question,
    )
      .sort((left, right) => {
        if (right.matchedKeywordCount !== left.matchedKeywordCount) {
          return right.matchedKeywordCount - left.matchedKeywordCount;
        }
        return left.name.localeCompare(right.name, "ko");
      });

    const selected = forcedTemplateId
      ? candidates.find((c) => c.id === forcedTemplateId) ?? candidates[0] ?? null
      : candidates[0] ?? null;
    if (!selected) {
      logA2UITemplateSelection({
        templateId: null,
        page: "templates",
        scenarioId,
        operatorId:
          typeof body?.operatorId === "string" ? body.operatorId : null,
        userMessage: question,
        selectionReason: "simulate route found no matching template",
        decisionPayload: {
          page,
          role,
        },
        status: "fallback",
      });
      return NextResponse.json({
        success: false,
        selectedTemplate: null,
        preview: null,
        diagnostics: {
          reason: "no_matching_template",
          candidates: [],
        },
      });
    }

    const template = getA2UITemplateByToolName(selected.tool_name);
    if (!template) {
      return NextResponse.json({
        success: false,
        selectedTemplate: {
          id: selected.id,
          name: selected.name,
          toolName: selected.tool_name,
          cardType: selected.card_type,
        },
        preview: null,
        diagnostics: {
          reason: "template_lookup_failed",
          candidates: candidates.slice(0, 5).map((item) => ({
            id: item.id,
            name: item.name,
            matchedKeywordCount: item.matchedKeywordCount,
          })),
        },
      });
    }

    const args = resolvePreviewArgs({
      toolName: selected.tool_name,
      templateId: String(template["id"] ?? selected.id),
      scenarioId,
      question,
    });

    const preview = await renderTemplatePreview({
      templateId: String(template["id"] ?? selected.id),
      args,
      context: {
        page,
        actorRole: role,
      },
      missingLabel: selected.name,
    });

    logA2UITemplateSelection({
      templateId: String(template["id"] ?? selected.id),
      page: "templates",
      scenarioId,
      operatorId:
        typeof body?.operatorId === "string" ? body.operatorId : null,
      userMessage: question,
      selectionReason: `simulate route selected ${selected.tool_name}`,
      decisionPayload: {
        page,
        role,
        args,
        candidates: candidates.slice(0, 5).map((item) => ({
          id: item.id,
          name: item.name,
          matchedKeywordCount: item.matchedKeywordCount,
        })),
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
      success: true,
      selectedTemplate: {
        id: String(template["id"] ?? selected.id),
        name: selected.name,
        toolName: selected.tool_name,
        cardType: selected.card_type,
        promptHint: selected.prompt_hint,
      },
      preview: preview.output,
      diagnostics: {
        missingRequired: preview.missingRequired,
        warnings: preview.warnings,
        fallback: preview.fallback,
        fallbackTemplateId: preview.fallbackTemplateId,
        candidates: candidates.slice(0, 5).map((item) => ({
          id: item.id,
          name: item.name,
          matchedKeywordCount: item.matchedKeywordCount,
        })),
      },
    });
  } catch (err) {
    console.error("[POST /api/a2ui-templates/simulate]", err);
    return NextResponse.json(
      { error: "Failed to simulate template selection" },
      { status: 500 },
    );
  }
}
