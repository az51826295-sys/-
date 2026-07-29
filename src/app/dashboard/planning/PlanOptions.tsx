"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OptionType, StaffingOption } from "@/lib/planning/service";

/** Where choosing an option sends the manager. Choosing does not carry it out —
 *  it records the decision and takes them to where they can act on it. */
const DESTINATION: Record<OptionType, string> = {
  redistribute_work: "/dashboard/organization",
  cross_department_support: "/dashboard/organization",
  playbook_improvement: "/dashboard/playbooks",
  schedule_optimization: "/dashboard/recurring-assignments",
  hire_employee: "/employees",
};

const LABEL: Record<OptionType, string> = {
  redistribute_work: "Move work around",
  cross_department_support: "Borrow capacity",
  playbook_improvement: "Change the method",
  schedule_optimization: "Change the schedule",
  hire_employee: "Hire someone",
};

export function PlanOptions({
  planId,
  options,
}: {
  planId: string;
  options: StaffingOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(option: StaffingOption) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/planning/${planId}/choose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId: option.id }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "I couldn't record that.");
        return;
      }

      router.push(DESTINATION[option.optionType]);
    } catch {
      setError("I couldn't record that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/planning/${planId}/dismiss`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "I couldn't record that.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {options.map((option, index) => (
          <li key={option.id} className="rounded-lg border border-zinc-200 p-5">
            <p className="text-sm font-medium text-zinc-900">
              {/* Lettered rather than numbered: these are alternatives, and a
                  numbered list reads like an order to work through. */}
              {String.fromCharCode(65 + index)}. {option.summary}
              <span className="ml-2 text-xs font-normal text-zinc-500">
                {LABEL[option.optionType]}
              </span>
            </p>
            <p className="mt-1 text-sm text-zinc-700">{option.estimatedImpact}</p>
            <p className="mt-2 text-sm text-zinc-600">{option.reasoning}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => choose(option)}
              className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              Go with this
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={busy}
        onClick={dismiss}
        className="mt-4 text-sm text-zinc-500 underline disabled:opacity-60"
      >
        None of these — it&apos;s fine as it is
      </button>
    </div>
  );
}
