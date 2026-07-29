"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Template {
  key: string;
  name: string;
  description: string;
  stages: { title: string; intent: string; steps: string[] }[];
}

/**
 * Starting from a method this product knows rather than a blank page.
 *
 * Adopted as a draft, and the steps are readable before the button. A method
 * that started shaping the company's work the moment it was clicked would be a
 * way of putting words in the manager's mouth.
 */
export function AdoptPlaybook({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function adopt(key: string) {
    setAdopting(key);
    setError(null);

    try {
      const res = await fetch("/api/playbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateKey: key }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error ?? "I couldn't adopt this method.");
        return;
      }

      router.push(`/dashboard/playbooks/${body.playbookId}`);
    } catch {
      setError("I couldn't adopt this method. Please try again.");
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
                {template.stages.map((stage) => stage.title).join(" → ")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => adopt(template.key)}
              disabled={adopting !== null}
              className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {adopting === template.key ? "Adopting..." : "Adopt as draft"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setOpen(open === template.key ? null : template.key)}
            className="mt-3 text-xs text-zinc-600 underline"
          >
            {open === template.key ? "Hide the steps" : "Read the steps first"}
          </button>

          {open === template.key && (
            <ol className="mt-3 space-y-4 border-t border-zinc-100 pt-3">
              {template.stages.map((stage, index) => (
                <li key={stage.title}>
                  <p className="text-sm font-medium text-zinc-900">
                    {index + 1}. {stage.title}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-600">{stage.intent}</p>
                  <ul className="mt-2 space-y-1">
                    {stage.steps.map((step) => (
                      <li key={step} className="text-sm text-zinc-600">
                        • {step}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
}
