import { callTool } from "../mcp/client.js";
import { pool } from "../db/pool.js";

/**
 * Fixed for Phase 0: one address, a handful of restaurant IDs picked once
 * by hand via a live search_restaurants call. Not configurable yet —
 * Phase 1+ derives this set from the world model instead of a hardcoded list.
 */
const HOME_ADDRESS_ID = "8258911";
const WATCHED_RESTAURANT_IDS = ["328876", "895963", "1201163", "803481", "313703"];

interface MenuItem {
  id: string;
  name: string;
  price: number; // rupees, per get_restaurant_menu's structuredContent
}

// Some categories nest a further level of subcategories instead of holding
// items directly (seen live: "Shravan Special" -> subcategories -> items).
// Only one of `items` / `subcategories` is present on a given category.
interface MenuCategory {
  title: string;
  items?: MenuItem[];
  subcategories?: MenuCategory[];
}

function flattenItems(category: MenuCategory): MenuItem[] {
  if (category.items) return category.items;
  if (category.subcategories) return category.subcategories.flatMap(flattenItems);
  return [];
}

interface RestaurantMenuResult {
  structuredContent: {
    restaurant: { id: string; name: string; deliveryTime?: number };
    categories: MenuCategory[];
    hasMore: boolean;
  };
}

async function crawlRestaurant(restaurantId: string): Promise<void> {
  let page = 1;
  let restaurantName = "";
  let deliveryTime: number | undefined;
  const capturedAt = new Date();

  // get_restaurant_menu paginates by category (max pageSize 8) — walk every page
  // so a menu with 19 categories (seen live) doesn't get truncated to the first few.
  for (;;) {
    const response = await callTool<RestaurantMenuResult>("food", "get_restaurant_menu", {
      restaurantId,
      addressId: HOME_ADDRESS_ID,
      page,
      pageSize: 8,
    });
    const result = response.structuredContent;

    restaurantName = result.restaurant.name;
    deliveryTime = result.restaurant.deliveryTime;

    const rows = result.categories.flatMap((category) =>
      flattenItems(category).map((item) => ({
        restaurant_id: restaurantId,
        restaurant_name: restaurantName,
        item_id: item.id,
        item_name: item.name,
        price_paise: Math.round(item.price * 100),
        captured_at: capturedAt,
      })),
    );

    for (const row of rows) {
      await pool.query(
        `INSERT INTO menu_snapshots (restaurant_id, restaurant_name, item_id, item_name, price_paise, captured_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.restaurant_id, row.restaurant_name, row.item_id, row.item_name, row.price_paise, row.captured_at],
      );
    }

    if (!result.hasMore) break;
    page += 1;
  }

  await pool.query(
    `INSERT INTO eta_snapshots (restaurant_id, restaurant_name, eta_minutes, captured_at)
     VALUES ($1, $2, $3, $4)`,
    [restaurantId, restaurantName, deliveryTime ?? null, capturedAt],
  );
}

export async function crawlOnce(): Promise<void> {
  for (const restaurantId of WATCHED_RESTAURANT_IDS) {
    console.log(`[crawler] crawling restaurant ${restaurantId}...`);
    await crawlRestaurant(restaurantId);
  }
  console.log(`[crawler] done — crawled ${WATCHED_RESTAURANT_IDS.length} restaurants.`);
}
