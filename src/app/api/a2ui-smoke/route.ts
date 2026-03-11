import { NextRequest, NextResponse } from 'next/server';
import {
  getCurrentScenarioId,
  resetDatabase,
  setCurrentScenarioId,
} from '@/server/db';
import { runScenarioA2UISmokeTest } from '@/server/scenarios/a2ui-smoke';
import { listScenarios } from '@/server/scenarios';
import {
  A2UI_SCENARIO_QUESTION_CASES,
} from '@/server/scenarios/a2ui-question-catalog';
import type { ScenarioId } from '@/server/scenarios';

function listScenarioIdsWithQuestions() {
  return [...new Set(A2UI_SCENARIO_QUESTION_CASES.map((item) => item.scenarioId))];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const requestedScenarioId = String(body?.scenarioId ?? 'all');
    const prepare = body?.prepare !== false;
    const originalScenarioId = getCurrentScenarioId();
    const page = typeof body?.page === 'string' && body.page.trim().length > 0
      ? body.page.trim()
      : undefined;

    if (prepare) {
      resetDatabase();
    }

    const availableScenarioIds = listScenarioIdsWithQuestions();
    const targetScenarioIds =
      requestedScenarioId === 'all'
        ? availableScenarioIds
        : availableScenarioIds.includes(requestedScenarioId as (typeof availableScenarioIds)[number])
          ? [requestedScenarioId]
          : null;

    if (!targetScenarioIds) {
      return NextResponse.json(
        {
          error: 'Unknown scenarioId',
          availableScenarioIds,
        },
        { status: 400 },
      );
    }

    const scenarioResults = [];

    for (const scenarioId of targetScenarioIds) {
      setCurrentScenarioId(scenarioId);
      scenarioResults.push(await runScenarioA2UISmokeTest(scenarioId as ScenarioId, page));
    }

    setCurrentScenarioId(originalScenarioId);

    if (targetScenarioIds.length === 1) {
      const result = scenarioResults[0];
      return NextResponse.json({
        ...result,
        prepared: prepare,
        currentScenarioId: originalScenarioId,
        restoredScenarioId: originalScenarioId,
        scenario:
          listScenarios().find((item) => item.id === targetScenarioIds[0]) ?? null,
      });
    }

    return NextResponse.json({
      prepared: prepare,
      currentScenarioId: originalScenarioId,
      restoredScenarioId: originalScenarioId,
      scenarios: scenarioResults,
      summary: {
        total: scenarioResults.reduce((sum, item) => sum + item.total, 0),
        passed: scenarioResults.reduce((sum, item) => sum + item.passed, 0),
        failed: scenarioResults.reduce((sum, item) => sum + item.failed, 0),
        skipped: scenarioResults.reduce((sum, item) => sum + item.skipped, 0),
      },
    });
  } catch (err) {
    console.error('[POST /api/a2ui-smoke]', err);
    return NextResponse.json(
      { error: 'Failed to run A2UI smoke test' },
      { status: 500 },
    );
  }
}
