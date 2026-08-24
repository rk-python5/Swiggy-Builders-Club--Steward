import { dueSoon, type Commitment } from "../world/commitments.js";
import { propose } from "../actions/gate.js";
import { callTool } from "../mcp/client.js";
import { getNotifier } from "../notify/notify.js";
import { pool } from "../db/pool.js";

const LOOKAHEAD_HOURS = 3;

/**
 * UNVERIFIED against a live call -- there's no Dineout OAuth token yet (Phase 0 only
 * authenticated Food). Shape is the best available guess from swiggy-mcp-reference.md
 * §4.3, itself already caught out on other inaccuracies elsewhere (see CLAUDE.md). Keep
 * dryRun=true (see runStandingPlans's default) until this has been checked against a
 * real tools/list + a real get_available_slots/book_table response, the way Phase 0's
 * Food crawler was checked before trusting it.
 */
interface Slot {
  slotId: string;
  time: string;
  isFree: boolean;
  bookingPrice: number;
}

async function findSlot(commitment: Commitment): Promise<Slot | null> {
  if (!commitment.restaurantId) {
    // Phase 1 doesn't do restaurant discovery for an unpinned commitment yet --
    // every commitment needs restaurant_id set directly for now.
    return null;
  }

  const result = await callTool<{ structuredContent: { slots: Slot[] } }>("dineout", "get_available_slots", {
    restaurantId: commitment.restaurantId,
    addressId: commitment.addressId,
    partySize: commitment.partySize,
    date: new Date().toISOString().substring(0, 10),
  });

  const slots = result.structuredContent.slots ?? [];
  const target = commitment.timeOfDay.substring(0, 5); // "19:30"
  return slots.find((s) => s.time === target) ?? null;
}

async function runOne(commitment: Commitment, dryRun: boolean): Promise<void> {
  const today = new Date().toISOString().substring(0, 10);
  const idempotencyKey = `standing-plans:${commitment.id}:${today}`;

  const slot = await findSlot(commitment);
  if (!slot) {
    console.log(`[standing-plans] no matching slot for commitment ${commitment.id} ("${commitment.label}")`);
    return;
  }
  if (!slot.isFree || slot.bookingPrice > 0) {
    // Tier A is only safe because book_table structurally rejects paid deals. If this
    // slot isn't free, don't even attempt it -- log and let a human deal with it manually
    // rather than silently downgrading to a Tier B proposal (Phase 1 doesn't have Tier B
    // wired for Dineout, and shouldn't guess).
    console.log(`[standing-plans] matching slot for commitment ${commitment.id} isn't free, skipping`);
    return;
  }

  const proposal = await propose({
    idempotencyKey,
    daemon: "standing_plans",
    server: "dineout",
    tier: "A",
    summary: `${commitment.label}: table for ${commitment.partySize} booked automatically`,
    toolName: "book_table",
    args: {
      restaurantId: commitment.restaurantId,
      slotId: slot.slotId,
      addressId: commitment.addressId,
      partySize: commitment.partySize,
    },
    dryRun,
  });

  const notifier = await getNotifier();
  if (proposal.status === "executed") {
    await notifier.notify(`✅ ${proposal.summary}${dryRun ? " (dry run)" : ""}`);
  } else if (proposal.status === "failed") {
    await notifier.notify(`⚠️ Standing Plans failed to book "${commitment.label}": ${proposal.error}`);
  }
}

export async function runStandingPlans(dryRun = true): Promise<void> {
  const { rows } = await pool.query(`INSERT INTO daemon_runs (daemon) VALUES ('standing_plans') RETURNING id`);
  const runId = rows[0].id;

  try {
    const commitments = await dueSoon(LOOKAHEAD_HOURS);
    console.log(`[standing-plans] ${commitments.length} commitment(s) due within ${LOOKAHEAD_HOURS}h`);
    for (const c of commitments) {
      await runOne(c, dryRun);
    }
    await pool.query(
      `UPDATE daemon_runs SET status = 'succeeded', finished_at = now(), detail = $2 WHERE id = $1`,
      [runId, `${commitments.length} commitment(s) checked`],
    );
  } catch (err) {
    await pool.query(`UPDATE daemon_runs SET status = 'failed', finished_at = now(), detail = $2 WHERE id = $1`, [
      runId,
      err instanceof Error ? err.message : String(err),
    ]);
    throw err;
  }
}
