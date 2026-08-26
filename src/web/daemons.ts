import { pool } from "../db/pool.js";

export interface DaemonMeta {
  key: string;
  name: string;
  tier: "A" | "B";
  description: string;
  vertical: string;
  icon: string;
}

// Static metadata matching the Claude Design mockup's Dashboard cards -- the three
// daemons built across Phases 1-3.
export const DAEMONS: DaemonMeta[] = [
  {
    key: "standing_plans",
    name: "Standing Plans",
    tier: "A",
    description: "Books recurring free reservations unattended.",
    vertical: "Dineout",
    icon: "🕐",
  },
  {
    key: "kitchen_entropy",
    name: "Kitchen Entropy",
    tier: "B",
    description: "Tracks pantry depletion, proposes a restock cart.",
    vertical: "Instamart",
    icon: "📦",
  },
  {
    key: "dead_mans_switch",
    name: "Dead Man's Switch",
    tier: "B",
    description: "Orders to another address when activity goes quiet.",
    vertical: "Food",
    icon: "🔔",
  },
];

export interface DaemonStatus {
  meta: DaemonMeta;
  lastRun: { status: string; startedAt: Date; detail: string | null } | null;
  pendingProposal: { id: number; summary: string; amountPaise: number | null } | null;
}

export async function loadDaemonStatuses(): Promise<DaemonStatus[]> {
  const statuses: DaemonStatus[] = [];
  for (const meta of DAEMONS) {
    const { rows: runRows } = await pool.query(
      `SELECT status, started_at, detail FROM daemon_runs WHERE daemon = $1 ORDER BY started_at DESC LIMIT 1`,
      [meta.key],
    );
    const { rows: proposalRows } = await pool.query(
      `SELECT id, summary, amount_paise FROM proposals
       WHERE daemon = $1 AND status IN ('pending', 'snoozed') ORDER BY created_at DESC LIMIT 1`,
      [meta.key],
    );
    statuses.push({
      meta,
      lastRun: runRows[0]
        ? { status: runRows[0].status, startedAt: new Date(runRows[0].started_at), detail: runRows[0].detail }
        : null,
      pendingProposal: proposalRows[0]
        ? { id: proposalRows[0].id, summary: proposalRows[0].summary, amountPaise: proposalRows[0].amount_paise }
        : null,
    });
  }
  return statuses;
}
