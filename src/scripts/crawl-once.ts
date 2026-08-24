import "dotenv/config";
import { crawlOnce } from "../crawler/food.js";
import { pool } from "../db/pool.js";

crawlOnce()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[crawl-once] failed:", err);
    process.exit(1);
  });
