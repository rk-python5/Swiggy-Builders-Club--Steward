# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This repo is currently pre-build: it holds the legal/access setup and MCP wiring for a Swiggy Builders Club
integration, but no application code has been written yet and no language/stack has been chosen. See
`Swiggy MCP - Ideation Notes.docx` for the brainstormed product directions under consideration. There are no
build, lint, or test commands yet — add them here once a stack is picked.

## Tool inventory & call sequences — use `swiggy-mcp-reference.md`

`swiggy-mcp-reference.md` (twin: `Swiggy_MCP_Working_Reference.docx`) is a compiled working reference covering
the full tool inventory per server, canonical call sequences (order food / order groceries / book a table / UPI
payment), the `place_food_order` schema in full as a template, hard constraints (₹1000 cap, gated Instamart
coupons, no cancellation tool, Dineout free-bookings-only, cart replacement semantics on Instamart), and known
data gaps (no dish-level ratings, no cross-vertical restaurant join, split address ID spaces). Read it before
building anything against a specific tool — it's far more complete than what's summarized in this file.

**Verify before trusting exact counts/behavior claims in it** — it was not fully fact-checked against live
calls. Spot-checked so far:

- ✅ Server structure, endpoint URLs, and the GitHub manifest repo (`Swiggy/swiggy-mcp-server-manifest`) it
  cites are real — confirmed directly.
- ❌ **Food tool count is wrong.** The doc claims 18 Food tools and a 48-tool total. A live `tools/list` call
  against `mcp.swiggy.com/food` returned **20 tools** — the doc's Food table omits `create_address` and
  `delete_address` entirely. Treat per-server/total tool counts anywhere (this doc, `llms.txt`, the reference
  site) as unconfirmed until re-checked with a live `tools/list` call.
- ⚠️ **Refresh-token claim is unconfirmed.** The doc asserts OAuth now issues refresh tokens. Swiggy's
  auth-server metadata does list `refresh_token` as a supported grant type, but an actual token exchange
  performed this session returned no `refresh_token` field. Don't build refresh-token handling on faith —
  confirm empirically first.
- ⚠️ Specifics with no independent source (e.g. the cancellation support phone number, the "widely-cited build
  report" about single-agent tool-registration failure) should be treated as unverified, not fact.

For anything current/authoritative, prefer fetching live: `https://mcp.swiggy.com/builders/llms.txt` (index of
every doc page, kept current by Swiggy) and `https://mcp.swiggy.com/builders/docs/reference/` — this repo's
`.md`/`.docx` are dated snapshots (compiled 24 Aug 2026), not a live source.

## What this integration is

Swiggy Builders Club MCP exposes Swiggy's Food delivery, Instamart (grocery), and Dineout (table booking)
backends as MCP tool servers, so an LLM agent can search, cart, checkout, and track orders on behalf of an
authenticated Swiggy user instead of a human using the app. Docs: https://mcp.swiggy.com/builders/docs/.

The three servers are registered in `.mcp.json` (project scope):

- `swiggy-food` → `https://mcp.swiggy.com/food`
- `swiggy-instamart` → `https://mcp.swiggy.com/im`
- `swiggy-dineout` → `https://mcp.swiggy.com/dineout`

## Sandbox constraints (governs any design/build decisions)

- Order placement is currently stubbed — `place_food_order` and friends return `{"success": true, "data": {}}`,
  not real kitchen dispatch.
- ₹1000 hard cap per order in the Builders Club sandbox.
- Food cart is locked to a single restaurant; switching restaurants flushes the cart.
- `place_food_order` is not idempotent — on a failed/ambiguous response, verify via `get_food_orders` rather
  than retrying blindly.
- Order tracking is poll-based (`track_food_order`, `track_order`), no faster than ~10s intervals — no
  confirmed webhook mechanism yet.
- Access tokens last 5 days. Refresh-token support is ambiguous — see the "Tool inventory" section below for
  what's actually been confirmed. Until confirmed, expect to re-run the OAuth flow periodically.

## Authenticating against the Swiggy MCP servers

Standard path: run `claude` interactively in this directory and approve/authenticate each `swiggy-*` server
when prompted (opens a browser for phone + OTP). This can't be done from a non-interactive session.

**Known bug — OAuth discovery is broken for strict clients.** Swiggy's protected-resource metadata at
`https://mcp.swiggy.com/food/.well-known/oauth-protected-resource` declares its authorization server as
`https://mcp.swiggy.com/auth`, but the actual `oauth-authorization-server` metadata document is served at the
*root* well-known path (`https://mcp.swiggy.com/.well-known/oauth-authorization-server`) while still declaring
`"issuer": "https://mcp.swiggy.com/auth"`. That's a location/issuer mismatch per RFC 8414 §3.3, so spec-strict
clients (e.g. MCP Inspector) refuse to connect with "Issuer mismatch in authorization server metadata." Worth
flagging in the Builders Club Discord if it's still unfixed.

Workaround — do the PKCE exchange manually and pass the token as a raw header, bypassing discovery:

1. Dynamically register a client: `POST https://mcp.swiggy.com/auth/register` with
   `redirect_uris`, `token_endpoint_auth_method: "none"`, `grant_types: ["authorization_code"]`,
   `response_types: ["code"]` → returns a `client_id`.
2. Build an authorize URL against `https://mcp.swiggy.com/auth/authorize` with a generated PKCE
   `code_challenge` (S256) and a `redirect_uri` like `http://localhost:8765/callback`, open it in a browser,
   complete phone + OTP login. The redirect will fail to load (nothing's listening) — copy the `code` from the
   resulting URL.
3. Exchange it: `POST https://mcp.swiggy.com/auth/token` with `grant_type=authorization_code`, the `code`,
   `redirect_uri`, `client_id`, and the PKCE `code_verifier` → returns a Bearer access token (5-day expiry, no
   refresh token).
4. Call tools directly: `POST https://mcp.swiggy.com/{food|im|dineout}` with a JSON-RPC body
   (`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name": "...", "arguments": {...}}}`) and
   `Authorization: Bearer <token>`. In MCP Inspector, the same token can be set under a server's Settings →
   Custom Headers as `Authorization: Bearer <token>` to skip the broken discovery flow.

Never print or commit access tokens — treat them as live credentials tied to the real Swiggy account.

## Legal constraints from the signed Integration Agreement

These bind whatever gets built here, so they're relevant to any implementation decisions:

- Must display "powered by Swiggy" on every screen/interface where the MCP integration is exposed.
- Cannot resell, sublicense, or expose Swiggy MCP/Swiggy Site/Listings as a standalone product to third parties.
- Cannot use the integration to benchmark, train, or build a competing product/dataset, or share derived data
  with a Swiggy competitor.
- Exclusivity clause: no partnering with another food delivery / quick-commerce / dining platform during the
  Term.
- Must give Swiggy prior written notice and get consent before implementing/deploying any new use of the MCP
  (Clause 2.1(v)) — check whether a given feature needs this before shipping it.
- The agreement's own existence/contents are confidential (Clause 12.5) — don't post it publicly.
- Liability capped at ₹50,000; 1-year term from 19-Aug-2026; 30-day termination notice either side.

## Reference docs

- Tool reference (Food/Instamart/Dineout): https://mcp.swiggy.com/builders/docs/reference/
- Recipes (e.g. end-to-end food order flow): https://mcp.swiggy.com/builders/docs/build/recipes/order-food/
- Production access process: https://mcp.swiggy.com/builders/docs/operate/access/
