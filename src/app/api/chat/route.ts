import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  stepCountIs,
  type UIMessage,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { buildSystemPrompt, PageContext } from '@/server/ai/system-prompt';
import { aiTools } from '@/server/ai/tools';
import {
  clearPendingTemplateDecisionState,
  getCurrentScenarioId,
  getAllDeployments,
  getAllIncidents,
  getAllJobRuns,
  getAllReports,
  getAuditLogs,
  getPendingTemplateDecisionState,
  logA2UITemplateSelection,
  setPendingTemplateDecisionState,
} from '@/server/db';
import {
  buildTemplatePromptGuidance,
  listEnabledA2UITemplates,
  type A2UITemplateAvailability,
} from '@/server/ai/template-service';
import { CORE_AI_TOOL_NAMES } from '@/server/ai/template-config';
import {
  A2UI_SCENARIO_QUESTION_CASES,
} from '@/server/scenarios/a2ui-question-catalog';
import {
  buildTemplateDecisionCandidates,
  decideTemplateWithAI,
  type TemplateDecisionOutcome,
} from '@/server/ai/template-decision';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ChatRequestBody {
  messages: UIMessage[];
  context: PageContext;
}

function normalizeQuestionForMatch(text: string) {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function hasA2UIIntent(
  userText: string,
  templates: A2UITemplateAvailability[] = [],
) {
  const normalizedUserText = normalizeQuestionForMatch(userText);
  const explicitUiSignals = [
    '카드',
    'a2ui',
    '템플릿',
    'stepper',
    '스텝퍼',
    '체크리스트',
    '렌더',
    '렌더링',
  ];
  const renderVerbs = ['보여줘', '띄워줘', '표시해줘', 'render'];
  const hasUiSignal = explicitUiSignals.some((keyword) =>
    normalizedUserText.includes(keyword),
  );
  const hasRenderVerb = renderVerbs.some((keyword) =>
    normalizedUserText.includes(keyword),
  );
  const hasTemplateKeywordSignal = templates.some((template) =>
    template.keywords.some((keyword) =>
      normalizedUserText.includes(keyword.toLowerCase()),
    ),
  );

  return hasUiSignal || (hasRenderVerb && hasTemplateKeywordSignal);
}

function getCollectedString(
  collectedInputs: Record<string, string | number | boolean | null> | undefined,
  ...keys: string[]
) {
  if (!collectedInputs) {
    return null;
  }

  for (const key of keys) {
    const value = collectedInputs[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function inferDeploymentTargetId(
  context: PageContext,
  collectedInputs?: Record<string, string | number | boolean | null>,
) {
  const decisionTargetId = getCollectedString(
    collectedInputs,
    'selectedDeploymentId',
    'selectedEntityId',
  );
  if (decisionTargetId?.startsWith('dep_')) {
    return decisionTargetId;
  }

  return context.selectedEntityId?.startsWith('dep_') ? context.selectedEntityId : 'latest';
}

function inferIncidentTargetId(
  context: PageContext,
  collectedInputs?: Record<string, string | number | boolean | null>,
) {
  const decisionTargetId = getCollectedString(
    collectedInputs,
    'selectedIncidentId',
    'selectedEntityId',
  );
  if (decisionTargetId?.startsWith('inc_')) {
    return decisionTargetId;
  }

  return context.selectedEntityId?.startsWith('inc_') ? context.selectedEntityId : 'active_incident';
}

function inferJobRunTargetId(
  context: PageContext,
  collectedInputs?: Record<string, string | number | boolean | null>,
) {
  const decisionTargetId = getCollectedString(
    collectedInputs,
    'selectedJobRunId',
    'selectedEntityId',
  );
  if (decisionTargetId?.startsWith('job_')) {
    return decisionTargetId;
  }

  return context.selectedEntityId?.startsWith('job_') ? context.selectedEntityId : 'latest_job';
}

function inferConfirmActionType(
  context: PageContext,
  userText: string,
  collectedInputs?: Record<string, string | number | boolean | null>,
) {
  const normalizedUserText = normalizeQuestionForMatch(userText);
  const selectedEntityId = getCollectedString(
    collectedInputs,
    'selectedEntityId',
    'selectedJobRunId',
    'selectedIncidentId',
    'selectedDeploymentId',
  );

  if (
    selectedEntityId?.startsWith('job_') ||
    context.selectedEntityId?.startsWith('job_') ||
    context.page === 'jobs' ||
    normalizedUserText.includes('job') ||
    normalizedUserText.includes('잡')
  ) {
    return 'job_execute' as const;
  }

  if (
    selectedEntityId?.startsWith('inc_') ||
    context.selectedEntityId?.startsWith('inc_') ||
    context.page === 'incidents' ||
    normalizedUserText.includes('인시던트') ||
    normalizedUserText.includes('incident')
  ) {
    return 'incident_close' as const;
  }

  return 'rollback' as const;
}

function inferReportType(context: PageContext, userText: string) {
  const normalizedUserText = normalizeQuestionForMatch(userText);

  if (
    normalizedUserText.includes('postmortem') ||
    normalizedUserText.includes('포스트모템')
  ) {
    return 'incident_postmortem' as const;
  }

  if (
    normalizedUserText.includes('weekly') ||
    normalizedUserText.includes('주간')
  ) {
    return 'weekly_ops' as const;
  }

  if (
    normalizedUserText.includes('배포 리뷰') ||
    normalizedUserText.includes('deployment review')
  ) {
    return 'deployment_review' as const;
  }

  if (context.page === 'reports' || context.page === 'incidents') {
    return 'incident_postmortem' as const;
  }

  return 'default' as const;
}

function buildTemplateToolArgs(
  template: A2UITemplateAvailability,
  context: PageContext,
  userText: string,
  collectedInputs?: Record<string, string | number | boolean | null>,
) {
  switch (template.tool_name) {
    case 'renderRollbackCard':
    case 'renderDryRunStepperCard':
      return {
        deploymentId: inferDeploymentTargetId(context, collectedInputs),
      };
    case 'renderEvidenceCard':
      return {
        incidentId: inferIncidentTargetId(context, collectedInputs),
      };
    case 'renderJobReviewCard':
      return {
        jobRunId: inferJobRunTargetId(context, collectedInputs),
      };
    case 'renderConfirmCard': {
      const actionType = inferConfirmActionType(context, userText, collectedInputs);
      const targetId =
        actionType === 'job_execute'
          ? inferJobRunTargetId(context, collectedInputs)
          : actionType === 'incident_close'
            ? inferIncidentTargetId(context, collectedInputs)
            : inferDeploymentTargetId(context, collectedInputs);

      return {
        actionType,
        targetId,
      };
    }
    case 'renderReportTemplateCard':
      return {
        incidentId: inferIncidentTargetId(context, collectedInputs),
        reportType: inferReportType(context, userText),
      };
    default:
      return null;
  }
}

function findForcedA2UIQuestionCase(
  context: PageContext,
  userText: string,
  scenarioId: string,
) {
  const normalizedUserText = normalizeQuestionForMatch(userText);
  if (!normalizedUserText) {
    return null;
  }

  const matches = A2UI_SCENARIO_QUESTION_CASES.filter(
    (questionCase) =>
      normalizeQuestionForMatch(questionCase.question) === normalizedUserText,
  );

  if (matches.length === 0) {
    return null;
  }

  return (
    matches.find(
      (questionCase) =>
        questionCase.scenarioId === scenarioId &&
        questionCase.page === context.page &&
        questionCase.operatorRole === context.operatorRole,
    ) ??
    matches.find(
      (questionCase) =>
        questionCase.page === context.page &&
        questionCase.operatorRole === context.operatorRole,
    ) ??
    matches.find((questionCase) => questionCase.page === context.page) ??
    matches[0]
  );
}

interface A2UIRenderOutput {
  type: 'a2ui_render';
  cardType: string;
  cardData: Record<string, unknown>;
}

function isA2UIRenderOutput(output: unknown): output is A2UIRenderOutput {
  if (!output || typeof output !== 'object') return false;

  const record = output as Record<string, unknown>;
  return (
    record.type === 'a2ui_render' &&
    typeof record.cardType === 'string' &&
    typeof record.cardData === 'object' &&
    record.cardData !== null
  );
}

function attachDecisionEnvelope(
  output: unknown,
  input: {
    template: A2UITemplateAvailability;
    decision: TemplateDecisionOutcome;
    selectedToolName: string;
  },
) {
  if (!isA2UIRenderOutput(output)) {
    return output;
  }

  return {
    ...output,
    cardData: {
      ...output.cardData,
      _a2uiDecisionContext: {
        templateId: input.template.id,
        toolName: input.selectedToolName,
        strategy: input.decision.strategy,
        confidence: input.decision.confidence,
        decisionReason: input.decision.decisionReason,
        matchedSignals: input.decision.matchedSignals,
        missingInputs: input.decision.missingInputs,
        collectedInputs: input.decision.selectedCandidate?.collectedInputs ?? {},
      },
    },
    renderer: {
      name: 'A2UICardRenderer',
      version: 'v1',
      schema: 'A2UIRenderEnvelope/v1',
    },
    template: {
      templateId: input.template.id,
      toolName: input.selectedToolName,
      cardType: output.cardType,
    },
    decision: {
      strategy: input.decision.strategy,
      confidence: input.decision.confidence,
      decisionReason: input.decision.decisionReason,
      matchedSignals: input.decision.matchedSignals,
      missingInputs: input.decision.missingInputs,
      collectedInputs: input.decision.selectedCandidate?.collectedInputs ?? {},
    },
  };
}

function createForcedA2UIResponse(
  messages: UIMessage[],
  forcedInvocation: {
    expectedToolName: string;
    toolArgs: Record<string, unknown>;
  },
  output: unknown,
) {
  const toolCallId = `forced-${forcedInvocation.expectedToolName}-${Date.now()}`;
  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: ({ writer }) => {
      writer.write({ type: 'start' });
      writer.write({ type: 'start-step' });
      writer.write({
        type: 'tool-input-available',
        dynamic: true,
        toolCallId,
        toolName: forcedInvocation.expectedToolName,
        input: forcedInvocation.toolArgs,
      });
      writer.write({
        type: 'tool-output-available',
        toolCallId,
        output,
      });
      writer.write({ type: 'finish-step' });
      writer.write({ type: 'finish', finishReason: 'stop' });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function createTextResponse(messages: UIMessage[], text: string): Response {
  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: ({ writer }) => {
      writer.write({ type: 'start' });
      writer.write({ type: 'text-start', id: 'decision-followup-text' });
      writer.write({
        type: 'text-delta',
        id: 'decision-followup-text',
        delta: text,
      });
      writer.write({ type: 'text-end', id: 'decision-followup-text' });
      writer.write({ type: 'finish', finishReason: 'stop' });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function isPendingTemplateDecisionActive(createdAt: string) {
  const createdTime = new Date(createdAt).getTime();
  if (Number.isNaN(createdTime)) {
    return false;
  }

  return Date.now() - createdTime <= 15 * 60 * 1000;
}

function selectRuntimeTools(context: PageContext, userText: string) {
  const scenarioId = getCurrentScenarioId();
  const enabledTemplates = listEnabledA2UITemplates(
    {
      page: context.page,
      role: context.operatorRole,
      scenarioId,
    },
    userText,
  );

  const activeToolNames = new Set<string>([
    ...CORE_AI_TOOL_NAMES,
    ...enabledTemplates.map((template) => template.tool_name),
  ]);

  const runtimeTools = Object.fromEntries(
    Object.entries(aiTools).filter(([toolName]) => activeToolNames.has(toolName)),
  ) as typeof aiTools;

  const templateGuidance = buildTemplatePromptGuidance(
    {
      page: context.page,
      role: context.operatorRole,
      scenarioId,
    },
    userText,
  );

  return {
    runtimeTools,
    templateGuidance,
  };
}

function extractLastUserText(messages: UIMessage[]): string {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');

  if (!lastUserMessage?.parts) {
    return '';
  }

  return lastUserMessage.parts
    .filter(
      (part): part is Extract<(typeof lastUserMessage.parts)[number], { type: 'text'; text: string }> =>
        part.type === 'text' && typeof part.text === 'string'
    )
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function buildLocalFallbackText(context: PageContext, messages: UIMessage[]): string {
  const incidents = getAllIncidents() as Array<{ id: string; title: string; severity: string; status: string }>;
  const deployments = getAllDeployments() as Array<{ id: string; service_id: string; version: string; status: string }>;
  const jobs = getAllJobRuns() as Array<{ id: string; template_id: string; status: string }>;
  const reports = getAllReports() as Array<{ id: string; title: string; status: string }>;
  const auditLogs = getAuditLogs({ limit: 10 }) as Array<{ action_type: string; result: string; target_id: string }>;
  const userText = extractLastUserText(messages);

  const activeIncidents = incidents.filter((incident) =>
    ['open', 'investigating', 'mitigated'].includes(incident.status)
  );
  const riskyDeployments = deployments.filter((deployment) =>
    ['failed', 'running', 'rolled_back'].includes(deployment.status)
  );
  const pendingJobs = jobs.filter((job) => ['draft', 'dry_run_ready', 'approved', 'running'].includes(job.status));
  const deniedAuditLogs = auditLogs.filter((log) => log.result !== 'success');

  const baseSummary = [
    '현재 환경에서는 OpenAI API 키가 설정되지 않아 로컬 운영 데이터 기반으로 요약합니다.',
    `- 활성 인시던트: ${activeIncidents.length}건`,
    `- 주의가 필요한 배포: ${riskyDeployments.length}건`,
    `- 진행 중이거나 대기 중인 잡: ${pendingJobs.length}건`,
    `- 보고서 초안/검토 대상: ${reports.filter((report) => report.status !== 'exported').length}건`,
  ];

  if (context.page === 'incidents') {
    const topIncidents = activeIncidents
      .slice(0, 3)
      .map((incident) => `- ${incident.severity.toUpperCase()} ${incident.title} (${incident.status})`);

    return [
      ...baseSummary,
      '',
      '인시던트 우선순위:',
      ...(topIncidents.length > 0 ? topIncidents : ['- 현재 열린 인시던트가 없습니다.']),
      '',
      `질문 반영: ${userText || '요청 내용 없음'}`,
    ].join('\n');
  }

  if (context.page === 'deployments') {
    const items = riskyDeployments
      .slice(0, 3)
      .map((deployment) => `- ${deployment.service_id} ${deployment.version} (${deployment.status})`);

    return [
      ...baseSummary,
      '',
      '배포 현황:',
      ...(items.length > 0 ? items : ['- 현재 주의가 필요한 배포가 없습니다.']),
      '',
      `질문 반영: ${userText || '요청 내용 없음'}`,
    ].join('\n');
  }

  if (context.page === 'jobs') {
    const items = pendingJobs
      .slice(0, 3)
      .map((job) => `- ${job.template_id} (${job.status})`);

    return [
      ...baseSummary,
      '',
      '잡 실행 현황:',
      ...(items.length > 0 ? items : ['- 현재 진행 중이거나 승인 대기 중인 잡이 없습니다.']),
      '',
      `질문 반영: ${userText || '요청 내용 없음'}`,
    ].join('\n');
  }

  if (context.page === 'reports') {
    const items = reports
      .slice(0, 3)
      .map((report) => `- ${report.title} (${report.status})`);

    return [
      ...baseSummary,
      '',
      '보고서 현황:',
      ...(items.length > 0 ? items : ['- 현재 보고서가 없습니다.']),
      '',
      `질문 반영: ${userText || '요청 내용 없음'}`,
    ].join('\n');
  }

  if (context.page === 'audit') {
    const items = deniedAuditLogs
      .slice(0, 3)
      .map((log) => `- ${log.action_type} (${log.result}) #${log.target_id.slice(0, 8)}`);

    return [
      ...baseSummary,
      '',
      '최근 비정상 감사 로그:',
      ...(items.length > 0 ? items : ['- 최근 실패/거부된 감사 로그가 없습니다.']),
      '',
      `질문 반영: ${userText || '요청 내용 없음'}`,
    ].join('\n');
  }

  return [
    ...baseSummary,
    '',
    '운영 요약:',
    `- 가장 높은 우선순위 인시던트: ${activeIncidents[0]?.title ?? '없음'}`,
    `- 최근 주의 배포: ${riskyDeployments[0]?.service_id ?? '없음'}`,
    `- 최근 잡: ${pendingJobs[0]?.template_id ?? '없음'}`,
    '',
    `질문 반영: ${userText || '요청 내용 없음'}`,
  ].join('\n');
}

function createFallbackResponse(context: PageContext, messages: UIMessage[]): Response {
  const text = buildLocalFallbackText(context, messages);
  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: ({ writer }) => {
      writer.write({ type: 'start' });
      writer.write({ type: 'text-start', id: 'fallback-text' });
      writer.write({ type: 'text-delta', id: 'fallback-text', delta: text });
      writer.write({ type: 'text-end', id: 'fallback-text' });
      writer.write({ type: 'finish', finishReason: 'stop' });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function normalizeContext(context: unknown): PageContext | null {
  if (!context || typeof context !== 'object') {
    return null;
  }

  const record = context as Record<string, unknown>;
  if (
    typeof record['page'] === 'string' &&
    typeof record['operatorId'] === 'string' &&
    typeof record['operatorRole'] === 'string'
  ) {
    return {
      page: record['page'],
      operatorId: record['operatorId'],
      operatorRole: record['operatorRole'],
      selectedEntityId:
        typeof record['selectedEntityId'] === 'string'
          ? record['selectedEntityId']
          : undefined,
    };
  }

  const operator = record['operator'];
  const path = record['path'];
  if (
    operator &&
    typeof operator === 'object' &&
    typeof (operator as Record<string, unknown>)['id'] === 'string' &&
    typeof (operator as Record<string, unknown>)['role'] === 'string'
  ) {
    const page =
      typeof path === 'string'
        ? path.replace(/^\/+/, '').split('/')[0] || 'dashboard'
        : 'dashboard';

    return {
      page,
      operatorId: (operator as Record<string, unknown>)['id'] as string,
      operatorRole: (operator as Record<string, unknown>)['role'] as string,
    };
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatRequestBody;
    const { messages } = body;
    const context = normalizeContext(body.context);

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'messages 배열이 필요합니다.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (
      !context ||
      !context.operatorId ||
      !context.operatorRole ||
      !context.page
    ) {
      return new Response(
        JSON.stringify({
          error: 'context (operatorId, operatorRole, page) 가 필요합니다.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const userText = extractLastUserText(messages);
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const currentScenarioId = getCurrentScenarioId();
    const enabledTemplates = listEnabledA2UITemplates(
      {
        page: context.page,
        role: context.operatorRole,
        scenarioId: currentScenarioId,
      },
      userText,
    );
    const a2uiIntent = hasA2UIIntent(userText, enabledTemplates);
    const pendingTemplateDecision = getPendingTemplateDecisionState(
      context.operatorId,
      context.page,
    );
    const hasActivePendingTemplateDecision =
      pendingTemplateDecision !== null &&
      pendingTemplateDecision.scenarioId === currentScenarioId &&
      isPendingTemplateDecisionActive(pendingTemplateDecision.createdAt);
    if (pendingTemplateDecision && !hasActivePendingTemplateDecision) {
      clearPendingTemplateDecisionState(context.operatorId, context.page);
    }
    const templateByToolName = new Map(
      enabledTemplates.map((template) => [template.tool_name, template]),
    );

    const forcedQuestionCase = findForcedA2UIQuestionCase(
      context,
      userText,
      currentScenarioId,
    );

    if (
      hasActivePendingTemplateDecision &&
      ['취소', '그만', 'cancel', 'stop'].some((keyword) =>
        normalizeQuestionForMatch(userText).includes(keyword),
      )
    ) {
      clearPendingTemplateDecisionState(context.operatorId, context.page);
      return createTextResponse(messages, '보류 중이던 A2UI 템플릿 선택을 취소했습니다.');
    }

    if (forcedQuestionCase) {
      clearPendingTemplateDecisionState(context.operatorId, context.page);
      const forcedTemplate =
        templateByToolName.get(forcedQuestionCase.expectedToolName) ?? null;
      const forcedInvocation = {
        expectedToolName: forcedQuestionCase.expectedToolName,
        toolArgs: forcedQuestionCase.toolArgs,
      };
      const forcedTool = (
        aiTools as Record<
          string,
          { execute?: (args: Record<string, unknown>) => Promise<unknown> }
        >
      )[forcedInvocation.expectedToolName];

      if (forcedTool?.execute) {
        const forcedCandidate = forcedTemplate
          ? buildTemplateDecisionCandidates({
              templates: [forcedTemplate],
              userText,
              context,
              scenarioId: currentScenarioId,
            })[0] ?? null
          : null;
        const forcedOutputRaw = await forcedTool.execute(forcedInvocation.toolArgs);
        const forcedDecision: TemplateDecisionOutcome = {
          selectedTemplateId: forcedTemplate?.id ?? null,
          confidence: 1,
          decisionReason: '시나리오 Exact Match 규칙으로 템플릿을 강제 선택했습니다.',
          matchedSignals: ['scenario_exact_match'],
          rejectedTemplateIds: enabledTemplates
            .filter((template) => template.tool_name !== forcedInvocation.expectedToolName)
            .map((template) => template.id),
          missingInputs: forcedCandidate?.missingInputKeys ?? [],
          shouldAskFollowUp: false,
          selectedTemplate: forcedTemplate,
          selectedCandidate: forcedCandidate,
          candidates: forcedCandidate ? [forcedCandidate] : [],
          strategy: 'rule+heuristic_fallback',
        };
        const forcedOutput =
          forcedTemplate !== null
            ? attachDecisionEnvelope(forcedOutputRaw, {
                template: forcedTemplate,
                decision: forcedDecision,
                selectedToolName: forcedInvocation.expectedToolName,
              })
            : forcedOutputRaw;

        logA2UITemplateSelection({
          templateId: forcedTemplate?.id ?? null,
          page: context.page,
          scenarioId: currentScenarioId,
          operatorId: context.operatorId,
          userMessage: userText,
          selectionReason: forcedDecision.decisionReason,
          decisionPayload: forcedDecision,
          status: forcedTemplate ? 'selected' : 'fallback',
        });

        return createForcedA2UIResponse(
          messages,
          forcedInvocation,
          forcedOutput,
        );
      }
    }

    if ((a2uiIntent || hasActivePendingTemplateDecision) && enabledTemplates.length > 0) {
      const candidateTemplateIdSet = new Set(
        pendingTemplateDecision?.candidateTemplateIds ?? [],
      );
      const decisionTemplates =
        hasActivePendingTemplateDecision && candidateTemplateIdSet.size > 0
          ? enabledTemplates.filter((template) => candidateTemplateIdSet.has(template.id))
          : enabledTemplates;
      const decisionUserText =
        hasActivePendingTemplateDecision && pendingTemplateDecision
          ? `${pendingTemplateDecision.originalUserText}\n추가 판단근거: ${userText}`
          : userText;
      const decision = await decideTemplateWithAI({
        userText: decisionUserText,
        context,
        scenarioId: currentScenarioId,
        templates: decisionTemplates,
        apiKey,
      });

      if (decision.shouldAskFollowUp && decision.followUpQuestion) {
        setPendingTemplateDecisionState(context.operatorId, context.page, {
          originalUserText:
            pendingTemplateDecision?.originalUserText ?? userText,
          scenarioId: currentScenarioId,
          candidateTemplateIds:
            decision.candidates.length > 0
              ? decision.candidates.map((candidate) => candidate.template.id)
              : decision.selectedTemplateId
                ? [decision.selectedTemplateId]
                : [],
          createdAt: new Date().toISOString(),
        });
        logA2UITemplateSelection({
          templateId: decision.selectedTemplateId,
          page: context.page,
          scenarioId: currentScenarioId,
          operatorId: context.operatorId,
          userMessage: userText,
          selectionReason: decision.decisionReason,
          decisionPayload: decision,
          status: 'blocked',
        });
        return createTextResponse(messages, decision.followUpQuestion);
      }

      if (decision.selectedTemplate) {
        clearPendingTemplateDecisionState(context.operatorId, context.page);
        const selectedTemplate = decision.selectedTemplate;
        const toolArgs = buildTemplateToolArgs(
          selectedTemplate,
          context,
          decisionUserText,
          decision.selectedCandidate?.collectedInputs,
        );
        if (!toolArgs) {
          logA2UITemplateSelection({
            templateId: selectedTemplate.id,
            page: context.page,
            scenarioId: currentScenarioId,
            operatorId: context.operatorId,
            userMessage: userText,
            selectionReason: '선택된 템플릿의 tool args를 생성하지 못했습니다.',
            decisionPayload: decision,
            status: 'blocked',
          });
        } else {
          const selectedToolName = selectedTemplate.tool_name;
          const selectedTool = (
            aiTools as Record<
              string,
              { execute?: (args: Record<string, unknown>) => Promise<unknown> }
            >
          )[selectedToolName];

          if (selectedTool?.execute) {
            const selectedOutputRaw = await selectedTool.execute(toolArgs);
            const selectedOutput = attachDecisionEnvelope(selectedOutputRaw, {
              template: selectedTemplate,
              decision,
              selectedToolName,
            });

            logA2UITemplateSelection({
              templateId: selectedTemplate.id,
              page: context.page,
              scenarioId: currentScenarioId,
              operatorId: context.operatorId,
              userMessage: userText,
              selectionReason: decision.decisionReason,
              decisionPayload: decision,
              status: 'selected',
            });

            return createForcedA2UIResponse(
              messages,
              {
                expectedToolName: selectedToolName,
                toolArgs,
              },
              selectedOutput,
            );
          }
        }
      }

      clearPendingTemplateDecisionState(context.operatorId, context.page);
      logA2UITemplateSelection({
        templateId: null,
        page: context.page,
        scenarioId: currentScenarioId,
        operatorId: context.operatorId,
        userMessage: userText,
        selectionReason: '재판단 후 유효한 템플릿 실행에 실패해 일반 응답으로 fallback합니다.',
        decisionPayload: decision,
        status: 'fallback',
      });
    }

    if (a2uiIntent && enabledTemplates.length === 0) {
      clearPendingTemplateDecisionState(context.operatorId, context.page);
      logA2UITemplateSelection({
        templateId: null,
        page: context.page,
        scenarioId: currentScenarioId,
        operatorId: context.operatorId,
        userMessage: userText,
        selectionReason: 'A2UI 의도는 감지됐지만 현재 컨텍스트에서 활성화된 템플릿이 없습니다.',
        status: 'fallback',
      });
    }

    const { runtimeTools, templateGuidance } = selectRuntimeTools(context, userText);
    const systemPrompt = `${buildSystemPrompt(context)}\n\n## A2UI 템플릿 가이드\n\n${templateGuidance}`;
    const modelMessages = await convertToModelMessages(messages);

    if (!apiKey || apiKey.includes('your') || apiKey.includes('here')) {
      return createFallbackResponse(context, messages);
    }

    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages: modelMessages,
      tools: runtimeTools,
      stopWhen: stepCountIs(10),
      onError: ({ error }) => {
        console.error('[chat/route] streamText error:', error);
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
    });
  } catch (error) {
    console.error('[chat/route] Unhandled error:', error);

    const message =
      error instanceof Error
        ? error.message
        : '알 수 없는 오류가 발생했습니다.';

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
