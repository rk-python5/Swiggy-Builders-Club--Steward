import "dotenv/config";
import { runTelegramBot } from "../telegram/bot.js";

runTelegramBot().catch((err) => {
  console.error(err);
  process.exit(1);
});
