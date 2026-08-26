import { pool } from "../db/pool.js";

export interface WatchedPerson {
  id: number;
  name: string;
  addressId: string;
  quietThresholdHours: number;
  lastContactAt: Date;
  active: boolean;
}

function mapRow(row: any): WatchedPerson {
  return {
    id: row.id,
    name: row.name,
    addressId: row.address_id,
    quietThresholdHours: Number(row.quiet_threshold_hours),
    lastContactAt: new Date(row.last_contact_at),
    active: row.active,
  };
}

export async function createWatchedPerson(input: {
  name: string;
  addressId: string;
  quietThresholdHours?: number;
}): Promise<WatchedPerson> {
  const { rows } = await pool.query(
    `INSERT INTO watched_people (name, address_id, quiet_threshold_hours) VALUES ($1, $2, $3) RETURNING *`,
    [input.name, input.addressId, input.quietThresholdHours ?? 48],
  );
  return mapRow(rows[0]);
}

/** Resets the clock -- a call, a message, an order placed for them all count as contact. */
export async function checkIn(id: number): Promise<void> {
  await pool.query(`UPDATE watched_people SET last_contact_at = now() WHERE id = $1`, [id]);
}

export interface QuietStatus {
  person: WatchedPerson;
  hoursSinceContact: number;
  isQuiet: boolean;
}

export async function allQuietStatuses(now: Date = new Date()): Promise<QuietStatus[]> {
  const { rows } = await pool.query(`SELECT * FROM watched_people WHERE active = true`);
  return rows.map((row) => {
    const person = mapRow(row);
    const hoursSinceContact = (now.getTime() - person.lastContactAt.getTime()) / 3_600_000;
    return { person, hoursSinceContact, isQuiet: hoursSinceContact >= person.quietThresholdHours };
  });
}
