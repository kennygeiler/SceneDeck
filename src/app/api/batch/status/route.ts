export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { sql, count, eq, and, gte } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";
import { getJobCounts } from "@/lib/queue";

export async function GET() {
  try {
    const stages = await getJobCounts();

    // Total films
    const [filmsRow] = await db
      .select({ count: count() })
      .from(schema.films);
    const totalFilms = filmsRow?.count ?? 0;

    // Total shots
    const [shotsRow] = await db
      .select({ count: count() })
      .from(schema.shots);
    const totalShots = shotsRow?.count ?? 0;

    // Flagged for review (shots with review_status = 'needs_review')
    const [flaggedRow] = await db
      .select({ count: count() })
      .from(schema.shotMetadata)
      .where(eq(schema.shotMetadata.reviewStatus, "needs_review"));
    const flaggedForReview = flaggedRow?.count ?? 0;

    // Throughput: count jobs completed in the last 5 minutes, extrapolate to per-minute
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const [recentRow] = await db
      .select({ count: count() })
      .from(schema.pipelineJobs)
      .where(
        and(
          eq(schema.pipelineJobs.status, "completed"),
          gte(schema.pipelineJobs.completedAt, fiveMinAgo),
        ),
      );
    const recentCompleted = recentRow?.count ?? 0;
    const shotsPerMinute = Math.round((recentCompleted / 5) * 10) / 10;

    // Estimated completion: remaining queued + running jobs / throughput
    const totalQueued = Object.values(stages).reduce((s, v) => s + v.queued, 0);
    const totalRunning = Object.values(stages).reduce((s, v) => s + v.running, 0);
    const remaining = totalQueued + totalRunning;
    let estimatedCompletion = "N/A";

    if (shotsPerMinute > 0 && remaining > 0) {
      const minutesLeft = remaining / shotsPerMinute;
      const hours = Math.floor(minutesLeft / 60);
      const mins = Math.round(minutesLeft % 60);
      estimatedCompletion = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    } else if (remaining === 0) {
      estimatedCompletion = "Complete";
    }

    // Failed jobs with error messages
    const failedJobs = await db
      .select({
        id: schema.pipelineJobs.id,
        stage: schema.pipelineJobs.stage,
        filmId: schema.pipelineJobs.filmId,
        error: schema.pipelineJobs.error,
        createdAt: schema.pipelineJobs.createdAt,
      })
      .from(schema.pipelineJobs)
      .where(eq(schema.pipelineJobs.status, "failed"))
      .orderBy(sql`${schema.pipelineJobs.createdAt} DESC`)
      .limit(50);

    return NextResponse.json({
      stages,
      totals: {
        films: totalFilms,
        shots: totalShots,
        flaggedForReview,
      },
      throughput: {
        shotsPerMinute,
      },
      estimatedCompletion,
      failedJobs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
