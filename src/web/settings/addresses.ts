import { callTool } from "../../mcp/client.js";

export interface SavedAddress {
  id: string;
  addressLine: string;
  addressCategory: string;
  addressTag: string;
}

interface AddressesResult {
  structuredContent: {
    addresses: SavedAddress[];
    pagination?: { hasMore: boolean };
  };
}

/**
 * Fetches every saved address across all pages (get_addresses paginates, 10 per page --
 * verified live in Phase 0). Backs both the Commitments and Watched People settings
 * forms: this is the real answer to "how do we know who the other person is" -- Swiggy
 * already lets one account hold multiple people's addresses (tagged "Maa", "Work",
 * "Friends & Family", etc.), so the picker is just this list, not a new contacts system.
 */
export async function fetchAllAddresses(): Promise<SavedAddress[]> {
  const all: SavedAddress[] = [];
  let page = 1;
  for (;;) {
    const result = await callTool<AddressesResult>("food", "get_addresses", { page, pageSize: 10 });
    all.push(...result.structuredContent.addresses);
    if (!result.structuredContent.pagination?.hasMore) break;
    page += 1;
  }
  return all;
}
