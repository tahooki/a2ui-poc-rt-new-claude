import { NextRequest, NextResponse } from 'next/server';
import { getCurrentScenarioId } from '@/server/db';
import {
  listScenarioQuestionSuggestions,
} from '@/server/scenarios/a2ui-question-catalog';
import { listScenarios } from '@/server/scenarios';
import type { ScenarioId } from '@/server/scenarios';

export async function GET(req: NextRequest) {
  try {
    const currentScenarioId = getCurrentScenarioId();
    const scenario = listScenarios().find((item) => item.id === currentScenarioId) ?? null;
    const page = req.nextUrl.searchParams.get('page') ?? undefined;
    const limitRaw = Number(req.nextUrl.searchParams.get('limit') ?? '4');
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 20)) : 4;

    const questions = listScenarioQuestionSuggestions(
      currentScenarioId as ScenarioId,
      page,
      limit,
    );

    return NextResponse.json({
      currentScenarioId,
      scenario,
      page: page ?? null,
      total: questions.length,
      questions,
    });
  } catch (err) {
    console.error('[GET /api/runtime/scenario/questions]', err);
    return NextResponse.json(
      { error: 'Failed to fetch scenario questions' },
      { status: 500 },
    );
  }
}
