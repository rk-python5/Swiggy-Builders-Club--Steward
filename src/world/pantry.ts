import { pool } from "../db/pool.js";
import type { Clock } from "../sim/clock.js";

export interface PantryItem {
  id: number;
  itemName: string;
  quantity: number;
  unit: string;
  shelfLifeDays: number;
  purchasedAt: Date;
  sourceOrderId: string | null;
}

function mapRow(row: any): PantryItem {
  return {
    id: row.id,
    itemName: row.item_name,
    quantity: Number(row.quantity),
    unit: row.unit,
    shelfLifeDays: Number(row.shelf_life_days),
    purchasedAt: new Date(row.purchased_at),
    sourceOrderId: row.source_order_id,
  };
}

export async function recordPurchase(input: {
  itemName: string;
  quantity: number;
  unit: string;
  shelfLifeDays: number;
  sourceOrderId?: string;
  purchasedAt?: Date;
}): Promise<PantryItem> {
  const { rows } = await pool.query(
    `INSERT INTO pantry_items (item_name, quantity, unit, shelf_life_days, source_order_id, purchased_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, now())) RETURNING *`,
    [
      input.itemName,
      input.quantity,
      input.unit,
      input.shelfLifeDays,
      input.sourceOrderId ?? null,
      input.purchasedAt ?? null,
    ],
  );
  return mapRow(rows[0]);
}

/**
 * Belief, not fact: a half-life exponential decay of "confidence this item is still
 * around" since the last purchase -- confidence(shelf_life_days elapsed) = 0.5, decaying
 * smoothly rather than a hard cliff. Deliberately not a running countdown quantity: a
 * stored snapshot would silently go stale the instant time moves past when it was
 * written. Heuristic now, per DECISIONS.md's ML stance -- a trained per-item survival
 * model is legitimate future scope once real purchase-interval data exists to fit one.
 */
export function confidenceRemaining(item: Pick<PantryItem, "purchasedAt" | "shelfLifeDays">, now: Date): number {
  const daysElapsed = (now.getTime() - item.purchasedAt.getTime()) / 86_400_000;
  if (daysElapsed <= 0) return 1;
  return Math.pow(0.5, daysElapsed / item.shelfLifeDays);
}

/** Most recent purchase of a given item, or null if we've never seen one. */
export async function latestPurchase(itemName: string): Promise<PantryItem | null> {
  const { rows } = await pool.query(
    `SELECT * FROM pantry_items WHERE item_name = $1 ORDER BY purchased_at DESC LIMIT 1`,
    [itemName],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export interface DepletionStatus {
  itemName: string;
  confidence: number;
  daysSincePurchase: number;
  lastPurchase: PantryItem;
}

/**
 * Confidence for every tracked item, using `clock` so callers (and tests) control "now"
 * explicitly -- see src/sim/clock.ts, built in Phase 0 specifically for this kind of
 * "advance simulated time without waiting real days" case.
 */
export async function allDepletionStatuses(clock: Clock): Promise<DepletionStatus[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (item_name) * FROM pantry_items ORDER BY item_name, purchased_at DESC`,
  );
  const now = clock.now();
  return rows.map((row) => {
    const item = mapRow(row);
    return {
      itemName: item.itemName,
      confidence: confidenceRemaining(item, now),
      daysSincePurchase: (now.getTime() - item.purchasedAt.getTime()) / 86_400_000,
      lastPurchase: item,
    };
  });
}
