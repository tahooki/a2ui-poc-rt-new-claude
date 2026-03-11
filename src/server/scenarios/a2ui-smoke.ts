import { listEnabledA2UITemplates } from '@/server/ai/template-service';
import { aiTools } from '@/server/ai/tools';
import type { ScenarioId } from '@/server/scenarios';
import {
  listScenarioA2UIQuestionCases,
  type A2UIScenarioQuestionCase,
} from '@/server/scenarios/a2ui-question-catalog';

type SmokeStatus = 'passed' | 'failed' | 'skipped';

export interface A2UISmokeQuestionResult {
  id: string;
  page: string;
  operatorRole: string;
  question: string;
  expectedToolName: string;
  expectedCardType: string;
  status: SmokeStatus;
  reason: string | null;
  toolArgs: Record<string, unknown>;
  outputSummary: Record<string, unknown> | null;
}

function summarizeToolOutput(output: unknown) {
  if (!output || typeof output !== 'object') {
    return null;
  }

  const record = output as Record<string, unknown>;
  if (typeof record.error === 'string') {
    return { error: record.error };
  }
  if (record.type === 'a2ui_render') {
    return {
      type: record.type,
      cardType: record.cardType,
      cardDataKeys:
        record.cardData && typeof record.cardData === 'object'
          ? Object.keys(record.cardData as Record<string, unknown>)
          : [],
    };
  }

  return {
    keys: Object.keys(record).slice(0, 8),
  };
}

async function runQuestionCase(
  scenarioId: ScenarioId,
  questionCase: A2UIScenarioQuestionCase,
): Promise<A2UISmokeQuestionResult> {
  const availableTemplates = listEnabledA2UITemplates(
    {
      page: questionCase.page,
      role: questionCase.operatorRole,
      scenarioId,
    },
    questionCase.question,
  );

  const expectedTemplate = availableTemplates.find(
    (item) => item.tool_name === questionCase.expectedToolName,
  );

  if (!expectedTemplate) {
    return {
      id: questionCase.id,
      page: questionCase.page,
      operatorRole: questionCase.operatorRole,
      question: questionCase.question,
      expectedToolName: questionCase.expectedToolName,
      expectedCardType: questionCase.expectedCardType,
      status: 'skipped',
      reason: 'template_disabled_or_not_available',
      toolArgs: questionCase.toolArgs,
      outputSummary: null,
    };
  }

  const tool = (
    aiTools as Record<string, { execute?: (args: Record<string, unknown>) => Promise<unknown> }>
  )[questionCase.expectedToolName];

  if (!tool?.execute) {
    return {
      id: questionCase.id,
      page: questionCase.page,
      operatorRole: questionCase.operatorRole,
      question: questionCase.question,
      expectedToolName: questionCase.expectedToolName,
      expectedCardType: questionCase.expectedCardType,
      status: 'failed',
      reason: 'tool_execute_missing',
      toolArgs: questionCase.toolArgs,
      outputSummary: null,
    };
  }

  try {
    const output = await tool.execute(questionCase.toolArgs);
    const summary = summarizeToolOutput(output);
    const record = output as Record<string, unknown> | null;

    if (record && typeof record.error === 'string') {
      return {
        id: questionCase.id,
        page: questionCase.page,
        operatorRole: questionCase.operatorRole,
        question: questionCase.question,
        expectedToolName: questionCase.expectedToolName,
        expectedCardType: questionCase.expectedCardType,
        status: 'failed',
        reason: 'data_missing_or_lookup_failed',
        toolArgs: questionCase.toolArgs,
        outputSummary: summary,
      };
    }

    if (
      record?.type === 'a2ui_render' &&
      record.cardType === questionCase.expectedCardType
    ) {
      return {
        id: questionCase.id,
        page: questionCase.page,
        operatorRole: questionCase.operatorRole,
        question: questionCase.question,
        expectedToolName: questionCase.expectedToolName,
        expectedCardType: questionCase.expectedCardType,
        status: 'passed',
        reason: null,
        toolArgs: questionCase.toolArgs,
        outputSummary: summary,
      };
    }

    return {
      id: questionCase.id,
      page: questionCase.page,
      operatorRole: questionCase.operatorRole,
      question: questionCase.question,
      expectedToolName: questionCase.expectedToolName,
      expectedCardType: questionCase.expectedCardType,
      status: 'failed',
      reason: 'unexpected_tool_output',
      toolArgs: questionCase.toolArgs,
      outputSummary: summary,
    };
  } catch (error) {
    return {
      id: questionCase.id,
      page: questionCase.page,
      operatorRole: questionCase.operatorRole,
      question: questionCase.question,
      expectedToolName: questionCase.expectedToolName,
      expectedCardType: questionCase.expectedCardType,
      status: 'failed',
      reason: error instanceof Error ? error.message : 'unknown_error',
      toolArgs: questionCase.toolArgs,
      outputSummary: null,
    };
  }
}

export async function runScenarioA2UISmokeTest(
  scenarioId: ScenarioId,
  page?: string,
) {
  const questionCases = listScenarioA2UIQuestionCases(scenarioId, page);
  const results = await Promise.all(
    questionCases.map((questionCase) => runQuestionCase(scenarioId, questionCase)),
  );

  return {
    scenarioId,
    page: page ?? null,
    total: results.length,
    passed: results.filter((item) => item.status === 'passed').length,
    failed: results.filter((item) => item.status === 'failed').length,
    skipped: results.filter((item) => item.status === 'skipped').length,
    results,
  };
}
