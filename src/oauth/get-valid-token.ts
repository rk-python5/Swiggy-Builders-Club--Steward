import { loadToken, saveToken, getClientId, type SwiggyServer } from "../db/tokens.js";
import { tryRefresh } from "./flow.js";

const EXPIRY_SAFETY_MARGIN_MS = 60_000;

/**
 * Returns a usable access token for `server`, refreshing it first if it's
 * expired (or about to be) and a refresh token is on hand. Throws a clear,
 * actionable error otherwise — there's no notifier in Phase 0, so a daemon
 * (once one exists) hitting this needs to fail loudly, not silently no-op.
 */
export async function getValidToken(server: SwiggyServer): Promise<string> {
  const stored = await loadToken(server);
  if (!stored) {
    throw new Error(`No token stored for '${server}'. Run: npm run auth -- ${server}`);
  }

  const isExpiring = stored.expiresAt.getTime() - Date.now() < EXPIRY_SAFETY_MARGIN_MS;
  if (!isExpiring) {
    return stored.accessToken;
  }

  if (stored.refreshToken) {
    const clientId = await getClientId(server);
    if (clientId) {
      const refreshed = await tryRefresh(clientId, stored.refreshToken);
      if (refreshed) {
        await saveToken(server, refreshed);
        return refreshed.access_token;
      }
    }
  }

  throw new Error(
    `Token for '${server}' is expired and could not be refreshed. Run: npm run auth -- ${server}`,
  );
}
