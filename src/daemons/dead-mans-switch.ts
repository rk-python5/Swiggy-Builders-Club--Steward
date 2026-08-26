import { allQuietStatuses, type WatchedPerson } from "../world/watched-people.js";
import { propose } from "../actions/gate.js";
import { callTool } from "../mcp/client.js";
import { getNotifier } from "../notify/notify.js";
import { pool } from "../db/pool.js";

const MAX_ITEM_PRICE_RUPEES = 300; // a small check-in gesture, not a full grocery run

/**
 * Design correction from PLAN.md's original framing: there is no tool that reads a
 * different account's order history, so "watches their ordering activity" as originally
 * imagined isn't buildable -- see src/world/watched-people.ts and DECISIONS.md. This
 * daemon watches OUR OWN last-contact record instead.
 *
 * search_restaurants/get_restaurant_menu are verified live from Phase 0. update_food_cart/
 * get_food_cart are NOT -- Phase 0 never actually called them, only crawled read-only menu
 * data. Don't assume; check before trusting cart.structuredContent's shape here.
 */
interface MenuItem {
  id: string;
  name: string;
  price: number;
  inStock: number;
}
interface MenuCategory {
  items?: MenuItem[];
  subcategories?: MenuCategory[];
}
interface MenuResult {
  structuredContent: { restaurant: { id: string; name: string }; categories: MenuCategory[] };
}
interface SearchResult {
  structuredContent: { restaurants: { id: string; name: string }[] };
}
interface CartResult {
  structuredContent: { data?: { pricing?: { to_pay?: number } } };
}

function flattenItems(category: MenuCategory): MenuItem[] {
  if (category.items) return category.items;
  if (category.subcategories) return category.subcategories.flatMap(flattenItems);
  return [];
}

async function pickModestItem(person: WatchedPerson): Promise<{ restaurantId: string; item: MenuItem } | null> {
  const search = await callTool<SearchResult>("food", "search_restaurants", {
    addressId: person.addressId,
    query: "food",
  });
  const restaurant = search.structuredContent.restaurants?.[0];
  if (!restaurant) return null;

  const menu = await callTool<MenuResult>("food", "get_restaurant_menu", {
    restaurantId: restaurant.id,
    addressId: person.addressId,
    page: 1,
    pageSize: 8,
  });

  const items = menu.structuredContent.categories.flatMap(flattenItems);
  const affordable = items
    .filter((i) => i.inStock === 1 && i.price > 0 && i.price <= MAX_ITEM_PRICE_RUPEES)
    .sort((a, b) => a.price - b.price);

  return affordable[0] ? { restaurantId: restaurant.id, item: affordable[0] } : null;
}

async function runOne(status: { person: WatchedPerson; hoursSinceContact: number }, dryRun: boolean): Promise<void> {
  const { person, hoursSinceContact } = status;
  const idempotencyKey = `dead-mans-switch:${person.id}:${person.lastContactAt.toISOString()}`;

  const picked = await pickModestItem(person);
  if (!picked) {
    console.log(`[dead-mans-switch] no affordable item found for ${person.name}`);
    return;
  }

  await callTool("food", "update_food_cart", {
    restaurantId: picked.restaurantId,
    addressId: person.addressId,
    cartItems: [{ menu_item_id: picked.item.id, quantity: 1 }],
  });
  const cart = await callTool<CartResult>("food", "get_food_cart", { addressId: person.addressId });
  const toPay = cart.structuredContent.data?.pricing?.to_pay;
  if (toPay === undefined) {
    // Fail loudly, not silently -- a fallback to picked.item.price here previously
    // masked a wrong field path and undercounted a real total by ~₹103 (delivery +
    // taxes excluded). Better to abort the proposal than propose a fabricated amount.
    throw new Error("get_food_cart response missing data.pricing.to_pay -- cart total unknown, refusing to propose");
  }
  const amountPaise = Math.round(toPay * 100);

  const proposal = await propose({
    idempotencyKey,
    daemon: "dead_mans_switch",
    server: "food",
    tier: "B",
    summary: `${person.name} has been quiet for ${Math.round(hoursSinceContact)}h -- order "${picked.item.name}" (₹${toPay}) as a nudge to call?`,
    toolName: "place_food_order",
    args: { addressId: person.addressId, paymentMethod: "Cash", noteToRestaurant: "Thinking of you!" },
    amountPaise,
    dryRun,
  });

  const notifier = await getNotifier();
  if (proposal.status === "pending") {
    await notifier.notify(`💭 ${proposal.summary}`);
  } else if (proposal.status === "failed") {
    await notifier.notify(`⚠️ Dead Man's Switch proposal rejected for ${person.name}: ${proposal.error}`);
  }
}

export async function runDeadMansSwitch(dryRun = true): Promise<void> {
  const { rows } = await pool.query(`INSERT INTO daemon_runs (daemon) VALUES ('dead_mans_switch') RETURNING id`);
  const runId = rows[0].id;

  try {
    const statuses = await allQuietStatuses();
    const quiet = statuses.filter((s) => s.isQuiet);
    console.log(`[dead-mans-switch] ${quiet.length}/${statuses.length} watched person(s) past quiet threshold`);

    for (const status of quiet) {
      await runOne(status, dryRun);
    }

    await pool.query(`UPDATE daemon_runs SET status = 'succeeded', finished_at = now(), detail = $2 WHERE id = $1`, [
      runId,
      `${quiet.length} quiet person(s) checked`,
    ]);
  } catch (err) {
    await pool.query(`UPDATE daemon_runs SET status = 'failed', finished_at = now(), detail = $2 WHERE id = $1`, [
      runId,
      err instanceof Error ? err.message : String(err),
    ]);
    throw err;
  }
}
