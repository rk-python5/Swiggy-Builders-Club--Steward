import { layout, esc } from "../layout.js";
import { recordPurchase } from "../../world/pantry.js";
import { pool } from "../../db/pool.js";
import { settingsTabs } from "./tabs.js";

export async function renderPantryPage(justCreated: boolean): Promise<string> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (item_name) item_name, quantity, unit, shelf_life_days, purchased_at
     FROM pantry_items ORDER BY item_name, purchased_at DESC`,
  );

  const existingList = rows.length
    ? rows
        .map(
          (r) =>
            `<div class="restaurant-option"><div><div class="name">${esc(r.item_name)}</div><div class="meta">${r.quantity} ${esc(r.unit)} &middot; ${r.shelf_life_days}-day shelf life &middot; last bought ${new Date(r.purchased_at).toLocaleDateString()}</div></div></div>`,
        )
        .join("\n")
    : `<div class="empty-state">Nothing tracked yet.</div>`;

  const body = `
    <div class="page-header"><h2>Settings</h2></div>
    ${settingsTabs("pantry")}
    ${justCreated ? '<div class="success-banner">Recorded -- Kitchen Entropy will track its depletion.</div>' : ""}

    <div class="card">
      <p class="card-title">Track a pantry item</p>
      <p class="card-desc">Record what you bought and how long it typically lasts. Kitchen Entropy proposes a restock once its confidence drops low.</p>
      <form method="post" action="/settings/pantry">
        <div class="form-field">
          <label>Item</label>
          <input type="text" name="itemName" placeholder="e.g. milk" required>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>Quantity</label>
            <input type="number" name="quantity" step="0.1" value="1" required>
          </div>
          <div class="form-field">
            <label>Unit</label>
            <input type="text" name="unit" placeholder="e.g. L, dozen, kg" required>
          </div>
          <div class="form-field">
            <label>Typically lasts (days)</label>
            <input type="number" name="shelfLifeDays" value="7" min="1" required>
          </div>
        </div>
        <button class="btn btn-primary" type="submit">Save</button>
      </form>
    </div>

    <div class="page-header" style="margin-top:32px"><h2 style="font-size:18px">Tracked items</h2></div>
    ${existingList}
  `;

  return layout("settings", "Settings", body);
}

export async function recordPurchaseFromForm(body: Record<string, string>): Promise<void> {
  await recordPurchase({
    itemName: body.itemName,
    quantity: Number(body.quantity),
    unit: body.unit,
    shelfLifeDays: Number(body.shelfLifeDays),
  });
}
