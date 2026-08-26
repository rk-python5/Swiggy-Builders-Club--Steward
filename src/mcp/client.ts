import { getValidToken } from "../oauth/get-valid-token.js";
import { endpointFor } from "../oauth/flow.js";
import type { SwiggyServer } from "../db/tokens.js";

let requestId = 0;

interface ToolResultShape {
  isError?: boolean;
  content?: { type: string; text?: string }[];
  structuredContent?: { error?: { message?: string } };
}

interface JsonRpcSuccess<T> {
  jsonrpc: "2.0";
  id: number;
  result: T;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: number;
  error: { code: number; message: string };
}

/**
 * A tool call can "succeed" at the JSON-RPC level (no top-level `error`) while still
 * being a tool-level failure (`result.isError: true`, e.g. Instamart's "address not
 * serviceable"). Found the hard way: callTool originally only checked JSON-RPC errors, so
 * a tool-level error silently passed through as if it were valid data -- e.g. a missing
 * cartTotalAmount got parsed as ₹0 instead of throwing. Every daemon depends on this
 * function to fail loudly, not quietly return garbage.
 */
function extractToolError(result: ToolResultShape): string | null {
  if (!result?.isError) return null;
  return result.structuredContent?.error?.message ?? result.content?.[0]?.text ?? "unknown tool error";
}

/**
 * Calls one MCP tool on one Swiggy server. Deliberately not using
 * @modelcontextprotocol/sdk's transport: its OAuthClientProvider does
 * spec-compliant discovery (RFC 8414/9728), which fails against Swiggy's
 * currently-broken authorization-server metadata (issuer mismatch). This
 * bypasses discovery entirely and just attaches a Bearer token we already
 * obtained ourselves via the manual PKCE flow.
 */
export async function callTool<T = unknown>(
  server: SwiggyServer,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const token = await getValidToken(server);
  const id = ++requestId;

  const res = await fetch(endpointFor(server), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  if (!res.ok) {
    throw new Error(`MCP call ${server}/${name} failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as JsonRpcSuccess<T & ToolResultShape> | JsonRpcError;
  if ("error" in body) {
    throw new Error(`MCP call ${server}/${name} returned a JSON-RPC error: ${body.error.message}`);
  }

  const toolError = extractToolError(body.result);
  if (toolError) {
    throw new Error(`MCP call ${server}/${name} returned a tool-level error: ${toolError}`);
  }

  return body.result;
}

export async function listTools(server: SwiggyServer): Promise<unknown> {
  const token = await getValidToken(server);
  const id = ++requestId;

  const res = await fetch(endpointFor(server), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/list", params: {} }),
  });

  if (!res.ok) {
    throw new Error(`tools/list on ${server} failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as JsonRpcSuccess<{ tools: unknown[] }> | JsonRpcError;
  if ("error" in body) {
    throw new Error(`tools/list on ${server} returned an error: ${body.error.message}`);
  }

  return body.result.tools;
}
