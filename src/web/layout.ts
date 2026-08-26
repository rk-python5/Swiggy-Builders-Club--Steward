function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export { esc };

// Nav is Dashboard / Timeline / Architecture, matching the mockup exactly -- Approve is
// not a nav destination in the design, it's a modal triggered from a Dashboard card's
// Review button (see dashboard.ts). An earlier version wrongly put "Approve" in the nav
// where "Architecture" belongs.
export function layout(activeNav: "dashboard" | "timeline" | "architecture", title: string, body: string): string {
  const navLink = (href: string, label: string, key: string) =>
    `<a href="${href}" class="${key === activeNav ? "active" : ""}">${label}</a>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Steward -- ${esc(title)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Mono:wght@700&display=swap">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="layout">
    <div class="sidebar">
      <h1>Steward</h1>
      <div class="powered-by">Powered by <strong>Swiggy</strong></div>
      <nav class="nav">
        ${navLink("/", "Dashboard", "dashboard")}
        ${navLink("/timeline", "Timeline", "timeline")}
        ${navLink("/architecture", "Architecture", "architecture")}
      </nav>
    </div>
    <div class="main">
      ${body}
    </div>
  </div>
</body>
</html>`;
}
