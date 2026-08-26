import { loadDaemonStatuses, type DaemonStatus } from "./daemons.js";
import { layout, esc } from "./layout.js";
import { relativeTime, rupees } from "./format.js";
import { icon } from "./icons.js";

function statusRow(status: DaemonStatus): string {
  const { meta, lastRun, pendingProposal } = status;
  const tierClass = meta.tier === "A" ? "tier-a" : "tier-b";

  if (pendingProposal) {
    return `<div class="status-row">
      <span class="status-pill"><span class="dot ${tierClass}"></span>${esc(pendingProposal.summary)}</span>
      <a href="#review-${meta.key}" class="btn btn-primary">Review</a>
    </div>`;
  }
  if (meta.tier === "A") {
    const label = lastRun ? `last checked ${relativeTime(lastRun.startedAt)}` : "not yet run";
    return `<div class="status-row">
      <span class="status-pill"><span class="dot ${tierClass}"></span>${esc(label)}</span>
      <span class="no-action">No action needed</span>
    </div>`;
  }
  const label = lastRun ? `watching &middot; checked ${relativeTime(lastRun.startedAt)}` : "not yet run";
  return `<div class="status-row">
    <span class="status-pill"><span class="dot neutral"></span>${label}</span>
  </div>`;
}

function modalFor(status: DaemonStatus): string {
  const { meta, pendingProposal } = status;
  if (!pendingProposal) return "";

  const args = pendingProposal.payload?.args ?? {};
  const address = args.addressId ? String(args.addressId) : null;
  const paymentMethod = args.paymentMethod ? String(args.paymentMethod) : "default payment method";

  // Matches the mockup's ApprovalModal structure: icon tile + Tier B badge, name,
  // status line, delivery address, payment, then Approve order / Snooze. A server-
  // rendered form can't replicate the mockup's in-place "Order placed" swap without
  // client-side JS -- approving/snoozing here submits and returns to the dashboard,
  // where the card's own status reflects the new state instead.
  return `<div class="modal-overlay" id="review-${meta.key}">
    <div class="modal-card">
      <div class="card">
        <div class="card-top">
          <div class="icon-tile spine">${icon(meta.icon, "var(--white)")}</div>
          <span class="pill tier-b">Tier B &middot; Consent</span>
        </div>
        <p class="modal-title">${esc(meta.name)}</p>
        <p class="card-desc">${esc(pendingProposal.summary)}</p>
        <div class="divider"></div>
        ${address ? `<div class="modal-label">Delivery address</div><div class="modal-value">Your order will be delivered to: ${esc(address)}.</div>` : ""}
        <div class="modal-label">Payment</div>
        <div class="modal-value">${esc(paymentMethod)}${pendingProposal.amountPaise !== null ? ` &middot; ${rupees(pendingProposal.amountPaise)}` : ""}</div>
        <div class="modal-actions">
          <form method="post" action="/proposals/${pendingProposal.id}/approve"><button class="btn btn-primary" type="submit">Approve order</button></form>
          <form method="post" action="/proposals/${pendingProposal.id}/snooze"><button class="btn btn-secondary" type="submit">Snooze</button></form>
          <a href="#" class="btn btn-ghost">Close</a>
        </div>
      </div>
    </div>
  </div>`;
}

export async function renderDashboard(): Promise<string> {
  const statuses = await loadDaemonStatuses();

  const cards = statuses
    .map((s) => {
      const tierClass = s.meta.tier === "A" ? "tier-a" : "tier-b";
      const tierLabel = s.meta.tier === "A" ? "Tier A &middot; Autonomous" : "Tier B &middot; Consent";
      return `<div class="card ${tierClass}">
        <div class="card-body">
          <div class="icon-tile ${tierClass}">${icon(s.meta.icon, s.meta.tier === "A" ? "var(--green-600)" : "var(--amber-600)")}</div>
          <div style="flex:1">
            <div class="card-top">
              <p class="card-title">${esc(s.meta.name)}</p>
              <span class="pill ${tierClass}">${tierLabel}</span>
            </div>
            <p class="card-desc">${esc(s.meta.description)} <span class="muted">(${esc(s.meta.vertical)})</span></p>
            <div class="divider"></div>
            ${statusRow(s)}
          </div>
        </div>
      </div>`;
    })
    .join("\n");

  const modals = statuses.map(modalFor).join("\n");

  const pendingCount = statuses.filter((s) => s.pendingProposal).length;
  const watchingCount = statuses.length - pendingCount;
  const summary =
    pendingCount > 0
      ? `${watchingCount} watching &middot; <strong>${pendingCount} need${pendingCount === 1 ? "s" : ""} your review</strong>`
      : `${watchingCount} watching &middot; nothing needs you right now`;

  const body = `
    <div class="page-header">
      <h2>Daemons</h2>
      <span class="subtitle">Powered by Swiggy</span>
    </div>
    <p class="status-summary">${summary}</p>
    ${cards}
    ${modals}
  `;

  return layout("dashboard", "Dashboard", body);
}
