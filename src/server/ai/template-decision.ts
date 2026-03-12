import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { PageContext } from '@/server/ai/system-prompt';
import type {
  A2UITemplateAvailability,
  TemplateDecisionInputRecord,
} from '@/server/ai/template-service';
import {
  getToolParameterSpec,
  formatToolParamSpecForPrompt,
} from '@/server/ai/tool-parameter-spec';

// ─── Schemas ────────────────────────────────────────────────────────────────

const selectTemplateSchema = z.object({
  selectedTemplateId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  decisionReason: z.string().min(1),
  matchedSignals: z.array(z.string()).default([]),
  rejectedTemplateIds: z.array(z.string()).default([]),
  missingInputs: z.array(z.string()).default([]),
  shouldAskFollowUp: z.boolean().default(false),
  followUpQuestion: z.string().optional(),
});

const buildToolArgsSchema = z.object({
  toolName: z.string(),
  toolArgs: z.record(z.string(), z.unknown()),
  cardType: z.string(),
});

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TemplateDecisionResult {
  selectedTemplateId: string | null;
  confidence: number;
  decisionReason: string;
  matchedSignals: string[];
  rejectedTemplateIds: string[];
  missingInputs: string[];
  shouldAskFollowUp: boolean;
  followUpQuestion?: string;
}

export interface TemplateDecisionCandidate {
  template: A2UITemplateAvailability;
  collectedInputs: Record<string, string | number | boolean | null>;
  missingInputKeys: string[];
}

export interface TemplateDecisionOutcome extends TemplateDecisionResult {
  selectedTemplate: A2UITemplateAvailability | null;
  selectedCandidate: TemplateDecisionCandidate | null;
  candidates: TemplateDecisionCandidate[];
  strategy: 'rule+ai_second_pass' | 'rule+heuristic_fallback';
}

export interface ToolArgsResult {
  toolName: string;
  toolArgs: Record<string, unknown>;
  cardType: string;
}

interface DecideTemplateWithAIParams {
  userText: string;
  context: PageContext;
  scenarioId: string;
  templates: A2UITemplateAvailability[];
  apiKey?: string;
}

interface BuildTemplateDecisionCandidatesParams {
  templates: A2UITemplateAvailability[];
  userText: string;
  context: PageContext;
  scenarioId: string;
}

interface BuildToolArgsWithAIParams {
  selectedTemplate: A2UITemplateAvailability;
  userText: string;
  context: PageContext;
  scenarioId: string;
  apiKey?: string;
}

// ─── Input Collection Helpers ───────────────────────────────────────────────

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

function extractExplicitUserInputs(userText: string) {
  const extracted: Record<string, string> = {};
  const keyValuePattern = /([\w\-\u3131-\uD79D]+)\s*[:=]\s*([^\n,;]+)/g;

  let match: RegExpExecArray | null = keyValuePattern.exec(userText);
  while (match) {
    const key = normalizeToken(match[1] ?? '');
    const value = (match[2] ?? '').trim();
    if (key && value) {
      extracted[key] = value;
    }
    match = keyValuePattern.exec(userText);
  }

  return extracted;
}

function findInputValueByLabel(
  explicitInputs: Record<string, string>,
  inputDef: TemplateDecisionInputRecord,
) {
  const key = normalizeToken(inputDef.input_key);
  if (explicitInputs[key]) {
    return explicitInputs[key];
  }

  const label = normalizeToken(inputDef.label);
  if (explicitInputs[label]) {
    return explicitInputs[label];
  }

  return null;
}

function resolveContextInputValue(
  context: PageContext,
  scenarioId: string,
  inputKey: string,
) {
  const normalized = normalizeToken(inputKey);

  if (normalized === 'page') {
    return context.page;
  }
  if (normalized === 'operatorrole' || normalized === 'role') {
    return context.operatorRole;
  }
  if (normalized === 'operatorid') {
    return context.operatorId;
  }
  if (normalized === 'scenarioid') {
    return scenarioId;
  }
  if (normalized === 'selectedentityid') {
    return context.selectedEntityId ?? null;
  }

  if (normalized.includes('deployment')) {
    if (context.selectedEntityId?.startsWith('dep_')) {
      return context.selectedEntityId;
    }
  }

  if (normalized.includes('incident')) {
    if (context.selectedEntityId?.startsWith('inc_')) {
      return context.selectedEntityId;
    }
  }

  if (normalized.includes('job')) {
    if (context.selectedEntityId?.startsWith('job_')) {
      return context.selectedEntityId;
    }
  }

  return context.selectedEntityId ?? null;
}

function resolveDerivedInputValue(
  template: A2UITemplateAvailability,
  userText: string,
  inputKey: string,
) {
  const normalizedUserText = normalizeToken(userText);
  const matchedKeywords = template.keywords.filter((keyword) =>
    normalizedUserText.includes(normalizeToken(keyword)),
  );

  const normalizedKey = normalizeToken(inputKey);
  if (normalizedKey.includes('signal') || normalizedKey.includes('summary')) {
    if (matchedKeywords.length > 0) {
      return matchedKeywords.join(', ');
    }
    return '매칭된 키워드 없음';
  }

  return matchedKeywords.length > 0 ? matchedKeywords.join(', ') : null;
}

function collectTemplateInput(
  template: A2UITemplateAvailability,
  inputDef: TemplateDecisionInputRecord,
  userText: string,
  context: PageContext,
  scenarioId: string,
  explicitInputs: Record<string, string>,
) {
  if (inputDef.source === 'context') {
    return resolveContextInputValue(context, scenarioId, inputDef.input_key);
  }

  if (inputDef.source === 'derived') {
    return resolveDerivedInputValue(template, userText, inputDef.input_key);
  }

  const userValue = findInputValueByLabel(explicitInputs, inputDef);
  if (userValue) {
    return userValue;
  }

  if (inputDef.default_value) {
    return inputDef.default_value;
  }

  return null;
}

export function buildTemplateDecisionCandidates(
  params: BuildTemplateDecisionCandidatesParams,
) {
  const explicitInputs = extractExplicitUserInputs(params.userText);

  return params.templates.map((template) => {
    const collectedInputs: Record<string, string | number | boolean | null> = {};
    const missingInputKeys: string[] = [];

    for (const inputDef of template.decisionInputs) {
      const value = collectTemplateInput(
        template,
        inputDef,
        params.userText,
        params.context,
        params.scenarioId,
        explicitInputs,
      );
      collectedInputs[inputDef.input_key] =
        value === undefined ? null : (value as string | number | boolean | null);

      const isMissing =
        inputDef.required === 1 &&
        (value === null || value === undefined || String(value).trim().length === 0);

      if (isMissing) {
        missingInputKeys.push(inputDef.input_key);
      }
    }

    return {
      template,
      collectedInputs,
      missingInputKeys,
    } satisfies TemplateDecisionCandidate;
  });
}

// ─── Follow-up Question Builders ────────────────────────────────────────────

function buildFollowUpQuestion(candidate: TemplateDecisionCandidate) {
  const missingLabels = candidate.template.decisionInputs
    .filter((inputDef) => candidate.missingInputKeys.includes(inputDef.input_key))
    .map((inputDef) => inputDef.label);

  if (missingLabels.length === 0) {
    return undefined;
  }

  return `다음 판단 근거를 알려주시면 ${candidate.template.name} 템플릿 선택을 확정할 수 있습니다: ${missingLabels.join(', ')}`;
}

function buildAmbiguityFollowUpQuestion(candidates: TemplateDecisionCandidate[]) {
  const labels = candidates
    .slice(0, 3)
    .map((candidate) => candidate.template.name);

  if (labels.length === 0) {
    return '어떤 형태의 A2UI 템플릿이 필요한지 조금 더 구체적으로 알려주세요.';
  }

  return `원하는 형태를 조금 더 구체적으로 알려주세요. 예: ${labels.join(', ')}`;
}

// ─── Heuristic Fallback ─────────────────────────────────────────────────────

function chooseByHeuristic(
  candidates: TemplateDecisionCandidate[],
  userText: string,
): TemplateDecisionOutcome {
  const sorted = [...candidates].sort((a, b) => {
    if (b.template.matchedKeywordCount !== a.template.matchedKeywordCount) {
      return b.template.matchedKeywordCount - a.template.matchedKeywordCount;
    }
    if (a.missingInputKeys.length !== b.missingInputKeys.length) {
      return a.missingInputKeys.length - b.missingInputKeys.length;
    }
    return a.template.name.localeCompare(b.template.name, 'ko');
  });

  const selectedCandidate = sorted[0] ?? null;
  if (!selectedCandidate) {
    return {
      selectedTemplateId: null,
      confidence: 0,
      decisionReason: '선택 가능한 템플릿 후보가 없습니다.',
      matchedSignals: [],
      rejectedTemplateIds: [],
      missingInputs: [],
      shouldAskFollowUp: false,
      selectedTemplate: null,
      selectedCandidate: null,
      candidates,
      strategy: 'rule+heuristic_fallback',
    };
  }

  const followUpQuestion = buildFollowUpQuestion(selectedCandidate);
  const topKeywordCount = selectedCandidate.template.matchedKeywordCount;
  const nextCandidate = sorted[1] ?? null;
  const isAmbiguous =
    topKeywordCount === 0 ||
    (nextCandidate !== null &&
      nextCandidate.template.matchedKeywordCount === topKeywordCount &&
      topKeywordCount <= 1);
  const shouldAskFollowUp =
    selectedCandidate.missingInputKeys.length > 0 || isAmbiguous;

  return {
    selectedTemplateId: selectedCandidate.template.id,
    confidence:
      selectedCandidate.template.matchedKeywordCount > 0
        ? 0.75
        : 0.55,
    decisionReason:
      selectedCandidate.template.matchedKeywordCount > 0
        ? `키워드 매칭(${selectedCandidate.template.matchedKeywordCount})이 가장 높은 템플릿을 선택했습니다.`
        : '키워드 매칭이 낮아 템플릿 기본 우선순위로 선택했습니다.',
    matchedSignals: selectedCandidate.template.keywords.filter((keyword) =>
      normalizeToken(userText).includes(
        normalizeToken(keyword),
      ),
    ),
    rejectedTemplateIds: candidates
      .filter((candidate) => candidate.template.id !== selectedCandidate.template.id)
      .map((candidate) => candidate.template.id),
    missingInputs: selectedCandidate.missingInputKeys,
    shouldAskFollowUp,
    followUpQuestion:
      selectedCandidate.missingInputKeys.length > 0
        ? followUpQuestion
        : isAmbiguous
          ? buildAmbiguityFollowUpQuestion(sorted)
          : undefined,
    selectedTemplate: selectedCandidate.template,
    selectedCandidate,
    candidates,
    strategy: 'rule+heuristic_fallback',
  };
}

// ─── Sanitize ───────────────────────────────────────────────────────────────

function sanitizeDecisionOutcome(
  raw: TemplateDecisionResult,
  candidates: TemplateDecisionCandidate[],
): TemplateDecisionOutcome {
  const selectedCandidate =
    raw.selectedTemplateId === null
      ? null
      : candidates.find((candidate) => candidate.template.id === raw.selectedTemplateId) ??
        null;

  const fallbackCandidate = selectedCandidate ?? candidates[0] ?? null;
  const missingInputs =
    selectedCandidate?.missingInputKeys ?? fallbackCandidate?.missingInputKeys ?? [];

  const shouldAskFollowUp = raw.shouldAskFollowUp || missingInputs.length > 0;

  return {
    selectedTemplateId: selectedCandidate?.template.id ?? fallbackCandidate?.template.id ?? null,
    confidence: raw.confidence,
    decisionReason: raw.decisionReason,
    matchedSignals: raw.matchedSignals,
    rejectedTemplateIds: raw.rejectedTemplateIds,
    missingInputs,
    shouldAskFollowUp,
    followUpQuestion:
      raw.followUpQuestion ??
      (shouldAskFollowUp && fallbackCandidate
        ? buildFollowUpQuestion(fallbackCandidate)
        : undefined),
    selectedTemplate: selectedCandidate?.template ?? fallbackCandidate?.template ?? null,
    selectedCandidate: selectedCandidate ?? fallbackCandidate,
    candidates,
    strategy: 'rule+ai_second_pass',
  };
}

// ─── 1차 AI 호출: 템플릿 선택 ───────────────────────────────────────────────

export async function selectTemplateWithAI(
  params: DecideTemplateWithAIParams,
): Promise<TemplateDecisionOutcome> {
  const candidates = buildTemplateDecisionCandidates({
    templates: params.templates,
    userText: params.userText,
    context: params.context,
    scenarioId: params.scenarioId,
  });

  if (candidates.length === 0) {
    return {
      selectedTemplateId: null,
      confidence: 0,
      decisionReason: '선택 가능한 템플릿이 없습니다.',
      matchedSignals: [],
      rejectedTemplateIds: [],
      missingInputs: [],
      shouldAskFollowUp: false,
      selectedTemplate: null,
      selectedCandidate: null,
      candidates,
      strategy: 'rule+heuristic_fallback',
    };
  }

  if (candidates.length === 1) {
    const single = candidates[0];
    return {
      selectedTemplateId: single.template.id,
      confidence: 1,
      decisionReason: '활성 템플릿 후보가 1개여서 자동 선택했습니다.',
      matchedSignals: single.template.keywords,
      rejectedTemplateIds: [],
      missingInputs: single.missingInputKeys,
      shouldAskFollowUp: single.missingInputKeys.length > 0,
      followUpQuestion: buildFollowUpQuestion(single),
      selectedTemplate: single.template,
      selectedCandidate: single,
      candidates,
      strategy: 'rule+heuristic_fallback',
    };
  }

  const hasValidApiKey =
    typeof params.apiKey === 'string' &&
    params.apiKey.trim().length > 0 &&
    !params.apiKey.includes('your') &&
    !params.apiKey.includes('here');

  if (!hasValidApiKey) {
    return chooseByHeuristic(candidates, params.userText);
  }

  try {
    const candidatesSummary = candidates.map((candidate) => ({
      templateId: candidate.template.id,
      name: candidate.template.name,
      toolName: candidate.template.tool_name,
      cardType: candidate.template.card_type,
      promptHint: candidate.template.prompt_hint,
      matchedKeywordCount: candidate.template.matchedKeywordCount,
      keywords: candidate.template.keywords,
      decisionInputs: candidate.template.decisionInputs.map((inputDef) => ({
        key: inputDef.input_key,
        label: inputDef.label,
        required: inputDef.required === 1,
        source: inputDef.source,
      })),
      collectedInputs: candidate.collectedInputs,
      missingInputs: candidate.missingInputKeys,
    }));

    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: selectTemplateSchema,
      system:
        '당신은 A2UI 템플릿 라우팅 판별기입니다. 반드시 후보 목록 내부의 templateId만 선택하고, 선택 근거를 간결하게 작성하세요.',
      prompt: [
        `질문: ${params.userText || '(없음)'}`,
        `페이지: ${params.context.page}`,
        `운영자 역할: ${params.context.operatorRole}`,
        `시나리오: ${params.scenarioId}`,
        '후보 템플릿(JSON):',
        JSON.stringify(candidatesSummary, null, 2),
        '',
        '규칙:',
        '- selectedTemplateId는 반드시 후보 templateId 중 하나이거나 null 이어야 한다.',
        '- 질문 의도와 가장 맞는 템플릿 1개만 선택한다.',
        '- 각 템플릿의 promptHint와 keywords를 주요 판단 근거로 사용한다.',
        '- missingInputs는 선택 템플릿의 누락 key만 넣는다.',
        '- 질문으로 템플릿 선택이 불가능하면 selectedTemplateId를 null로 둔다.',
      ].join('\n'),
    });

    const decision = sanitizeDecisionOutcome(object, candidates);
    if (!decision.selectedTemplate) {
      return chooseByHeuristic(candidates, params.userText);
    }

    return decision;
  } catch {
    return chooseByHeuristic(candidates, params.userText);
  }
}

// ─── 2차 AI 호출: tool args 생성 ────────────────────────────────────────────

export async function buildToolArgsWithAI(
  params: BuildToolArgsWithAIParams,
): Promise<ToolArgsResult | null> {
  const { selectedTemplate, userText, context, scenarioId } = params;
  const paramSpec = getToolParameterSpec(selectedTemplate.tool_name);

  if (!paramSpec) {
    return buildToolArgsByHeuristic(selectedTemplate, context, userText);
  }

  const hasValidApiKey =
    typeof params.apiKey === 'string' &&
    params.apiKey.trim().length > 0 &&
    !params.apiKey.includes('your') &&
    !params.apiKey.includes('here');

  if (!hasValidApiKey) {
    return buildToolArgsByHeuristic(selectedTemplate, context, userText);
  }

  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: buildToolArgsSchema,
      system:
        '당신은 A2UI 카드 렌더링 데이터 생성기입니다. 선택된 템플릿의 tool을 실행하기 위한 정확한 인자를 생성하세요.',
      prompt: [
        `사용자 질문: ${userText || '(없음)'}`,
        `현재 페이지: ${context.page}`,
        `운영자 역할: ${context.operatorRole}`,
        `시나리오: ${scenarioId}`,
        `선택된 엔티티 ID: ${context.selectedEntityId ?? '없음'}`,
        '',
        '선택된 템플릿 정보:',
        `  이름: ${selectedTemplate.name}`,
        `  설명: ${selectedTemplate.description}`,
        `  promptHint: ${selectedTemplate.prompt_hint}`,
        '',
        '실행할 tool 스펙:',
        formatToolParamSpecForPrompt(paramSpec),
        '',
        '규칙:',
        `- toolName은 반드시 "${selectedTemplate.tool_name}"이어야 한다.`,
        `- cardType은 반드시 "${selectedTemplate.card_type}"이어야 한다.`,
        '- toolArgs의 각 필드는 위 파라미터 스펙에 정의된 이름과 타입을 따른다.',
        '- enum 타입은 반드시 허용 값 중 하나여야 한다.',
        '- ID를 특정할 수 없으면 스펙에 정의된 defaultAlias를 사용한다.',
        '- 선택된 엔티티 ID가 해당 타입이면 그것을 우선 사용한다.',
        '  (dep_ 접두사 → deploymentId, inc_ → incidentId, job_ → jobRunId)',
      ].join('\n'),
    });

    // Validate toolName and cardType match
    if (object.toolName !== selectedTemplate.tool_name) {
      object.toolName = selectedTemplate.tool_name;
    }
    if (object.cardType !== selectedTemplate.card_type) {
      object.cardType = selectedTemplate.card_type;
    }

    return object;
  } catch {
    return buildToolArgsByHeuristic(selectedTemplate, context, userText);
  }
}

// ─── Heuristic tool args fallback ───────────────────────────────────────────

function buildToolArgsByHeuristic(
  template: A2UITemplateAvailability,
  context: PageContext,
  userText: string,
): ToolArgsResult | null {
  const paramSpec = getToolParameterSpec(template.tool_name);
  if (!paramSpec) return null;

  const toolArgs: Record<string, unknown> = {};

  for (const param of paramSpec.params) {
    if (param.type === 'enum' && param.enumValues) {
      // Try to infer from context
      const inferred = inferEnumValue(param, context, userText);
      toolArgs[param.name] = inferred ?? param.enumValues[0];
    } else {
      // String ID param — try to use context entity or default alias
      const contextId = inferIdFromContext(param.name, context);
      toolArgs[param.name] = contextId ?? param.defaultAlias ?? 'latest';
    }
  }

  return {
    toolName: template.tool_name,
    toolArgs,
    cardType: template.card_type,
  };
}

function inferIdFromContext(paramName: string, context: PageContext): string | null {
  const entityId = context.selectedEntityId;
  if (!entityId) return null;

  const normalized = paramName.toLowerCase();

  if (normalized.includes('deployment') && entityId.startsWith('dep_')) return entityId;
  if (normalized.includes('incident') && entityId.startsWith('inc_')) return entityId;
  if (normalized.includes('job') && entityId.startsWith('job_')) return entityId;
  if (normalized === 'targetid') return entityId;

  return null;
}

function inferEnumValue(
  param: { name: string; enumValues?: string[] },
  context: PageContext,
  userText: string,
): string | null {
  if (!param.enumValues) return null;
  const normalizedText = normalizeToken(userText);

  if (param.name === 'actionType') {
    if (context.selectedEntityId?.startsWith('job_') || context.page === 'jobs' ||
        normalizedText.includes('job') || normalizedText.includes('잡')) {
      return 'job_execute';
    }
    if (context.selectedEntityId?.startsWith('inc_') || context.page === 'incidents' ||
        normalizedText.includes('인시던트') || normalizedText.includes('incident')) {
      return 'incident_close';
    }
    return 'rollback';
  }

  if (param.name === 'reportType') {
    if (normalizedText.includes('postmortem') || normalizedText.includes('포스트모템')) {
      return 'incident_postmortem';
    }
    if (normalizedText.includes('weekly') || normalizedText.includes('주간')) {
      return 'weekly_ops';
    }
    if (normalizedText.includes('배포 리뷰') || normalizedText.includes('deployment review')) {
      return 'deployment_review';
    }
    return context.page === 'reports' || context.page === 'incidents'
      ? 'incident_postmortem'
      : 'default';
  }

  return null;
}

// ─── Legacy compatibility export ────────────────────────────────────────────
// decideTemplateWithAI is kept as an alias for selectTemplateWithAI
// so that existing imports continue to work during migration.

export const decideTemplateWithAI = selectTemplateWithAI;
