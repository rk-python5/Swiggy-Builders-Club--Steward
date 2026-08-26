import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderDashboard } from "./dashboard.js";
import { renderTimeline } from "./timeline.js";
import { renderArchitecture } from "./architecture.js";
import { approveProposal, snoozeProposal } from "../actions/gate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.WEB_PORT ?? 3000);

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", async (_req, res) => {
  res.send(await renderDashboard());
});

app.get("/timeline", async (_req, res) => {
  res.send(await renderTimeline());
});

app.get("/architecture", async (_req, res) => {
  res.send(await renderArchitecture());
});

// Review lives as a modal on the Dashboard (matching the mockup), not a separate page --
// both actions redirect back there.
app.post("/proposals/:id/approve", async (req, res) => {
  await approveProposal(Number(req.params.id));
  res.redirect("/");
});

app.post("/proposals/:id/snooze", async (req, res) => {
  const until = new Date(Date.now() + 4 * 3600_000); // snooze 4 hours, matching the mockup's simple flow
  await snoozeProposal(Number(req.params.id), until);
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`[web] Steward running at http://localhost:${PORT}`);
});
