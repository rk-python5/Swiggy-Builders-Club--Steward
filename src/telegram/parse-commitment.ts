/**
 * Rule-based extraction for free-text commitment declarations, e.g.
 * "commitment to Sigree in Bandra, Friday 8pm for 2".
 *
 * Deliberately not an LLM call (chosen over that for v1: no new API key, no external
 * latency/cost on every message). Weaker on genuinely loose phrasing than an LLM parser
 * would be -- by design, every field this can't confidently extract comes back null
 * rather than guessed, and the bot always echoes what it understood before searching so
 * a bad parse gets caught by the user, not silently turned into a wrong commitment.
 */
export interface ParsedCommitment {
  query: string | null; // restaurant name / cuisine, passed to search_restaurants_dineout
  areaHint: string | null; // free-text area/landmark, e.g. "Bandra"
  dayOfWeek: number | null; // 0=Sunday .. 6=Saturday
  timeOfDay: string | null; // "HH:MM:00"
  partySize: number | null;
}

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const TRIGGER_RE = /^\/?commitment\b\s*(?:to|:)?\s*/i;

function extractDayOfWeek(text: string): { dayOfWeek: number | null; rest: string } {
  const re = new RegExp(`\\b(${Object.keys(DAY_NAMES).join("|")})\\b`, "i");
  const m = text.match(re);
  if (!m) return { dayOfWeek: null, rest: text };
  return { dayOfWeek: DAY_NAMES[m[1].toLowerCase()], rest: text.replace(re, " ").replace(/\bevery\b/gi, " ") };
}

function extractTime(text: string): { timeOfDay: string | null; rest: string } {
  const m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ?? text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!m) return { timeOfDay: null, rest: text };

  let hour: number;
  let minute: number;
  if (m[3]) {
    // 12-hour form: "8pm", "7:30 am"
    hour = Number(m[1]) % 12;
    minute = m[2] ? Number(m[2]) : 0;
    if (/pm/i.test(m[3])) hour += 12;
  } else {
    hour = Number(m[1]);
    minute = Number(m[2]);
  }
  const timeOfDay = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  return { timeOfDay, rest: text.replace(m[0], " ") };
}

function extractPartySize(text: string): { partySize: number | null; rest: string } {
  const m =
    text.match(/\bfor\s+(\d{1,2})\s*(?:people|ppl|pax)?\b/i) ??
    text.match(/\bparty of\s+(\d{1,2})\b/i) ??
    text.match(/\b(\d{1,2})\s*(?:people|ppl|pax)\b/i);
  if (!m) return { partySize: null, rest: text };
  return { partySize: Number(m[1]), rest: text.replace(m[0], " ") };
}

function extractArea(text: string): { areaHint: string | null; rest: string } {
  const m = text.match(/\bin\s+([A-Za-z][A-Za-z\s]{1,40}?)(?=,|$|\s+(?:every|on|at|for)\b)/i);
  if (!m) return { areaHint: null, rest: text };
  return { areaHint: m[1].trim(), rest: text.replace(m[0], " ") };
}

export function parseCommitment(rawText: string): ParsedCommitment {
  let text = rawText.replace(TRIGGER_RE, "").trim();

  const day = extractDayOfWeek(text);
  text = day.rest;
  const time = extractTime(text);
  text = time.rest;
  const party = extractPartySize(text);
  text = party.rest;
  const area = extractArea(text);
  text = area.rest;

  const query = text
    .replace(/[,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    query: query.length > 0 ? query : null,
    areaHint: area.areaHint,
    dayOfWeek: day.dayOfWeek,
    timeOfDay: time.timeOfDay,
    partySize: party.partySize,
  };
}

export function isCommitmentTrigger(text: string): boolean {
  return TRIGGER_RE.test(text.trim());
}
