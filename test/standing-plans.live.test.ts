import { test } from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";
import { findSlot } from "../src/daemons/standing-plans.js";
import { propose } from "../src/actions/gate.js";
import { createCommitment } from "../src/world/commitments.js";
import { pool } from "../src/db/pool.js";

// Live-credential test: needs a real Dineout OAuth token (npm run auth -- dineout).
// Skipped automatically if none is stored, so `npm test` still passes for anyone who
// hasn't authenticated Dineout yet -- this isn't optional-by-laziness, it's the only way
// this suite can run in CI or a fresh clone without a browser+OTP step.
async function hasDineoutToken(): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM oauth_tokens WHERE server = 'dineout'`);
  return rows.length > 0;
}

test("findSlot returns a real free deal for a restaurant/date known to have dinner availability", async (t) => {
  if (!(await hasDineoutToken())) {
    t.skip("no Dineout OAuth token stored -- run `npm run auth -- dineout` first");
    return;
  }

  // A Diner - Four Points by Sheraton, Vashi -- confirmed live on 2026-08-25 to have
  // free (isFree, bookingPrice=0) dinner slots on 2026-08-27. If this restaurant stops
  // offering that deal, this test will need a new fixture restaurant/date -- that's
  // expected, not a code regression.
  const commitment = await createCommitment({
    label: "Live verification dinner",
    dayOfWeek: 4, // 2026-08-27 is a Thursday
    timeOfDay: "19:30",
    restaurantId: "1392960",
    addressId: "8258911",
    latitude: 19.098639,
    longitude: 73.00371,
  });

  const chosen = await findSlot(commitment, "2026-08-27");
  assert.ok(chosen, "expected a matching free slot on a date known to have dinner availability");
  assert.equal(chosen!.deal.isFree, true);
  assert.equal(chosen!.deal.bookingPrice, 0);
  assert.equal(chosen!.slot.dateStr, "2026-08-27");

  const proposal = await propose({
    idempotencyKey: `live-test:${commitment.id}:${Date.now()}`,
    daemon: "standing_plans",
    server: "dineout",
    tier: "A",
    summary: "live verification proposal",
    toolName: "book_table",
    args: {
      restaurantId: commitment.restaurantId,
      slotId: chosen!.deal.slotId,
      itemId: chosen!.deal.itemId,
      reservationTime: Number(chosen!.slot.reservationTime),
      guestCount: commitment.partySize,
      latitude: commitment.latitude,
      longitude: commitment.longitude,
    },
    dryRun: true, // never books a real table from an automated test run
  });

  assert.equal(proposal.status, "executed");
});
