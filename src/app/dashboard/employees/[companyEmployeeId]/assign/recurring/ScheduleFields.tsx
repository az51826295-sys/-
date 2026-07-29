"use client";

import type { RecurringDraft } from "@/lib/recurring/draft";
import { WEEKDAYS, weekdayLabel, type Weekday } from "@/lib/schedule/time";

const FREQUENCIES: { value: RecurringDraft["frequency"]; interval: number; label: string }[] = [
  { value: "daily", interval: 1, label: "Daily" },
  { value: "weekly", interval: 1, label: "Weekly" },
  { value: "weekly", interval: 2, label: "Every 2 weeks" },
  { value: "monthly", interval: 1, label: "Monthly" },
];

/**
 * How often the work should happen, in the manager's own terms.
 *
 * "Every 2 weeks" is offered as its own choice even though it is stored as a
 * weekly interval — nobody thinks of it as "weekly with interval 2", and the
 * storage shape is not the manager's problem.
 */
export function ScheduleFields({
  draft,
  timezone,
  employeeName,
  onChange,
}: {
  draft: RecurringDraft;
  timezone: string;
  employeeName: string;
  onChange: (patch: Partial<RecurringDraft>) => void;
}) {
  const activeKey = `${draft.frequency}:${draft.frequency === "weekly" ? draft.interval : 1}`;

  const rangeInvalid =
    draft.frequency === "weekly" && draft.daysOfWeek.length === 0;

  function selectFrequency(frequency: RecurringDraft["frequency"], interval: number) {
    onChange({
      frequency,
      interval,
      // Every other week on several days has no unambiguous meaning, so
      // switching to it keeps only the first day chosen.
      daysOfWeek:
        frequency === "weekly" && interval === 2
          ? [draft.daysOfWeek[0] ?? "MO"]
          : draft.daysOfWeek.length > 0
            ? draft.daysOfWeek
            : ["MO"],
    });
  }

  function toggleDay(day: Weekday) {
    if (draft.frequency === "weekly" && draft.interval === 2) {
      onChange({ daysOfWeek: [day] });
      return;
    }
    const selected = draft.daysOfWeek.includes(day);
    onChange({
      daysOfWeek: selected
        ? draft.daysOfWeek.filter((entry) => entry !== day)
        : [...draft.daysOfWeek, day],
    });
  }

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 p-5">
      <p className="text-sm font-medium text-zinc-900">
        How often should {employeeName} do this?
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {FREQUENCIES.map((option) => {
          const key = `${option.value}:${option.interval}`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => selectFrequency(option.value, option.interval)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                activeKey === key
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {draft.frequency === "weekly" && (
        <div className="mt-5">
          <p className="text-sm font-medium text-zinc-900">
            {draft.interval === 2 ? "Day" : "Days"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const selected = draft.daysOfWeek.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                    selected
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {weekdayLabel[day].slice(0, 3)}
                </button>
              );
            })}
          </div>
          {rangeInvalid && (
            <p className="mt-2 text-xs text-red-700">
              Choose at least one day for this weekly assignment.
            </p>
          )}
        </div>
      )}

      {draft.frequency === "monthly" && (
        <div className="mt-5">
          <label htmlFor="dayOfMonth" className="block text-sm font-medium text-zinc-900">
            Day of month
          </label>
          <input
            id="dayOfMonth"
            type="number"
            min={1}
            max={28}
            inputMode="numeric"
            value={draft.dayOfMonth}
            onChange={(e) =>
              onChange({
                dayOfMonth: Math.max(1, Math.min(28, Number(e.target.value) || 1)),
              })
            }
            className="mt-2 w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
          {/* Days 29-31 don't exist in every month, and silently moving the
              date would make the schedule mean something the manager didn't
              ask for. */}
          <p className="mt-1 text-xs text-zinc-400">
            Between 1 and 28, so the date exists in every month.
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-4">
        <div>
          <label htmlFor="localTime" className="block text-sm font-medium text-zinc-900">
            Time
          </label>
          <input
            id="localTime"
            type="time"
            value={draft.localTime}
            onChange={(e) => onChange({ localTime: e.target.value })}
            className="mt-2 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="startDate" className="block text-sm font-medium text-zinc-900">
            Starts
          </label>
          <input
            id="startDate"
            type="date"
            value={draft.startDate}
            onChange={(e) => onChange({ startDate: e.target.value })}
            className="mt-2 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-5 border-t border-zinc-100 pt-4">
        <p className="text-xs text-zinc-500">Time zone</p>
        <p className="mt-0.5 text-sm font-medium text-zinc-900">{timezone}</p>
        <p className="mt-1 text-xs text-zinc-500">
          This schedule uses your company time zone.
        </p>
      </div>

      <div className="mt-5 border-t border-zinc-100 pt-4">
        <p className="text-sm font-medium text-zinc-900">
          If {employeeName} is busy at that time
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {(
            [
              {
                value: "wait" as const,
                label: "Wait until available",
                hint: `${employeeName} starts as soon as the current work is reviewed.`,
              },
              {
                value: "skip" as const,
                label: "Skip this time",
                hint: "That turn is skipped and the next one goes ahead as normal.",
              },
            ]
          ).map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 ${
                draft.conflictPolicy === option.value
                  ? "border-zinc-900"
                  : "border-zinc-200 hover:border-zinc-400"
              }`}
            >
              <input
                type="radio"
                name="conflictPolicy"
                checked={draft.conflictPolicy === option.value}
                onChange={() => onChange({ conflictPolicy: option.value })}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block text-sm text-zinc-900">{option.label}</span>
                <span className="block text-xs text-zinc-500">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
