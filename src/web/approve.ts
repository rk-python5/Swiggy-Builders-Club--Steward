import { pool } from "../db/pool.js";
import { DAEMONS } from "./daemons.js";
import { layout, esc } from "./layout.js";
import { rupees } from "./format.js";

const DAEMON_NAMES = new Map(DAEMONS.map((d) => [d.key, d.name]));

export async function renderApprove(): Promise<string> {
  const { rows } = await pool.query(
    `SELECT id, daemon, summary, amount_paise, payload FROM proposals
     WHERE status IN ('pending', 'snoozed') ORDER BY created_at ASC`,
  );

  const cards = rows.length
    ? rows
        .map((row) => {
          const daemonName = DAEMON_NAMES.get(row.daemon) ?? row.daemon;
          const address = row.payload?.args?.addressId ? String(row.payload.args.addressId) : null;
          const paymentMethod = row.payload?.args?.paymentMethod ?? "default payment method";

          return `<div class="card tier-b">
            <div class="card-top">
              <div>
                <p class="card-title">${esc(daemonName)}</p>
                <p class="card-desc">${esc(row.summary)}</p>
              </div>
              <span class="pill tier-b">TIER B &middot; CONSENT</span>
            </div>
            <div style="margin-top:12px; font-size:13px; color:var(--text-secondary);">
              ${address ? `<div><strong>Delivery address:</strong> ${esc(address)}</div>` : ""}
              <div><strong>Payment:</strong> ${esc(String(paymentMethod))}</div>
              ${row.amount_paise !== null ? `<div><strong>Amount:</strong> ${rupees(row.amount_paise)}</div>` : ""}
            </div>
            <div class="card-status" style="border-top:none; padding-top:14px; justify-content:flex-start; gap:10px;">
              <form class="inline" method="post" action="/proposals/${row.id}/approve">
                <button class="btn btn-primary" type="submit">Approve order</button>
              </form>
              <form class="inline" method="post" action="/proposals/${row.id}/snooze">
                <button class="btn btn-secondary" type="submit">Snooze</button>
              </form>
            </div>
          </div>`;
        })
        .join("\n")
    : `<div class="empty-state">Nothing waiting on you right now.</div>`;

  const body = `
    <div class="page-header">
      <div><h2>Approve</h2></div>
    </div>
    ${cards}
  `;

  return layout("approve", "Approve", body);
}
