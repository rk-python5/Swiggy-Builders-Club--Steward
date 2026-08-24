import { Pool } from "pg";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env first.");
}

export const pool = new Pool({ connectionString });
