export function settingsTabs(active: "commitments" | "watched-people" | "pantry"): string {
  const tab = (href: string, label: string, key: string) =>
    `<a href="${href}" class="${key === active ? "active" : ""}">${label}</a>`;
  return `<div class="settings-tabs">
    ${tab("/settings/commitments", "Standing Plans", "commitments")}
    ${tab("/settings/watched-people", "Dead Man's Switch", "watched-people")}
    ${tab("/settings/pantry", "Kitchen Entropy", "pantry")}
  </div>`;
}
