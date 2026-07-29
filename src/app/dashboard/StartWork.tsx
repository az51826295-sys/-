"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clarityBandClass,
  clarityBandLabel,
  scoreClarity,
} from "@/lib/assignments/clarity";

/**
 * One sentence, at the top of the home screen.
 *
 * Everything behind this already existed: a project gets divided into work
 * items, each routed to the department that can do it, and the plan comes back
 * for the manager to read before anybody starts. What did not exist was a way
 * in that did not look like paperwork — four labelled fields asking for a
 * title, a goal, an expected outcome and a priority before anything happens.
 *
 * So this asks for the sentence and derives the rest. The manager says what
 * they want; who does it is worked out for them.
 *
 * Two things it deliberately does not do:
 *
 * It does not skip the plan. The plan screen is the moment they get to
 * disagree before any money is spent, and a box that went straight to work
 * would be faster and worse.
 *
 * It does not refuse a short sentence. It says what the employees will have to
 * guess and lets the manager decide whether that matters — sometimes a vague
 * question is exactly the right one.
 */
export function StartWork({ canStart }: { canStart: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // String arithmetic, so it can run on every keystroke without costing
  // anything. Only the description check applies here — there is one field.
  const clarity = useMemo(
    () => scoreClarity({ title: text, description: text, expectedOutcome: "" }),
    [text],
  );

  const trimmed = text.trim();
  const tooShort = trimmed.length < 20;

  async function start() {
    if (tooShort) {
      setError("Say a little more — at least a sentence.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // The title is the first sentence, so the project is recognisable in a
      // list; the goal is everything they wrote, so nothing they said is lost.
      const firstSentence = trimmed.split(/(?<=[.?!。])\s|\n/)[0] ?? trimmed;

      const created = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: firstSentence.slice(0, 200),
          goal: trimmed,
          priority: "normal",
        }),
      });

      const body = await created.json();

      if (!created.ok) {
        setError(body.error ?? "I couldn't start this. What you wrote is still here.");
        return;
      }

      const planned = await fetch(`/api/projects/${body.projectId}/prepare-plan`, {
        method: "POST",
      });

      // The project exists either way. If planning failed, its retry lives on
      // the project page rather than being lost with this box.
      router.push(
        planned.ok
          ? `/dashboard/projects/${body.projectId}/plan`
          : `/dashboard/projects/${body.projectId}`,
      );
    } catch {
      setError("I couldn't start this. What you wrote is still here. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-zinc-900">
        What do you want done?
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Say it in your own words. The work gets divided up and you&apos;ll see
        who is doing what before anyone starts.
      </p>

      <textarea
        rows={3}
        value={text}
        maxLength={5000}
        disabled={!canStart || submitting}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start();
        }}
        placeholder="Find out what the main AI note-taking tools charge small teams in Korea, and where the gap is."
        className="mt-4 w-full resize-none rounded-lg border border-zinc-300 px-4 py-3 text-sm focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50"
      />

      {/*
        Only once they have started writing. An empty box scored "they'll have
        to guess" would be scolding someone for not having typed yet.
      */}
      {trimmed.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${clarityBandClass[clarity.band]}`}
          >
            {clarityBandLabel[clarity.band]}
          </span>
          {clarity.missing.length > 0 && (
            <span className="text-xs text-zinc-500">
              {clarity.missing[0].hint}
            </span>
          )}
        </div>
      )}

      {!canStart && (
        <p className="mt-3 text-sm text-zinc-500">
          Hire and train at least one employee first.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-4">
        {submitting && (
          <p className="text-xs text-zinc-500">
            Working out who should do what. This takes a moment.
          </p>
        )}
        <button
          type="button"
          onClick={start}
          disabled={!canStart || submitting || tooShort}
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
        >
          {submitting ? "Preparing..." : "Start"}
        </button>
      </div>
    </section>
  );
}
