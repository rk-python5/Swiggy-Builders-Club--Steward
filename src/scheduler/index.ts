import { PgBoss } from "pg-boss";
import { runStandingPlans } from "../daemons/standing-plans.js";
import { runKitchenEntropy } from "../daemons/kitchen-entropy.js";

const STANDING_PLANS_JOB = "standing-plans-tick";
const KITCHEN_ENTROPY_JOB = "kitchen-entropy-tick";

/**
 * Real scheduler (pg-boss), replacing Phase 0's node-cron placeholder now that retry/
 * run-history semantics actually matter -- a daemon whose job silently vanishes on a
 * crash is worse than one that never ran. pg-boss persists jobs to Postgres itself, so
 * this survives a process restart by construction (Phase 1's exit criterion #2, proven
 * live 2026-08-26).
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

  await boss.createQueue(KITCHEN_ENTROPY_JOB);
  // Pantry depletion changes slowly -- hourly is plenty, no reason to tick as often as
  // Standing Plans' time-sensitive slot-availability checks.
  await boss.schedule(KITCHEN_ENTROPY_JOB, "0 * * * *", null, { tz: "UTC" });
  await boss.work(KITCHEN_ENTROPY_JOB, async () => {
    const dryRun = process.env.DAEMON_DRY_RUN !== "false";
    await runKitchenEntropy(dryRun);
  });

  console.log("[scheduler] started -- standing-plans-tick every 15 min, kitchen-entropy-tick hourly");
  return boss;
}
