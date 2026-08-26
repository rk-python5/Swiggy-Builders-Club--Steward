import "dotenv/config";
import { runKitchenEntropy } from "../daemons/kitchen-entropy.js";
import { pool } from "../db/pool.js";

const dryRun = process.argv[2] !== "--live";

runKitchenEntropy(dryRun)
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[kitchen-entropy-once] failed:", err);
    process.exit(1);
  });
