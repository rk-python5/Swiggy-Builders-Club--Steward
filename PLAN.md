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

## Phase 1 — Spine + First Daemon (Standing Plans / Dineout)

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

## Phase 2 — Abstraction Test (Kitchen Entropy / Instamart)

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

## Phase 3 — Third Daemon + Interactive Path (Dead Man's Switch / Food)

**Goal:** an absence-triggered (not presence-triggered) daemon, and the one place a cross-server router is
allowed to exist.

**Deliverables:**
- Food OAuth already exists from Phase 0 — re-auth if the token's since expired.
- Daemon: Dead Man's Switch — watches a tracked person's `get_food_orders` history; if it goes quiet past a
  threshold, proposes ordering food to their address as a nudge to call (Tier B — needs the account holder's
  confirmation, not the recipient's).
- Interactive re-solve path: a small router handling free-text requests like "not cooking tonight" across all
  three servers at once — deliberately the *only* place that happens, and kept small on purpose, since a single
  agent holding all ~48 tools is a documented failure mode (`swiggy-mcp-reference.md` §9 — the model loses track
  of which server it's calling).

**Exit criteria:** all three daemons run concurrently without interfering with each other's scheduler slots or
DB state; the interactive router picks the correct vertical on a handful of hand-tested free-text prompts.

---

## Phase 4 — Frontend: Surface and Demo

Without this phase the project stops at a backend + a Telegram bot — a working model, not a product. It's a
real deliverable, not an afterthought; it's just sequenced last because the *build* needs real accumulated
daemon activity to be worth looking at. **Design is not gated on that** — screens and system-design work in
Claude Design can (and should) happen any time in parallel with Phases 1-3; what's deliberately deferred is
writing the frontend's code against real data, not designing what it looks like.

**Goal:** a real web app — not the Telegram bot repurposed, a superset of it — that makes the daemons' existence
visible and gives Tier-B confirmations a proper home instead of only a chat message.

**Screens (source of truth: the Claude Design mockups once they exist):**
- **Timeline** — a feed of daemon activity: price history accumulating, a spoilage countdown ticking, a booking
  that happened overnight while nobody was watching. This is the actual pitch — "look what already ran," not a
  live click-through.
- **Proposal inbox** — every open Tier-B proposal (a restock cart, a Dead Man's Switch order) with one-tap
  confirm/reject, reading from the same `action_gate`/`proposals` tables the Telegram bot already writes to —
  two surfaces on one source of truth, not two separate systems.
- **Daemon health** — last run, next scheduled run, error state, and which server's token needs re-auth (the
  no-refresh-tokens problem from Phase 0 has to surface here, not just in logs).
- **Settings** — addresses, spend caps, tracked people (for Dead Man's Switch), depletion thresholds (for
  Kitchen Entropy) — the knobs a user actually needs, not a config file only the developer can touch.

**Stack (decide for real once Phase 4 starts, not now):** the backend is already Node/TS reading/writing
Postgres directly — a server-rendered app (Next.js, or something lighter like Express + htmx) that queries the
same DB avoids inventing a second API layer just to feed a SPA. Revisit this once the Claude Design mockups
exist and it's clear how interactive the screens actually need to be.

**Exit criteria:** the demo is "here's what's already been running," not a live click-through — the whole pitch
depends on this distinction (review doc §7). The proposal inbox and the Telegram bot both correctly reflect the
same underlying state (confirm in one, it disappears from the other).

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
