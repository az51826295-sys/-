"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { OnboardingQuestion } from "@/lib/employees/definitions";

export type NumberRange = { min?: number; max?: number };
type AnswerValue = string | string[] | NumberRange;

const LIST_TYPES = ["multi_select", "list", "ranked_select"];

function toAnswerValue(
  question: OnboardingQuestion,
  stored: { text: string | null; json: unknown } | undefined,
): AnswerValue {
  if (question.inputType === "number_range") {
    const json = stored?.json as NumberRange | undefined;
    return json && typeof json === "object" ? json : {};
  }
  if (LIST_TYPES.includes(question.inputType)) {
    return Array.isArray(stored?.json) ? (stored!.json as string[]) : [];
  }
  return stored?.text ?? "";
}

function isAnswerEmpty(value: AnswerValue) {
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    return value.min === undefined && value.max === undefined;
  }
  return value.trim().length === 0;
}

/** Blank means "no limit here", which is different from zero. */
function parseBound(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined;
}

export function OnboardingInterview({
  companyEmployeeId,
  employeeName,
  greeting,
  questions,
  initialAnswers,
  initialCurrentQuestionId,
}: {
  companyEmployeeId: string;
  employeeName: string;
  greeting: string;
  questions: OnboardingQuestion[];
  initialAnswers: Record<string, { text: string | null; json: unknown }>;
  initialCurrentQuestionId: string | null;
}) {
  const router = useRouter();

  const [phase, setPhase] = useState<"greeting" | "interview">(
    Object.keys(initialAnswers).length === 0 ? "greeting" : "interview",
  );

  const startIndex = useMemo(() => {
    const idx = questions.findIndex((q) => q.id === initialCurrentQuestionId);
    return idx >= 0 ? idx : 0;
  }, [questions, initialCurrentQuestionId]);

  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => {
    const map: Record<string, AnswerValue> = {};
    for (const q of questions) {
      map[q.id] = toAnswerValue(q, initialAnswers[q.id]);
    }
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;
  const value = answers[question.id];

  async function saveCurrentAnswer(nextQuestionId: string) {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/company-employees/${companyEmployeeId}/onboarding/answers`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: question.id,
            answer: value,
            currentQuestionId: nextQuestionId,
          }),
        },
      );

      const body = await res.json();

      if (!res.ok) {
        setError(body.error ?? "I couldn't save your answer.");
        return false;
      }

      return true;
    } catch {
      setError("I couldn't save your answer. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function updateValue(next: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [question.id]: next }));
  }

  async function handleContinue() {
    if (question.required && isAnswerEmpty(value)) {
      setError("Please answer this question before continuing.");
      return;
    }

    // Caught here as well as on the server, so the manager sees it beside the
    // two fields rather than after a round trip.
    if (question.inputType === "number_range") {
      const range = value as NumberRange;
      if (
        range.min !== undefined &&
        range.max !== undefined &&
        range.min > range.max
      ) {
        setError("The smallest company size must not be larger than the largest.");
        return;
      }
    }

    if (isLast) {
      const ok = await saveCurrentAnswer(question.id);
      if (ok) {
        router.push(`/dashboard/employees/${companyEmployeeId}/onboarding/review`);
      }
      return;
    }

    const nextQuestion = questions[currentIndex + 1];
    const ok = await saveCurrentAnswer(nextQuestion.id);
    if (ok) {
      setCurrentIndex((i) => i + 1);
    }
  }

  function handleBack() {
    setError(null);
    setCurrentIndex((i) => Math.max(0, i - 1));
  }

  if (phase === "greeting") {
    return (
      <div className="rounded-lg border border-zinc-200 p-8">
        <p className="text-sm font-medium text-zinc-500">{employeeName}</p>
        <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-zinc-900">
          {greeting}
        </p>
        <button
          onClick={() => setPhase("interview")}
          className="mt-8 rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Get Started
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-medium text-zinc-900">Onboarding {employeeName}</h1>
        <p className="text-sm text-zinc-500">
          Question {currentIndex + 1} of {questions.length}
        </p>
      </div>

      <div className="mt-3 flex gap-1">
        {questions.map((q, i) => (
          <div
            key={q.id}
            className={`h-1.5 flex-1 rounded-full ${
              i <= currentIndex ? "bg-zinc-900" : "bg-zinc-200"
            }`}
          />
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-zinc-200 p-8">
        <p className="text-sm font-medium text-zinc-500">{employeeName}</p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-900">{question.question}</h2>
        {question.description && (
          <p className="mt-1 text-sm text-zinc-500">{question.description}</p>
        )}

        <div className="mt-6">
          {question.inputType === "textarea" && (
            <textarea
              value={value as string}
              onChange={(e) => updateValue(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          )}

          {question.inputType === "text" && (
            <input
              type="text"
              value={value as string}
              onChange={(e) => updateValue(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          )}

          {question.inputType === "list" && (
            <div>
              <textarea
                value={(value as string[]).join("\n")}
                onChange={(e) =>
                  updateValue(
                    e.target.value.split("\n").map((line) => line.trim()).filter(Boolean),
                  )
                }
                rows={4}
                placeholder={question.placeholder ?? "One per line"}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              />
              <p className="mt-1 text-xs text-zinc-400">One per line</p>
            </div>
          )}

          {question.inputType === "number_range" && (
            <div className="flex flex-wrap gap-4">
              {(["min", "max"] as const).map((bound) => (
                <div key={bound} className="flex-1">
                  <label
                    htmlFor={`${question.id}-${bound}`}
                    className="block text-xs text-zinc-500"
                  >
                    {question.rangeLabels?.[bound] ??
                      (bound === "min" ? "Minimum" : "Maximum")}
                  </label>
                  <input
                    id={`${question.id}-${bound}`}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={(value as NumberRange)[bound] ?? ""}
                    onChange={(e) =>
                      updateValue({
                        ...(value as NumberRange),
                        [bound]: parseBound(e.target.value),
                      })
                    }
                    placeholder="No limit"
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Ranked: order is the answer, so selecting shows a position rather
              than a tick. The manager reads back "1, 2, 3", not a set. */}
          {question.inputType === "ranked_select" && (
            <div className="flex flex-col gap-2">
              {question.options?.map((option) => {
                const current = value as string[];
                const position = current.indexOf(option);
                const selected = position >= 0;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() =>
                      updateValue(
                        selected
                          ? current.filter((item) => item !== option)
                          : [...current, option],
                      )
                    }
                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${
                      selected
                        ? "border-zinc-900 text-zinc-900"
                        : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
                    }`}
                  >
                    <span>{option}</span>
                    {selected && (
                      <span className="ml-3 shrink-0 rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white">
                        {position + 1}
                      </span>
                    )}
                  </button>
                );
              })}
              <p className="mt-1 text-xs text-zinc-400">
                Tap in order of importance. Most important first.
              </p>
            </div>
          )}

          {question.inputType === "multi_select" && (
            <div className="flex flex-col gap-2">
              {question.options?.map((option) => {
                const selected = (value as string[]).includes(option);
                return (
                  <label
                    key={option}
                    className="flex items-center gap-2 text-sm text-zinc-700"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) => {
                        const current = value as string[];
                        updateValue(
                          e.target.checked
                            ? [...current, option]
                            : current.filter((o) => o !== option),
                        );
                      }}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    {option}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={handleBack}
          disabled={currentIndex === 0 || saving}
          className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          disabled={saving}
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {saving ? "Saving..." : isLast ? "Review My Answers" : "Continue"}
        </button>
      </div>
    </div>
  );
}
