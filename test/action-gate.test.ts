import { test } from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";
import { propose } from "../src/actions/gate.js";
import { pool } from "../src/db/pool.js";

// Integration test against the real dev Postgres (DATABASE_URL) -- deliberately not
// mocked, since the thing actually being proven is the DB-level unique constraint on
// idempotency_key. dryRun:true means no MCP/network call happens either way, so this
// needs no Swiggy credentials of any kind.

test("propose() with the same idempotency key does not execute twice", async () => {
  const key = `test:${Date.now()}:${Math.random()}`;

  const first = await propose({
    idempotencyKey: key,
    daemon: "standing_plans",
    server: "dineout",
    tier: "A",
    summary: "test booking",
    toolName: "book_table",
    args: { restaurantId: "x" },
    dryRun: true,
  });

  const second = await propose({
    idempotencyKey: key,
    daemon: "standing_plans",
    server: "dineout",
    tier: "A",
    summary: "test booking (retried)",
    toolName: "book_table",
    args: { restaurantId: "x" },
    dryRun: true,
  });

  assert.equal(first.id, second.id, "a retried proposal with the same key must resolve to the same row");
  assert.equal(first.status, "executed");
  assert.equal(second.status, "executed");

  const { rows } = await pool.query("SELECT count(*) FROM proposals WHERE idempotency_key = $1", [key]);
  assert.equal(Number(rows[0].count), 1, "exactly one row must exist for this idempotency key");
});

test("tier B proposals stay pending until explicitly approved", async () => {
  const key = `test:${Date.now()}:${Math.random()}`;

  const proposal = await propose({
    idempotencyKey: key,
    daemon: "kitchen_entropy",
    server: "im",
    tier: "B",
    summary: "test restock",
    toolName: "checkout",
    args: {},
    amountPaise: 64_000, // ₹640, under the cap
    dryRun: true,
  });

  assert.equal(proposal.status, "pending", "tier B must not execute on its own");
  assert.equal(proposal.amount_paise, 64_000);
});

test("the ₹1000 cap is enforced by the gate itself, before any MCP call is attempted", async () => {
  const key = `test:${Date.now()}:${Math.random()}`;

  const proposal = await propose({
    idempotencyKey: key,
    daemon: "kitchen_entropy",
    server: "im",
    tier: "B",
    summary: "test restock over the cap",
    toolName: "checkout",
    args: {},
    amountPaise: 150_000, // ₹1500, over the ₹1000 sandbox cap
    dryRun: false, // proves the cap check happens BEFORE dryRun would even matter
  });

  assert.equal(proposal.status, "failed", "a proposal at/above ₹1000 must be rejected outright, not left pending");
  assert.match(proposal.error ?? "", /1000/);
});

test("a proposal exactly at the ₹1000 cap is also rejected (cap is >=, not >)", async () => {
  const key = `test:${Date.now()}:${Math.random()}`;

  const proposal = await propose({
    idempotencyKey: key,
    daemon: "kitchen_entropy",
    server: "im",
    tier: "B",
    summary: "test restock at exactly the cap",
    toolName: "checkout",
    args: {},
    amountPaise: 100_000, // exactly ₹1000
    dryRun: true,
  });

  assert.equal(proposal.status, "failed");
});
