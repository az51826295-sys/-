import type { CompanySnapshot } from "@/lib/intelligence/snapshot";
import type { Insight, Severity } from "@/lib/intelligence/types";
import { normalizeForComparison, similarity } from "@/lib/memory/validation";

/**
 * What the company can notice about itself.
 *
 * Each detector answers one question with arithmetic and stops. Deliberately
 * not one big function: adding a thing worth watching should be an entry here,
 * and a detector that turns out to cry wolf can be removed without touching the
 * others.
 *
 * Every one of these returns a fact. "Marketing has nine pieces of work waiting
 * and one person free" is a fact. "Marketing is overloaded" is a judgement, and
 * judgements live in recommendations where the manager can disagree with them.
 */
export interface DetectorResult {
  category: Insight["category"];
  title: string;
  summary: string;
  measurements: Record<string, number | string>;
  severity: Severity;
  signalKey: string;
  subjectType: Insight["subjectType"];
  subjectId: string | null;
}

export interface InsightDetector {
  id: string;
  run(snapshot: CompanySnapshot): DetectorResult[];
}

/** Work waiting on a department with nobody free to pick it up. */
const departmentBacklog: InsightDetector = {
  id: "department_backlog",
  run(snapshot) {
    return snapshot.departments
      .filter((department) => department.waitingCount > 0)
      .map((department) => {
        const perPerson =
          department.memberCount > 0
            ? department.waitingCount / department.memberCount
            : department.waitingCount;

        // Thresholds are per person, not absolute. Four pieces of work waiting
        // is an afternoon for a department of four and a fortnight for one.
        const severity: Severity =
          department.readyCount === 0 && perPerson >= 3
            ? "high"
            : department.readyCount === 0 && perPerson >= 1
              ? "medium"
              : "low";

        return {
          category: "capacity" as const,
          title: `${department.name} has work waiting`,
          summary:
            department.readyCount === 0
              ? `${department.waitingCount} ${department.waitingCount === 1 ? "piece" : "pieces"} of work waiting and nobody free in ${department.name}.`
              : `${department.waitingCount} waiting in ${department.name}, with ${department.readyCount} free to pick it up.`,
          measurements: {
            waiting: department.waitingCount,
            people: department.memberCount,
            free: department.readyCount,
            waitingPerPerson: Number(perPerson.toFixed(1)),
          },
          severity,
          signalKey: `department_backlog:${department.id}`,
          subjectType: "department" as const,
          subjectId: department.id,
        };
      });
  },
};

/** A department with people free and nothing to do. */
const departmentIdle: InsightDetector = {
  id: "department_idle",
  run(snapshot) {
    // Only reported when some other department has work waiting. A quiet
    // department is not a problem by itself — it is only interesting next to a
    // busy one, and reporting it alone would read as an accusation.
    const somebodyBusy = snapshot.departments.some(
      (department) => department.waitingCount > 0,
    );
    if (!somebodyBusy) return [];

    return snapshot.departments
      .filter(
        (department) =>
          department.memberCount > 0 &&
          department.waitingCount === 0 &&
          department.activeAssignments === 0 &&
          department.readyCount === department.memberCount,
      )
      .map((department) => ({
        category: "capacity" as const,
        title: `${department.name} has spare capacity`,
        summary: `Everyone in ${department.name} is free and nothing is queued for them.`,
        measurements: { people: department.memberCount, free: department.readyCount },
        severity: "info" as const,
        signalKey: `department_idle:${department.id}`,
        subjectType: "department" as const,
        subjectId: department.id,
      }));
  },
};

/** Finished work waiting on the manager. */
const reviewBacklog: InsightDetector = {
  id: "review_backlog",
  run(snapshot) {
    if (snapshot.review.awaiting === 0) return [];

    const days = snapshot.review.oldestWaitingDays;
    const severity: Severity =
      days >= 7 ? "high" : days >= 3 ? "medium" : snapshot.review.awaiting >= 3 ? "low" : "info";

    return [
      {
        category: "review" as const,
        title: "Finished work is waiting on you",
        summary:
          days >= 1
            ? `${snapshot.review.awaiting} ${snapshot.review.awaiting === 1 ? "deliverable is" : "deliverables are"} waiting to be reviewed, the oldest for ${days} ${days === 1 ? "day" : "days"}. Employees stay blocked until you decide.`
            : `${snapshot.review.awaiting} ${snapshot.review.awaiting === 1 ? "deliverable is" : "deliverables are"} waiting to be reviewed.`,
        measurements: {
          awaiting: snapshot.review.awaiting,
          oldestWaitingDays: days,
        },
        severity,
        signalKey: "review_backlog",
        subjectType: "company" as const,
        subjectId: null,
      },
    ];
  },
};

/** Work an approval is blocked on by the company's own standards. */
const blockedByStandards: InsightDetector = {
  id: "blocked_by_standards",
  run(snapshot) {
    if (snapshot.review.blockedByStandards === 0) return [];

    return [
      {
        category: "quality" as const,
        title: "Work is blocked by your own standards",
        summary: `${snapshot.review.blockedByStandards} ${snapshot.review.blockedByStandards === 1 ? "deliverable does" : "deliverables do"} not meet a required standard, so approval is held up.`,
        measurements: { blocked: snapshot.review.blockedByStandards },
        severity: snapshot.review.blockedByStandards >= 3 ? "medium" : "low",
        signalKey: "blocked_by_standards",
        subjectType: "company" as const,
        subjectId: null,
      },
    ];
  },
};

/** How often work comes back for changes. */
const revisionRate: InsightDetector = {
  id: "revision_rate",
  run(snapshot) {
    // Under five reviews any percentage is noise. Reporting "50% revision rate"
    // off two reviews would send the manager rewriting a method on the strength
    // of one bad afternoon.
    if (snapshot.quality.reviewed < 5) return [];

    const rate = snapshot.quality.changesRequested / snapshot.quality.reviewed;
    if (rate < 0.25) return [];

    const percent = Math.round(rate * 100);

    return [
      {
        category: "quality" as const,
        title: "Work is coming back for changes often",
        summary: `${percent}% of the work you reviewed in the last month needed changes. That is time spent twice.`,
        measurements: {
          reviewed: snapshot.quality.reviewed,
          changesRequested: snapshot.quality.changesRequested,
          percent,
        },
        severity: rate >= 0.5 ? "high" : "medium",
        signalKey: "revision_rate",
        subjectType: "company" as const,
        subjectId: null,
      },
    ];
  },
};

/** Proposals nobody has decided on. */
const unreviewedLearning: InsightDetector = {
  id: "unreviewed_learning",
  run(snapshot) {
    if (snapshot.learning.pendingCandidates === 0) return [];

    return [
      {
        category: "learning" as const,
        title: "The company has learned things you haven't decided on",
        summary: `${snapshot.learning.pendingCandidates} ${snapshot.learning.pendingCandidates === 1 ? "proposal is" : "proposals are"} waiting. Until you decide, nobody works any differently.`,
        measurements: { pending: snapshot.learning.pendingCandidates },
        severity: snapshot.learning.pendingCandidates >= 5 ? "medium" : "low",
        signalKey: "unreviewed_learning",
        subjectType: "company" as const,
        subjectId: null,
      },
    ];
  },
};

/** Plans waiting for the manager before anybody starts. */
const projectsAwaitingApproval: InsightDetector = {
  id: "projects_awaiting_approval",
  run(snapshot) {
    if (snapshot.projects.awaitingApproval === 0) return [];

    return [
      {
        category: "throughput" as const,
        title: "Projects are planned but not started",
        summary: `${snapshot.projects.awaitingApproval} ${snapshot.projects.awaitingApproval === 1 ? "project has" : "projects have"} a plan waiting for your approval. Nobody has started, and nothing has been spent.`,
        measurements: { awaiting: snapshot.projects.awaitingApproval },
        severity: "low",
        signalKey: "projects_awaiting_approval",
        subjectType: "company" as const,
        subjectId: null,
      },
    ];
  },
};

/**
 * Longest a piece of work can plausibly still be running.
 *
 * A research run takes minutes. Two hours is not slow, it is a run that died
 * somewhere the product never noticed — a failed call, a restarted server, a
 * step that never wrote its result.
 */
const STALLED_AFTER_HOURS = 2;

/**
 * Work that started and went quiet.
 *
 * The one failure this product had no way to see. An employee stuck at
 * "working" looks exactly like an employee working: no error, no bill, nobody
 * blocked, and every screen says the same reassuring thing. It is the failure
 * mode most likely to survive a whole weekend.
 *
 * A count of hours, nothing more. It does not guess why — the manager opens it
 * and finds out, and "retry" already exists on that page.
 */
const stalledWork: InsightDetector = {
  id: "stalled_work",
  run(snapshot) {
    const stuck = snapshot.stalled.filter(
      (item) => item.hours >= STALLED_AFTER_HOURS,
    );
    if (stuck.length === 0) return [];

    const worst = stuck[0];
    const days = Math.floor(worst.hours / 24);

    return [
      {
        category: "throughput" as const,
        title:
          stuck.length === 1
            ? "A piece of work has gone quiet"
            : `${stuck.length} pieces of work have gone quiet`,
        summary: `"${worst.title}" has been running for ${
          days >= 1
            ? `${days} ${days === 1 ? "day" : "days"}`
            : `${worst.hours} hours`
        }. Work here takes minutes, so this one has most likely stopped without saying so. Opening it will show what it was doing.`,
        measurements: { stalled: stuck.length, oldestHours: worst.hours },
        // A day of silence is worse than two hours of it, but neither is a
        // crisis: nothing is lost, and the fix is one click.
        severity: (days >= 1 ? "high" : "medium") as Severity,
        signalKey: "stalled_work",
        subjectType: "company" as const,
        subjectId: null,
      },
    ];
  },
};

/** How many times the same request has to appear before it is a pattern. */
const REPEAT_THRESHOLD = 3;

/** How alike two pieces of feedback must be to count as the same request. */
const SAME_REQUEST = 0.5;

/**
 * The manager asking for the same thing over and over.
 *
 * This is the company learning something about itself, and it is precisely the
 * fact a count destroys. Three rejections tell you the employees are
 * struggling. Three rejections that all say "check this against the vendor's
 * own page" tell you the company has a standard nobody has written down — and
 * that until somebody writes it down, the manager will keep paying for the
 * revision that enforces it.
 *
 * Word overlap, not meaning. It will miss two people saying the same thing in
 * different words, and that is the right way round to be wrong: a detector
 * that guessed at intent would tell the manager they have a policy they have
 * never had.
 */
const repeatedFeedback: InsightDetector = {
  id: "repeated_feedback",
  run(snapshot) {
    const requests = snapshot.quality.changeRequests.filter(
      (text) => text.trim().length >= 15,
    );
    if (requests.length < REPEAT_THRESHOLD) return [];

    // Greedy clustering: each request either joins the first cluster it
    // resembles or starts its own. Good enough for tens of reviews, and the
    // alternative — pairwise everything — buys precision nobody would notice.
    const clusters: { representative: string; members: string[] }[] = [];

    for (const request of requests) {
      const home = clusters.find(
        (cluster) => similarity(cluster.representative, request) >= SAME_REQUEST,
      );
      if (home) home.members.push(request);
      else clusters.push({ representative: request, members: [request] });
    }

    const repeated = clusters
      .filter((cluster) => cluster.members.length >= REPEAT_THRESHOLD)
      .sort((a, b) => b.members.length - a.members.length);

    return repeated.slice(0, 2).map((cluster) => {
      const times = cluster.members.length;
      // The shortest member, on the theory that the plainest statement of a
      // repeated request is the one worth showing back.
      const clearest = [...cluster.members].sort(
        (a, b) => a.length - b.length,
      )[0];

      return {
        category: "quality" as const,
        title: "You keep asking for the same thing",
        summary: `${times} times you sent work back asking for something like this: "${truncate(clearest, 140)}" Written down as a standard, it would apply to every deliverable instead of being caught one at a time.`,
        measurements: { times, distinctRequests: clusters.length },
        severity: (times >= 5 ? "medium" : "low") as Severity,
        // Keyed on the cluster's content, so a different repeated request is a
        // different insight rather than overwriting this one.
        signalKey: `repeated_feedback:${fingerprint(clearest)}`,
        subjectType: "company" as const,
        subjectId: null,
      };
    });
  },
};

function truncate(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** A short stable key for a piece of text, so the same repeated request keeps
 *  the same signal across detection runs. */
function fingerprint(text: string): string {
  const words = normalizeForComparison(text).split(" ").filter(Boolean);
  return [...words].sort().slice(0, 6).join("-").slice(0, 60);
}

const DETECTORS: InsightDetector[] = [
  departmentBacklog,
  departmentIdle,
  reviewBacklog,
  blockedByStandards,
  revisionRate,
  unreviewedLearning,
  projectsAwaitingApproval,
  repeatedFeedback,
  stalledWork,
];

export function runDetectors(snapshot: CompanySnapshot): DetectorResult[] {
  return DETECTORS.flatMap((detector) => {
    try {
      return detector.run(snapshot);
    } catch {
      // One broken detector must not take the whole diagnosis with it — a
      // partial picture of the company beats no picture.
      return [];
    }
  });
}

export function listDetectors(): string[] {
  return DETECTORS.map((detector) => detector.id);
}
