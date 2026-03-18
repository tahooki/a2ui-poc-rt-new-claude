import { buildTemplateCardData } from "./build-template-card-data";
import type { TemplateExecutionContext } from "../execution/resolve-input-mapping";

export interface RenderedTemplatePreviewResult {
  output: Record<string, unknown>;
  missingRequired: string[];
  warnings: string[];
  fallback: "partial_allowed" | "fallback_template" | "text_fallback" | null;
  fallbackTemplateId: string | null;
}

export async function renderTemplatePreview(input: {
  templateId: string;
  args: Record<string, string>;
  context?: TemplateExecutionContext;
  missingLabel?: string;
  depth?: number;
}): Promise<RenderedTemplatePreviewResult> {
  const built = await buildTemplateCardData({
    templateId: input.templateId,
    args: input.args,
    context: input.context,
  });

  if (built.missingRequired.length > 0) {
    if (built.fallback === "partial_allowed") {
      return {
        output: {
          type: "a2ui_render" as const,
          cardType: built.cardType,
          cardData: built.cardData,
          warnings: [
            ...built.warnings,
            `필수 데이터 일부가 누락되어 partial render로 표시합니다: ${built.missingRequired.join(", ")}`,
          ],
          missingRequired: built.missingRequired,
        },
        missingRequired: built.missingRequired,
        warnings: built.warnings,
        fallback: built.fallback,
        fallbackTemplateId: built.fallbackTemplateId ?? null,
      };
    }

    if (
      built.fallback === "fallback_template" &&
      built.fallbackTemplateId &&
      (input.depth ?? 0) < 1
    ) {
      return await renderTemplatePreview({
        templateId: built.fallbackTemplateId,
        args: input.args,
        context: input.context,
        missingLabel: input.missingLabel,
        depth: (input.depth ?? 0) + 1,
      });
    }

    return {
      output: {
        error: `${input.missingLabel ?? input.templateId} 생성에 필요한 필수 데이터가 없습니다: ${built.missingRequired.join(", ")}`,
        warnings: built.warnings,
        fallback: built.fallback,
        fallbackTemplateId: built.fallbackTemplateId ?? null,
      },
      missingRequired: built.missingRequired,
      warnings: built.warnings,
      fallback: built.fallback,
      fallbackTemplateId: built.fallbackTemplateId ?? null,
    };
  }

  return {
    output: {
      type: "a2ui_render" as const,
      cardType: built.cardType,
      cardData: built.cardData,
      warnings: built.warnings,
    },
    missingRequired: built.missingRequired,
    warnings: built.warnings,
    fallback: built.fallback,
    fallbackTemplateId: built.fallbackTemplateId ?? null,
  };
}
