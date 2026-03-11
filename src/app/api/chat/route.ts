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
  getAllDeployments,
  getAllIncidents,
  getAllJobRuns,
  getAllReports,
  getAuditLogs,
} from '@/server/db';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ChatRequestBody {
  messages: UIMessage[];
  context: PageContext;
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

    const systemPrompt = buildSystemPrompt(context);
    const modelMessages = await convertToModelMessages(messages);
    const apiKey = process.env.OPENAI_API_KEY?.trim();

    if (!apiKey || apiKey.includes('your') || apiKey.includes('here')) {
      return createFallbackResponse(context, messages);
    }

    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages: modelMessages,
      tools: aiTools,
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
