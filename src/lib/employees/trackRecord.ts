import type { SupabaseClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

/**
 * What one employee has actually done here.
 *
 * The product asks people to think of these as colleagues rather than as a
 * button that produces documents. A colleague has a history — you know what
 * they have handed you before, whether it came back needing another pass, and
 * how long they usually take. Until now the employee's own screen showed only
 * what they were told during onboarding, which is the equivalent of a CV with
 * no work history on it.
 *
 * Three rules this holds itself to, because the alternative is the thing the
 * owner warned against — a product that *looks* like a company rather than one
 * that is one:
 *
 * Only things that happened. Every number here is a count of rows. Nothing is
 * modelled, projected, or scored out of a hundred.
 *
 * No rate until a rate means something. An employee who has handed in two
 * pieces of work and had both approved does not have a "100% approval rate";
 * they have two approvals. Percentages arrive at MIN_FOR_RATE and not before,
 * because a number that swings 50 points on one review teaches the manager
 * nothing except to distrust the number.
 *
 * Free. This is arithmetic over rows the company already has. A track record
 * that cost a model call per view would be switched off, and one nobody looks
 * at is not a track record.
 */

/** Below this, counts are shown and rates are not. */
export const MIN_FOR_RATE = 5;

export interface TrackRecord {
  /** Approved and handed over. */
  finished: number;
  /** Handed in and sitting with the manager right now. */
  awaitingReview: number;
  /** Pieces that came back for changes at least once. */
  sentBack: number;
  /** Times a colleague asked them for something and they answered. */
  helpedColleagues: number;
  /** Null until there are MIN_FOR_RATE reviewed pieces. 0–100. */
  approvalRate: number | null;
  /** Median hours from being given the work to handing it in. Null under three
   *  samples — a median of two numbers is just the two numbers. */
  typicalHours: number | null;
  /** When they first finished something here. Null if they never have. */
  workingSince: string | null;
  lastFinished: string | null;
}

export async function loadTrackRecord(
  db: Db,
  companyEmployeeId: string,
): Promise<TrackRecord> {
  const [deliverables, requests] = await Promise.all([
    db
      .from("deliverables")
      .select("status, version, submitted_at, approved_at, assignment_id, assignments!inner(assigned_at, assignment_type)")
      .eq("company_employee_id", companyEmployeeId)
      // Work done for a colleague is real work, but it is not something the
      // manager reviewed, so it cannot count towards an approval rate.
      .eq("assignments.assignment_type", "manager"),
    db
      .from("internal_requests")
      .select("id", { count: "exact", head: true })
      .eq("assignee_company_employee_id", companyEmployeeId)
      .eq("status", "completed"),
  ]);

  const rows = (deliverables.data ?? []) as unknown as {
    status: string;
    version: number;
    submitted_at: string | null;
    approved_at: string | null;
    assignments: { assigned_at: string } | null;
  }[];

  const finished = rows.filter((row) => row.status === "approved").length;
  const awaitingReview = rows.filter((row) => row.status === "submitted").length;

  // A version above one means the manager sent it back at least once. Counted
  // per piece of work rather than per revision: three passes on one report is
  // one piece that needed work, not three failures.
  const sentBack = rows.filter((row) => row.version > 1).length;

  const reviewed = rows.filter((row) =>
    ["approved", "needs_changes", "superseded"].includes(row.status),
  ).length;

  // Approved first time, out of everything that was reviewed at all.
  const cleanFirstTime = rows.filter(
    (row) => row.status === "approved" && row.version === 1,
  ).length;

  const turnarounds = rows
    .map((row) => {
      const start = row.assignments?.assigned_at;
      if (!start || !row.submitted_at) return null;
      const hours =
        (new Date(row.submitted_at).getTime() - new Date(start).getTime()) /
        3_600_000;
      // Negative or absurd spans mean the data is wrong, not that somebody was
      // fast. Dropping them is better than reporting them.
      return hours > 0 && hours < 24 * 30 ? hours : null;
    })
    .filter((hours): hours is number => hours !== null)
    .sort((a, b) => a - b);

  const approvedDates = rows
    .filter((row) => row.approved_at)
    .map((row) => row.approved_at!)
    .sort();

  return {
    finished,
    awaitingReview,
    sentBack,
    helpedColleagues: requests.count ?? 0,
    approvalRate:
      reviewed >= MIN_FOR_RATE
        ? Math.round((cleanFirstTime / reviewed) * 100)
        : null,
    typicalHours:
      turnarounds.length >= 3
        ? Math.round(turnarounds[Math.floor(turnarounds.length / 2)] * 10) / 10
        : null,
    workingSince: approvedDates[0] ?? null,
    lastFinished: approvedDates[approvedDates.length - 1] ?? null,
  };
}

/**
 * The track record as a sentence, for when there is no room for a grid.
 *
 * Says "nothing yet" plainly rather than showing four zeroes. A row of zeroes
 * reads as a broken screen; "hasn't finished anything yet" reads as a fact
 * about a new colleague, which is what it is.
 */
export function summariseTrackRecord(
  record: TrackRecord,
  name: string,
): string {
  if (record.finished === 0 && record.awaitingReview === 0) {
    return `${name} hasn't finished anything here yet.`;
  }

  const parts: string[] = [];
  if (record.finished > 0) {
    parts.push(
      `${record.finished} ${record.finished === 1 ? "piece" : "pieces"} of work approved`,
    );
  }
  if (record.awaitingReview > 0) {
    parts.push(`${record.awaitingReview} waiting on you`);
  }
  if (record.helpedColleagues > 0) {
    parts.push(
      `helped a colleague ${record.helpedColleagues} ${record.helpedColleagues === 1 ? "time" : "times"}`,
    );
  }

  return `${name}: ${parts.join(" · ")}.`;
}
