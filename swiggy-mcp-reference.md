# Swiggy MCP — Working Reference

> Agent-readable map of the Swiggy Food / Instamart / Dineout MCP surface.
> Compiled 24 Aug 2026 from `mcp.swiggy.com/builders`, `Swiggy/swiggy-mcp-server-manifest`, and the Builders Club blog.
> **Unofficial.** Swiggy ships a `.md` twin of every doc page plus an `llms.txt` index — those are authoritative and fresher. Treat this as a map, not a contract.

---

## 0. Live docs (prefer these when the agent can fetch)

```
https://mcp.swiggy.com/builders/llms.txt          # index of every page
https://mcp.swiggy.com/builders/docs/reference/   # all tools by server + stage
https://mcp.swiggy.com/builders/docs/start/coding-agents/

# every page has a .md twin — append .md to any doc URL:
https://mcp.swiggy.com/builders/docs/reference/food/place_food_order.md
```

Sections **8 (constraints)**, **9 (data gaps)** and **10 (architecture)** below are the parts not stated plainly anywhere in the official docs.

---

## 1. Servers and endpoints

Three independent HTTP MCP servers. They do **not** share cart state, and they do **not** share ID spaces.

| Server | Endpoint | Tools | Covers |
|---|---|---|---|
| Food | `POST mcp.swiggy.com/food` | 18 | Restaurant discovery, menus, cart, coupons, delivery orders, tracking |
| Instamart | `POST mcp.swiggy.com/im` | 19 | Grocery search with pack-size variants, cart, checkout, order history |
| Dineout | `POST mcp.swiggy.com/dineout` | 11 | Dine-in discovery, deals, slot availability, table booking |

```json
{
  "mcpServers": {
    "swiggy-food":      { "type": "http", "url": "https://mcp.swiggy.com/food" },
    "swiggy-instamart": { "type": "http", "url": "https://mcp.swiggy.com/im" },
    "swiggy-dineout":   { "type": "http", "url": "https://mcp.swiggy.com/dineout" }
  }
}
```

> **Tool count:** marketing still says "35+ tools". The docs nav lists 48. The gap is the UPI payment stage (`get_payment_options`, `check_payment_status`, `confirm_order` × 3 servers) added in the July 2026 Pay-in-Chat release. Trust the nav.

---

## 2. Authentication

OAuth 2.1 with PKCE. One-time browser handoff, then the session supplies credentials automatically.

- Session credentials (identity, access token) are injected by the authenticated MCP session. **Never pass them as tool arguments.**
- Redirect URIs must be whitelisted by Swiggy. The manifest repo lists approved ones; email `builders@swiggy.in` to add more.
- Expired-token handling: `docs/start/authenticate`. Enterprise multi-tenant uses a separate delegated on-behalf-of flow.

> **If working from older notes:** early write-ups claimed 5-day tokens with no refresh in v1. No longer accurate — current flow is OAuth 2.1 + PKCE with documented refresh. Don't build a re-auth workaround you don't need.

---

## 3. Universal response envelope

Every tool on every server returns the same outer shape.

```jsonc
// success
{ "success": true,  "data": { /* tool-specific */ }, "message": "optional" }

// failure
{ "success": false, "error": { "message": "what went wrong" } }
```

Full catalogue: `docs/reference/errors`.

**Identifier discipline.** Use returned IDs and enum values *exactly* as provided. Do not invent fallback IDs, status values, payment methods, or timestamps. Hallucinated cart IDs are the most commonly reported failure in public builds.

---

## 4. Tool inventory

### 4.1 Food — 18 tools

| Stage | Tool | What it does |
|---|---|---|
| Discover | `get_addresses` | Saved delivery addresses, sorted by last order date. Shared with Instamart. Most journeys start here — `addressId` is required almost everywhere. |
| Discover | `search_restaurants` | Search restaurants for delivery. Returns the `restaurantId` used by menu and cart calls. |
| Discover | `get_restaurant_menu` | Complete menu, paginated by category. **COMPACT view: dish names, prices, `hasVariants`, `hasAddons`.** `page` / `pageSize` (default 5, max 8). |
| Discover | `search_menu` | Find specific dishes. Returns full customisation detail (variants, addons) — **required before adding to cart**. |
| Cart | `update_food_cart` | Add or update items. Supports variants and addons. |
| Cart | `get_food_cart` | Cart with bill breakdown. Also returns `valid_addons` and `availablePaymentMethods`. |
| Cart | `flush_food_cart` | Empty the cart. |
| Cart | `fetch_food_coupons` | Available coupons/offers. **Not gated.** |
| Cart | `apply_food_coupon` | Apply a coupon code. **Not gated.** |
| Payment | `get_payment_options` | Payment picker — UPI apps + scan-QR, Cash where available. Device-aware. |
| Payment | `check_payment_status` | One status read on an in-flight UPI payment. |
| Payment | `confirm_order` | Finalise `PENDING_PAYMENT` → placed. Idempotent. Usually automatic. |
| Order | `place_food_order` | Place the order. **Mutating.** See §6. |
| Track | `track_food_order` | Conversational tracking. Use this, not the widget poller. |
| Track | `get_food_delivery_status` | Widget-only ETA poller. Absolute ETA epoch + poll cadence. |
| Track | `get_food_orders` | Active orders and status. |
| Track | `get_food_order_details` | Full detail for one order. |
| Support | `report_error` | Pre-filled error report for the Swiggy MCP team. |

### 4.2 Instamart — 19 tools

| Stage | Tool | What it does |
|---|---|---|
| Discover | `search_products` | Search products at the selected address. **Returns products WITH VARIANTS — pack sizes and quantities.** Always search first; you need the `spinId`. |
| Discover | `your_go_to_items` | Frequently/recently ordered items for an address. Closest thing to a pantry signal. |
| Address | `get_addresses` | Saved addresses. Shared with Food. |
| Address | `create_address` / `delete_address` | Manage delivery addresses. |
| Cart | `update_cart` | **REPLACES the entire cart** with the items provided. Not an append — read-merge-write. |
| Cart | `get_cart` | Cart with items and `billBreakdown`. |
| Cart | `clear_cart` | Remove all items. |
| Cart | `list_coupons` | Applicable coupons. **GATED — whitelisted accounts only.** |
| Cart | `apply_coupon` | Apply coupon, returns updated cart. **GATED — whitelisted accounts only.** |
| Payment | `get_payment_options` / `check_payment_status` / `confirm_order` | Same UPI stage as Food. |
| Order | `checkout` | Places and confirms the grocery order in one operation. |
| Track | `track_order` | Primary tracking tool. |
| Track | `get_delivery_status` | Widget-only ETA poller. |
| Track | `get_orders` | Order history — past orders and preferences. |
| Track | `get_order_details` | Full detail for one order. |
| Support | `report_error` | Pre-filled error report. |

### 4.3 Dineout — 11 tools

| Stage | Tool | What it does |
|---|---|---|
| Find | `get_saved_locations` | Addresses for Dineout search. **Separate ID space from Food/Instamart `get_addresses`.** |
| Find | `search_restaurants_dineout` | Search for **table booking, not delivery**. Returns cuisines, ratings with count, `costForTwo`. |
| Find | `get_restaurant_details` | Ratings, deals, timings, address. Use the ID from `search_restaurants_dineout` and the same coordinates. |
| Reserve | `get_available_slots` | Slots across **up to 7 days** from the requested date. Breakfast / lunch / dinner. |
| Reserve | `create_cart` | Cart for booking (`DEAL_TICKET_PURCHASE`) or bill payment. Validates `billToPay = 0` and `skipPayment`. |
| Reserve | `book_table` | Book a slot. **FREE reservations only** (`isFree=true`, `bookingPrice=0`). Paid deals rejected. |
| Payment | `get_payment_options` / `check_payment_status` / `confirm_order` | Paid-reservation UPI stage. |
| Manage | `get_booking_status` | Restaurant name, date, time, guests, deal title, status. |
| Support | `report_error` | Pre-filled error report. |

---

## 5. Canonical call sequences

Published as recipes under `docs/build/recipes`.

**Order food (canonical 7-tool journey)**
```
get_addresses            -> addressId
search_restaurants       -> restaurantId
get_restaurant_menu      -> browse (names + prices only)
search_menu              -> itemId + variants/addons   [required before cart]
update_food_cart         -> add items
fetch_food_coupons -> apply_food_coupon                [optional]
get_food_cart            -> totals + availablePaymentMethods
place_food_order         -> orderId  [EXPLICIT USER CONFIRMATION REQUIRED]
track_food_order         -> delivery progress
```

**Order groceries**
```
get_addresses    -> addressId
search_products  -> spinId (pick the right pack-size variant)
update_cart      -> REPLACES cart wholesale; merge client-side first
get_cart         -> billBreakdown
checkout         -> places and confirms in one call
track_order      -> delivery progress
```

**Book a table**
```
get_saved_locations         -> addressId (Dineout-scoped)
search_restaurants_dineout  -> restaurantId, costForTwo, rating
get_restaurant_details      -> deals, timings
get_available_slots         -> slot (up to 7 days out)
book_table                  -> booking  [FREE reservations only]
get_booking_status          -> confirmation
```

**UPI payment (shared across all three servers)**
```
get_payment_options   -> user picks UPI app or scan-QR
place_food_order / checkout / book_table
      -> status = "PENDING_PAYMENT"      <-- ORDER IS NOT PLACED
check_payment_status  -> poll at pollingIntervalInMs until SUCCESS
confirm_order         -> now, and only now, the order is PLACED
```

> **The `PENDING_PAYMENT` trap.** On a UPI flow, `place_food_order` returns `success: true` with `status="PENDING_PAYMENT"`. The order is *not* placed. Do not announce success until `confirm_order` succeeds. Do not poll faster than `pollingIntervalInMs`. Stop at any terminal status.

---

## 6. Worked example: `place_food_order`

Every tool page follows this shape — description, parameters, envelope, output schema, schema notes, "next in this journey".

| Field | Value |
|---|---|
| Server | Food — `POST mcp.swiggy.com/food` |
| Stage | Order |
| Behaviour | mutating |
| Next | `track_food_order` |

**Parameters**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `addressId` | string | **yes** | From `get_addresses`. Coordinates fetched automatically. |
| `paymentMethod` | string | no | e.g. `"UPI"` or `"Cash"`. Omit for Cash only when Cash is the sole available method. |
| `intentApp` | string | no | Advanced. Leave blank unless the preceding `get_food_cart` response says otherwise. |
| `generateUPIQR` | boolean | no | Advanced. Same rule. |
| `noteToRestaurant` | string | no | Note to the kitchen ("no onions"). Not for delivery-partner instructions. |

**Confirmation protocol (mandated by the tool description)**

1. Call `get_food_cart` first; display items, costs, available payment methods.
2. Show the available payment method(s) and state which will be used.
3. State the delivery address explicitly: *"Your order will be delivered to: [full address]"*.
4. Ask: *"Do you want to proceed with placing this order to this address?"*
5. Wait for clear confirmation. Never proceed without explicit permission.

**Output schema — two shapes**

```ts
// Cash / COD — placed immediately
{ orderId, status: "CONFIRMED", normalizedStatus: "success",
  items: FoodPlacedItem[], restaurantName, restaurantAddress,
  totalAmount, estimatedDelivery, deliveryAddress }

// UPI — created but NOT placed
{ orderId, paasId, transactionId, upiIntentUrl, bridgeUrl, isQrFlow,
  pollingIntervalInMs, maxTimeToPollForInMs, paymentMethod: "UPI",
  status: "PENDING_PAYMENT", normalizedStatus: "pending",
  addressId, cartId, lat, lng }
```

**Cancellation.** Call no tool. Direct the user to Swiggy customer care on **080-67466729**. There is no cancellation tool on any server.

---

## 7. Hard constraints and gating

| Constraint | Detail |
|---|---|
| **₹1000 order cap** | `place_food_order` is rejected for cart values of ₹1000 or more. Stated reason: MCP is in beta, used strictly for testing. Above that, redirect the user to the Swiggy app. |
| **Dineout: free bookings only** | `book_table` supports `isFree=true` / `bookingPrice=0` only. Paid deals rejected — a large share of attractive Dineout offers cannot be booked through MCP. |
| **Instamart coupons gated** | `list_coupons` and `apply_coupon` are whitelisted-accounts-only. Food coupons are *not* gated. Don't assume symmetry between servers. |
| **Cart replacement semantics** | Instamart `update_cart` replaces the whole cart rather than appending. Read-merge-write or silently drop items. |
| **No cancellation path** | No server exposes a cancel tool. Placed orders cannot be cancelled programmatically. |
| **Keep the Swiggy app closed** | Concurrent app + MCP sessions cause session conflicts and order-processing issues. Matters during demos. |
| **COD orders are real** | On production credentials the agent places genuine cash-on-delivery orders. Confirmation gating is not optional. |
| **Third-party distribution** | The manifest repo states third-party app development is not permitted pending security/compliance review. Production access is application-gated via Builders Club. |

---

## 8. Data gaps — read before scoping

Absences confirmed against the tool contracts. Each one invalidates an otherwise reasonable product idea.

**No item-level social proof anywhere.**
`get_restaurant_menu` returns a COMPACT view: dish names, prices, `hasVariants`, `hasAddons`. There is no per-item rating, no "% liked this", no order-volume signal, on any tool on any server.
→ You cannot rank or filter dishes *within* a menu by quality. Anything shaped like "show me the six things this kitchen actually does well" is not buildable. Restaurant-level ratings exist; dish-level ones do not.

**Dineout has no menus and no item prices.**
The Dineout surface is discovery + booking: cuisines, ratings with count, `costForTwo`, deals, timings, address, slots. No dishes, no per-item prices.
→ Dine-in cost can only be estimated coarsely as `costForTwo` modulated by the deal. Comparison against a Food cart happens at *meal* granularity, never dish granularity.

**No documented cross-vertical restaurant join.**
Dineout restaurant IDs are Dineout-scoped — `get_restaurant_details` explicitly requires the ID from `search_restaurants_dineout`. Nothing maps a Food `restaurantId` to its Dineout equivalent.
→ Matching "the same restaurant" across delivery and dine-in means fuzzy-matching name + coordinates, with no coverage guarantee. Budget for unreliability.

**Address ID spaces are split.**
Food and Instamart share `get_addresses`. Dineout uses `get_saved_locations` with its own IDs. Do not pass one into the other.

### What the API *is* generous with

- `search_products` returns pack-size variants — raw material for true unit-cost / amortisation calculation.
- `your_go_to_items` + `get_orders` gives a usable proxy for household consumption patterns.
- Food coupons are ungated, so real discounted totals are computable on the delivery side.
- `get_available_slots` looks 7 days ahead — enough for genuine planning, not just same-night reaction.

---

## 9. Architecture notes

**Do not register all tools to one agent.** A widely-cited build report describes registering all of Swiggy's tools on a single agent and asking it to add groceries to a cart: the model ignored the Instamart tools entirely, called `search_restaurants` instead, hallucinated a cart ID, and gave up. With this many tools sharing near-identical verbs across three servers, attention degrades fast.

→ Route per server. One sub-agent per vertical with only that server's tools registered, plus a thin orchestrator deciding which vertical a request belongs to. The tool descriptions are themselves written defensively for this reason — several shout "NOT for groceries" / "NOT for food delivery" in their first line.

**Multi-turn cart state.** MCP is stateless; carts are not. Cart identity must be carried across turns by your own layer. Pattern: `docs/build/agent-patterns/multi-turn-state`.

**Widgets.** The servers can return render-ready UI fragments alongside tool responses — order-success cards, payment pickers, tracking views. `docs/build/widgets`. Most builders never find this page; free presentation polish for demos.

**Voice vs chat.** Same tool, different response contracts by surface. `docs/build/agent-patterns/voice-vs-chat`.

**Widget-only vs conversational.** `get_food_delivery_status` and `get_delivery_status` are widget pollers. For a chat agent use `track_food_order` / `track_order` — the pollers return epoch timestamps and cadence hints, not readable text.

---

## 10. Authoritative sources

```
https://mcp.swiggy.com/builders/llms.txt
https://mcp.swiggy.com/builders/docs/reference/
https://mcp.swiggy.com/builders/docs/reference/food/
https://mcp.swiggy.com/builders/docs/reference/instamart/
https://mcp.swiggy.com/builders/docs/reference/dineout/
https://mcp.swiggy.com/builders/docs/reference/errors/
https://mcp.swiggy.com/builders/docs/start/authenticate/
https://mcp.swiggy.com/builders/docs/start/coding-agents/
https://mcp.swiggy.com/builders/docs/build/widgets/
https://mcp.swiggy.com/builders/docs/operate/rate-limits/
https://mcp.swiggy.com/builders/docs/operate/changelog/
https://github.com/Swiggy/swiggy-mcp-server-manifest
```

*Swiggy versions its MCP surface with SemVer and publishes a changelog at `docs/operate/changelog` — check it before trusting anything above.*
