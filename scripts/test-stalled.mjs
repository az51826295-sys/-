// Free check for the stalled-work detector. No model calls.
import { runDetectors } from "../src/lib/intelligence/detectors.ts";

const base = {
  capturedAt: new Date().toISOString(),
  departments: [], employees: [],
  review: { awaiting: 0, oldestWaitingDays: 0, blockedByStandards: 0 },
  quality: { reviewed: 0, changesRequested: 0, changeRequests: [] },
  learning: { pendingCandidates: 0, proposedPlaybookChanges: 0 },
  projects: { active: 0, awaitingApproval: 0 },
};

const run = (label, stalled) => {
  const out = runDetectors({ ...base, stalled }).filter(
    (i) => i.signalKey === "stalled_work",
  );
  console.log(`\n${label} -> ${out.length}${out[0] ? " · " + out[0].severity : ""}`);
  out.forEach((i) => console.log("   " + i.title + " — " + i.summary.slice(0, 110)));
};

run("running 20 min (normal)", [{ title: "Competitor pricing", hours: 0 }]);
run("running 3 hours", [{ title: "Competitor pricing", hours: 3 }]);
run("running 2 days", [{ title: "Japan market entry", hours: 50 }]);
run("two stuck", [
  { title: "Japan market entry", hours: 50 },
  { title: "Q4 retention", hours: 6 },
]);
