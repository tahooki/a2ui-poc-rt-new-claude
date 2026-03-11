import { NextResponse } from "next/server";
import { getDb } from "@/server/db";

export async function GET() {
  try {
    const db = getDb();

    // Incident trend: count incidents created per day over the last 7 days
    const incidentTrendRows = db
      .prepare(
        `
        WITH RECURSIVE dates(d) AS (
          SELECT date('now', '-6 days')
          UNION ALL
          SELECT date(d, '+1 day') FROM dates WHERE d < date('now')
        )
        SELECT
          strftime('%m/%d', dates.d) AS date,
          COALESCE(cnt, 0) AS count
        FROM dates
        LEFT JOIN (
          SELECT date(created_at) AS day, COUNT(*) AS cnt
          FROM incidents
          WHERE date(created_at) >= date('now', '-6 days')
          GROUP BY date(created_at)
        ) inc ON inc.day = dates.d
        ORDER BY dates.d
        `
      )
      .all() as { date: string; count: number }[];

    // Deployment stats: count by status
    const deploymentStatsRows = db
      .prepare(
        `
        SELECT status, COUNT(*) AS count
        FROM deployments
        WHERE status IN ('succeeded', 'failed', 'rolled_back')
        GROUP BY status
        ORDER BY
          CASE status
            WHEN 'succeeded' THEN 1
            WHEN 'failed' THEN 2
            WHEN 'rolled_back' THEN 3
          END
        `
      )
      .all() as { status: string; count: number }[];

    // Ensure all three statuses are represented
    const statusMap: Record<string, number> = {
      succeeded: 0,
      failed: 0,
      rolled_back: 0,
    };
    for (const row of deploymentStatsRows) {
      statusMap[row.status] = row.count;
    }
    const deploymentStats = Object.entries(statusMap).map(
      ([status, count]) => ({ status, count })
    );

    return NextResponse.json({
      incidentTrend: incidentTrendRows,
      deploymentStats,
    });
  } catch (err) {
    console.error("[GET /api/dashboard/stats]", err);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
