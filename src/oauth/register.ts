import { getClientId, saveClientId, type SwiggyServer } from "../db/tokens.js";

const AUTH_BASE = "https://mcp.swiggy.com/auth";

/**
 * Returns a cached client_id for this server if we've registered one before,
 * otherwise performs dynamic client registration (RFC 7591) and caches the result.
 *
 * One client_id is reused across servers/redirects in practice, but we register
 * (and cache) per-server to keep each server's OAuth state independent.
 */
export async function getOrRegisterClient(server: SwiggyServer, redirectUri: string): Promise<string> {
  const cached = await getClientId(server);
  if (cached) return cached;

  const res = await fetch(`${AUTH_BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: "household-daemons",
    }),
  });

  if (!res.ok) {
    throw new Error(`Client registration failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { client_id: string };
  await saveClientId(server, body.client_id);
  return body.client_id;
}
