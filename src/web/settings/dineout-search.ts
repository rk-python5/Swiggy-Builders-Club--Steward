import { callTool } from "../../mcp/client.js";

export interface RestaurantResult {
  id: string;
  name: string;
}

interface SearchResult {
  content: { type: string; text: string }[];
}

/**
 * search_restaurants_dineout's real data lives ONLY in the text block --
 * structuredContent is empty (verified live 2026-08-25, see DECISIONS.md). This parses
 * the numbered-list text format rather than pretending there's structured data to read.
 */
export async function searchDineoutRestaurants(
  addressId: string,
  query: string,
): Promise<{ restaurants: RestaurantResult[]; latitude: number | null; longitude: number | null }> {
  const result = await callTool<SearchResult>("dineout", "search_restaurants_dineout", { addressId, query });
  const text = result.content?.[0]?.text ?? "";

  const restaurants: RestaurantResult[] = [];
  const lineRe = /^\d+\.\s+(.+?)\s+—.*\(ID:\s*(\d+)\)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text))) {
    restaurants.push({ name: m[1].replace(/\(Ad\)\s*$/, "").trim(), id: m[2] });
  }

  const coordMatch = text.match(/Search coordinates:\s*latitude=([\d.-]+),\s*longitude=([\d.-]+)/);
  return {
    restaurants,
    latitude: coordMatch ? Number(coordMatch[1]) : null,
    longitude: coordMatch ? Number(coordMatch[2]) : null,
  };
}
