# Decisions

A running log of decisions made on this project — what was chosen, why, and what it rules out. Newest first.
Updated as decisions happen, and nudged every 20 tool actions by a hook (see `.claude/hooks/`) so it doesn't
fall behind silently.

---

## 2026-08-26 — CLI onboarding replaced with real Settings pages; Swiggy-orange theme

**Decision:** built `/settings/commitments`, `/settings/watched-people`, `/settings/pantry` as real forms backed
by live data, replacing the `add-commitment`/`add-watched-person`/`record-purchase` CLI scripts as the way
anyone (not just the developer) actually gets data into the system. Restyled the whole app around Swiggy's real
brand orange (`#FC8019`) instead of the mockup's blue.

**Why now:** three real product questions surfaced the gap directly — how does the system learn a commitment
(answer: it can't infer one, it has to be told, which means a real form, not a CLI flag), how does payment
happen (answer: UPI needs live human 2FA, which is *why* every daemon defaults to Cash/COD — that's what makes
"zero taps" true), and who's "the other person" for Dead Man's Switch (answer: already solved by data that
exists — Swiggy's own `get_addresses` already tags entries like "Maa"/"Work"/"Friends & Family", so the picker
is just that list, not a new contacts system).

**What's real, not mocked:** the address picker on both Commitments and Watched People calls live
`get_addresses` and shows this account's actual 14 saved addresses. The Commitments form does a genuinely live
`search_restaurants_dineout` call and lets you pick a real restaurant — proved end-to-end by creating and then
deleting a real "Test Biryani Night" commitment against real search results (Sigree, Punjab Grill, Biryani Can,
etc.), not placeholder data.

**Swiggy's actual logo asset couldn't be fetched** — this sandbox's network access is scoped to `mcp.swiggy.com`
(the MCP domain), not their marketing site (`www.swiggy.com`), confirmed by both `curl` and a Playwright
navigation returning nothing. "Powered by Swiggy" uses their real, publicly well-documented brand orange as a
styled wordmark instead of a fabricated logo shape — swap in the real file if one gets provided.

---

## 2026-08-26 — Corrected: the first Phase 4 build didn't actually follow the mockup

**What went wrong:** the first pass at the Steward web app used emoji icons with no badge background, put "Approve" in the sidebar nav as a full page, and never built the Architecture view — none of which matches `Steward Web.html`. This wasn't caught by the earlier "screenshotted against the mockup for a visual sanity check" claim in the previous commit message — that check was too shallow (a glance, not a real comparison) to catch real structural differences.

**What actually fixed it:** re-rendered the mockup in Playwright and extracted its real DOM (`page.evaluate(() => document.body.innerHTML)`), not just a screenshot — this recovered the literal SVG icon paths, the real nav items (Dashboard/Timeline/**Architecture**, not Approve), the exact `ApprovalModal` structure and copy, the real `DOMAINS` array behind the Architecture view, and the actual CSS custom property values (colors, fonts: Inter + Space Mono, not the IBM Plex assumed from the separate Architecture *artifact*, which turned out to be a different design system entirely). Rebuilt against that extracted source, not against memory of what the screenshot looked like.

**Consequence — the actual lesson:** "screenshotted it and it looked right" is not verification when the reference is a specific design, the same way "the code compiles" was never verification for the MCP schema work earlier. Reading the mockup's real markup/source is required, not optional, when the ask is to follow a specific design — a visual approximation from a screenshot is a different, lower bar than the one that was actually set.

---

## 2026-08-26 — Found and fixed test data silently polluting the real dev DB

**Decision:** added `t.after()` cleanup to every integration test that writes to Postgres
(`test/action-gate.test.ts`, `test/standing-plans.live.test.ts`), deleting exactly the row(s) that test created.

**Why:** tests share the same `DATABASE_URL` as manual dev usage and now the Steward web UI. Building the
Dashboard surfaced this concretely: it rendered a fake "Kitchen Entropy -- test restock -- ₹640" card, because
`action-gate.test.ts` had been leaving a permanent `pending` proposal behind on every `npm test` run, with no
cleanup and a random idempotency key so nothing ever deduped it. 22 fake proposal rows and 5 duplicate
commitments (from `standing-plans.live.test.ts` doing the same thing) had silently accumulated over the
session before the web UI made it visible. Deleted all of it, keeping only the real rows (including commitment
id 2 and its real ₹0 booking, order ID 246727708188841 -- the live test creates a fresh commitment every run and
cleanup only removes what that specific run created).

**Consequence:** any new integration test that writes to this shared DB needs the same discipline. A dedicated
test database would prevent this class of bug structurally rather than relying on remembering to clean up --
worth reconsidering if this keeps happening.

---

## 2026-08-26 — Phase 4 stack: Express + server-rendered HTML, not Next.js/React

**Decision:** the Steward frontend is a plain Express server rendering HTML via template literals (`src/web/`),
not a React/Next.js port of the Claude Design mockup's component structure.

**Why:** PLAN.md left this genuinely open ("decide for real once Phase 4 starts... revisit once it's clear how
interactive the screens actually need to be"). v1's actual interactivity is listing data and handling
approve/snooze form submissions — not complex client state. That's squarely in Express+plain-HTML territory,
and it keeps the whole project on one consistent stack (Node/TS + `pg`, no ORM, no ORM-adjacent framework
weight) rather than introducing React/Next.js as a second paradigm for one dashboard. The mockup's visual
design (fonts, card layout, color language) is still the source of truth for what it looks like — just
implemented as server-rendered markup instead of React components.

**Consequence:** if the screens later need real client-side interactivity (live-updating without a refresh,
drag interactions, etc.), that's the trigger to revisit React — not before.

---

## 2026-08-26 — Phase 3: Dead Man's Switch redesigned around a real API constraint

**Decision:** "watches a tracked person's ordering activity" (the review doc's original framing) is not
buildable — a single OAuth token grants access to exactly one Swiggy account, and no tool reads a *different*
account's order history. Redesigned "quiet" to mean our own last-contact record (`watched_people.last_contact_at`,
reset by an explicit check-in — a call, a message, an order placed for them), not observed Swiggy data.

**Why:** better to correct the design against what the API actually allows than build something that looks
right until someone asks "wait, how does it know their account went quiet?" and there's no answer. This is the
same category of correction as Phase 1/2's schema fixes, just at the design level instead of the argument-shape
level.

**Consequence:** the daemon is honest about what it can and can't know — it's watching *our* attentiveness, not
theirs. A future refinement could add a manual "they haven't called" check-in trigger from the Steward UI, but
that's still human-reported, not Swiggy-observed.

---

## 2026-08-26 — Food cart schema verified live; a dangerous fallback caught and removed

**Decision:** fixed `update_food_cart`/`get_food_cart`'s args against real `tools/list` (Phase 0 only ever
crawled read-only menu data, never actually called these). Real shape: `update_food_cart` takes `cartItems`
(not `items`) with `menu_item_id` (not `itemId`), plus a required `addressId` that was missing entirely;
`get_food_cart` also requires `addressId`. The real cart total lives at
`structuredContent.data.pricing.to_pay` — yet another distinct envelope shape on top of the four already found.

**The more important catch:** the first version had a fallback chain
(`cart.structuredContent.total ?? cart.structuredContent.billTotal ?? picked.item.price`) that silently landed
on `picked.item.price` when neither guessed field existed — producing a proposal for **₹29 when the real total
(with delivery + taxes) was ₹132**. A ₹103 undercount on a real spend proposal is a serious near-miss, not a
cosmetic bug. Caught by manually re-checking the raw `get_food_cart` response rather than trusting the daemon's
own output — the same discipline that caught Instamart's ₹0 bug the same day.

**Rule going forward, stated explicitly because two same-day bugs came from violating it:** when a value drives
a spend decision (the `amount_paise` an action-gate proposal carries), never fall back to a proxy/guessed value
if the real field is missing — throw. A wrong number that looks plausible is worse than a loud failure.

---

## 2026-08-26 — Interactive re-solve router deferred, not built

**Decision:** Phase 3's other deliverable (a small free-text router across all three servers, e.g. "not cooking
tonight") is not built yet. Daemon logic (Dead Man's Switch) and the three-daemons-concurrent exit criterion
are both done; the router is deferred.

**Why:** the router needs an actual input channel to receive free text from a human, and none exists yet — the
Telegram bot is still console-logging only (explicitly deferred per your direction, "we will integrate telegram
bot accordingly later"). Building a router with nothing to route from would be untestable scaffolding, not a
real deliverable.

**Consequence:** revisit this once Telegram (or Phase 4's web surface) exists as a real input channel — it's
not dropped, just correctly sequenced after something exists to wire it to.

---

## 2026-08-26 — Instamart verified live; found a real bug in the MCP client itself, not just a schema guess

**Decision:** fixed `callTool` (`src/mcp/client.ts`) to check for tool-level errors (`result.isError`), not just
JSON-RPC-level ones. Every daemon depends on this function, so the fix is generic, not Kitchen-Entropy-specific.

**Why:** `get_cart` returned a "not serviceable" error for an address that *had* worked seconds earlier
(Instamart serviceability appears flaky/transient in this sandbox — same address, different result, no code
change in between). `callTool` treated that error response as valid data because it only checked the outer
JSON-RPC envelope, not the inner tool-result's `isError` flag. The bug: a missing `cartTotalAmount` silently
parsed as ₹0 instead of throwing — a Tier B proposal almost went out with a fabricated ₹0 total. Caught by
sanity-checking the number against an earlier manual test (₹123 for the same item), not by any built-in check.

**What was also wrong in the guessed Instamart schema**, corrected the same way Dineout was:
`update_cart` takes `selectedAddressId`, not `addressId`; `checkout` **requires** `addressId` (was being called
with empty args); `get_cart` takes **no arguments at all**; product data lives under `variations`, not
`variants`, with price nested as `price.offerPrice`; `get_cart`'s total is a **currency-formatted string**
(`"₹123"`), not a number.

**Confirmed, not assumed:** `update_cart` genuinely replaces the real item(s) sent (tested item A → item B,
left only item B) — the reference doc was right about this one. Swiggy also auto-injects its own promotional
freebie/voucher items independent of anything sent; those aren't "what this daemon restocked" and are ignored.
Real platform fees (handling, small-cart, delivery-partner, surge, GST) took a single ₹17 item to ₹123 total —
confirms the design choice to check the ₹1000 cap against `get_cart`'s real total, never a naive sum of item
prices.

**Also found:** the Food/Dineout home address (`8258911`) is not Instamart-serviceable on this account; a
different saved address ("Work") is. Serviceability is per-vertical, not a property of the address itself.

**Verified end-to-end (no live purchase — explicit instruction):** ran Kitchen Entropy for real against live
data — found the depleted item, searched a real product, built a real cart (₹123 with fees), created a
correctly-`pending` Tier B proposal. `checkout` was never called. Test cart cleared afterward so nothing is
left sitting in the real Instamart cart.

---

## 2026-08-26 — Phase 1 MVP: first real autonomous booking

**Decision:** with explicit sign-off, flipped `dryRun` to `false` for one real execution against the
already-verified commitment (2026-08-25's live-schema entry) rather than only ever trusting dry-run proof.

**Why:** every earlier check (schema verification, the idempotency test, the restart-survival test) proved the
*pipeline* was correct, but Phase 1's actual exit criterion is a real booking happening with zero human action
at execution time — that can only be proven by really doing it once. Asked first because it creates a real,
externally-visible artifact (a reservation under this account) rather than staying inside the dev environment.

**What happened:** `book_table` against A Diner - Four Points by Sheraton (Vashi), 27 Aug 2026, 7:30 PM, 2
guests, ₹0 (free "10% off" deal) — `status: COMPLETED`, Order ID `246727708188841`. Independently re-confirmed
via a separate `get_booking_status` call, not just trusting `book_table`'s own response.

**Important consequence for Phase 1+ generally:** the idempotency key used
(`standing-plans:2:2026-08-27`) was deliberately the *same* key the real scheduler will generate when it
naturally sees this commitment as due on Thursday (day_of_week match) — not a throwaway test key. That means
when the schedule fires for real, `propose()` will find the existing `executed` row and correctly no-op instead
of double-booking. Manually exercising the real path still has to respect the same safety mechanism a
production firing would — that's not a one-off exception, it's the rule.

---

## 2026-08-25 — Phase 1 spine built; Standing Plans blocked on live Dineout auth

**Decision:** built the full Phase 1 spine (scheduler via pg-boss, action gate, minimal world model, the
Standing Plans daemon, Telegram notify with a console fallback) against the best-available Dineout tool spec
from `swiggy-mcp-reference.md` §4.3, rather than waiting for Dineout OAuth to exist before writing any code.

**Why:** everything up to the live MCP call is independently verifiable without Dineout access — proved the
idempotency guarantee (`propose()` with a repeated key resolves to the same row, doesn't double-book) against
the real dev Postgres, and confirmed the scheduler starts, persists its own schema, and survives a clean
restart. No reason to block all of that on one missing credential.

**What's still unverified:** `get_available_slots` / `book_table`'s exact argument and response shape
(`src/daemons/standing-plans.ts`'s `findSlot`) — `swiggy-mcp-reference.md` has already been wrong about Food
before (tool count, response envelope), so treat this Dineout section with the same skepticism until checked
against a real `tools/list` + a real call, the way Phase 0's Food crawler was checked before being trusted.

**Consequence:** `runStandingPlans` defaults to `dryRun=true` everywhere (the CLI script, the scheduler) until
that verification happens — dry-run skips the actual `book_table` call but still needs a valid Dineout token to
check slot availability, so even dry-running end-to-end needs `npm run auth -- dineout` once.

---

## 2026-08-25 — Dineout schema verified live; the guessed version was wrong on several points

**Decision:** rewrote `findSlot`/`runOne` in `src/daemons/standing-plans.ts` against the real schema, confirmed
by calling `tools/list` and real `get_available_slots`/`search_restaurants_dineout`/`get_restaurant_details`
calls with an actual Dineout token, rather than the `swiggy-mcp-reference.md`-derived guess from the day before.

**What was actually wrong:**
- `get_available_slots` takes `{restaurantId, date, latitude, longitude}` — no `addressId`, no `partySize`.
  `get_saved_locations` never returns coordinates (privacy protection, same as Food/Instamart's `get_addresses`)
  , so an address alone can't drive this call — **the world model needed `latitude`/`longitude` columns added
  to `commitments` that weren't in the original Phase 1 schema.**
- `book_table` needs `slotId` (a **number**, from `slot.deals[].slotId`) and `itemId` (from
  `slot.deals[].itemId`), plus `reservationTime` (a unix timestamp, from the slot, not the deal) and
  `guestCount` — not the `partySize`/string-`slotId` shape originally assumed.
- **A third distinct response envelope shape**, on top of the two already known
  (`structuredContent.<key>` for Food, `structuredContent.data.<key>` for `get_saved_locations`):
  `get_available_slots`'s real data lives under `_meta.slots`, with `structuredContent` empty. There is no
  universal envelope across tools, full stop — check every tool's actual response before parsing it, regardless
  of which shape the last one used.
- **Dineout's address ID space is NOT separate from Food/Instamart's**, contrary to
  `swiggy-mcp-reference.md`'s explicit claim. `get_saved_locations` returned the identical ID (`8258911`, this
  account's home) as Food's `get_addresses` for the same address. Still worth treating as unconfirmed for other
  accounts — but on this account, sharing an address ID across servers was safe, not the error the reference
  doc implied.
- Found an undocumented tool, `render_restaurants_dineout` (a "how to display these search results" rendering
  helper, per its accompanying prompt instructions) — not listed in `swiggy-mcp-reference.md`'s Dineout table.

**Also learned (environmental, not a schema bug):** same-day booking returned zero available slots at every
restaurant tried. Real free dinner slots did exist starting a few days out. A live regression test
(`test/standing-plans.live.test.ts`) locks in the verified shape against a known-good future date/restaurant,
skipping itself automatically if no Dineout token is stored (so `npm test` still passes on a fresh clone).

**How this was actually checked:** ad hoc `node --import tsx -e "..."` one-liners calling `callTool`/`listTools`
directly against the live Dineout server — the same pattern used to verify Food in Phase 0. Worth reusing this
approach before trusting any unverified tool spec, Instamart included when Phase 2 gets there.

---

## 2026-08-25 — How to actually read a Claude Design "Bundled Page" export

**Finding, not really a decision, but worth recording so it isn't re-derived from scratch:** a downloaded
Claude Design export (e.g. `Steward Web.html`) is a compiled React app bundle, not plain HTML — grep/text
search finds nothing, because the actual screen content is packed into an opaque blob that only unpacks at
runtime in a real browser (the visible "Unpacking..." loader is literal). A *published Claude Code Artifact*
(like the Architecture diagram) is different — that's a self-contained snapshot with the real content readable
directly as JSON in the page (`appifact-doc`/`canvas.json`), no execution needed.

**What worked:** installed Playwright + Chromium locally (`npm install playwright` in a scratch dir, then
`npx playwright install chromium`), opened the file with `file://`, waited a few seconds for it to unpack, then
pulled `document.body.innerText` and a full-page screenshot. Had to click through the app's own nav (Dashboard/
Timeline/Architecture on web, Home/Approve/Timeline on mobile) to capture every screen — only the default view
renders without interaction.

**Consequence:** if a future session gets handed another Claude Design HTML export to read, don't try grep
first assuming it might be plain markup — go straight to rendering it. If Playwright/Chromium isn't already
installed, budget ~200MB and a couple minutes for the download.

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
