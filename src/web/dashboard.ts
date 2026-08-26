import { loadDaemonStatuses } from "./daemons.js";
import { layout, esc } from "./layout.js";
import { relativeTime, rupees } from "./format.js";

export async function renderDashboard(): Promise<string> {
  const statuses = await loadDaemonStatuses();

  const cards = statuses
    .map(({ meta, lastRun, pendingProposal }) => {
      const tierClass = meta.tier === "A" ? "tier-a" : "tier-b";
      const tierLabel = meta.tier === "A" ? "TIER A &middot; AUTONOMOUS" : "TIER B &middot; CONSENT";

      let statusHtml: string;
      if (meta.tier === "A") {
        statusHtml = lastRun
          ? `<span>last checked ${relativeTime(lastRun.startedAt)}</span><span>No action needed</span>`
          : `<span>not yet run</span><span></span>`;
      } else if (pendingProposal) {
        statusHtml = `<span>PROPOSAL READY &middot; ${rupees(pendingProposal.amountPaise)}</span>
          <form class="inline" method="get" action="/approve"><button class="btn btn-primary" type="submit">Review</button></form>`;
      } else {
        statusHtml = lastRun
          ? `<span>watching &middot; checked ${relativeTime(lastRun.startedAt)}</span><span></span>`
          : `<span>not yet run</span><span></span>`;
      }

      return `<div class="card ${tierClass}">
        <div class="card-top">
          <div>
            <p class="card-title">${meta.icon} ${esc(meta.name)}</p>
            <p class="card-desc">${esc(meta.description)} <span style="color:var(--text-tertiary)">(${esc(meta.vertical)})</span></p>
          </div>
          <span class="pill ${tierClass}">${tierLabel}</span>
        </div>
        <div class="card-status">${statusHtml}</div>
      </div>`;
    })
    .join("\n");

  const body = `
    <div class="page-header">
      <div>
        <h2>Daemons</h2>
      </div>
      <span class="subtitle">Powered by Swiggy</span>
    </div>
    ${cards}
  `;

  return layout("dashboard", "Dashboard", body);
}
