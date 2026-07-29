"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  POLICY_PRIORITIES,
  policyPriorityHint,
  policyPriorityLabel,
  type PolicyPriority,
  type PolicyRule,
  type PolicyStatus,
} from "@/lib/policies/types";

interface CheckOption {
  id: string;
  label: string;
  description: string;
  config: { key: string; label: string; default: number; min: number; max: number } | null;
}

/**
 * Editing what the company holds itself to.
 *
 * Every change here moves the policy to a new version, and the screen says so.
 * A standard that changed silently would leave a manager unable to explain why
 * last week's work was approved and this week's was not.
 */
export function PolicyEditor({
  policyId,
  status,
  rules,
  departments,
  appliedDepartmentIds,
  checks,
}: {
  policyId: string;
  status: PolicyStatus;
  rules: PolicyRule[];
  departments: { id: string; name: string }[];
  appliedDepartmentIds: string[];
  checks: CheckOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [priority, setPriority] = useState<PolicyPriority>("recommended");
  const [checkId, setCheckId] = useState("");

  async function send(url: string, method: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error ?? "I couldn't save this change.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("I couldn't save this change. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addRule() {
    if (!title.trim() || !instruction.trim()) {
      setError("A rule needs a title and the rule itself.");
      return;
    }

    const selected = checks.find((check) => check.id === checkId);
    const ok = await send(`/api/policies/${policyId}/rules`, "POST", {
      title,
      instruction,
      priority,
      checkId: checkId || null,
      checkConfig:
        selected?.config
          ? { [selected.config.key]: selected.config.default }
          : {},
    });

    if (ok) {
      setTitle("");
      setInstruction("");
      setPriority("recommended");
      setCheckId("");
      setAdding(false);
    }
  }

  const scoped = appliedDepartmentIds.length > 0;

  return (
    <div className="mt-8">
      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-900">Rules</h2>
        <button
          type="button"
          onClick={() => setAdding(!adding)}
          className="text-sm text-zinc-600 underline"
        >
          {adding ? "Cancel" : "Add a rule"}
        </button>
      </div>

      {adding && (
        <div className="mt-3 space-y-4 rounded-lg border border-zinc-200 p-5">
          <div>
            <label htmlFor="rule-title" className="block text-sm font-medium text-zinc-900">
              What is the rule called?
            </label>
            <input
              id="rule-title"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Numbers come with their source"
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="rule-instruction"
              className="block text-sm font-medium text-zinc-900"
            >
              Write it as you would say it to a new employee
            </label>
            <textarea
              id="rule-instruction"
              rows={3}
              value={instruction}
              maxLength={500}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="Every figure is stated together with where it came from and as of when."
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="rule-priority" className="block text-sm font-medium text-zinc-900">
                How strict is it?
              </label>
              <select
                id="rule-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value as PolicyPriority)}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              >
                {POLICY_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {policyPriorityLabel[value]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-zinc-500">{policyPriorityHint[priority]}</p>
            </div>

            <div>
              <label htmlFor="rule-check" className="block text-sm font-medium text-zinc-900">
                Can it be checked for you?
              </label>
              <select
                id="rule-check"
                value={checkId}
                onChange={(event) => setCheckId(event.target.value)}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              >
                <option value="">No — I&apos;ll judge this myself</option>
                {checks.map((check) => (
                  <option key={check.id} value={check.id}>
                    {check.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-zinc-500">
                {checks.find((check) => check.id === checkId)?.description ??
                  "Most standards are like this — the employee follows it, and you see it flagged for your judgement."}
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={addRule}
              disabled={busy}
              className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              Add rule
            </button>
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">
          No rules yet, so this policy doesn&apos;t change how anybody works.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {rules.map((rule) => (
            <li key={rule.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className={rule.enabled ? "" : "opacity-50"}>
                  <p className="text-sm font-medium text-zinc-900">
                    {rule.title}
                    <span className="ml-2 text-xs font-normal text-zinc-500">
                      {policyPriorityLabel[rule.priority]}
                      {rule.checkId && " · checked automatically"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-600">{rule.instruction}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      send(`/api/policies/rules/${rule.id}`, "PATCH", {
                        enabled: !rule.enabled,
                      })
                    }
                    className="text-xs text-zinc-600 underline disabled:opacity-60"
                  >
                    {rule.enabled ? "Turn off" : "Turn on"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => send(`/api/policies/rules/${rule.id}`, "DELETE", undefined)}
                    className="text-xs text-zinc-400 underline disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-900">Who this applies to</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {scoped
            ? "Only the departments ticked below."
            : "Everyone. Tick departments to narrow it."}
        </p>
        {departments.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            You have no departments yet, so this applies to the whole company.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {departments.map((department) => {
              const on = appliedDepartmentIds.includes(department.id);
              return (
                <button
                  key={department.id}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    send(`/api/policies/${policyId}`, "PATCH", {
                      departmentIds: on
                        ? appliedDepartmentIds.filter((value) => value !== department.id)
                        : [...appliedDepartmentIds, department.id],
                    })
                  }
                  className={`rounded-full px-3 py-1 text-sm disabled:opacity-60 ${
                    on
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {department.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            send(`/api/policies/${policyId}`, "PATCH", {
              status: status === "active" ? "archived" : "active",
            })
          }
          className="text-sm text-zinc-600 underline disabled:opacity-60"
        >
          {status === "active"
            ? "Retire this policy"
            : "Put this policy back into effect"}
        </button>
        <p className="mt-1 text-xs text-zinc-500">
          {status === "active"
            ? "It stops applying to new work. Work already under way keeps it."
            : "It applies again from the next assignment on."}
        </p>
      </section>
    </div>
  );
}
