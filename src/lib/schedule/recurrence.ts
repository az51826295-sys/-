import {
  addDays,
  calendarDaysBetween,
  formatInZone,
  formatLocalTime,
  instantFromWallClock,
  isValidTimeZone,
  parseDateAndTime,
  wallClockIn,
  weekdayLabel,
  weekdayOf,
  WEEKDAYS,
  type Weekday,
  type WallClock,
} from "@/lib/schedule/time";

export type Frequency = "daily" | "weekly" | "monthly";

export interface RecurringScheduleDefinition {
  frequency: Frequency;
  interval: number;
  daysOfWeek?: Weekday[];
  dayOfMonth?: number;
  /** "09:00" in the company's own time. */
  localTime: string;
  timezone: string;
  /** "2026-08-03". Anchors every-2-weeks counting and bounds the first turn. */
  startDate: string;
}

/** How far ahead the search will look before giving up. Generous enough for
 *  monthly, short enough that a nonsensical schedule fails fast. */
const MAX_SEARCH_DAYS = 400;

/**
 * The next time this schedule is due, strictly after `after`.
 *
 * Computed from the calendar rather than by adding an interval to the last run,
 * which is the difference between a schedule and a treadmill: if Monday's work
 * is delayed until Wednesday, next Monday is still next Monday.
 */
export function getNextOccurrence(
  schedule: RecurringScheduleDefinition,
  after: Date,
): Date | null {
  const { timezone } = schedule;
  if (!isValidTimeZone(timezone)) return null;

  const startWall = parseDateAndTime(schedule.startDate, schedule.localTime);
  const afterWall = wallClockIn(after, timezone);

  // Never start before the day the manager chose, even if that day is in the
  // future by weeks.
  let cursor: WallClock =
    calendarDaysBetween(afterWall, startWall) > 0
      ? { ...startWall }
      : {
          year: afterWall.year,
          month: afterWall.month,
          day: afterWall.day,
          hour: startWall.hour,
          minute: startWall.minute,
        };

  for (let step = 0; step <= MAX_SEARCH_DAYS; step += 1) {
    if (matchesSchedule(schedule, cursor, startWall)) {
      const instant = instantFromWallClock(cursor, timezone);
      if (instant.getTime() > after.getTime()) return instant;
    }
    cursor = addDays(cursor, 1);
  }

  return null;
}

function matchesSchedule(
  schedule: RecurringScheduleDefinition,
  candidate: WallClock,
  start: WallClock,
): boolean {
  if (calendarDaysBetween(start, candidate) < 0) return false;

  switch (schedule.frequency) {
    case "daily":
      return true;

    case "weekly": {
      const days = schedule.daysOfWeek ?? [];
      if (!days.includes(weekdayOf(candidate))) return false;
      if (schedule.interval <= 1) return true;

      // Every other week, counted in whole weeks from the start date's week so
      // the rhythm survives a missed or delayed turn.
      const weeksFromStart = Math.floor(
        calendarDaysBetween(startOfWeek(start), startOfWeek(candidate)) / 7,
      );
      return weeksFromStart % schedule.interval === 0;
    }

    case "monthly":
      return candidate.day === schedule.dayOfMonth;
  }
}

/** Sunday of the week containing this date, used only for interval counting. */
function startOfWeek(wall: WallClock): WallClock {
  return addDays(wall, -WEEKDAYS.indexOf(weekdayOf(wall)));
}

// --- Validation -------------------------------------------------------------

export type ScheduleValidation =
  | { ok: true; schedule: RecurringScheduleDefinition }
  | { ok: false; error: string };

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checked on the server, always. A schedule that looks fine in the form but is
 * malformed in the body would either never fire or fire at the wrong time, and
 * both are worse than being rejected.
 */
export function validateSchedule(input: unknown): ScheduleValidation {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Choose how often this work should happen." };
  }

  const raw = input as Record<string, unknown>;
  const frequency = raw.frequency;

  if (frequency !== "daily" && frequency !== "weekly" && frequency !== "monthly") {
    return { ok: false, error: "Choose how often this work should happen." };
  }

  const localTime = typeof raw.localTime === "string" ? raw.localTime : "";
  if (!TIME_PATTERN.test(localTime)) {
    return { ok: false, error: "Choose a valid time." };
  }

  const timezone = typeof raw.timezone === "string" ? raw.timezone : "";
  if (!isValidTimeZone(timezone)) {
    return { ok: false, error: "Set your company time zone before scheduling recurring work." };
  }

  const startDate = typeof raw.startDate === "string" ? raw.startDate : "";
  if (!DATE_PATTERN.test(startDate)) {
    return { ok: false, error: "Choose a valid start date." };
  }

  const interval = typeof raw.interval === "number" ? raw.interval : 1;

  if (frequency === "daily") {
    if (interval !== 1) {
      return { ok: false, error: "Daily work repeats every day." };
    }
    return {
      ok: true,
      schedule: { frequency, interval: 1, localTime, timezone, startDate },
    };
  }

  if (frequency === "weekly") {
    if (interval !== 1 && interval !== 2) {
      return { ok: false, error: "Weekly work repeats every week or every two weeks." };
    }

    const daysOfWeek = Array.isArray(raw.daysOfWeek)
      ? raw.daysOfWeek.filter((day): day is Weekday =>
          WEEKDAYS.includes(day as Weekday),
        )
      : [];

    if (daysOfWeek.length === 0) {
      return { ok: false, error: "Choose at least one day for this weekly assignment." };
    }
    // Every other week on several days would make "which week" ambiguous, and
    // the manager has no way to say which they meant.
    if (interval === 2 && daysOfWeek.length > 1) {
      return { ok: false, error: "Every two weeks repeats on a single day." };
    }

    return {
      ok: true,
      schedule: { frequency, interval, daysOfWeek, localTime, timezone, startDate },
    };
  }

  const dayOfMonth = typeof raw.dayOfMonth === "number" ? raw.dayOfMonth : 0;
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) {
    return {
      ok: false,
      error: "Monthly recurring assignments must use a day between 1 and 28.",
    };
  }
  if (interval !== 1) {
    return { ok: false, error: "Monthly work repeats every month." };
  }

  return {
    ok: true,
    schedule: { frequency, interval: 1, dayOfMonth, localTime, timezone, startDate },
  };
}

// --- Description ------------------------------------------------------------

/** The schedule as the manager would say it out loud. */
export function describeSchedule(schedule: RecurringScheduleDefinition): string {
  const time = formatLocalTime(schedule.localTime);

  if (schedule.frequency === "daily") {
    return `Every day at ${time}`;
  }

  if (schedule.frequency === "weekly") {
    const days = (schedule.daysOfWeek ?? [])
      .slice()
      .sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b))
      .map((day) => weekdayLabel[day]);

    const dayText =
      days.length === 1
        ? days[0]
        : `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`;

    return schedule.interval === 2
      ? `Every 2 weeks on ${dayText} at ${time}`
      : `Every ${dayText} at ${time}`;
  }

  return `Monthly on day ${schedule.dayOfMonth} at ${time}`;
}

export function describeNextRun(
  nextRunAt: string | null,
  timezone: string,
): string | null {
  if (!nextRunAt) return null;
  return formatInZone(new Date(nextRunAt), timezone);
}
