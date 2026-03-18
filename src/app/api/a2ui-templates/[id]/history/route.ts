import { NextRequest, NextResponse } from "next/server";
import { getA2UITemplate, getA2UITemplateSelectionLogs } from "@/server/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const template = getA2UITemplate(id);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : 12;
    const logs = getA2UITemplateSelectionLogs({
      templateId: id,
      page: "templates",
      limit: Number.isFinite(limit) ? limit : 12,
    });

    return NextResponse.json({
      template: {
        id: String(template["id"] ?? id),
        name: String(template["name"] ?? id),
      },
      history: logs.map((item) => ({
        id: String(item["id"] ?? ""),
        page: String(item["page"] ?? ""),
        scenarioId: String(item["scenario_id"] ?? ""),
        operatorId: item["operator_id"] === null ? null : String(item["operator_id"]),
        userMessage: String(item["user_message"] ?? ""),
        selectionReason: String(item["selection_reason"] ?? ""),
        status: String(item["status"] ?? ""),
        decisionPayload:
          typeof item["decision_payload"] === "string" && item["decision_payload"]
            ? (() => {
                try {
                  return JSON.parse(String(item["decision_payload"]));
                } catch {
                  return item["decision_payload"];
                }
              })()
            : null,
        createdAt: String(item["created_at"] ?? ""),
      })),
    });
  } catch (err) {
    console.error("[GET /api/a2ui-templates/[id]/history]", err);
    return NextResponse.json(
      { error: "Failed to load template history" },
      { status: 500 },
    );
  }
}
