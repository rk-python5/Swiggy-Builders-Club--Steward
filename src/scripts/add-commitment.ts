import "dotenv/config";
import { createCommitment } from "../world/commitments.js";
import { pool } from "../db/pool.js";

// Manual seeding until the Settings screen (flagged as missing in PLAN.md Phase 4) exists.
// Usage: npm run add-commitment -- "Friday dinner" 5 19:30 <restaurantId> <addressId> <lat> <lng>
const [label, dayOfWeek, timeOfDay, restaurantId, addressId, lat, lng] = process.argv.slice(2);

if (!label || !dayOfWeek || !timeOfDay || !restaurantId || !addressId || !lat || !lng) {
  console.error(
    'Usage: npm run add-commitment -- "<label>" <dayOfWeek 0-6> <HH:MM> <restaurantId> <addressId> <latitude> <longitude>\n' +
      "  latitude/longitude: use the ones printed by search_restaurants_dineout / get_restaurant_details for this restaurant.",
  );
  process.exit(1);
}

createCommitment({
  label,
  dayOfWeek: Number(dayOfWeek),
  timeOfDay,
  restaurantId,
  addressId,
  latitude: Number(lat),
  longitude: Number(lng),
})
  .then((c) => {
    console.log("Created commitment:", c);
    return pool.end();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
