import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "fixtures");

/**
 * Plays back a recorded fixture instead of calling the network. Implements
 * the same shape as mcp/client.ts's callTool so daemon logic (once it
 * exists, from Phase 1 onward) can be pointed at either implementation.
 * Fixture files are named `<toolName>.json` and hold exactly the `result`
 * field of a real tools/call JSON-RPC response — nothing MCP-connection
 * related.
 */
export async function simulatedCallTool<T = unknown>(toolName: string): Promise<T> {
  const fixturePath = path.join(FIXTURES_DIR, `${toolName}.json`);
  const raw = await readFile(fixturePath, "utf8");
  return JSON.parse(raw) as T;
}
