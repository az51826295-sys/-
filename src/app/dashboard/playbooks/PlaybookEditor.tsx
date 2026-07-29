"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  PlaybookQualityCheck,
  PlaybookStage,
  PlaybookStatus,
} from "@/lib/playbooks/types";

/**
 * Writing the company's method.
 *
 * Editing changes the draft; publishing changes how the company works. Keeping
 * those two apart is the whole point — a manager rewording a step should not
 * silently change what people already mid-assignment were told to do.
 */
export function PlaybookEditor({
  playbookId,
  status,
  version,
  stages,
  qualityChecks,
  departments,
  departmentId,
}: {
  playbookId: string;
  status: PlaybookStatus;
  version: number;
  stages: PlaybookStage[];
  qualityChecks: PlaybookQualityCheck[];
  departments: { id: string; name: string }[];
  departmentId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingStage, setAddingStage] = useState(false);
  const [stageTitle, setStageTitle] = useState("");
  const [stageIntent, setStageIntent] = useState("");
  const [stepFor, setStepFor] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");
  const [changeSummary, setChangeSummary] = useState("");

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
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

  return (
    <div className="mt-8">
      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-900">Stages</h2>
        <button
          type="button"
          onClick={() => setAddingStage(!addingStage)}
          className="text-sm text-zinc-600 underline"
        >
          {addingStage ? "Cancel" : "Add a stage"}
        </button>
      </div>

      {addingStage && (
        <div className="mt-3 space-y-4 rounded-lg border border-zinc-200 p-5">
          <div>
            <label htmlFor="stage-title" className="block text-sm font-medium text-zinc-900">
              What is this stage called?
            </label>
            <input
              id="stage-title"
              value={stageTitle}
              maxLength={80}
              onChange={(event) => setStageTitle(event.target.value)}
              placeholder="Map the competition"
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="stage-intent" className="block text-sm font-medium text-zinc-900">
              What is it for?
            </label>
            <input
              id="stage-intent"
              value={stageIntent}
              maxLength={200}
              onChange={(event) => setStageIntent(event.target.value)}
              placeholder="Establish who is already there, from their own material."
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const ok = await send(`/api/playbooks/${playbookId}/stages`, "POST", {
                  title: stageTitle,
                  intent: stageIntent,
                });
                if (ok) {
                  setStageTitle("");
                  setStageIntent("");
                  setAddingStage(false);
                }
              }}
              className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              Add stage
            </button>
          </div>
        </div>
      )}

      {stages.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">
          No stages yet. A method with no stages tells nobody anything.
        </p>
      ) : (
        <ol className="mt-3 space-y-4">
          {stages.map((stage, index) => (
            <li key={stage.id} className="rounded-lg border border-zinc-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {index + 1}. {stage.title}
                  </p>
                  {stage.intent && (
                    <p className="mt-0.5 text-sm text-zinc-600">{stage.intent}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => send(`/api/playbooks/stages/${stage.id}`, "DELETE")}
                  className="shrink-0 text-xs text-zinc-400 underline disabled:opacity-60"
                >
                  Remove
                </button>
              </div>

              {stage.steps.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
                  {stage.steps.map((step) => (
                    <li key={step.id} className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-zinc-700">
                          {step.instruction}
                          {!step.required && (
                            <span className="ml-2 text-xs text-zinc-500">
                              only where it applies
                            </span>
                          )}
                        </p>
                        {step.expectedOutput && (
                          <p className="mt-0.5 text-xs text-zinc-500">
                            Should produce: {step.expectedOutput}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => send(`/api/playbooks/steps/${step.id}`, "DELETE")}
                        className="shrink-0 text-xs text-zinc-400 underline disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {stepFor === stage.id ? (
                <div className="mt-3 space-y-3 border-t border-zinc-100 pt-3">
                  <input
                    value={instruction}
                    maxLength={500}
                    onChange={(event) => setInstruction(event.target.value)}
                    placeholder="What should be done at this step?"
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                  />
                  <input
                    value={expectedOutput}
                    maxLength={200}
                    onChange={(event) => setExpectedOutput(event.target.value)}
                    placeholder="What should it leave behind?"
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setStepFor(null)}
                      className="text-sm text-zinc-600 underline"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await send(
                          `/api/playbooks/stages/${stage.id}`,
                          "POST",
                          { instruction, expectedOutput },
                        );
                        if (ok) {
                          setInstruction("");
                          setExpectedOutput("");
                          setStepFor(null);
                        }
                      }}
                      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                    >
                      Add step
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setStepFor(stage.id)}
                  className="mt-3 text-xs text-zinc-600 underline"
                >
                  Add a step
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {qualityChecks.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-zinc-900">
            What this method considers finished
          </h2>
          <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {qualityChecks.map((check) => (
              <li key={check.id} className="px-5 py-3">
                <p className="text-sm font-medium text-zinc-900">
                  {check.title}
                  {check.checkId && (
                    <span className="ml-2 text-xs font-normal text-zinc-500">
                      checked automatically
                    </span>
                  )}
                </p>
                {check.description && (
                  <p className="mt-0.5 text-sm text-zinc-600">{check.description}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-900">Who works this way</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              send(`/api/playbooks/${playbookId}`, "PATCH", { departmentId: null })
            }
            className={`rounded-full px-3 py-1 text-sm disabled:opacity-60 ${
              departmentId === null
                ? "bg-zinc-900 text-white"
                : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            Whole company
          </button>
          {departments.map((department) => (
            <button
              key={department.id}
              type="button"
              disabled={busy}
              onClick={() =>
                send(`/api/playbooks/${playbookId}`, "PATCH", {
                  departmentId: department.id,
                })
              }
              className={`rounded-full px-3 py-1 text-sm disabled:opacity-60 ${
                departmentId === department.id
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {department.name}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-zinc-200 p-5">
        <p className="text-sm font-medium text-zinc-900">
          {status === "active" ? `In use — version ${version}` : "Not in use yet"}
        </p>
        <p className="mt-1 text-sm text-zinc-600">
          {status === "active"
            ? "Publishing again makes a new version. Work already under way keeps the one it started with."
            : "Nobody works to this until you publish it."}
        </p>
        <input
          value={changeSummary}
          maxLength={200}
          onChange={(event) => setChangeSummary(event.target.value)}
          placeholder={
            status === "active" ? "What changed?" : "Anything to note about this first version?"
          }
          className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        />
        <div className="mt-3 flex items-center justify-between gap-4">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const ok = await send(`/api/playbooks/${playbookId}/publish`, "POST", {
                changeSummary,
              });
              if (ok) setChangeSummary("");
            }}
            className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {status === "active" ? "Publish new version" : "Put into use"}
          </button>
          {status === "active" && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                send(`/api/playbooks/${playbookId}`, "PATCH", { status: "archived" })
              }
              className="text-sm text-zinc-600 underline disabled:opacity-60"
            >
              Retire this method
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
