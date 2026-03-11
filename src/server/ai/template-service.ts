import {
  getAllA2UITemplates,
  getA2UITemplateDecisionInputs,
  getA2UITemplate,
  getA2UITemplateOverrides,
  getA2UITemplateRules,
} from "@/server/db";
import type { TemplateDecisionInputSource } from "@/server/ai/template-config";

type ScopeType = "global" | "scenario" | "page" | "role";

export interface TemplateRuleRecord {
  id: string;
  template_id: string;
  rule_type: "keyword" | "prompt_hint" | "page" | "role";
  rule_value: string;
  priority: number;
  created_at: string;
}

export interface TemplateOverrideRecord {
  id: string;
  template_id: string;
  scope_type: ScopeType;
  scope_value: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateDecisionInputRecord {
  id: string;
  template_id: string;
  input_key: string;
  label: string;
  description: string;
  required: number;
  source: TemplateDecisionInputSource;
  default_value: string | null;
  priority: number;
  created_at: string;
}

export interface A2UITemplateRecord {
  id: string;
  name: string;
  description: string;
  card_type: string;
  builder_key: string;
  tool_name: string;
  category: string;
  prompt_hint: string;
  is_enabled: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateResolutionInput {
  page: string;
  role: string;
  scenarioId: string;
}

export interface A2UITemplateAvailability extends A2UITemplateRecord {
  rules: TemplateRuleRecord[];
  overrides: TemplateOverrideRecord[];
  decisionInputs: TemplateDecisionInputRecord[];
  allowedPages: string[];
  allowedRoles: string[];
  keywords: string[];
  effectiveEnabled: boolean;
  blockReason: string | null;
  matchedKeywordCount: number;
}

function normalizeTemplate(
  row: Record<string, unknown> | undefined,
): A2UITemplateRecord | null {
  if (!row) return null;

  return {
    id: String(row["id"] ?? ""),
    name: String(row["name"] ?? ""),
    description: String(row["description"] ?? ""),
    card_type: String(row["card_type"] ?? ""),
    builder_key: String(row["builder_key"] ?? ""),
    tool_name: String(row["tool_name"] ?? ""),
    category: String(row["category"] ?? "general"),
    prompt_hint: String(row["prompt_hint"] ?? ""),
    is_enabled: Number(row["is_enabled"] ?? 0),
    created_at: String(row["created_at"] ?? ""),
    updated_at: String(row["updated_at"] ?? ""),
  };
}

function normalizeRules(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    id: String(row["id"] ?? ""),
    template_id: String(row["template_id"] ?? ""),
    rule_type: String(row["rule_type"] ?? "") as TemplateRuleRecord["rule_type"],
    rule_value: String(row["rule_value"] ?? ""),
    priority: Number(row["priority"] ?? 100),
    created_at: String(row["created_at"] ?? ""),
  }));
}

function normalizeOverrides(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    id: String(row["id"] ?? ""),
    template_id: String(row["template_id"] ?? ""),
    scope_type: String(row["scope_type"] ?? "global") as ScopeType,
    scope_value: String(row["scope_value"] ?? ""),
    enabled: Number(row["enabled"] ?? 0),
    created_at: String(row["created_at"] ?? ""),
    updated_at: String(row["updated_at"] ?? ""),
  }));
}

function normalizeDecisionInputs(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    id: String(row["id"] ?? ""),
    template_id: String(row["template_id"] ?? ""),
    input_key: String(row["input_key"] ?? ""),
    label: String(row["label"] ?? ""),
    description: String(row["description"] ?? ""),
    required: Number(row["required"] ?? 0),
    source: String(row["source"] ?? "derived") as TemplateDecisionInputSource,
    default_value:
      row["default_value"] === null || row["default_value"] === undefined
        ? null
        : String(row["default_value"]),
    priority: Number(row["priority"] ?? 100),
    created_at: String(row["created_at"] ?? ""),
  }));
}

function pickOverride(
  overrides: TemplateOverrideRecord[],
  scopeType: ScopeType,
  scopeValue: string,
) {
  return overrides.find(
    (override) =>
      override.scope_type === scopeType && override.scope_value === scopeValue,
  );
}

function getEffectiveEnabled(
  template: A2UITemplateRecord,
  overrides: TemplateOverrideRecord[],
  input: TemplateResolutionInput,
) {
  let enabled = template.is_enabled === 1;

  const globalOverride =
    pickOverride(overrides, "global", "*") ||
    pickOverride(overrides, "global", "default");
  if (globalOverride) enabled = globalOverride.enabled === 1;

  const scenarioOverride = pickOverride(overrides, "scenario", input.scenarioId);
  if (scenarioOverride) enabled = scenarioOverride.enabled === 1;

  const pageOverride = pickOverride(overrides, "page", input.page);
  if (pageOverride) enabled = pageOverride.enabled === 1;

  const roleOverride = pickOverride(overrides, "role", input.role);
  if (roleOverride) enabled = roleOverride.enabled === 1;

  return enabled;
}

function buildAvailability(
  template: A2UITemplateRecord,
  rules: TemplateRuleRecord[],
  overrides: TemplateOverrideRecord[],
  decisionInputs: TemplateDecisionInputRecord[],
  input: TemplateResolutionInput,
  userText = "",
): A2UITemplateAvailability {
  const allowedPages = rules
    .filter((rule) => rule.rule_type === "page")
    .map((rule) => rule.rule_value);
  const allowedRoles = rules
    .filter((rule) => rule.rule_type === "role")
    .map((rule) => rule.rule_value);
  const keywords = rules
    .filter((rule) => rule.rule_type === "keyword")
    .map((rule) => rule.rule_value);
  const normalizedUserText = userText.trim().toLowerCase();

  const effectiveEnabled = getEffectiveEnabled(template, overrides, input);

  let blockReason: string | null = null;
  if (!effectiveEnabled) {
    blockReason = "disabled";
  } else if (allowedPages.length > 0 && !allowedPages.includes(input.page)) {
    blockReason = "page_mismatch";
  } else if (allowedRoles.length > 0 && !allowedRoles.includes(input.role)) {
    blockReason = "role_mismatch";
  }

  const matchedKeywordCount = normalizedUserText
    ? keywords.filter((keyword) =>
        normalizedUserText.includes(keyword.toLowerCase()),
      ).length
    : 0;

  return {
    ...template,
    rules,
    overrides,
    decisionInputs,
    allowedPages,
    allowedRoles,
    keywords,
    effectiveEnabled: blockReason === null,
    blockReason,
    matchedKeywordCount,
  };
}

export function getA2UITemplateAvailability(
  templateId: string,
  input: TemplateResolutionInput,
  userText = "",
) {
  const template = normalizeTemplate(getA2UITemplate(templateId));
  if (!template) return null;

  return buildAvailability(
    template,
    normalizeRules(getA2UITemplateRules(templateId)),
    normalizeOverrides(getA2UITemplateOverrides(templateId)),
    normalizeDecisionInputs(getA2UITemplateDecisionInputs(templateId)),
    input,
    userText,
  );
}

export function listA2UITemplateAvailability(
  input: TemplateResolutionInput,
  userText = "",
) {
  const rulesByTemplate = normalizeRules(getA2UITemplateRules()).reduce<
    Record<string, TemplateRuleRecord[]>
  >((acc, rule) => {
    acc[rule.template_id] ??= [];
    acc[rule.template_id].push(rule);
    return acc;
  }, {});

  const overridesByTemplate = normalizeOverrides(
    getA2UITemplateOverrides(),
  ).reduce<Record<string, TemplateOverrideRecord[]>>((acc, override) => {
    acc[override.template_id] ??= [];
    acc[override.template_id].push(override);
    return acc;
  }, {});

  const decisionInputsByTemplate = normalizeDecisionInputs(
    getA2UITemplateDecisionInputs(),
  ).reduce<Record<string, TemplateDecisionInputRecord[]>>((acc, inputRule) => {
    acc[inputRule.template_id] ??= [];
    acc[inputRule.template_id].push(inputRule);
    return acc;
  }, {});

  return getAllA2UITemplates()
    .map((row) => normalizeTemplate(row))
    .filter((row): row is A2UITemplateRecord => row !== null)
    .map((template) =>
      buildAvailability(
        template,
        rulesByTemplate[template.id] ?? [],
        overridesByTemplate[template.id] ?? [],
        decisionInputsByTemplate[template.id] ?? [],
        input,
        userText,
      ),
    );
}

export function listEnabledA2UITemplates(
  input: TemplateResolutionInput,
  userText = "",
) {
  return listA2UITemplateAvailability(input, userText).filter(
    (template) => template.effectiveEnabled,
  );
}

export function buildTemplatePromptGuidance(
  input: TemplateResolutionInput,
  userText = "",
) {
  const enabledTemplates = listEnabledA2UITemplates(input, userText);
  if (enabledTemplates.length === 0) {
    return "현재 컨텍스트에서 활성화된 A2UI 템플릿이 없습니다. 일반 텍스트로만 응답하세요.";
  }

  const sortedTemplates = [...enabledTemplates].sort((a, b) => {
    if (b.matchedKeywordCount !== a.matchedKeywordCount) {
      return b.matchedKeywordCount - a.matchedKeywordCount;
    }
    return a.name.localeCompare(b.name, "ko");
  });

  const lines = sortedTemplates.map((template, index) => {
    const keywordText =
      template.keywords.length > 0
        ? `키워드: ${template.keywords.join(", ")}`
        : "키워드: 없음";
    const pageText =
      template.allowedPages.length > 0
        ? `페이지: ${template.allowedPages.join(", ")}`
        : "페이지 제한 없음";
    const inputText =
      template.decisionInputs.length > 0
        ? `판단근거 입력: ${template.decisionInputs
            .map((inputDef) =>
              `${inputDef.label}${inputDef.required === 1 ? "(필수)" : ""}`,
            )
            .join(", ")}`
        : "판단근거 입력: 없음";
    return `${index + 1}. ${template.name} (${template.tool_name}) - ${template.prompt_hint} / ${keywordText} / ${pageText} / ${inputText}`;
  });

  return [
    "현재 컨텍스트에서 사용 가능한 A2UI 템플릿:",
    ...lines,
    "질문과 가장 맞는 템플릿이 있을 때만 해당 render 도구를 호출하세요. 비활성 템플릿은 사용할 수 없습니다.",
  ].join("\n");
}
