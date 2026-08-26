import "dotenv/config";
import { recordPurchase } from "../world/pantry.js";
import { pool } from "../db/pool.js";

// Manual seeding until real purchases are observed from get_orders/your_go_to_items
// (a later refinement -- Phase 2 tracks what's manually recorded, not yet what Instamart
// itself reports as ordered).
// Usage: npm run record-purchase -- milk 2 L 4
const [itemName, quantity, unit, shelfLifeDays] = process.argv.slice(2);

if (!itemName || !quantity || !unit || !shelfLifeDays) {
  console.error("Usage: npm run record-purchase -- <itemName> <quantity> <unit> <shelfLifeDays>");
  process.exit(1);
}

recordPurchase({
  itemName,
  quantity: Number(quantity),
  unit,
  shelfLifeDays: Number(shelfLifeDays),
})
  .then((p) => {
    console.log("Recorded purchase:", p);
    return pool.end();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
