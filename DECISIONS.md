# Decisions

A running log of decisions made on this project — what was chosen, why, and what it rules out. Newest first.
Updated as decisions happen, and nudged every 20 tool actions by a hook (see `.claude/hooks/`) so it doesn't
fall behind silently.

---

## 2026-08-24 — Refresh tokens confirmed NOT issued by Swiggy

**Decision:** Design Phase 1+ assuming no headless token renewal is possible. `getValidToken()` throws a clear
"re-run `npm run auth`" error on expiry rather than attempting silent recovery.

**Why:** Swiggy's auth-server metadata lists `refresh_token` as a supported grant type. Tested twice — once with
a client that didn't request it, once with a client that explicitly registered
`grant_types: ["authorization_code", "refresh_token"]` — neither ever received a `refresh_token` in the token
response. This isn't "unconfirmed," it's confirmed absent.

**Consequence:** The review doc's "headless refresh has to actually work" requirement for a 3am daemon is not
solvable the way it assumed. Phase 1+ needs an actual answer here (e.g. a notification asking a human to
re-auth every ~4.5 days) — tracked as an open problem, not silently designed around.

---

## 2026-08-24 — No `@modelcontextprotocol/sdk` client/transport

**Decision:** `src/mcp/client.ts` is a hand-written fetch-based JSON-RPC caller. The OAuth flow (`src/oauth/`)
is also hand-written PKCE, not the SDK's `OAuthClientProvider`.

**Why:** Swiggy's `oauth-authorization-server` metadata is served at the wrong well-known path for the issuer
it declares (RFC 8414 §3.3 violation) — confirmed by hand, and independently by MCP Inspector refusing to
connect with "Issuer mismatch." Any client that does spec-compliant discovery hits this wall. Bypassing
discovery and attaching a manually-obtained Bearer token sidesteps it entirely.

**Consequence:** If Swiggy fixes their metadata, the SDK's transport becomes viable and could replace this —
worth revisiting periodically, not a permanent constraint.

---

## 2026-08-24 — Docker Postgres on port 5434, not 5432

**Decision:** `docker-compose.yml` maps Postgres to host port 5434.

**Why:** This machine already runs a native Postgres on 5432 (unrelated to this project), and an unrelated
project's container occupies 5433. Both discovered the hard way (silent wrong-role connection, then a bind
failure) rather than checked up front.

**Consequence:** Anyone else running this repo on a machine without those conflicts could safely use 5432 —
this is a local-machine accommodation, not a general requirement. Worth a `lsof -nP -iTCP:5432,5433,5434` check
before assuming a port is free on a new machine.

---

## 2026-08-24 — No ORM; plain SQL migrations via node-pg-migrate

**Decision:** Raw `pg` queries, migrations as plain `.sql` files with `-- Up Migration` / `-- Down Migration`
markers.

**Why:** Matches the review doc's own "spine built crude-but-real first" principle for Phase 0. An ORM's value
(type-safe queries, schema-as-code) matters more once the world model (Phase 2+) has real complexity to model —
premature here.

---

## 2026-08-24 — Crawler scoped to Food domain only for Phase 0

**Decision:** `src/crawler/food.ts` only. Instamart/Dineout crawling deferred to whichever phase actually
introduces Kitchen Entropy / Standing Plans.

**Why:** A working Food token already existed from earlier in the session; scoping Instamart/Dineout in now
would've meant two more rounds of phone/OTP login before Phase 0 could even start, for data nothing yet
consumes.

---

## 2026-08-24 — Stack: Node.js + TypeScript

**Decision:** Node/TS for the whole system, not Python or anything else.

**Why:** Inherited from the review doc's own architecture choice of `pg-boss` (a Node-only Postgres job queue)
for the Phase 1 scheduler — picking a different language for Phase 0 would mean rewriting it at Phase 1 anyway.

---

## 2026-08-24 — Public repo: exclude the signed Integration Agreement PDF

**Decision:** `.gitignore` excludes `Integration Agreement*.pdf`; it was never committed.

**Why:** The target GitHub repo (`rk-python5/Swiggy-Builders-Club--Steward`) is public. The PDF contains PAN,
DOB, and home address, and Clause 12.5 of the agreement itself bars disclosing its existence/contents without
Swiggy's written consent.

---

## 2026-08-24 — Product direction: Household Daemons

**Decision:** Build a persistence layer + scheduler running small autonomous "daemons" against the Swiggy MCP
(Standing Plans / Dineout, Kitchen Entropy / Instamart, Dead Man's Switch / Food) — not another chat-interface
wrapper around ordering.

**Why:** A competitive scan (`Household_Daemons_Review_Draft.docx` §2) found every other known Swiggy MCP
project is a stateless *surface* — a new place to type or speak an order. Nothing persists state between
sessions or acts without being asked. The two-tier consent model (autonomous only where nothing can be spent —
Dineout's free-bookings-only constraint makes this safe by construction) is what makes unattended action
tractable rather than reckless.

**Alternatives considered and set aside:** a menu-quality filter (killed — no dish-level ratings exist on any
tool); cook-vs-order arbitrage (survives the API but self-terminating — teach the heuristic twice and the user
doesn't need the tool anymore); a three-way Food/Instamart/Dineout price comparator (wounded — Dineout has no
item-level prices, so comparison can only ever be at meal granularity).
