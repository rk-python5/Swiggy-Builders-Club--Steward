// Real SVG paths extracted from the Claude Design mockup's rendered DOM (Steward Web.html),
// not approximated with emoji or a generic icon set.
const PATHS: Record<string, string> = {
  clock: '<path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-14v4l3 2"/>',
  layers: '<path d="M12 2l9 5-9 5-9-5 9-5zm-9 9l9 5 9-5m-18 5l9 5 9-5"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6zm-3.3 9a1.7 1.7 0 0 1-3.4 0"/>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  plug: '<path d="M22 9.5l-2 2m-9.5-9.5l2-2m5 12.5l-8-8m8 8s-1.5 1.5-4 1.5S8 12 8 12l-4 4 4 4 4-4s2.5 2.5 2.5 0 1.5-4 1.5-4"/>',
  monitor: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8m-4-3v3"/>',
};

export function icon(name: string, colorVar: string, size = 20): string {
  const path = PATHS[name] ?? PATHS.bell;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${colorVar}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
