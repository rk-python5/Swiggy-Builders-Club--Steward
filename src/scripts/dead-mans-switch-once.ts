import "dotenv/config";
import { runDeadMansSwitch } from "../daemons/dead-mans-switch.js";
import { pool } from "../db/pool.js";

const dryRun = process.argv[2] !== "--live";

runDeadMansSwitch(dryRun)
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[dead-mans-switch-once] failed:", err);
    process.exit(1);
  });
