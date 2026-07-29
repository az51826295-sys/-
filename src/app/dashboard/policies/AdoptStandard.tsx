"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { policyPriorityLabel, type PolicyPriority } from "@/lib/policies/types";

interface Template {
  key: string;
  name: string;
  description: string;
  category: string;
  rules: {
    title: string;
    instruction: string;
    priority: PolicyPriority;
    checked: boolean;
  }[];
}

/**
 * Adopting a standard the company hasn't written itself.
 *
 * The rules are shown in full before the button, not behind it. A standard the
 * manager agreed to without reading would start blocking their work with rules
 * they never chose — and they would be right to blame the product for it.
 */
export function AdoptStandard({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function adopt(key: string) {
    setAdopting(key);
    setError(null);

    try {
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateKey: key }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error ?? "I couldn't adopt this standard.");
        return;
      }

      router.push(`/dashboard/policies/${body.policyId}`);
    } catch {
      setError("I couldn't adopt this standard. Please try again.");
    } finally {
      setAdopting(null);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {templates.map((template) => (
        <div key={template.key} className="rounded-lg border border-zinc-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-900">{template.name}</p>
              <p className="mt-0.5 text-sm text-zinc-600">{template.description}</p>
              <p className="mt-2 text-xs text-zinc-500">
                {template.category} · {template.rules.length} rules
              </p>
            </div>
            <button
              type="button"
              onClick={() => adopt(template.key)}
              disabled={adopting !== null}
              className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {adopting === template.key ? "Adopting..." : "Adopt"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setOpen(open === template.key ? null : template.key)}
            className="mt-3 text-xs text-zinc-600 underline"
          >
            {open === template.key ? "Hide the rules" : "Read the rules first"}
          </button>

          {open === template.key && (
            <ul className="mt-3 space-y-3 border-t border-zinc-100 pt-3">
              {template.rules.map((rule) => (
                <li key={rule.title}>
                  <p className="text-sm font-medium text-zinc-900">
                    {rule.title}
                    <span className="ml-2 text-xs font-normal text-zinc-500">
                      {policyPriorityLabel[rule.priority]}
                      {rule.checked && " · checked automatically"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-600">{rule.instruction}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
