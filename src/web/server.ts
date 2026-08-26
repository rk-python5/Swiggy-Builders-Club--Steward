import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderDashboard } from "./dashboard.js";
import { renderTimeline } from "./timeline.js";
import { renderArchitecture } from "./architecture.js";
import { approveProposal, snoozeProposal } from "../actions/gate.js";
import { renderCommitmentsPage, renderCommitmentsSearchResults, createCommitmentFromForm } from "./settings/commitments.js";
import { renderWatchedPeoplePage, createWatchedPersonFromForm } from "./settings/watched-people.js";
import { renderPantryPage, recordPurchaseFromForm } from "./settings/pantry.js";

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

// Settings -- replaces the CLI scripts (add-commitment, add-watched-person,
// record-purchase) with real, frontend-driven onboarding.
app.get("/settings", (_req, res) => res.redirect("/settings/commitments"));

app.get("/settings/commitments", async (req, res) => {
  res.send(await renderCommitmentsPage(req.query.created === "1"));
});
app.get("/settings/commitments/search", async (req, res) => {
  res.send(await renderCommitmentsSearchResults(req.query as Record<string, string>));
});
app.post("/settings/commitments/create", async (req, res) => {
  await createCommitmentFromForm(req.body);
  res.redirect("/settings/commitments?created=1");
});

app.get("/settings/watched-people", async (req, res) => {
  res.send(await renderWatchedPeoplePage(req.query.created === "1"));
});
app.post("/settings/watched-people", async (req, res) => {
  await createWatchedPersonFromForm(req.body);
  res.redirect("/settings/watched-people?created=1");
});

app.get("/settings/pantry", async (req, res) => {
  res.send(await renderPantryPage(req.query.created === "1"));
});
app.post("/settings/pantry", async (req, res) => {
  await recordPurchaseFromForm(req.body);
  res.redirect("/settings/pantry?created=1");
});

app.listen(PORT, () => {
  console.log(`[web] Steward running at http://localhost:${PORT}`);
});
