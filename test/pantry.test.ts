import { test } from "node:test";
import assert from "node:assert/strict";
import { confidenceRemaining } from "../src/world/pantry.js";

test("confidence is 1.0 at the moment of purchase", () => {
  const purchasedAt = new Date("2026-08-24T00:00:00Z");
  const now = new Date("2026-08-24T00:00:00Z");
  assert.equal(confidenceRemaining({ purchasedAt, shelfLifeDays: 7 }, now), 1);
});

test("confidence is exactly 0.5 at one shelf-life period elapsed (half-life definition)", () => {
  const purchasedAt = new Date("2026-08-24T00:00:00Z");
  const now = new Date("2026-08-31T00:00:00Z"); // 7 days later
  const confidence = confidenceRemaining({ purchasedAt, shelfLifeDays: 7 }, now);
  assert.ok(Math.abs(confidence - 0.5) < 1e-9, `expected ~0.5, got ${confidence}`);
});

test("confidence decays smoothly, not as a hard cliff", () => {
  const purchasedAt = new Date("2026-08-24T00:00:00Z");
  const shelfLifeDays = 7;
  const atThreeDays = confidenceRemaining({ purchasedAt, shelfLifeDays }, new Date("2026-08-27T00:00:00Z"));
  const atFourDays = confidenceRemaining({ purchasedAt, shelfLifeDays }, new Date("2026-08-28T00:00:00Z"));
  assert.ok(atThreeDays > 0.5, "should still be above the half-life point before shelf_life_days elapses");
  assert.ok(atFourDays < atThreeDays, "confidence must strictly decrease as time passes");
});

test("confidence approaches but never reaches zero, far past shelf life", () => {
  const purchasedAt = new Date("2026-08-24T00:00:00Z");
  const now = new Date("2026-10-24T00:00:00Z"); // ~9 shelf-life periods later
  const confidence = confidenceRemaining({ purchasedAt, shelfLifeDays: 7 }, now);
  assert.ok(confidence > 0, "confidence should be positive, however small");
  assert.ok(confidence < 0.01, `expected a small residual confidence, got ${confidence}`);
});
