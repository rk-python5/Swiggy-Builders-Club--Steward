import { allDepletionStatuses } from "../world/pantry.js";
import { propose } from "../actions/gate.js";
import { callTool } from "../mcp/client.js";
import { getNotifier } from "../notify/notify.js";
import { pool } from "../db/pool.js";
import { realClock } from "../sim/clock.js";

const CONFIDENCE_THRESHOLD = 0.3; // below this, propose a restock

// Instamart serviceability is per-vertical, not per-account -- the Food/Dineout home
// address (8258911) came back "not serviceable" for Instamart on this account, verified
// live 2026-08-26. The Work address is serviceable. Don't assume one address works
// everywhere just because it worked for another server.
const INSTAMART_ADDRESS_ID = "d5kv55162u3v0tsfb2hg";

/**
 * Verified live against real Instamart tool schemas (tools/list + real calls) on
 * 2026-08-26 -- corrected from the swiggy-mcp-reference.md-derived guess, same pattern as
 * Dineout. Real differences found: update_cart takes `selectedAddressId`, not `addressId`;
 * checkout REQUIRES `addressId` (was being called with empty args); get_cart takes no
 * arguments at all; product variants live under `variations`, not `variants`, with price
 * nested as `price.offerPrice`; get_cart's total is a currency-formatted STRING
 * (`"₹123"`), not a number. Confirmed update_cart genuinely replaces the real item(s) you
 * send (tested: item A -> item B left only item B), though Swiggy also injects its own
 * promotional freebie/voucher items independent of anything sent -- those are filtered
 * out here by mrp, not counted as "what this daemon restocked."
 */
interface ProductVariation {
  spinId: string;
  skuId: string;
  quantityDescription: string;
  price: { mrp: number; offerPrice: number };
}

interface SearchProductsResult {
  structuredContent?: { products: { displayName: string; variations: ProductVariation[] }[] };
}

interface GetCartResult {
  structuredContent?: { cartTotalAmount?: string };
}

function parseRupeeString(value: string | undefined): number {
  if (!value) return 0;
  return Number(value.replace(/[^0-9.]/g, "")) || 0;
}

async function findProduct(itemName: string): Promise<ProductVariation | null> {
  const result = await callTool<SearchProductsResult>("im", "search_products", {
    addressId: INSTAMART_ADDRESS_ID,
    query: itemName,
  });
  const product = result.structuredContent?.products?.[0];
  return product?.variations?.[0] ?? null;
}

export async function runKitchenEntropy(dryRun = true): Promise<void> {
  const { rows } = await pool.query(`INSERT INTO daemon_runs (daemon) VALUES ('kitchen_entropy') RETURNING id`);
  const runId = rows[0].id;

  try {
    const statuses = await allDepletionStatuses(realClock);
    const depleted = statuses.filter((s) => s.confidence < CONFIDENCE_THRESHOLD);
    console.log(`[kitchen-entropy] ${depleted.length}/${statuses.length} tracked item(s) below confidence threshold`);

    if (depleted.length === 0) {
      await pool.query(`UPDATE daemon_runs SET status = 'succeeded', finished_at = now(), detail = $2 WHERE id = $1`, [
        runId,
        "nothing below threshold",
      ]);
      return;
    }

    const cartItems: { spinId: string; skuId: string; quantity: number }[] = [];
    const lineNames: string[] = [];
    for (const item of depleted) {
      const product = await findProduct(item.itemName);
      if (!product) {
        console.log(`[kitchen-entropy] no product match for "${item.itemName}", skipping`);
        continue;
      }
      cartItems.push({ spinId: product.spinId, skuId: product.skuId, quantity: 1 });
      lineNames.push(item.itemName);
    }

    if (cartItems.length === 0) {
      await pool.query(`UPDATE daemon_runs SET status = 'succeeded', finished_at = now(), detail = $2 WHERE id = $1`, [
        runId,
        "no products matched for any depleted item",
      ]);
      return;
    }

    await callTool("im", "update_cart", { selectedAddressId: INSTAMART_ADDRESS_ID, items: cartItems });
    const cart = await callTool<GetCartResult>("im", "get_cart", {});
    const totalRupees = parseRupeeString(cart.structuredContent?.cartTotalAmount);
    const amountPaise = Math.round(totalRupees * 100);

    const minConfidence = Math.min(...depleted.map((d) => d.confidence));
    const idempotencyKey = `kitchen-entropy:${new Date().toISOString().substring(0, 10)}:${lineNames.sort().join(",")}`;

    const proposal = await propose({
      idempotencyKey,
      daemon: "kitchen_entropy",
      server: "im",
      tier: "B",
      summary: `Restock cart ready: ${lineNames.join(", ")} (₹${totalRupees})`,
      toolName: "checkout",
      args: { addressId: INSTAMART_ADDRESS_ID },
      amountPaise,
      confidence: minConfidence,
      dryRun,
    });

    const notifier = await getNotifier();
    if (proposal.status === "pending") {
      await notifier.notify(`🛒 ${proposal.summary} -- reply to approve or snooze.`);
    } else if (proposal.status === "failed") {
      await notifier.notify(`⚠️ Kitchen Entropy proposal rejected: ${proposal.error}`);
    }

    await pool.query(`UPDATE daemon_runs SET status = 'succeeded', finished_at = now(), detail = $2 WHERE id = $1`, [
      runId,
      `proposal ${proposal.id} (${proposal.status})`,
    ]);
  } catch (err) {
    await pool.query(`UPDATE daemon_runs SET status = 'failed', finished_at = now(), detail = $2 WHERE id = $1`, [
      runId,
      err instanceof Error ? err.message : String(err),
    ]);
    throw err;
  }
}
