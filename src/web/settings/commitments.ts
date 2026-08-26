import { layout, esc } from "../layout.js";
import { fetchAllAddresses } from "./addresses.js";
import { searchDineoutRestaurants } from "./dineout-search.js";
import { createCommitment } from "../../world/commitments.js";
import { pool } from "../../db/pool.js";
import { settingsTabs } from "./tabs.js";
import { emptyStateIcon } from "../icons.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function renderCommitmentsPage(justCreated: boolean): Promise<string> {
  const [addresses, existingRows] = await Promise.all([
    fetchAllAddresses(),
    pool.query(`SELECT id, label, day_of_week, time_of_day, restaurant_id FROM commitments ORDER BY created_at DESC`),
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
            `<div class="restaurant-option"><div><div class="name">${esc(r.label)}</div><div class="meta">Every ${DAY_NAMES[r.day_of_week]} at ${String(r.time_of_day).slice(0, 5)} &middot; restaurant ${esc(r.restaurant_id ?? "?")}</div></div></div>`,
        )
        .join("\n")
    : `<div class="empty-state">${emptyStateIcon("clock")}<p>No standing plans yet.</p></div>`;

  const dayOptions = DAY_NAMES.map((d, i) => `<option value="${i}">${d}</option>`).join("");

  const body = `
    <div class="page-header"><h2>Settings</h2></div>
    ${settingsTabs("commitments")}
    ${justCreated ? '<div class="success-banner">Standing plan saved -- Standing Plans will book it automatically when free.</div>' : ""}

    <div class="card">
      <p class="card-title">Add a standing plan</p>
      <p class="card-desc">A recurring commitment -- Standing Plans books it autonomously when a free slot matches, no tap needed.</p>
      <form method="get" action="/settings/commitments/search">
        <div class="form-field">
          <label>What is it?</label>
          <input type="text" name="label" placeholder="e.g. Friday dinner with Vibhuti" required>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>Day of week</label>
            <select name="dayOfWeek">${dayOptions}</select>
          </div>
          <div class="form-field">
            <label>Time</label>
            <input type="time" name="timeOfDay" value="19:30" required>
          </div>
          <div class="form-field">
            <label>Party size</label>
            <input type="number" name="partySize" value="2" min="1" required>
          </div>
        </div>
        <div class="form-field">
          <label>Delivery/dining address</label>
          ${addressOptions || '<p class="empty-state">No saved addresses found.</p>'}
        </div>
        <div class="form-field">
          <label>Search for a restaurant</label>
          <input type="text" name="query" placeholder="e.g. Italian, biryani, a specific name" required>
        </div>
        <button class="btn btn-primary" type="submit">Search restaurants</button>
      </form>
    </div>

    <div class="page-header" style="margin-top:32px"><h2 style="font-size:18px">Standing plans</h2></div>
    ${existingList}
  `;

  return layout("settings", "Settings", body);
}

export async function renderCommitmentsSearchResults(q: Record<string, string>): Promise<string> {
  const { restaurants, latitude, longitude } = await searchDineoutRestaurants({ addressId: q.addressId }, q.query);

  const results = restaurants.length
    ? restaurants
        .slice(0, 10)
        .map((r) => {
          const hidden = Object.entries({ ...q, restaurantId: r.id, latitude: latitude ?? "", longitude: longitude ?? "" })
            .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(String(v))}">`)
            .join("");
          return `<form method="post" action="/settings/commitments/create" class="restaurant-option">
            <div><div class="name">${esc(r.name)}</div><div class="meta">ID ${esc(r.id)}</div></div>
            ${hidden}
            <button class="btn btn-secondary" type="submit">Use this</button>
          </form>`;
        })
        .join("\n")
    : `<div class="empty-state">${emptyStateIcon("bell")}<p>No Dineout-bookable restaurants found for "${esc(q.query)}" -- try a different search.</p></div>`;

  const body = `
    <div class="page-header"><h2>Pick a restaurant</h2></div>
    ${latitude === null ? '<div class="empty-state">Could not resolve coordinates for this search -- try again.</div>' : ""}
    ${results}
    <p style="margin-top:16px"><a href="/settings/commitments">&larr; back</a></p>
  `;

  return layout("settings", "Settings", body);
}

export async function createCommitmentFromForm(body: Record<string, string>): Promise<void> {
  await createCommitment({
    label: body.label,
    dayOfWeek: Number(body.dayOfWeek),
    timeOfDay: body.timeOfDay,
    partySize: Number(body.partySize),
    addressId: body.addressId,
    restaurantId: body.restaurantId,
    latitude: Number(body.latitude),
    longitude: Number(body.longitude),
  });
}
