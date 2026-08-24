import { exec } from "node:child_process";
import { generatePkce } from "./pkce.js";
import { getOrRegisterClient } from "./register.js";
import { waitForCallback } from "./callback-server.js";
import { saveToken, type SwiggyServer, type TokenResponse } from "../db/tokens.js";

const SERVER_ENDPOINTS: Record<SwiggyServer, string> = {
  food: "https://mcp.swiggy.com/food",
  im: "https://mcp.swiggy.com/im",
  dineout: "https://mcp.swiggy.com/dineout",
};

const AUTH_BASE = "https://mcp.swiggy.com/auth";

function openBrowser(url: string): void {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${opener} "${url}"`);
}

async function exchangeCode(params: {
  code: string;
  verifier: string;
  clientId: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.verifier,
  });

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }

  return (await res.json()) as TokenResponse;
}

/**
 * Attempts a refresh_token grant against the token endpoint. Returns the new
 * token response on success, or null if the server rejects it / doesn't
 * support it. This is the empirical check Phase 0 needs — Swiggy's
 * auth-server metadata *lists* refresh_token as a supported grant, but that
 * doesn't prove tokens are actually issued with one, or that redeeming it
 * works. Don't trust metadata; trust this.
 */
export async function tryRefresh(clientId: string, refreshToken: string): Promise<TokenResponse | null> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    console.warn(`[oauth] refresh_token grant rejected: ${res.status} ${await res.text()}`);
    return null;
  }

  return (await res.json()) as TokenResponse;
}

/**
 * Full interactive PKCE login for one server: register/reuse a client,
 * build the authorize URL, open the browser, wait for the redirect,
 * exchange the code, test whether a refresh token actually works, and
 * persist the result. Requires a human to complete phone/OTP in the browser
 * — there is no way around that for the *first* login; only the subsequent
 * refresh (if it works) can be headless.
 */
export async function login(server: SwiggyServer, callbackPort: number): Promise<void> {
  const redirectUri = `http://localhost:${callbackPort}/callback`;
  const clientId = await getOrRegisterClient(server, redirectUri);
  const { verifier, challenge, state } = generatePkce();

  const authorizeUrl = new URL(`${AUTH_BASE}/authorize`);
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    scope: "mcp:tools mcp:resources mcp:prompts",
  }).toString();

  console.log(`[oauth] Opening browser for ${server} login. If it doesn't open, visit:\n${authorizeUrl}\n`);
  const callbackPromise = waitForCallback(callbackPort, state);
  openBrowser(authorizeUrl.toString());

  const { code } = await callbackPromise;
  const token = await exchangeCode({ code, verifier, clientId, redirectUri });
  console.log(`[oauth] Token obtained for ${server}. Has refresh_token in response: ${Boolean(token.refresh_token)}`);

  if (token.refresh_token) {
    const refreshed = await tryRefresh(clientId, token.refresh_token);
    console.log(`[oauth] refresh_token grant actually works: ${refreshed !== null}`);
    if (refreshed) {
      // The refresh succeeded and issued a new token — persist that one instead,
      // since the one we just tested is now spent (or superseded).
      await saveToken(server, refreshed);
      console.log(`[oauth] Stored the refreshed token for ${server}.`);
      return;
    }
  }

  await saveToken(server, token);
  console.log(`[oauth] Stored token for ${server}. Expires in ${token.expires_in}s.`);
}

export function endpointFor(server: SwiggyServer): string {
  return SERVER_ENDPOINTS[server];
}
