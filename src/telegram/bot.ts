import { getUpdates, sendMessage, type TelegramMessage } from "./client.js";
import { parseCommitment, isCommitmentTrigger, type ParsedCommitment } from "./parse-commitment.js";
import { resolveArea, type AreaAnchor } from "./resolve-area.js";
import { fetchAllAddresses, type SavedAddress } from "../web/settings/addresses.js";
import { searchDineoutRestaurants, type RestaurantResult } from "../web/settings/dineout-search.js";
import { createCommitment } from "../world/commitments.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type PendingState =
  | { kind: "awaiting_area"; parsed: ParsedCommitment }
  | {
      kind: "awaiting_restaurant_pick";
      parsed: ParsedCommitment;
      anchor: AreaAnchor;
      restaurants: RestaurantResult[];
      latitude: number;
      longitude: number;
    }
  | {
      kind: "awaiting_address_confirm";
      parsed: ParsedCommitment;
      restaurant: RestaurantResult;
      latitude: number;
      longitude: number;
      savedAddresses: SavedAddress[];
    };

// Single-user personal system, one process -- an in-memory Map per chat is enough;
// no durability need for a conversation this short-lived.
const pending = new Map<number, PendingState>();

function missingFieldsMessage(parsed: ParsedCommitment): string | null {
  const missing: string[] = [];
  if (!parsed.query) missing.push("a restaurant or cuisine name");
  if (parsed.dayOfWeek === null) missing.push("a day of the week");
  if (parsed.timeOfDay === null) missing.push("a time");
  if (missing.length === 0) return null;
  return (
    `I need ${missing.join(" and ")} to set this up. Try something like:\n` +
    `"commitment to Sigree in Bandra, Friday 8pm for 2"`
  );
}

async function startSearch(chatId: number, parsed: ParsedCommitment, anchor: AreaAnchor): Promise<void> {
  const location = anchor.kind === "address" ? { addressId: anchor.addressId } : { latitude: anchor.latitude, longitude: anchor.longitude };
  const { restaurants, latitude, longitude } = await searchDineoutRestaurants(location, parsed.query!);

  if (restaurants.length === 0) {
    await sendMessage(chatId, `No Dineout-bookable places found for "${parsed.query}" near ${anchor.label}. Try a different name?`);
    return;
  }

  // Prefer the search response's own resolved coordinates (same value the existing web
  // Settings flow stores) -- fall back to the anchor's coordinates only if the tool
  // didn't echo any back.
  const resolvedLat = latitude ?? (anchor.kind === "coordinates" ? anchor.latitude : 0);
  const resolvedLng = longitude ?? (anchor.kind === "coordinates" ? anchor.longitude : 0);

  const top = restaurants.slice(0, 5);
  const list = top.map((r, i) => `${i + 1}. ${r.name}`).join("\n");
  pending.set(chatId, { kind: "awaiting_restaurant_pick", parsed, anchor, restaurants: top, latitude: resolvedLat, longitude: resolvedLng });
  await sendMessage(chatId, `Found these near ${anchor.label}:\n${list}\n\nReply with a number, or "cancel".`);
}

async function finalizeCommitment(
  chatId: number,
  parsed: ParsedCommitment,
  restaurant: RestaurantResult,
  addressId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  const label = `${restaurant.name} (via Telegram)`;
  const commitment = await createCommitment({
    label,
    dayOfWeek: parsed.dayOfWeek!,
    timeOfDay: parsed.timeOfDay!,
    partySize: parsed.partySize ?? 2,
    addressId,
    restaurantId: restaurant.id,
    latitude,
    longitude,
  });
  pending.delete(chatId);
  console.log(`[telegram] commitment ${commitment.id} created: ${restaurant.name}, ${DAY_NAMES[commitment.dayOfWeek]} ${commitment.timeOfDay}`);
  await sendMessage(
    chatId,
    `Standing Plan created: ${restaurant.name}, every ${DAY_NAMES[commitment.dayOfWeek]} at ${commitment.timeOfDay.slice(0, 5)} for ${commitment.partySize}. Standing Plans will book it automatically when a free slot matches.`,
  );
}

async function handleAwaitingArea(chatId: number, text: string, state: Extract<PendingState, { kind: "awaiting_area" }>): Promise<void> {
  const savedAddresses = await fetchAllAddresses();
  const anchor = resolveArea(text, savedAddresses);
  if (!anchor) {
    const tags = savedAddresses.map((a) => a.addressTag || a.addressCategory).join(", ");
    await sendMessage(chatId, `Still don't recognize "${text}". Your saved areas: ${tags}. Or try a major city/area name.`);
    return;
  }
  await startSearch(chatId, state.parsed, anchor);
}

async function handleAwaitingRestaurantPick(
  chatId: number,
  text: string,
  state: Extract<PendingState, { kind: "awaiting_restaurant_pick" }>,
): Promise<void> {
  if (/^cancel$/i.test(text.trim())) {
    pending.delete(chatId);
    await sendMessage(chatId, "Cancelled.");
    return;
  }
  const idx = Number(text.trim()) - 1;
  const restaurant = state.restaurants[idx];
  if (!restaurant) {
    await sendMessage(chatId, `Pick a number from 1 to ${state.restaurants.length}, or "cancel".`);
    return;
  }

  if (state.anchor.kind === "address") {
    // Search was already anchored to a real saved address -- reuse it directly, no extra round-trip.
    await finalizeCommitment(chatId, state.parsed, restaurant, state.anchor.addressId, state.latitude, state.longitude);
    return;
  }

  // Search was anchored by a known-area lookup, not a saved address -- the commitments
  // table's address_id still needs a real saved address on record, so ask which one.
  const savedAddresses = await fetchAllAddresses();
  pending.set(chatId, {
    kind: "awaiting_address_confirm",
    parsed: state.parsed,
    restaurant,
    latitude: state.latitude,
    longitude: state.longitude,
    savedAddresses,
  });
  const list = savedAddresses.map((a, i) => `${i + 1}. ${a.addressTag || a.addressCategory}`).join("\n");
  await sendMessage(chatId, `Which of your saved addresses should this be booked under?\n${list}`);
}

async function handleAwaitingAddressConfirm(
  chatId: number,
  text: string,
  state: Extract<PendingState, { kind: "awaiting_address_confirm" }>,
): Promise<void> {
  const idx = Number(text.trim()) - 1;
  const address = state.savedAddresses[idx];
  if (!address) {
    await sendMessage(chatId, `Pick a number from 1 to ${state.savedAddresses.length}.`);
    return;
  }
  await finalizeCommitment(chatId, state.parsed, state.restaurant, address.id, state.latitude, state.longitude);
}

async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const text = message.text ?? "";
  const state = pending.get(chatId);

  if (state) {
    if (state.kind === "awaiting_area") return handleAwaitingArea(chatId, text, state);
    if (state.kind === "awaiting_restaurant_pick") return handleAwaitingRestaurantPick(chatId, text, state);
    if (state.kind === "awaiting_address_confirm") return handleAwaitingAddressConfirm(chatId, text, state);
  }

  if (!isCommitmentTrigger(text)) {
    await sendMessage(chatId, 'To add a Standing Plan, message me like: "commitment to Sigree in Bandra, Friday 8pm for 2"');
    return;
  }

  const parsed = parseCommitment(text);
  const missing = missingFieldsMessage(parsed);
  if (missing) {
    await sendMessage(chatId, missing);
    return;
  }

  const savedAddresses = await fetchAllAddresses();
  if (parsed.areaHint) {
    const anchor = resolveArea(parsed.areaHint, savedAddresses);
    if (!anchor) {
      pending.set(chatId, { kind: "awaiting_area", parsed });
      const tags = savedAddresses.map((a) => a.addressTag || a.addressCategory).join(", ");
      await sendMessage(chatId, `Don't recognize "${parsed.areaHint}". Your saved areas: ${tags}. Or try a major city/area name.`);
      return;
    }
    await startSearch(chatId, parsed, anchor);
    return;
  }

  // No area given -- fall back to a "home"-tagged saved address if there is one, else ask.
  const home = savedAddresses.find((a) => /home/i.test(a.addressTag || a.addressCategory || ""));
  if (home) {
    await startSearch(chatId, parsed, { kind: "address", addressId: home.id, label: home.addressTag || "home" });
    return;
  }
  pending.set(chatId, { kind: "awaiting_area", parsed });
  await sendMessage(chatId, "Which area? (no home address on file to default to)");
}

/**
 * Long-polling loop. No public server/webhook needed -- appropriate for a personal,
 * single-user bot running on a dev machine, same reasoning as the daemons running via
 * pg-boss rather than an inbound HTTP surface.
 */
export async function runTelegramBot(): Promise<never> {
  console.log("[telegram] Steward bot polling for messages...");
  let offset = 0;
  for (;;) {
    let updates;
    try {
      updates = await getUpdates(offset);
    } catch (err) {
      console.error("[telegram] getUpdates failed, retrying in 5s:", err);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    for (const update of updates) {
      offset = update.update_id + 1;
      if (!update.message?.text) continue;
      try {
        await handleMessage(update.message);
      } catch (err) {
        console.error("[telegram] error handling message:", err);
        await sendMessage(update.message.chat.id, "Something went wrong on my end -- try again.").catch(() => {});
      }
    }
  }
}
