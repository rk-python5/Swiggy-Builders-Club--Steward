import { PgBoss } from "pg-boss";
import { runStandingPlans } from "../daemons/standing-plans.js";

const STANDING_PLANS_JOB = "standing-plans-tick";

/**
 * Real scheduler (pg-boss), replacing Phase 0's node-cron placeholder now that retry/
 * run-history semantics actually matter -- a daemon whose job silently vanishes on a
 * crash is worse than one that never ran. pg-boss persists jobs to Postgres itself, so
 * this survives a process restart by construction (Phase 1's exit criterion #2).
 */
export async function startScheduler(): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL });

  boss.on("error", (err: Error) => console.error("[scheduler] pg-boss error:", err));

  await boss.start();
  await boss.createQueue(STANDING_PLANS_JOB);

  await boss.schedule(STANDING_PLANS_JOB, "*/15 * * * *", null, { tz: "UTC" });

  await boss.work(STANDING_PLANS_JOB, async () => {
    const dryRun = process.env.DAEMON_DRY_RUN !== "false";
    await runStandingPlans(dryRun);
  });

  console.log("[scheduler] started -- standing-plans-tick every 15 minutes");
  return boss;
}
