/**
 * Wall-clock time in a named zone, converted to and from instants.
 *
 * A recurring assignment means "every Monday at 9am where the company is", not
 * "every 604800 seconds from some epoch". Those differ twice a year, and the
 * manager only ever thinks in the first one — so the local intent is what is
 * stored and the instant is derived, never the other way round.
 *
 * Built on Intl rather than a date library: the zone rules ship with the
 * runtime and stay current without a dependency to update.
 */

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = partsCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  partsCache.set(timeZone, formatter);
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const WEEKDAY_FROM_SHORT: Record<string, Weekday> = {
  Sun: "SU",
  Mon: "MO",
  Tue: "TU",
  Wed: "WE",
  Thu: "TH",
  Fri: "FR",
  Sat: "SA",
};

export const weekdayLabel: Record<Weekday, string> = {
  SU: "Sunday",
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
};

/** What the clock on the wall says in `timeZone` at this instant. */
export function wallClockIn(instant: Date, timeZone: string): WallClock & {
  second: number;
  weekday: Weekday;
} {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "0";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_FROM_SHORT[get("weekday")] ?? "SU",
  };
}

/** The zone's offset from UTC, in minutes, at a given instant. */
function offsetMinutesAt(instant: Date, timeZone: string): number {
  const local = wallClockIn(instant, timeZone);
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  return (asUtc - instant.getTime()) / 60000;
}

/**
 * The instant at which the clock in `timeZone` reads the given wall time.
 *
 * Two passes, because the offset depends on the answer: guess using the offset
 * at the naive instant, then re-check using the offset at the guess. That
 * settles every case except the hour that a spring-forward skips, where the
 * requested time never occurs — there the second pass lands just after the
 * jump, which is the behaviour a person expects from "9am on the day the
 * clocks went forward".
 */
export function instantFromWallClock(wall: WallClock, timeZone: string): Date {
  const naive = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    0,
  );

  const firstGuess = new Date(naive - offsetMinutesAt(new Date(naive), timeZone) * 60000);
  const refined = new Date(naive - offsetMinutesAt(firstGuess, timeZone) * 60000);

  return refined;
}

/** Days between two calendar dates, ignoring time and zone entirely. */
export function calendarDaysBetween(from: WallClock, to: WallClock): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / 86_400_000);
}

/** Moves a calendar date by whole days without touching the clock time. */
export function addDays(wall: WallClock, days: number): WallClock {
  const moved = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + days));
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
    hour: wall.hour,
    minute: wall.minute,
  };
}

export function weekdayOf(wall: WallClock): Weekday {
  const utc = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  return WEEKDAYS[utc.getUTCDay()];
}

/** "2026-08-03" → calendar date, with the clock time supplied separately. */
export function parseDateAndTime(date: string, time: string): WallClock {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return { year, month, day, hour: hour ?? 0, minute: minute ?? 0 };
}

/** How a scheduled time reads to the manager, in their own zone. */
export function formatInZone(
  instant: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  }).format(instant);
}

/** "9:00 AM" from a stored "09:00:00". */
export function formatLocalTime(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(minute).padStart(2, "0")} ${suffix}`;
}
