import { NextRequest, NextResponse } from "next/server";
import {
  clearA2UITemplateOverride,
  getA2UITemplate,
  getCurrentScenarioId,
  logA2UITemplateSelection,
  replaceA2UITemplateDecisionInputs,
  replaceA2UITemplateBindingOverrides,
  replaceA2UITemplateRulesByType,
  upsertA2UIDataSourceOverrides,
  updateA2UITemplateEnabled,
  updateA2UITemplatePromptHint,
  upsertA2UITemplateOverride,
} from "@/server/db";
import { getBindingDefinition, getDataSourceDefinition } from "@/server/a2ui";

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

    if (Array.isArray(body?.bindingOverrides)) {
      replaceA2UITemplateBindingOverrides(
        id,
        body.bindingOverrides.map(
          (
            binding: {
              binding_id?: string;
              source_id?: string;
              slot?: string;
              required?: boolean;
              output_key?: string;
              input_mapping?: Record<string, string>;
            },
          ) => {
            const currentBinding = binding.binding_id
              ? getBindingDefinition(String(binding.binding_id))
              : null;

            return {
              binding_id: String(binding.binding_id ?? currentBinding?.id ?? ""),
              source_id: String(binding.source_id ?? currentBinding?.sourceId ?? ""),
              slot: String(binding.slot ?? currentBinding?.slot ?? "detail"),
              required:
                typeof binding.required === "boolean"
                  ? binding.required
                  : Boolean(currentBinding?.required),
              output_key: String(binding.output_key ?? currentBinding?.outputKey ?? ""),
              input_mapping:
                binding.input_mapping && typeof binding.input_mapping === "object"
                  ? Object.fromEntries(
                      Object.entries(binding.input_mapping).map(([key, value]) => [
                        key,
                        String(value ?? ""),
                      ]),
                    )
                  : currentBinding?.inputMapping ?? {},
            };
          },
        ),
      );
      updates["bindingOverrides"] = body.bindingOverrides;
    }

    if (Array.isArray(body?.sourceOverrides)) {
      upsertA2UIDataSourceOverrides(
        body.sourceOverrides.map(
          (
            source: {
              source_id?: string;
              kind?: string;
              method?: string | null;
              url?: string | null;
              handler_key?: string | null;
              path_params?: Record<string, string>;
              query_params?: Record<string, string>;
              body_mapping?: Record<string, string>;
              result_path?: string | null;
              timeout_ms?: number;
            },
          ) => {
            const currentSource = source.source_id
              ? getDataSourceDefinition(String(source.source_id))
              : null;

            return {
              source_id: String(source.source_id ?? currentSource?.id ?? ""),
              kind: String(source.kind ?? currentSource?.kind ?? "internal_db"),
              method:
                source.method === undefined
                  ? currentSource?.method ?? null
                  : source.method,
              url: source.url === undefined ? currentSource?.url ?? null : source.url,
              handler_key:
                source.handler_key === undefined
                  ? currentSource?.handlerKey ?? null
                  : source.handler_key,
              path_params:
                source.path_params && typeof source.path_params === "object"
                  ? Object.fromEntries(
                      Object.entries(source.path_params).map(([key, value]) => [
                        key,
                        String(value ?? ""),
                      ]),
                    )
                  : currentSource?.pathParams ?? {},
              query_params:
                source.query_params && typeof source.query_params === "object"
                  ? Object.fromEntries(
                      Object.entries(source.query_params).map(([key, value]) => [
                        key,
                        String(value ?? ""),
                      ]),
                    )
                  : currentSource?.queryParams ?? {},
              body_mapping:
                source.body_mapping && typeof source.body_mapping === "object"
                  ? Object.fromEntries(
                      Object.entries(source.body_mapping).map(([key, value]) => [
                        key,
                        String(value ?? ""),
                      ]),
                    )
                  : currentSource?.bodyMapping ?? {},
              result_path:
                source.result_path === undefined
                  ? currentSource?.resultPath ?? null
                  : source.result_path,
              timeout_ms:
                typeof source.timeout_ms === "number"
                  ? source.timeout_ms
                  : currentSource?.timeoutMs ?? 1500,
              input_schema: currentSource?.inputSchema ?? null,
              output_schema: currentSource?.outputSchema ?? null,
            };
          },
        ),
      );
      updates["sourceOverrides"] = body.sourceOverrides;
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

    if (body?.publishAction === true) {
      logA2UITemplateSelection({
        templateId: id,
        page: "templates",
        scenarioId:
          typeof body?.scenarioId === "string" && body.scenarioId.trim().length > 0
            ? body.scenarioId.trim()
            : currentScenarioId,
        operatorId:
          typeof body?.operatorId === "string" && body.operatorId.trim().length > 0
            ? body.operatorId.trim()
            : null,
        userMessage: `[publish] ${String(template["name"] ?? id)}`,
        selectionReason: "admin publish action",
        decisionPayload: {
          updates,
        },
        status: "selected",
      });
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
