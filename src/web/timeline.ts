import { pool } from "../db/pool.js";
import { DAEMONS } from "./daemons.js";
import { layout, esc } from "./layout.js";
import { relativeTime } from "./format.js";

const DAEMON_NAMES = new Map(DAEMONS.map((d) => [d.key, d.name]));

function dotClass(status: string): string {
  if (status === "executed") return "tier-a";
  if (status === "pending" || status === "snoozed") return "tier-b";
  return "neutral";
}

function statusLabel(status: string): string {
  switch (status) {
    case "executed":
      return "confirmed automatically";
    case "pending":
      return "awaiting your tap";
    case "snoozed":
      return "snoozed";
    case "failed":
      return "failed";
    default:
      return status;
  }
}

export async function renderTimeline(): Promise<string> {
  const { rows } = await pool.query(
    `SELECT id, daemon, summary, status, created_at, resolved_at FROM proposals ORDER BY created_at DESC LIMIT 25`,
  );

  const items = rows.length
    ? rows
        .map((row, i) => {
          const when = row.resolved_at ? new Date(row.resolved_at) : new Date(row.created_at);
          const daemonName = DAEMON_NAMES.get(row.daemon) ?? row.daemon;
          const divider = i < rows.length - 1 ? '<div class="divider"></div>' : "";
          return `<div class="timeline-item">
            <span class="status-pill"><span class="dot ${dotClass(row.status)}"></span>${relativeTime(when)}</span>
            <p class="timeline-title">${esc(daemonName)}</p>
            <p class="timeline-detail">${esc(row.summary)} &middot; ${statusLabel(row.status)}</p>
          </div>${divider}`;
        })
        .join("\n")
    : `<div class="empty-state">Nothing yet -- run a daemon to see activity here.</div>`;

  const body = `
    <div class="page-header">
      <div>
        <h2>Timeline</h2>
        <p class="description">Everything the daemons have done or are waiting on.</p>
      </div>
    </div>
    ${items}
  `;

  return layout("timeline", "Timeline", body);
}
