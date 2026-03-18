import { getBindingDefinition } from "../bindings/binding-definitions";
import { executeBindingSource } from "../execution/execute-data-source";
import type { TemplateExecutionContext } from "../execution/resolve-input-mapping";
import { getTemplateDefinition } from "../templates/template-definitions";

export interface BuiltTemplateData {
  templateId: string;
  cardType: string;
  cardData: Record<string, unknown>;
  missingRequired: string[];
  warnings: string[];
  fallback: "partial_allowed" | "fallback_template" | "text_fallback" | null;
  fallbackTemplateId?: string;
}

export async function buildTemplateCardData(input: {
  templateId: string;
  args: Record<string, string>;
  context?: TemplateExecutionContext;
}): Promise<BuiltTemplateData> {
  const template = getTemplateDefinition(input.templateId);
  if (!template) {
    throw new Error(`템플릿 정의를 찾을 수 없습니다: ${input.templateId}`);
  }

  const bindingIds = [...template.requiredBindings, ...template.optionalBindings];
  const cardData: Record<string, unknown> = {};
  const missingRequired: string[] = [];
  const warnings: string[] = [];

  for (const bindingId of bindingIds) {
    const binding = getBindingDefinition(bindingId);
    if (!binding) {
      missingRequired.push(bindingId);
      continue;
    }

    const result = await executeBindingSource({
      sourceId: binding.sourceId,
      mapping: binding.inputMapping,
      args: input.args,
      context: input.context,
    });

    if (!result.ok) {
      if (binding.required) {
        missingRequired.push(binding.outputKey);
      } else {
        warnings.push(result.error ?? `${binding.id} 실행 실패`);
      }
      continue;
    }

    if (result.data === null && binding.required) {
      missingRequired.push(binding.outputKey);
      continue;
    }

    cardData[binding.outputKey] = result.data;
  }

  const fallback =
    missingRequired.length === 0 ? null : template.fallbackPolicy.mode;

  return {
    templateId: template.id,
    cardType: template.cardType,
    cardData,
    missingRequired,
    warnings,
    fallback,
    fallbackTemplateId:
      template.fallbackPolicy.mode === "fallback_template"
        ? template.fallbackPolicy.fallbackTemplateId
        : undefined,
  };
}
