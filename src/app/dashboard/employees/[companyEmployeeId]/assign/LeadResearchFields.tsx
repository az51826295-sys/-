"use client";

import type { AssignmentFormExtensionProps } from "./extensions";
import {
  DEFAULT_TARGET_COUNT,
  MAX_TARGET_COUNT,
  type LeadResearchAssignmentInput,
} from "@/lib/roles/schemas";

type Value = Partial<LeadResearchAssignmentInput>;

function parseCount(raw: string): number {
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed)) return DEFAULT_TARGET_COUNT;
  return Math.max(1, Math.min(MAX_TARGET_COUNT, Math.floor(parsed)));
}

function parseList(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBound(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined;
}

/**
 * The extra fields Emma needs on an assignment.
 *
 * Everything here starts from what the manager taught Emma during onboarding
 * and can be changed for this assignment only — editing a filter here never
 * writes back to the ideal customer profile, so a one-off search doesn't
 * quietly retrain the employee.
 */
export function LeadResearchFields({
  employeeName,
  defaults,
  value,
  onChange,
}: AssignmentFormExtensionProps) {
  const profile = (defaults ?? {}) as {
    industries?: string[];
    locations?: string[];
    employeeRange?: { min?: number; max?: number };
    buyingSignals?: string[];
    excludedCompanies?: string[];
  };

  const current = (value ?? {}) as Value;

  // Blank means "use what I taught you", so the placeholder shows the profile
  // value rather than pre-filling and pretending the manager typed it.
  const industries = current.industries ?? [];
  const locations = current.locations ?? [];
  const signals = current.requiredSignals ?? [];
  const excluded = current.excludedCompanies ?? [];
  const range = current.employeeRange ?? {};

  function update(patch: Value) {
    onChange({ ...current, ...patch });
  }

  const targetCount = current.targetCount ?? DEFAULT_TARGET_COUNT;
  const rangeInvalid =
    range.min !== undefined && range.max !== undefined && range.min > range.max;

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 p-5">
      <p className="text-sm font-medium text-zinc-900">What {employeeName} looks for</p>
      <p className="mt-1 text-xs text-zinc-500">
        These start from what you taught {employeeName}. Changing them here applies
        to this assignment only.
      </p>

      <div className="mt-5 flex flex-col gap-5">
        <div>
          <label htmlFor="targetCount" className="block text-sm font-medium text-zinc-900">
            How many companies?
          </label>
          <input
            id="targetCount"
            type="number"
            min={1}
            max={MAX_TARGET_COUNT}
            inputMode="numeric"
            value={targetCount}
            onChange={(e) => update({ targetCount: parseCount(e.target.value) })}
            className="mt-2 w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
          <p className="mt-1 text-xs text-zinc-400">
            Up to {MAX_TARGET_COUNT}. {employeeName} returns fewer if fewer can be
            verified.
          </p>
        </div>

        <div>
          <label htmlFor="industries" className="block text-sm font-medium text-zinc-900">
            Industries
          </label>
          <input
            id="industries"
            type="text"
            value={industries.join(", ")}
            onChange={(e) => update({ industries: parseList(e.target.value) })}
            placeholder={profile.industries?.join(", ") || "Any"}
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
          <p className="mt-1 text-xs text-zinc-400">Separate with commas.</p>
        </div>

        <div>
          <label htmlFor="locations" className="block text-sm font-medium text-zinc-900">
            Locations
          </label>
          <input
            id="locations"
            type="text"
            value={locations.join(", ")}
            onChange={(e) => update({ locations: parseList(e.target.value) })}
            placeholder={profile.locations?.join(", ") || "Any"}
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>

        <div>
          <p className="text-sm font-medium text-zinc-900">Company size</p>
          <div className="mt-2 flex gap-4">
            <div className="flex-1">
              <label htmlFor="minEmployees" className="block text-xs text-zinc-500">
                Minimum employees
              </label>
              <input
                id="minEmployees"
                type="number"
                min={0}
                inputMode="numeric"
                value={range.min ?? ""}
                onChange={(e) =>
                  update({
                    employeeRange: { ...range, min: parseBound(e.target.value) },
                  })
                }
                placeholder={profile.employeeRange?.min?.toString() ?? "No limit"}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="maxEmployees" className="block text-xs text-zinc-500">
                Maximum employees
              </label>
              <input
                id="maxEmployees"
                type="number"
                min={0}
                inputMode="numeric"
                value={range.max ?? ""}
                onChange={(e) =>
                  update({
                    employeeRange: { ...range, max: parseBound(e.target.value) },
                  })
                }
                placeholder={profile.employeeRange?.max?.toString() ?? "No limit"}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
          </div>
          {rangeInvalid && (
            <p className="mt-2 text-xs text-red-700">
              The smallest company size must not be larger than the largest.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="signals" className="block text-sm font-medium text-zinc-900">
            Required signals
          </label>
          <input
            id="signals"
            type="text"
            value={signals.join(", ")}
            onChange={(e) => update({ requiredSignals: parseList(e.target.value) })}
            placeholder={profile.buyingSignals?.join(", ") || "None required"}
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
          <p className="mt-1 text-xs text-zinc-400">
            A company without one of these is left out. Leave blank to include
            companies with no signal yet.
          </p>
        </div>

        <div>
          <label htmlFor="excluded" className="block text-sm font-medium text-zinc-900">
            Also exclude
          </label>
          <input
            id="excluded"
            type="text"
            value={excluded.join(", ")}
            onChange={(e) => update({ excludedCompanies: parseList(e.target.value) })}
            placeholder="Nothing extra"
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
          {/* Onboarding exclusions always apply; these are in addition. */}
          {profile.excludedCompanies && profile.excludedCompanies.length > 0 && (
            <p className="mt-1 text-xs text-zinc-400">
              Always excluded: {profile.excludedCompanies.join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
