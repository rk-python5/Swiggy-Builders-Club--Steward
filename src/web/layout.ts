function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export { esc };

// Nav is Dashboard / Timeline / Architecture / Settings. Approve is not a nav
// destination in the design, it's a modal triggered from a Dashboard card's Review
// button (see dashboard.ts).
export function layout(
  activeNav: "dashboard" | "timeline" | "architecture" | "settings",
  title: string,
  body: string,
): string {
  const navLink = (href: string, label: string, key: string) =>
    `<a href="${href}" class="${key === activeNav ? "active" : ""}">${label}</a>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Steward -- ${esc(title)}</title>
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Mono:wght@700&display=swap">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="layout">
    <div class="sidebar">
      <img class="brand-logo" src="/steward-logo.png" alt="Steward" width="65" height="106">
      <!-- Swiggy's own logo asset isn't reachable from this environment (network access
           is scoped to mcp.swiggy.com, not their marketing site) -- their real, widely
           documented brand orange is used for the wordmark instead of a fabricated
           logo shape. -->
      <div class="powered-by">Powered by <span class="swiggy-word">Swiggy</span></div>
      <nav class="nav">
        ${navLink("/", "Dashboard", "dashboard")}
        ${navLink("/timeline", "Timeline", "timeline")}
        ${navLink("/architecture", "Architecture", "architecture")}
        ${navLink("/settings", "Settings", "settings")}
      </nav>
    </div>
    <div class="main">
      ${body}
    </div>
  </div>
</body>
</html>`;
}
