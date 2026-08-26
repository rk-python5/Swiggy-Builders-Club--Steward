// One-off generator for Steward.postman_collection.json -- programmatic construction
// avoids hand-typed JSON syntax errors across ~60 repetitive request items. Not part of
// the app; run once with `node postman/generate-collection.mjs` and delete/keep as a
// reference for regenerating if the tool inventory changes.
import { writeFileSync } from "node:fs";

let uidCounter = 1;
function uid() {
  return `b3f1a1e0-0000-4000-8000-${String(uidCounter++).padStart(12, "0")}`;
}

function jsonBody(obj) {
  return { mode: "raw", raw: JSON.stringify(obj, null, 2), options: { raw: { language: "json" } } };
}

function urlencodedBody(pairs) {
  return {
    mode: "urlencoded",
    urlencoded: Object.entries(pairs).map(([key, value]) => ({ key, value: String(value), type: "text" })),
  };
}

function bearerAuth(tokenVar) {
  return { type: "bearer", bearer: [{ key: "token", value: `{{${tokenVar}}}`, type: "string" }] };
}

function urlFromRaw(raw) {
  const [base, query] = raw.split("?");
  const url = { raw, host: [base] };
  if (query) {
    url.query = query.split("&").map((pair) => {
      const [key, value = ""] = pair.split("=");
      return { key, value };
    });
  }
  return url;
}

function req(name, { method = "POST", url, body, auth, description = "" } = {}) {
  const request = { method, header: [], url: urlFromRaw(url), description };
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    request.header.push({ key: "Content-Type", value: body?.mode === "urlencoded" ? "application/x-www-form-urlencoded" : "application/json" });
  }
  if (body) request.body = body;
  if (auth) request.auth = auth;
  return { name, id: uid(), request, response: [] };
}

/** One JSON-RPC tools/call request against an MCP server. */
function mcpCall(server, baseVar, tokenVar, toolName, args, description = "") {
  return req(`${toolName}`, {
    method: "POST",
    url: `{{${baseVar}}}`,
    auth: bearerAuth(tokenVar),
    body: jsonBody({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
    description,
  });
}

function mcpToolsList(baseVar, tokenVar) {
  return req("tools/list", {
    method: "POST",
    url: `{{${baseVar}}}`,
    auth: bearerAuth(tokenVar),
    body: jsonBody({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    description: "Always run this first against a fresh token -- tool inventories in the docs have been wrong before (see CLAUDE.md's spot-check log). This is the authoritative source, not the reference doc.",
  });
}

function folder(name, description, items) {
  return { name, id: uid(), description, item: items };
}

// ---------------------------------------------------------------------------
// OAuth (manual PKCE -- see CLAUDE.md's "Authenticating against the Swiggy MCP servers")
// ---------------------------------------------------------------------------
const oauthFolder = folder(
  "OAuth (manual PKCE)",
  "Swiggy's authorization-server metadata has a known issuer/location mismatch (RFC 8414 §3.3) that breaks spec-strict discovery -- this is why the whole flow is manual here instead of an SDK's OAuthClientProvider. Generate a code_verifier/code_challenge (S256) yourself before running these (Postman doesn't do PKCE generation natively) and set oauth_code_verifier/oauth_code_challenge in the environment.",
  [
    req("1. Register dynamic client", {
      url: "{{swiggy_auth_base}}/register",
      body: jsonBody({
        redirect_uris: ["{{oauth_redirect_uri}}"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"],
      }),
      description: "Returns a client_id. Copy it into the oauth_client_id environment variable.",
    }),
    req("2. Authorize (open in a real browser, not Postman)", {
      method: "GET",
      url: "{{swiggy_auth_base}}/authorize?response_type=code&client_id={{oauth_client_id}}&redirect_uri={{oauth_redirect_uri}}&code_challenge={{oauth_code_challenge}}&code_challenge_method=S256",
      description: "Postman can't complete phone+OTP login -- open this URL in an actual browser tab. The redirect will fail to load (nothing's listening on oauth_redirect_uri) -- copy the `code` query param from the resulting URL into oauth_authorization_code.",
    }),
    req("3. Exchange code for token", {
      url: "{{swiggy_auth_base}}/token",
      body: urlencodedBody({
        grant_type: "authorization_code",
        code: "{{oauth_authorization_code}}",
        redirect_uri: "{{oauth_redirect_uri}}",
        client_id: "{{oauth_client_id}}",
        code_verifier: "{{oauth_code_verifier}}",
      }),
      description: "Returns a Bearer access token, 5-day expiry. Confirmed this session: no refresh_token is issued despite the auth server's metadata listing refresh_token as a supported grant type -- see DECISIONS.md 2026-08-24. Copy the access_token into swiggy_food_token / swiggy_im_token / swiggy_dineout_token as needed (same token works across all three servers).",
    }),
    req("[Known bug] Protected-resource metadata", {
      method: "GET",
      url: "{{swiggy_food_base}}/.well-known/oauth-protected-resource",
      description: "Declares its authorization_servers as https://mcp.swiggy.com/auth.",
    }),
    req("[Known bug] Authorization-server metadata (served at root, not /auth)", {
      method: "GET",
      url: "https://mcp.swiggy.com/.well-known/oauth-authorization-server",
      description: "This is the actual location the metadata is served from, but its own `issuer` field claims https://mcp.swiggy.com/auth -- a location/issuer mismatch per RFC 8414 §3.3. This is why spec-strict clients (MCP Inspector) refuse to connect with \"Issuer mismatch\". Worth re-checking periodically in case Swiggy fixes it.",
    }),
  ],
);

// ---------------------------------------------------------------------------
// Food server -- 20 tools, confirmed live this session (doc claims 18, undercounts
// create_address/delete_address -- see CLAUDE.md's spot-check log)
// ---------------------------------------------------------------------------
const foodFolder = folder(
  "Food server (20 tools)",
  "https://mcp.swiggy.com/food. Tool count confirmed live at 20 (the reference doc claims 18 and omits create_address/delete_address -- CLAUDE.md's tool-inventory section). Response envelope shapes vary per tool -- get_food_cart's real total is nested at structuredContent.data.pricing.to_pay, deeper than any other tool; see CLAUDE.md before assuming a shape.",
  [
    mcpToolsList("swiggy_food_base", "swiggy_food_token"),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "search_restaurants", { addressId: "{{address_id}}", query: "biryani" }),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "get_restaurant_menu", { restaurantId: "{{restaurant_id}}", page: 1, pageSize: 5 }),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "search_menu", { restaurantId: "{{restaurant_id}}", query: "paneer" }),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "update_food_cart", { addressId: "{{address_id}}", restaurantId: "{{restaurant_id}}", cartItems: [{ menu_item_id: "{{menu_item_id}}", quantity: 1 }] }, "Note the field names: cartItems (not items), menu_item_id (not itemId) -- confirmed live, differs from the reference doc's guess."),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "get_food_cart", { addressId: "{{address_id}}" }),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "flush_food_cart", {}),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "fetch_food_coupons", { addressId: "{{address_id}}" }),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "apply_food_coupon", { addressId: "{{address_id}}", couponCode: "WELCOME50" }),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "get_payment_options", { addressId: "{{address_id}}" }),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "check_payment_status", { orderId: "{{order_id}}" }),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "confirm_order", { orderId: "{{order_id}}" }),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "place_food_order", { addressId: "{{address_id}}", paymentMethod: "COD" }, "MUTATING -- places a real order (sandbox: stubbed, ₹1000 cap, no real kitchen dispatch per CLAUDE.md). Real schema is much larger -- see swiggy-mcp-reference.md §6 for the full template before using this for anything but a smoke test. Not idempotent -- verify via get_food_orders on ambiguous response, don't retry blindly."),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "track_food_order", { orderId: "{{order_id}}" }),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "get_food_delivery_status", { orderId: "{{order_id}}" }, "Widget-only poller -- returns epoch timestamps/cadence hints, not readable text. Use track_food_order for anything conversational."),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "get_food_orders", { addressId: "{{address_id}}" }, "Confirmed live this session: returns real delivered-order history, not just active orders as the reference doc's one-line description implies."),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "get_food_order_details", { orderId: "{{order_id}}" }),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "get_addresses", { page: 1, pageSize: 10 }, "Paginates -- structuredContent.pagination.{page,pageSize,total,totalPages,hasMore}. Shared with Instamart; Dineout uses a separate get_saved_locations."),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "create_address", { latitude: "{{latitude}}", longitude: "{{longitude}}", addressLine: "Example Street, Example Area", addressTag: "Test" }, "Not in the reference doc's Food table at all -- confirmed live to exist (CLAUDE.md's tool-inventory spot-check)."),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "delete_address", { addressId: "{{address_id}}" }, "DESTRUCTIVE -- deletes a real saved address. Double-check address_id before running."),
    mcpCall("food", "swiggy_food_base", "swiggy_food_token", "report_error", { description: "Test error report sent from Postman" }),
  ],
);

// ---------------------------------------------------------------------------
// Instamart server
// ---------------------------------------------------------------------------
const instamartFolder = folder(
  "Instamart server (doc: 19 tools -- live count was 16, unresolved)",
  "https://mcp.swiggy.com/im. The reference doc lists 19 tools; a live tools/list call earlier this session returned 16 and the full list wasn't captured at the time -- treat every tool below as unconfirmed until you re-run tools/list yourself. list_coupons/apply_coupon are GATED (whitelisted accounts only per the doc).",
  [
    mcpToolsList("swiggy_im_base", "swiggy_im_token"),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "search_products", { addressId: "{{address_id}}", query: "milk" }, "Returns products WITH variants (pack sizes/quantities) -- you need the spinId+skuId from a variation before update_cart."),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "your_go_to_items", { addressId: "{{address_id}}" }, "Confirmed live this session: real, populated data -- frequently/recently ordered items. Closest thing to a pantry signal."),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "get_addresses", { page: 1, pageSize: 10 }),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "create_address", { latitude: "{{latitude}}", longitude: "{{longitude}}", addressLine: "Example Street, Example Area", addressTag: "Test" }),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "delete_address", { addressId: "{{address_id}}" }, "DESTRUCTIVE."),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "update_cart", { addressId: "{{address_id}}", items: [{ spinId: "{{spin_id}}", skuId: "{{sku_id}}", quantity: 1 }] }, "REPLACES the entire cart with the items given -- not an append. Read-merge-write if you want to add to an existing cart."),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "get_cart", { addressId: "{{address_id}}" }, "Real total lives at structuredContent.data.pricing / cartTotalAmount -- check the actual shape, don't assume."),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "clear_cart", { addressId: "{{address_id}}" }),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "list_coupons", { addressId: "{{address_id}}" }, "GATED -- whitelisted accounts only."),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "apply_coupon", { addressId: "{{address_id}}", couponCode: "WELCOME50" }, "GATED -- whitelisted accounts only."),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "get_payment_options", { addressId: "{{address_id}}" }),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "check_payment_status", { orderId: "{{order_id}}" }),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "confirm_order", { orderId: "{{order_id}}" }),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "checkout", { addressId: "{{address_id}}", paymentMethod: "COD" }, "MUTATING -- places AND confirms the grocery order in one call. ₹1000 sandbox cap. Never fall back to a proxy/guessed cart total when this drives a spend decision -- throw instead (see CLAUDE.md's 2026-08-26 hard-rule entry, born from a real ₹0-vs-real-total near miss)."),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "track_order", { orderId: "{{order_id}}" }),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "get_delivery_status", { orderId: "{{order_id}}" }, "Widget-only poller, same caveat as Food's get_food_delivery_status."),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "get_orders", {}, "Confirmed live this session: works with NO required args, defaults to a 15-day lookback window. Returns real order history + preferences."),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "get_order_details", { orderId: "{{order_id}}" }),
    mcpCall("im", "swiggy_im_base", "swiggy_im_token", "report_error", { description: "Test error report sent from Postman" }),
  ],
);

// ---------------------------------------------------------------------------
// Dineout server
// ---------------------------------------------------------------------------
const dineoutFolder = folder(
  "Dineout server (doc: 11 tools -- only 10 documented, gap unresolved)",
  "https://mcp.swiggy.com/dineout. FREE reservations only (isFree=true, bookingPrice=0) -- book_table rejects paid deals. Address ID space is NOT separate from Food/Instamart despite the reference doc's claim -- get_saved_locations returned the identical home-address ID as Food's get_addresses in this session's testing (see DECISIONS.md 2026-08-25).",
  [
    mcpToolsList("swiggy_dineout_base", "swiggy_dineout_token"),
    mcpCall("dineout", "swiggy_dineout_base", "swiggy_dineout_token", "get_saved_locations", {}),
    mcpCall("dineout", "swiggy_dineout_base", "swiggy_dineout_token", "search_restaurants_dineout", { query: "Italian", latitude: "{{latitude}}", longitude: "{{longitude}}" }, "Confirmed live this session: accepts addressId OR raw latitude/longitude directly -- does not geocode area names itself. structuredContent is empty; real data is text-only in content[0].text (numbered list + \"Search coordinates: latitude=..., longitude=...\")."),
    mcpCall("dineout", "swiggy_dineout_base", "swiggy_dineout_token", "get_restaurant_details", { restaurantId: "{{restaurant_id}}", latitude: "{{latitude}}", longitude: "{{longitude}}" }),
    mcpCall("dineout", "swiggy_dineout_base", "swiggy_dineout_token", "get_available_slots", { restaurantId: "{{restaurant_id}}", latitude: "{{latitude}}", longitude: "{{longitude}}", date: "2026-08-28", partySize: 2 }, "Looks up to 7 days ahead. Real slot data lives under _meta.slots, NOT structuredContent -- confirmed live, a fourth distinct envelope shape. Takes latitude/longitude directly, not addressId."),
    mcpCall("dineout", "swiggy_dineout_base", "swiggy_dineout_token", "create_cart", { restaurantId: "{{restaurant_id}}", type: "DEAL_TICKET_PURCHASE" }, "Validates billToPay=0 and skipPayment for free bookings."),
    mcpCall("dineout", "swiggy_dineout_base", "swiggy_dineout_token", "book_table", { restaurantId: "{{restaurant_id}}", latitude: "{{latitude}}", longitude: "{{longitude}}", partySize: 2 }, "MUTATING -- books a real (free) table. See DECISIONS.md's 2026-08-25 Dineout-verification entry for the full corrected schema before using this for more than a smoke test."),
    mcpCall("dineout", "swiggy_dineout_base", "swiggy_dineout_token", "get_payment_options", {}, "Paid-reservation UPI stage -- N/A for free bookings."),
    mcpCall("dineout", "swiggy_dineout_base", "swiggy_dineout_token", "check_payment_status", { orderId: "{{order_id}}" }),
    mcpCall("dineout", "swiggy_dineout_base", "swiggy_dineout_token", "confirm_order", { orderId: "{{order_id}}" }),
    mcpCall("dineout", "swiggy_dineout_base", "swiggy_dineout_token", "get_booking_status", { bookingId: "{{booking_id}}" }, "Restaurant name, date, time, guests, deal title, status."),
    mcpCall("dineout", "swiggy_dineout_base", "swiggy_dineout_token", "report_error", { description: "Test error report sent from Postman" }, "UNCONFIRMED for Dineout specifically -- present on both Food and Instamart per the doc, but the Dineout table's 8 documented rows didn't show it. Run tools/list to check before relying on this."),
  ],
);

const mcpFolder = folder("Swiggy MCP", "The three Builders Club MCP servers, plus the manual OAuth flow that authenticates against them. Confirmed live: this project has always called the production-shaped mcp.swiggy.com URLs, never mcp-staging.swiggy.com -- see CLAUDE.md's 2026-08-26 entry.", [
  oauthFolder,
  foodFolder,
  instamartFolder,
  dineoutFolder,
]);

// ---------------------------------------------------------------------------
// Steward web app
// ---------------------------------------------------------------------------
const dashboardFolder = folder("Dashboard & actions", "Server-rendered HTML, no JSON API -- these return full pages. Useful for smoke-testing the app is up and routes don't 500.", [
  req("GET Dashboard", { method: "GET", url: "{{steward_base}}/" }),
  req("GET Timeline", { method: "GET", url: "{{steward_base}}/timeline" }),
  req("GET Architecture", { method: "GET", url: "{{steward_base}}/architecture" }),
  req("POST Approve proposal", { method: "POST", url: "{{steward_base}}/proposals/{{proposal_id}}/approve", description: "Tier B consent flow -- approves a pending proposal, triggering the real gated MCP mutation call (checkout/place_food_order/book_table). Confirm proposal_id is a real pending row first." }),
  req("POST Snooze proposal", { method: "POST", url: "{{steward_base}}/proposals/{{proposal_id}}/snooze", description: "Snoozes 4 hours (matches the mockup's simple flow)." }),
]);

const commitmentsFolder = folder("Settings — Commitments (Standing Plans)", "The real onboarding path for recurring Dineout commitments, replacing the old CLI script.", [
  req("GET Commitments page", { method: "GET", url: "{{steward_base}}/settings/commitments" }),
  req("GET Search restaurants (Dineout)", {
    method: "GET",
    url: "{{steward_base}}/settings/commitments/search?label=Test&dayOfWeek=5&timeOfDay=20:00&partySize=2&addressId={{address_id}}&query=biryani",
    description: "Backs the two-step form flow -- calls the real search_restaurants_dineout live.",
  }),
  req("POST Create commitment", {
    method: "POST",
    url: "{{steward_base}}/settings/commitments/create",
    body: urlencodedBody({
      label: "Test commitment (Postman)",
      dayOfWeek: 5,
      timeOfDay: "20:00",
      partySize: 2,
      addressId: "{{address_id}}",
      restaurantId: "{{restaurant_id}}",
      latitude: "{{latitude}}",
      longitude: "{{longitude}}",
    }),
    description: "Writes a real row to the commitments table. Standing Plans will try to book it on its next run -- delete via psql after testing if this was just a smoke test.",
  }),
]);

const watchedPeopleFolder = folder("Settings — Watched People (Dead Man's Switch)", "", [
  req("GET Watched People page", { method: "GET", url: "{{steward_base}}/settings/watched-people" }),
  req("POST Add watched person", {
    method: "POST",
    url: "{{steward_base}}/settings/watched-people",
    body: urlencodedBody({ name: "Test (Postman)", addressId: "{{address_id}}", quietThresholdHours: 48 }),
  }),
]);

const pantryFolder = folder("Settings — Pantry (Kitchen Entropy)", "", [
  req("GET Pantry page", { method: "GET", url: "{{steward_base}}/settings/pantry" }),
  req("POST Record purchase", {
    method: "POST",
    url: "{{steward_base}}/settings/pantry",
    body: urlencodedBody({ itemName: "Test item (Postman)", quantity: 1, unit: "unit", shelfLifeDays: 7 }),
  }),
]);

const staticAssetsFolder = folder("Static assets", "Sanity checks -- e.g. re-verifying the favicon.ico fallback fix.", [
  req("GET style.css", { method: "GET", url: "{{steward_base}}/style.css" }),
  req("GET favicon.png", { method: "GET", url: "{{steward_base}}/favicon.png" }),
  req("GET favicon.ico", { method: "GET", url: "{{steward_base}}/favicon.ico" }),
  req("GET steward-logo.png", { method: "GET", url: "{{steward_base}}/steward-logo.png" }),
]);

const stewardFolder = folder("Steward web app", "Requires `npm run web` running locally (default http://localhost:3000). All mutating routes here go through the real Action Gate / world-model code -- nothing here is a mock.", [
  dashboardFolder,
  commitmentsFolder,
  watchedPeopleFolder,
  pantryFolder,
  staticAssetsFolder,
]);

// ---------------------------------------------------------------------------
// Telegram Bot API
// ---------------------------------------------------------------------------
const telegramFolder = folder("Telegram Bot API", "The Standing Plans quick-add bot (src/telegram/). Runs long-polling (npm run telegram-bot), so getWebhookInfo should always show no webhook set -- if one appears, getUpdates will stop receiving messages until it's deleted.", [
  req("GET getMe", { method: "GET", url: "https://api.telegram.org/bot{{telegram_bot_token}}/getMe", description: "Sanity check the token is valid." }),
  req("GET getUpdates", { method: "GET", url: "https://api.telegram.org/bot{{telegram_bot_token}}/getUpdates", description: "Careful running this manually while the bot process is also polling -- Telegram only delivers each update once; concurrent getUpdates calls race on the offset." }),
  req("GET getWebhookInfo", { method: "GET", url: "https://api.telegram.org/bot{{telegram_bot_token}}/getWebhookInfo" }),
  req("POST sendMessage", {
    method: "POST",
    url: "https://api.telegram.org/bot{{telegram_bot_token}}/sendMessage",
    body: jsonBody({ chat_id: "{{telegram_chat_id}}", text: "commitment to Sigree in Bandra, Friday 8pm for 2" }),
    description: "Simulates what a user typing into the bot sends -- useful for testing parse-commitment.ts's extraction without needing to type on a phone.",
  }),
]);

const collection = {
  info: {
    _postman_id: "b3f1a1e0-0000-4000-8000-000000000000",
    name: "Steward — Household Daemons",
    description:
      "Everything testable in this project: the three Swiggy Builders Club MCP servers (Food/Instamart/Dineout) via raw JSON-RPC, the manual PKCE OAuth flow that authenticates against them, the Steward web app's own routes, and the Telegram quick-add bot.\n\nImport the companion Steward.postman_environment.json and select it before running anything -- request URLs/tokens are all environment variables, nothing is hardcoded.\n\nGenerated from this repo's own documented + live-verified findings (CLAUDE.md, DECISIONS.md, swiggy-mcp-reference.md) as of 2026-08-27 -- re-run tools/list before trusting exact tool counts, they've been wrong before (see the Instamart/Dineout folder descriptions for the two unresolved discrepancies).",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  item: [mcpFolder, stewardFolder, telegramFolder],
};

writeFileSync(new URL("./Steward.postman_collection.json", import.meta.url), JSON.stringify(collection, null, 2) + "\n");
console.log("Wrote Steward.postman_collection.json");
