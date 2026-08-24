import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeClock } from "../src/sim/clock.js";
import { simulatedCallTool } from "../src/sim/simulated-client.js";

test("FakeClock only advances when told to", () => {
  const clock = new FakeClock(new Date("2026-08-24T00:00:00Z"));
  const before = clock.now().getTime();
  clock.advance(7 * 24 * 60 * 60 * 1000); // one week
  const after = clock.now().getTime();
  assert.equal(after - before, 7 * 24 * 60 * 60 * 1000);
});

test("simulatedCallTool plays back a recorded fixture", async () => {
  const result = await simulatedCallTool<{
    structuredContent: { restaurant: { id: string; name: string } };
  }>("get_restaurant_menu");

  assert.equal(result.structuredContent.restaurant.id, "328876");
  assert.ok(result.structuredContent.restaurant.name.length > 0);
});
