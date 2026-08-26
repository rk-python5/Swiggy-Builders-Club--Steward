import { allDepletionStatuses } from "../world/pantry.js";
import { propose } from "../actions/gate.js";
import { callTool } from "../mcp/client.js";
import { getNotifier } from "../notify/notify.js";
import { pool } from "../db/pool.js";
import { realClock } from "../sim/clock.js";

const CONFIDENCE_THRESHOLD = 0.3; // below this, propose a restock
const HOME_ADDRESS_ID = "8258911";

/**
 * UNVERIFIED against a live call -- there's no Instamart OAuth token yet, same position
 * Standing Plans was in before Dineout got checked (see DECISIONS.md 2026-08-25). Shape
 * is the best available guess from swiggy-mcp-reference.md §4.2. Do not trust this
 * blindly -- Dineout's guessed shape was wrong on several concrete points once checked.
 * Verify against a real tools/list + real search_products/update_cart/get_cart/checkout
 * calls before relying on this in production, the same way Dineout was checked.
 */
interface ProductVariant {
  spinId: string;
  name: string;
  price: number; // rupees, matching the pattern seen on Food's menu prices
}

interface SearchProductsResult {
  structuredContent?: { products: { name: string; variants: ProductVariant[] }[] };
}

interface CartResult {
  structuredContent?: { billBreakdown?: { total: number } };
}

async function findProduct(itemName: string): Promise<ProductVariant | null> {
  const result = await callTool<SearchProductsResult>("im", "search_products", {
    query: itemName,
    addressId: HOME_ADDRESS_ID,
  });
  const products = result.structuredContent?.products ?? [];
  const first = products[0];
  return first?.variants?.[0] ?? null;
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

    const cartItems: { spinId: string; quantity: number }[] = [];
    const lineNames: string[] = [];
    for (const item of depleted) {
      const product = await findProduct(item.itemName);
      if (!product) {
        console.log(`[kitchen-entropy] no product match for "${item.itemName}", skipping`);
        continue;
      }
      cartItems.push({ spinId: product.spinId, quantity: 1 });
      lineNames.push(item.itemName);
    }

    if (cartItems.length === 0) {
      await pool.query(`UPDATE daemon_runs SET status = 'succeeded', finished_at = now(), detail = $2 WHERE id = $1`, [
        runId,
        "no products matched for any depleted item",
      ]);
      return;
    }

    // Instamart's update_cart REPLACES the whole cart, not appends (per
    // swiggy-mcp-reference.md, itself unverified) -- a single call with everything this
    // run wants to restock, not one call per item.
    await callTool("im", "update_cart", { addressId: HOME_ADDRESS_ID, items: cartItems });
    const cart = await callTool<CartResult>("im", "get_cart", { addressId: HOME_ADDRESS_ID });
    const totalRupees = cart.structuredContent?.billBreakdown?.total ?? 0;
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
      args: {},
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
