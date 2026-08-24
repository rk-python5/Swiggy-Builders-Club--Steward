import { pool } from "../db/pool.js";
import { callTool } from "../mcp/client.js";
import type { SwiggyServer } from "../db/tokens.js";

export type Tier = "A" | "B";

export interface ProposeArgs {
  idempotencyKey: string;
  daemon: string;
  server: SwiggyServer;
  tier: Tier;
  summary: string;
  toolName: string;
  args: Record<string, unknown>;
  dryRun?: boolean;
}

export interface ProposalRow {
  id: number;
  idempotency_key: string;
  daemon: string;
  server: SwiggyServer;
  tier: Tier;
  status: "pending" | "approved" | "snoozed" | "executed" | "failed" | "expired";
  summary: string;
  payload: { toolName: string; args: Record<string, unknown> };
  dry_run: boolean;
  result: unknown;
  error: string | null;
}

/**
 * The single mutation path. Every daemon action -- Tier A or B, dry-run or real -- goes
 * through here. If mutation logic leaks into individual daemons, the safety model this
 * whole project rests on stops being true (see PLAN.md Phase 1, Household Daemons
 * Architecture domain 04).
 *
 * Idempotency: idempotencyKey has a unique constraint at the DB level. A retried job with
 * the same key hits the ON CONFLICT branch and returns the existing row untouched --
 * place_food_order (and book_table) are not idempotent themselves, so this has to be.
 *
 * Tier A (autonomous): executes immediately and returns the result.
 * Tier B (consent required): inserts as 'pending' and returns without calling the MCP tool
 * at all -- execution happens later via approveProposal(), triggered by a human tap.
 */
export async function propose(args: ProposeArgs): Promise<ProposalRow> {
  const dryRun = args.dryRun ?? false;

  const { rows } = await pool.query<ProposalRow>(
    `INSERT INTO proposals (idempotency_key, daemon, server, tier, summary, payload, dry_run)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = proposals.idempotency_key
     RETURNING *`,
    [
      args.idempotencyKey,
      args.daemon,
      args.server,
      args.tier,
      args.summary,
      JSON.stringify({ toolName: args.toolName, args: args.args }),
      dryRun,
    ],
  );
  const proposal = rows[0];

  // Already resolved by an earlier attempt with the same key -- don't re-execute.
  if (proposal.status !== "pending") {
    return proposal;
  }

  if (args.tier === "B") {
    // Tier B waits for a human tap (approveProposal). Nothing executes yet.
    return proposal;
  }

  return executeProposal(proposal);
}

/**
 * Called by the Approval flow (Telegram / the Steward UI) when a human taps "Approve
 * order" on a Tier B proposal. Snoozing (see PLAN.md Phase 4) does NOT call this --
 * it just pushes snoozed_until forward and leaves status as 'snoozed'.
 */
export async function approveProposal(id: number): Promise<ProposalRow> {
  const { rows } = await pool.query<ProposalRow>(`SELECT * FROM proposals WHERE id = $1`, [id]);
  const proposal = rows[0];
  if (!proposal) throw new Error(`No proposal with id ${id}`);
  if (proposal.status !== "pending" && proposal.status !== "snoozed") {
    return proposal; // already executed/failed/expired -- no-op, not an error
  }
  return executeProposal(proposal);
}

export async function snoozeProposal(id: number, until: Date): Promise<void> {
  await pool.query(
    `UPDATE proposals SET status = 'snoozed', snoozed_until = $2 WHERE id = $1 AND status IN ('pending','snoozed')`,
    [id, until],
  );
}

async function executeProposal(proposal: ProposalRow): Promise<ProposalRow> {
  if (proposal.dry_run) {
    const { rows } = await pool.query<ProposalRow>(
      `UPDATE proposals SET status = 'executed', result = $2, resolved_at = now() WHERE id = $1 RETURNING *`,
      [proposal.id, JSON.stringify({ dryRun: true, note: "no MCP call made" })],
    );
    return rows[0];
  }

  try {
    const result = await callTool(proposal.server, proposal.payload.toolName, proposal.payload.args);
    const { rows } = await pool.query<ProposalRow>(
      `UPDATE proposals SET status = 'executed', result = $2, resolved_at = now() WHERE id = $1 RETURNING *`,
      [proposal.id, JSON.stringify(result)],
    );
    return rows[0];
  } catch (err) {
    const { rows } = await pool.query<ProposalRow>(
      `UPDATE proposals SET status = 'failed', error = $2, resolved_at = now() WHERE id = $1 RETURNING *`,
      [proposal.id, err instanceof Error ? err.message : String(err)],
    );
    return rows[0];
  }
}
