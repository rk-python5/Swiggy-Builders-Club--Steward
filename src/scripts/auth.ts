import "dotenv/config";
import { login } from "../oauth/flow.js";
import type { SwiggyServer } from "../db/tokens.js";

const VALID_SERVERS: SwiggyServer[] = ["food", "im", "dineout"];

const server = process.argv[2] as SwiggyServer | undefined;
if (!server || !VALID_SERVERS.includes(server)) {
  console.error(`Usage: npm run auth -- <${VALID_SERVERS.join("|")}>`);
  process.exit(1);
}

const port = Number(process.env.OAUTH_CALLBACK_PORT ?? 8765);

login(server, port)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[auth] login failed:", err);
    process.exit(1);
  });
