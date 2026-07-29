import { formatUsd, purposeLabel } from "@/lib/costs/pricing";
import type { UsageSummary } from "@/lib/costs/service";

/**
 * What a piece of work cost to produce.
 *
 * Collapsed to a single figure with the breakdown behind a disclosure: the
 * total is what the manager checks routinely, and the per-call detail is what
 * they want only when the total surprises them.
 */
export function CostSummary({
  usage,
  label = "This work cost",
}: {
  usage: UsageSummary;
  label?: string;
}) {
  if (usage.callCount === 0) return null;

  return (
    <details className="mt-6 rounded-lg border border-zinc-200 px-5 py-4">
      <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm">
        <span className="text-zinc-600">{label}</span>
        <span className="font-medium text-zinc-900">
          {formatUsd(usage.totalUsd)}
        </span>
      </summary>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500">
            <th className="pb-2 font-normal">Step</th>
            <th className="pb-2 text-right font-normal">In</th>
            <th className="pb-2 text-right font-normal">Out</th>
            <th className="pb-2 text-right font-normal">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {usage.lines.map((line, index) => (
            <tr key={`${line.purpose}-${index}`}>
              <td className="py-2 text-zinc-700">
                {/* An unlabelled step still shows its raw id — a cost with no
                    explanation is worse than an ugly one. */}
                {purposeLabel[line.purpose] ?? line.purpose}
              </td>
              <td className="py-2 text-right tabular-nums text-zinc-500">
                {line.inputTokens.toLocaleString()}
              </td>
              <td className="py-2 text-right tabular-nums text-zinc-500">
                {line.outputTokens.toLocaleString()}
              </td>
              <td className="py-2 text-right tabular-nums text-zinc-700">
                {formatUsd(line.costUsd)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-200">
            <td className="pt-2 text-zinc-600">
              {usage.callCount} {usage.callCount === 1 ? "step" : "steps"}
            </td>
            <td className="pt-2 text-right tabular-nums text-zinc-500">
              {usage.inputTokens.toLocaleString()}
            </td>
            <td className="pt-2 text-right tabular-nums text-zinc-500">
              {usage.outputTokens.toLocaleString()}
            </td>
            <td className="pt-2 text-right font-medium tabular-nums text-zinc-900">
              {formatUsd(usage.totalUsd)}
            </td>
          </tr>
        </tfoot>
      </table>
    </details>
  );
}
