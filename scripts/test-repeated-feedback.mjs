// Throwaway check for the repeated-feedback detector. Free: no model calls.
import { runDetectors } from "../src/lib/intelligence/detectors.ts";

const base = {
  capturedAt: new Date().toISOString(),
  departments: [],
  employees: [],
  review: { awaiting: 0, oldestWaitingDays: 0, blockedByStandards: 0 },
  learning: { pendingCandidates: 0, proposedPlaybookChanges: 0 },
  projects: { active: 0, awaitingApproval: 0 },
};

const run = (label, changeRequests) => {
  const out = runDetectors({
    ...base,
    quality: {
      reviewed: changeRequests.length,
      changesRequested: changeRequests.length,
      changeRequests,
    },
  }).filter((i) => i.signalKey.startsWith("repeated_feedback"));
  console.log(`\n${label} -> ${out.length} insight(s)`);
  out.forEach((i) => console.log("   " + i.summary.slice(0, 160)));
};

run("2 requests (below threshold)", [
  "출처를 반드시 각 회사 공식 가격 페이지에서 직접 확인해줘",
  "출처를 각 회사 공식 가격 페이지에서 확인해줘",
]);

run("3 Korean, same request", [
  "출처를 반드시 각 회사 공식 가격 페이지에서 직접 확인해줘",
  "출처를 각 회사 공식 가격 페이지에서 확인해줘",
  "출처를 각 회사 공식 가격 페이지에서 직접 확인해줘 블로그 말고",
]);

run("3 Korean, all different", [
  "출처를 공식 가격 페이지에서 확인해줘",
  "표로 정리하고 통화 단위를 원화로 바꿔줘",
  "결론을 맨 앞에 써줘 요약이 너무 길어",
]);

run("3 English, same request", [
  "Please cite the vendor's own pricing page, not a comparison blog",
  "Cite the vendor's own pricing page rather than a comparison blog",
  "Use the vendor's own pricing page for every price, not a blog",
]);
