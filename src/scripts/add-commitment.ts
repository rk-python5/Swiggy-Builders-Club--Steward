import "dotenv/config";
import { createCommitment } from "../world/commitments.js";
import { pool } from "../db/pool.js";

// Manual seeding until the Settings screen (flagged as missing in PLAN.md Phase 4) exists.
// Usage: npm run add-commitment -- "Friday dinner" 5 19:30 <restaurantId> <addressId>
const [label, dayOfWeek, timeOfDay, restaurantId, addressId] = process.argv.slice(2);

if (!label || !dayOfWeek || !timeOfDay || !restaurantId || !addressId) {
  console.error(
    'Usage: npm run add-commitment -- "<label>" <dayOfWeek 0-6> <HH:MM> <restaurantId> <addressId>',
  );
  process.exit(1);
}

createCommitment({
  label,
  dayOfWeek: Number(dayOfWeek),
  timeOfDay,
  restaurantId,
  addressId,
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
