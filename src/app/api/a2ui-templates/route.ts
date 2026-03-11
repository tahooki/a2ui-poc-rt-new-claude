import { NextResponse } from "next/server";
import { getCurrentScenarioId } from "@/server/db";
import {
  getAllA2UITemplates,
  getA2UITemplateDecisionInputs,
  getA2UITemplateOverrides,
  getA2UITemplateRules,
} from "@/server/db";
import { listScenarios } from "@/server/scenarios";

export async function GET() {
  try {
    const currentScenarioId = getCurrentScenarioId();
    const templates = getAllA2UITemplates();
    const rules = getA2UITemplateRules();
    const overrides = getA2UITemplateOverrides();
    const decisionInputs = getA2UITemplateDecisionInputs();

    const rulesByTemplate = (rules as Array<Record<string, unknown>>).reduce<
      Record<string, Array<Record<string, unknown>>>
    >((acc, rule) => {
      const templateId = String(rule["template_id"] ?? "");
      acc[templateId] ??= [];
      acc[templateId].push(rule);
      return acc;
    }, {});

    const overridesByTemplate = (
      overrides as Array<Record<string, unknown>>
    ).reduce<Record<string, Array<Record<string, unknown>>>>((acc, override) => {
      const templateId = String(override["template_id"] ?? "");
      acc[templateId] ??= [];
      acc[templateId].push(override);
      return acc;
    }, {});

    const decisionInputsByTemplate = (
      decisionInputs as Array<Record<string, unknown>>
    ).reduce<Record<string, Array<Record<string, unknown>>>>(
      (acc, inputDef) => {
        const templateId = String(inputDef["template_id"] ?? "");
        acc[templateId] ??= [];
        acc[templateId].push(inputDef);
        return acc;
      },
      {},
    );

    const items = (templates as Array<Record<string, unknown>>).map((template) => {
      const templateId = String(template["id"] ?? "");
      const templateOverrides = overridesByTemplate[templateId] ?? [];
      const scenarioOverride = templateOverrides.find(
        (override) =>
          override["scope_type"] === "scenario" &&
          override["scope_value"] === currentScenarioId,
      );

      return {
        ...template,
        rules: rulesByTemplate[templateId] ?? [],
        overrides: templateOverrides,
        decision_inputs: decisionInputsByTemplate[templateId] ?? [],
        scenario_override_enabled:
          scenarioOverride && typeof scenarioOverride["enabled"] === "number"
            ? Number(scenarioOverride["enabled"]) === 1
            : null,
        effective_scenario_enabled:
          scenarioOverride && typeof scenarioOverride["enabled"] === "number"
            ? Number(scenarioOverride["enabled"]) === 1
            : Number(template["is_enabled"] ?? 0) === 1,
      };
    }) as Array<
      Record<string, unknown> & {
        scenario_override_enabled: boolean | null;
        effective_scenario_enabled: boolean;
      }
    >;

    return NextResponse.json({
      currentScenarioId,
      scenarios: listScenarios(),
      templates: items,
      counts: {
        total: items.length,
        enabled: items.filter((item) => Number(item["is_enabled"] ?? 0) === 1).length,
        effectiveForScenario: items.filter((item) => item.effective_scenario_enabled).length,
      },
    });
  } catch (err) {
    console.error("[GET /api/a2ui-templates]", err);
    return NextResponse.json(
      { error: "Failed to fetch A2UI templates" },
      { status: 500 },
    );
  }
}
