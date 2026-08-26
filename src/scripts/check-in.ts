import "dotenv/config";
import { checkIn } from "../world/watched-people.js";
import { pool } from "../db/pool.js";

const id = process.argv[2];
if (!id) {
  console.error("Usage: npm run check-in -- <watchedPersonId>");
  process.exit(1);
}

checkIn(Number(id))
  .then(() => {
    console.log(`Checked in for person ${id} -- last_contact_at reset to now.`);
    return pool.end();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
