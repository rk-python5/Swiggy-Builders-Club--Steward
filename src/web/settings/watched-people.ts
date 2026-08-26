import { layout, esc } from "../layout.js";
import { fetchAllAddresses } from "./addresses.js";
import { createWatchedPerson } from "../../world/watched-people.js";
import { pool } from "../../db/pool.js";
import { settingsTabs } from "./tabs.js";

export async function renderWatchedPeoplePage(justCreated: boolean): Promise<string> {
  const [addresses, existingRows] = await Promise.all([
    fetchAllAddresses(),
    pool.query(`SELECT id, name, quiet_threshold_hours, active FROM watched_people ORDER BY created_at DESC`),
  ]);

  const addressOptions = addresses
    .map(
      (a) => `<label class="address-option">
        <input type="radio" name="addressId" value="${esc(a.id)}" required>
        <span class="address-tag">${esc(a.addressTag || a.addressCategory)}</span>
        <div class="address-line">${esc(a.addressLine)}</div>
      </label>`,
    )
    .join("\n");

  const existingList = existingRows.rows.length
    ? existingRows.rows
        .map(
          (r) =>
            `<div class="restaurant-option"><div><div class="name">${esc(r.name)}</div><div class="meta">quiet after ${r.quiet_threshold_hours}h ${r.active ? "" : "(inactive)"}</div></div></div>`,
        )
        .join("\n")
    : `<div class="empty-state">No one being watched yet.</div>`;

  const body = `
    <div class="page-header"><h2>Settings</h2></div>
    ${settingsTabs("watched-people")}
    ${justCreated ? '<div class="success-banner">Added -- Dead Man\'s Switch will now watch them.</div>' : ""}

    <div class="card">
      <p class="card-title">Watch someone</p>
      <p class="card-desc">Pick from your saved addresses -- Swiggy already lets one account hold multiple people's addresses (Maa, Work, Friends &amp; Family), so there's no separate contacts list to build.</p>
      <form method="post" action="/settings/watched-people">
        <div class="form-field">
          <label>Name</label>
          <input type="text" name="name" placeholder="e.g. Maa" required>
        </div>
        <div class="form-field">
          <label>Which saved address?</label>
          ${addressOptions || '<p class="empty-state">No saved addresses found.</p>'}
        </div>
        <div class="form-field">
          <label>Nudge me after this many hours of silence</label>
          <input type="number" name="quietThresholdHours" value="48" min="1" required>
        </div>
        <button class="btn btn-primary" type="submit">Start watching</button>
      </form>
    </div>

    <div class="page-header" style="margin-top:32px"><h2 style="font-size:18px">Currently watching</h2></div>
    ${existingList}
  `;

  return layout("settings", "Settings", body);
}

export async function createWatchedPersonFromForm(body: Record<string, string>): Promise<void> {
  await createWatchedPerson({
    name: body.name,
    addressId: body.addressId,
    quietThresholdHours: Number(body.quietThresholdHours),
  });
}
