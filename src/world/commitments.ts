import { pool } from "../db/pool.js";

export interface Commitment {
  id: number;
  label: string;
  dayOfWeek: number;
  timeOfDay: string; // "19:30:00"
  partySize: number;
  cuisineQuery: string | null;
  addressId: string;
  restaurantId: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
}

function mapRow(row: any): Commitment {
  return {
    id: row.id,
    label: row.label,
    dayOfWeek: row.day_of_week,
    timeOfDay: row.time_of_day,
    partySize: row.party_size,
    cuisineQuery: row.cuisine_query,
    addressId: row.address_id,
    restaurantId: row.restaurant_id,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    active: row.active,
  };
}

export async function createCommitment(input: {
  label: string;
  dayOfWeek: number;
  timeOfDay: string;
  partySize?: number;
  cuisineQuery?: string;
  addressId: string;
  restaurantId?: string;
  latitude: number;
  longitude: number;
}): Promise<Commitment> {
  const { rows } = await pool.query(
    `INSERT INTO commitments (label, day_of_week, time_of_day, party_size, cuisine_query, address_id, restaurant_id, latitude, longitude)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      input.label,
      input.dayOfWeek,
      input.timeOfDay,
      input.partySize ?? 2,
      input.cuisineQuery ?? null,
      input.addressId,
      input.restaurantId ?? null,
      input.latitude,
      input.longitude,
    ],
  );
  return mapRow(rows[0]);
}

/**
 * Commitments whose day-of-week matches today and whose time falls within the next
 * `withinHours` hours. This is intentionally the *only* trigger condition for Phase 1 --
 * no lead-time tuning, no "already booked this week" de-dup beyond the action gate's
 * idempotency key (which naturally handles same-day re-runs).
 */
export async function dueSoon(withinHours: number, now: Date = new Date()): Promise<Commitment[]> {
  const dayOfWeek = now.getUTCDay();
  const nowTime = now.toISOString().substring(11, 19); // "HH:MM:SS"
  const laterTime = new Date(now.getTime() + withinHours * 3600_000).toISOString().substring(11, 19);

  const { rows } = await pool.query(
    `SELECT * FROM commitments
     WHERE active = true AND day_of_week = $1 AND time_of_day BETWEEN $2 AND $3`,
    [dayOfWeek, nowTime, laterTime],
  );
  return rows.map(mapRow);
}
