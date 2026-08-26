import "dotenv/config";
import { createWatchedPerson } from "../world/watched-people.js";
import { pool } from "../db/pool.js";

// Usage: npm run add-watched-person -- "Maa" <addressId> [quietThresholdHours=48]
const [name, addressId, quietThresholdHours] = process.argv.slice(2);

if (!name || !addressId) {
  console.error('Usage: npm run add-watched-person -- "<name>" <addressId> [quietThresholdHours=48]');
  process.exit(1);
}

createWatchedPerson({
  name,
  addressId,
  quietThresholdHours: quietThresholdHours ? Number(quietThresholdHours) : undefined,
})
  .then((p) => {
    console.log("Created watched person:", p);
    return pool.end();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
