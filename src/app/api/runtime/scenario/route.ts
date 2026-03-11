import { NextRequest, NextResponse } from "next/server";
import { getCurrentScenarioId, setCurrentScenarioId } from "@/server/db";
import { listScenarios, scenarios } from "@/server/scenarios";

export async function GET() {
  try {
    return NextResponse.json({
      currentScenarioId: getCurrentScenarioId(),
      scenarios: listScenarios(),
    });
  } catch (err) {
    console.error("[GET /api/runtime/scenario]", err);
    return NextResponse.json(
      { error: "Failed to fetch runtime scenario" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const scenarioId = String(body?.scenarioId ?? "");
    if (!scenarioId || !scenarios[scenarioId as keyof typeof scenarios]) {
      return NextResponse.json(
        {
          error: "Unknown scenarioId",
          availableScenarios: listScenarios(),
        },
        { status: 400 },
      );
    }

    setCurrentScenarioId(scenarioId);

    return NextResponse.json({
      success: true,
      currentScenarioId: scenarioId,
      scenarios: listScenarios(),
    });
  } catch (err) {
    console.error("[PATCH /api/runtime/scenario]", err);
    return NextResponse.json(
      { error: "Failed to update runtime scenario" },
      { status: 500 },
    );
  }
}
