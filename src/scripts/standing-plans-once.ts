import "dotenv/config";
import { runStandingPlans } from "../daemons/standing-plans.js";
import { pool } from "../db/pool.js";

const dryRun = process.argv[2] !== "--live";

runStandingPlans(dryRun)
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[standing-plans-once] failed:", err);
    process.exit(1);
  });
