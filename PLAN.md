# Household Daemons — Project Plan

Six phases, start to end. Phases 0-4 restate and sharpen the build plan from `Household_Daemons_Review_Draft.docx`
§7 with what Phase 0 actually taught us (refresh tokens don't work, the real API response shapes, the DB port
collision, etc.) — see `DECISIONS.md` for the reasoning behind each of those. Phase 5 (production) isn't in the
review doc at all; it's added here because "start to end" has to include leaving the sandbox.

Each phase lists a goal, deliverables, and exit criteria — the thing that has to be true, observed, before
calling it done. Sequencing follows the review doc's own logic: cheapest/safest daemon first (nothing can be
spent), hardest abstraction test second (deliberately, to find a wrong interface with one daemon built instead
of two), then the odd one out, then the surface, then production.

**Design vs. build, for the frontend specifically:** UI screens and system-design work are being done in Claude
Design in parallel with the backend phases below — that work isn't gated on anything. What *is* deliberately
sequenced last (Phase 4) is writing the frontend's actual code, because it needs real accumulated daemon data
to be worth looking at. Without Phase 4 this project stops at a backend + a Telegram bot — a working model, not
a product — so it's a real phase, not an afterthought tacked on at the end.

---

## Phase 0 — Ground ✅ Done

Repo scaffold, Postgres, hand-rolled PKCE OAuth (Swiggy's discovery metadata is broken), a raw MCP client, a
Food-domain crawler, a simulation harness. See `/Users/rehaankhatri/.claude/plans/toasty-doodling-starlight.md`
for the original plan and `DECISIONS.md` for what was learned building it. Key confirmed fact carried into every
later phase: **refresh tokens are not issued, even when explicitly requested.** Every phase below has to design
around a token that dies in 5 days with no headless renewal — there's no "fix" for this, only ways to fail
gracefully.

---

## Phase 1 — Spine + First Daemon (Standing Plans / Dineout) ✅ MVP achieved 2026-08-26

A real free table was booked autonomously end-to-end: A Diner - Four Points by Sheraton, Vashi, 27 Aug 2026,
7:30 PM, 2 guests, ₹0 — confirmed independently via `get_booking_status` (Order ID 246727708188841), not just a
local echo. All three exit criteria met: real booking with no human action needed at execution, scheduler
survives a hard-killed process restart (verified by actually killing and restarting it), idempotency proven
both by direct test and by using the same key the real Thursday scheduler firing will generate — so when the
schedule naturally fires on the commitment's real day, it resolves to the already-executed row instead of
double-booking. See `DECISIONS.md`'s 2026-08-26 entry for the full trail.

**Goal:** prove the full spine end-to-end on the cheapest, safest daemon there is — `book_table` structurally
cannot spend money (free reservations only), so this daemon can run fully autonomous with zero financial risk
while every other piece of the spine gets built and debugged for free.

**Deliverables:**
- Dineout OAuth (one more manual PKCE login — repeat Phase 0's `npm run auth -- dineout`).
- Scheduler (`pg-boss`): cron + event triggers, run history, retries.
- Action gate: the single mutation path, both consent tiers (Tier A autonomous / Tier B needs a human tap),
  idempotency keyed on a `proposal_id`, a global dry-run flag. Built generically now even though Standing Plans
  only exercises Tier A — Phase 2 needs Tier B on day one.
- World model, minimal: a `commitments` table (recurring social plans) only — no pantry yet.
- Daemon: Standing Plans — on schedule, checks for a commitment coming due, checks slot availability
  (`get_available_slots`), books autonomously (`book_table`) since nothing can be spent.
- Telegram bot for notify + one-tap confirm — the notify channel Phase 2 actually needs, proven here first
  since this daemon's own confirmations are optional.
- **New problem this phase has to answer, not inherited from the review doc**: what happens when the Dineout
  token expires mid-operation with no refresh available? Evaluate: a proactive Telegram alert N days before
  expiry asking for re-auth, vs. the daemon self-reporting a "needs re-auth" state and going dormant rather than
  crashing. Whatever's decided, write it to `DECISIONS.md` — this exact problem recurs in every later phase.

**Exit criteria:** a real free Dineout reservation gets booked with zero human action at fire time; the
scheduler survives a process restart (proves persisted state, not just an in-memory timer); a manually-retried
job doesn't double-book (proves the idempotency key actually works, not just exists).

---

## Phase 2 — Abstraction Test (Kitchen Entropy / Instamart) ✅ MVP achieved 2026-08-26

Full Tier-B lifecycle proven live, with no real purchase ever made (explicit instruction): a real depleted
pantry item was detected, a real product searched, a real cart built (₹123 with genuine Swiggy platform fees,
not a naive item-price sum), a correctly `pending` proposal created, and the approval step itself proven —
`approveProposal()` transitioned it `pending → executed` while `dry_run: true` correctly prevented any call to
`checkout` (`"note": "no MCP call made"`). The ₹1000 cap enforcement lives in the action gate, proven by tests
independent of any live call. Along the way, found and fixed a real bug in the MCP client itself (silently
swallowed tool-level errors, not just this daemon's problem) — see `DECISIONS.md`'s 2026-08-26 entries for the
full trail, including why Phase 1's interfaces genuinely didn't quite fit here as expected.

**Goal:** stress-test Phase 1's abstractions with a genuinely harder daemon, and build the first real Tier-B
(spends money) consent flow. Sequenced second deliberately — per the review doc, better to find the wrong
interface with one daemon built than with two.

**Deliverables:**
- Instamart OAuth (another manual PKCE login).
- World model extended: a pantry belief per household item — purchases observed via `get_orders` /
  `your_go_to_items`, consumption *inferred* via a hand-set exponential decay curve. Per `DECISIONS.md`'s ML
  section: heuristic now, trained model later — there's no usage history yet to train on.
- Daemon: Kitchen Entropy — depletion crosses a confidence threshold, proposes a restock cart, routes through
  the action gate's Tier B (proposal → Telegram notify → one-tap confirm → `checkout`).
- Instrumentation: log every proposal, confidence score, and accept/reject from this point forward — it's the
  training set for the trained models scoped for later, and skipping this now means re-collecting months of
  data later.

**Expect** Phase 1's interfaces to not quite fit here — that's the point of the sequencing, not a failure.

**Exit criteria:** a real Instamart order is placed only after an explicit one-tap confirmation; the ₹1000 cap
is enforced by the action gate itself, not by the daemon (proves the gate is the only mutation path); proposal
logging is verifiably populating a table nothing consumes yet.

---

## Phase 3 — Third Daemon (Dead Man's Switch / Food) 🟡 daemon done, router deferred — 2026-08-26

**Design correction from the original framing:** a single OAuth token grants access to exactly one Swiggy
account — there is no tool that reads a *different* account's order history, so "watches a tracked person's
`get_food_orders` history" isn't actually buildable. Redesigned around what's real: `watched_people` tracks
*our own* last-contact record (reset by an explicit check-in), not observed Swiggy activity. See
`DECISIONS.md`'s 2026-08-26 entries for the full reasoning, plus a serious near-miss caught along the way — a
fallback chain that would have proposed ₹29 when the real cart total (delivery + taxes included) was ₹132.

**Goal:** an absence-triggered (not presence-triggered) daemon, and the one place a cross-server router is
allowed to exist.

**Deliverables:**
- Food OAuth already exists from Phase 0 — re-auth if the token's since expired.
- ✅ Daemon: Dead Man's Switch — a watched person quiet past their threshold gets a modest (< ₹300) item picked
  from a real restaurant search, a real cart built, and a Tier B proposal created (needs the account holder's
  confirmation, not the recipient's) — verified live end-to-end, no order ever placed.
- 🟡 **Deferred, not built**: the interactive free-text router ("not cooking tonight" across all three servers
  at once). It needs an actual input channel to route from, and none exists yet — Telegram is still
  console-logging only, deferred per explicit direction to wire it up later. Revisit once Telegram or Phase 4's
  web surface gives it something real to receive text from. Kept small and separate when it is built, since a
  single agent holding all ~48 tools is a documented failure mode (`swiggy-mcp-reference.md` §9).

**Exit criteria:** all three daemons run concurrently without interfering with each other's scheduler slots or
DB state (✅ verified — distinct pg-boss queues/schedules, no conflicts on startup); the interactive router
picks the correct vertical on a handful of hand-tested free-text prompts (⏸ deferred, see above).

---

## Phase 4 — Frontend: Surface and Demo 🟡 core built 2026-08-26, Settings/Architecture/mobile still open

Dashboard, Timeline, and Approve are real, running, and verified end-to-end against live data — including the
actual approve action submitted through the real web form, transitioning a real proposal and updating the UI
correctly. Stack ended up Express + server-rendered HTML, not the React/Next.js port sketched below — see
`DECISIONS.md`'s 2026-08-26 stack entry. Not yet built: the Settings screen (still the gap flagged below), the
Architecture view, and the mobile layout — Dashboard/Timeline/Approve on web cover the core "see and act on
what's happening" loop, which is what the exit criteria actually depend on.

Without this phase the project stops at a backend + a Telegram bot — a working model, not a product. It's a
real deliverable, not an afterthought; it's just sequenced last because the *build* needs real accumulated
daemon activity to be worth looking at. **Design is not gated on that** — the mockups below already exist,
built in Claude Design (`Steward Web.html` / `Steward Mobile.html`, a working React prototype, plus a separate
published "Household Daemons Architecture" artifact). What's deliberately deferred is writing the frontend's
*production* code against real data, not designing what it looks like.

**Goal:** a real web + mobile app called **Steward** — not the Telegram bot repurposed, a superset of it — that
makes the daemons' existence visible and gives Tier-B confirmations a proper home instead of only a chat
message. "Powered by Swiggy" is already designed into the header on every screen, which incidentally satisfies
the Integration Agreement's Clause 3.4(ii) branding requirement for free.

**Screens (from the actual mockups — extracted by rendering them, since the exported files are compiled React
bundles with no readable markup, not plain HTML):**
- **Dashboard/Home** — one card per daemon (icon, name, one-line description, vertical in parens): a colored
  left-border and a tier pill (green `TIER A · AUTONOMOUS` / amber `TIER B · CONSENT`) communicate risk at a
  glance. Tier A shows a status line and "No action needed"; Tier B shows a status line and a **Review** button
  when a proposal's waiting.
- **Timeline** — reverse-chronological feed, exactly matching the "here's what already ran" pitch from the
  original plan: completed autonomous actions (green dot), a proposal awaiting a tap (amber dot), a daemon
  currently watching with no action yet (gray dot) — e.g. *"Dead Man's Switch is watching — No activity for 6h
  · will propose an order at 9h."*
- **Approval flow** (web: modal from a Dashboard card's Review button; mobile: dedicated **Approve** tab) — tier
  badge, proposal summary, a **Delivery address** section, a **Payment** section ("UPI · will be used
  automatically"), then two actions: **Approve order** and **Snooze**.
- **Architecture** (web only, not on mobile — a dev/reviewer view, not an end-user one) — the same six-domain
  diagram as the standalone Architecture artifact, embedded directly in the app.

**Two real gaps the mockups surface — not cosmetic, both change earlier phases:**
1. **No Settings screen exists.** Nothing designed yet for addresses, spend caps, tracked people (Dead Man's
   Switch), or depletion thresholds (Kitchen Entropy) — the knobs a real user needs, not a config file only the
   developer can touch. Needs its own design pass before or during Phase 4, it's not just an implementation
   detail to backfill.
2. **"Snooze," not "Reject."** The approval flow only offers *Approve order* / *Snooze* — deferring a proposal
   to reappear later, not killing it outright. That's a real state the `proposals` table (Phase 2) needs to
   support — `pending` / `approved` / `snoozed(until)` — not the simpler accept/reject binary planned there
   originally. Update Phase 2's action-gate schema when it's actually built.

**Stack, as actually built (see `DECISIONS.md`):** Express + server-rendered HTML template literals
(`src/web/`), not the React/Next.js port originally sketched here. v1's actual interactivity — listing data,
handling approve/snooze form submissions — didn't justify introducing a second framework paradigm alongside the
rest of the project's plain Node/TS + `pg` stack. The mockup's visual design (fonts, card layout, color
language) is still the source of truth for what it looks like; only the implementation approach changed.
Revisit React if the screens later need real client-side interactivity this can't cover.

**Exit criteria:** the demo is "here's what's already been running," not a live click-through — the whole pitch
depends on this distinction (review doc §7). ✅ Verified: real Dashboard/Timeline/Approve pages read live
Postgres state, and a real approve action submitted through the actual web form correctly transitioned a real
proposal (`pending → executed`) and updated what the UI shows. The Telegram side of "both reflect the same
state" is still pending Telegram itself being wired up — the DB-backed mechanism it needs is already in place
and proven, so wiring Telegram in later is additive, not a redesign.

---

## Phase 5 — Production Access & Hardening

**Goal:** leave the sandbox (₹1000 cap, stubbed order responses) for real transactions. Not in the review doc's
phasing — added here because a plan that stops at "demo" isn't actually start-to-end.

**Deliverables:**
- Submit the demo video + production access application (`docs/operate/access`). Per `swiggy-mcp-reference.md`:
  staging credentials are issued during review; production access follows only after the staging integration
  runs cleanly for 48+ hours.
- Satisfy Integration Agreement Clause 2.1(v): written notice to Swiggy of the full technical implementation,
  and their consent, *before* going live — not after.
- "Powered by Swiggy" branding (Clause 3.4(ii)) on every surface before it's shown to a second person.
- Turn the token-expiry-with-no-refresh problem from an annoyance into a hardened path: at sandbox scale a
  dormant daemon for a day is a shrug; at production scale with real money it's a reliability requirement.
- Audit-readiness for Clause 17 (Swiggy's 2-year audit right): keep run history and proposal logs retrievable,
  not just locally useful.

**Exit criteria:** a real (non-sandbox) transaction placed by at least one daemon, compliant with every
obligation in the signed agreement — not just working code.
