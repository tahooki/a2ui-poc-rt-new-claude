import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { PageContext } from '@/server/ai/system-prompt';
import type {
  A2UITemplateAvailability,
  TemplateDecisionInputRecord,
} from '@/server/ai/template-service';

const decisionSchema = z.object({
  selectedTemplateId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  decisionReason: z.string().min(1),
  matchedSignals: z.array(z.string()).default([]),
  rejectedTemplateIds: z.array(z.string()).default([]),
  missingInputs: z.array(z.string()).default([]),
  shouldAskFollowUp: z.boolean().default(false),
  followUpQuestion: z.string().optional(),
});

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

export async function decideTemplateWithAI(
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
      schema: decisionSchema,
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
