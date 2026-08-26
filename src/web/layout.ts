function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export { esc };

export function layout(activeNav: "dashboard" | "timeline" | "approve", title: string, body: string): string {
  const navLink = (href: string, label: string, key: string) =>
    `<a href="${href}" class="${key === activeNav ? "active" : ""}">${label}</a>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Steward -- ${esc(title)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
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
        ${navLink("/approve", "Approve", "approve")}
      </nav>
    </div>
    <div class="main">
      ${body}
    </div>
  </div>
</body>
</html>`;
}
