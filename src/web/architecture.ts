import { layout, esc } from "./layout.js";
import { icon } from "./icons.js";

// Ported directly from the mockup's own DOMAINS array (extracted from Steward Web.html's
// rendered DOM source), not re-derived from memory.
const DOMAINS = [
  {
    n: "01",
    name: "MCP Session Layer",
    icon: "key",
    badgeLabel: "Spine",
    owns: "OAuth+PKCE, refresh, three separate per-server clients.",
    hard: "A daemon firing at 3am can't do a browser handoff — headless refresh has to actually work, persisted to the DB.",
  },
  {
    n: "02",
    name: "Scheduler",
    icon: "clock",
    badgeLabel: "Spine",
    owns: "Cron + event triggers, run history, idempotency.",
    hard: "place_food_order is not idempotent. A retried job that double-orders is the worst class of bug this system can ship.",
  },
  {
    n: "03",
    name: "World Model",
    icon: "layers",
    badgeLabel: "Spine",
    owns: "Pantry beliefs, commitments, people, addresses.",
    hard: "Nothing is directly observed. Purchases are seen; consumption is inferred, and that inference has to carry honest uncertainty.",
  },
  {
    n: "04",
    name: "Action Gate",
    icon: "lock",
    badgeLabel: "Gate",
    owns: "The single mutation path — both tiers, dry-run mode.",
    hard: "Every daemon must go through it. If mutation logic leaks into individual daemons, the safety model stops being true.",
    highlight: true,
  },
  {
    n: "05",
    name: "Daemons",
    icon: "plug",
    badgeLabel: "Pluggable",
    owns: "Trigger → proposal → terminal action.",
    hard: "Deliberately the easy part, once the four domains above exist.",
    dashed: true,
  },
  {
    n: "06",
    name: "Surface",
    icon: "monitor",
    badgeLabel: "Thin",
    owns: "Timeline, one-tap confirm, notifications.",
    hard: "Kept deliberately thin and built last, so it never becomes the thing the differentiation rests on.",
  },
];

export async function renderArchitecture(): Promise<string> {
  const cards = DOMAINS.map((d) => {
    const cls = ["arch-card", d.highlight ? "highlight" : "", d.dashed ? "dashed" : ""].filter(Boolean).join(" ");
    const iconColor = d.highlight ? "var(--white)" : "var(--swiggy-orange-dark)";
    // Border-top accent groups domains by category (Spine/Gate/Pluggable/Thin) -- same
    // "color = relationship" language the Dashboard already uses for Tier A/B, rather
    // than absolutely-positioned connector lines between non-adjacent grid cells, which
    // can't be visually verified reliably in this environment (screenshot tooling has
    // been unreliable this session -- see the plan's verification note).
    const categoryColor = d.highlight ? "" : d.dashed ? "var(--stone-300)" : d.badgeLabel === "Thin" ? "var(--ink-400)" : "var(--swiggy-orange-dark)";
    const borderStyle = categoryColor ? `border-top:3px solid ${categoryColor};` : "";
    return `<div class="${cls}" style="${borderStyle}">
      <div class="card-top">
        <div class="icon-tile ${d.highlight ? "spine" : ""}" style="${d.highlight ? "" : "background:var(--swiggy-orange-soft)"}">${icon(d.icon, iconColor)}</div>
        <span class="pill" style="background:${d.highlight ? "rgba(255,255,255,0.2)" : "var(--swiggy-orange-soft)"};color:${d.highlight ? "var(--white)" : "var(--swiggy-orange-dark)"}">${esc(d.badgeLabel)}</span>
      </div>
      <div class="arch-domain">DOMAIN ${d.n}</div>
      <div class="arch-name">${esc(d.name)}</div>
      <div class="arch-domain" style="margin-top:10px">OWNS</div>
      <div class="arch-owns">${esc(d.owns)}</div>
      <div class="divider"></div>
      <div class="arch-hard-label">THE HARD PART</div>
      <div class="arch-owns">${esc(d.hard)}</div>
    </div>`;
  }).join("\n");

  const body = `
    <div class="arch-eyebrow">Swiggy Builders Club &middot; Household Daemons</div>
    <div class="arch-display">Architecture</div>
    <p class="arch-intro">Six domains, split along what has to be uniform (spine, consent, safety) versus what is allowed to vary (individual daemon logic).</p>
    <div class="arch-grid">${cards}</div>
  `;

  return layout("architecture", "Architecture", body);
}
