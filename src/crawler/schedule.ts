import cron from "node-cron";
import { crawlOnce } from "./food.js";

/**
 * Placeholder scheduler for Phase 0 — a plain cron interval, no retry or
 * idempotency semantics. This gets replaced by pg-boss in Phase 1, once the
 * action gate and run-history requirements actually exist. The only job here
 * is read-only (crawling), so a missed or double-run tick is harmless —
 * unlike anything that will eventually go through the action gate.
 */
export function startCrawlSchedule(cronExpression = "0 * * * *"): void {
  cron.schedule(cronExpression, () => {
    crawlOnce().catch((err) => {
      console.error("[crawler] scheduled run failed:", err);
    });
  });
  console.log(`[crawler] scheduled with cron expression "${cronExpression}"`);
}
