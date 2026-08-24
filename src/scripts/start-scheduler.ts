import "dotenv/config";
import { startScheduler } from "../scheduler/index.js";

startScheduler().catch((err) => {
  console.error("[start-scheduler] failed to start:", err);
  process.exit(1);
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
