import { dueSoon, type Commitment } from "../world/commitments.js";
import { propose } from "../actions/gate.js";
import { callTool } from "../mcp/client.js";
import { getNotifier } from "../notify/notify.js";
import { pool } from "../db/pool.js";

const LOOKAHEAD_HOURS = 3;

/**
 * Verified live against real Dineout tool schemas (tools/list + real calls) on
 * 2026-08-25 -- this is NOT the shape guessed from swiggy-mcp-reference.md, which turned
 * out wrong on several points: get_available_slots takes {restaurantId, date, latitude,
 * longitude} (no addressId, no partySize); slot data lives under `_meta.slots`, not
 * `structuredContent` (a third distinct envelope shape, alongside structuredContent.<key>
 * and structuredContent.data.<key> seen elsewhere -- there is no universal envelope).
 * See DECISIONS.md for the full verification trail.
 */
interface Deal {
  itemId: string;
  slotId: number;
  isFree: boolean;
  bookingPrice: number;
}

interface AvailableSlot {
  displayTime: string; // "05:00 PM"
  dateStr: string; // "2026-08-27"
  reservationTime: string; // unix seconds, as a string
  deals: Deal[];
}

interface GetAvailableSlotsResult {
  _meta?: { slots: AvailableSlot[] };
}

function displayTimeToMinutes(displayTime: string): number {
  const [time, meridiem] = displayTime.split(" ");
  const [hRaw, m] = time.split(":").map(Number);
  let h = hRaw % 12;
  if (meridiem === "PM") h += 12;
  return h * 60 + m;
}

function timeOfDayToMinutes(timeOfDay: string): number {
  const [h, m] = timeOfDay.split(":").map(Number);
  return h * 60 + m;
}

interface Chosen {
  slot: AvailableSlot;
  deal: Deal;
}

export async function findSlot(commitment: Commitment, targetDate: string): Promise<Chosen | null> {
  if (!commitment.restaurantId || commitment.latitude === null || commitment.longitude === null) {
    return null;
  }

  const result = await callTool<GetAvailableSlotsResult>("dineout", "get_available_slots", {
    restaurantId: commitment.restaurantId,
    date: targetDate,
    latitude: commitment.latitude,
    longitude: commitment.longitude,
  });

  const slots = result._meta?.slots ?? [];
  const sameDay = slots.filter((s) => s.dateStr === targetDate);
  if (sameDay.length === 0) return null;

  const targetMinutes = timeOfDayToMinutes(commitment.timeOfDay);
  let best: AvailableSlot | null = null;
  let bestDiff = Infinity;
  for (const s of sameDay) {
    const diff = Math.abs(displayTimeToMinutes(s.displayTime) - targetMinutes);
    if (diff < bestDiff) {
      best = s;
      bestDiff = diff;
    }
  }
  if (!best) return null;

  // Tier A is only safe because free reservations are all book_table structurally
  // allows -- a paid deal must never be picked here, not even the closest-matching one.
  const freeDeal = best.deals.find((d) => d.isFree && d.bookingPrice === 0);
  if (!freeDeal) return null;

  return { slot: best, deal: freeDeal };
}

async function runOne(commitment: Commitment, dryRun: boolean): Promise<void> {
  const targetDate = new Date().toISOString().substring(0, 10);
  const idempotencyKey = `standing-plans:${commitment.id}:${targetDate}`;

  const chosen = await findSlot(commitment, targetDate);
  if (!chosen) {
    console.log(`[standing-plans] no bookable free slot for commitment ${commitment.id} ("${commitment.label}")`);
    return;
  }

  const proposal = await propose({
    idempotencyKey,
    daemon: "standing_plans",
    server: "dineout",
    tier: "A",
    summary: `${commitment.label}: table for ${commitment.partySize} booked automatically (${chosen.slot.displayTime})`,
    toolName: "book_table",
    args: {
      restaurantId: commitment.restaurantId,
      slotId: chosen.deal.slotId,
      itemId: chosen.deal.itemId,
      reservationTime: Number(chosen.slot.reservationTime),
      guestCount: commitment.partySize,
      latitude: commitment.latitude,
      longitude: commitment.longitude,
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
