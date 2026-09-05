"""Learning report: is the system getting better at predicting its world?

Builds a plain-text (ASCII-only) report from persisted episode records:
per-run aggregates in chronological order, a bar chart of average
prediction error per run, and a simple earlier-vs-recent trend verdict.
"""

from __future__ import annotations

from genesis.models.experience import EpisodeRecord

BAR_WIDTH = 30
# Relative difference below which the trend counts as flat
FLAT_TOLERANCE = 0.05


def build_learning_report(
    records: list[EpisodeRecord],
    experience_count: int | None = None,
) -> str:
    if not records:
        return "No episodes recorded yet. Run some episodes first."

    lines: list[str] = []
    lines.append("Genesis Learning Report")
    lines.append("=" * 40)

    runs: dict[str, list[EpisodeRecord]] = {}
    for record in records:
        runs.setdefault(record.run_id, []).append(record)

    successes = sum(1 for r in records if r.success)
    header = f"Runs: {len(runs)} | Episodes: {len(records)}"
    if experience_count is not None:
        header += f" | Experiences: {experience_count}"
    lines.append(header)
    lines.append(f"Overall success rate: {successes}/{len(records)}")
    lines.append("")

    lines.append("Per run (chronological):")
    run_errors: list[float] = []
    for run_id, items in runs.items():
        avg_error = sum(r.average_prediction_error for r in items) / len(items)
        avg_reward = sum(r.total_reward for r in items) / len(items)
        run_successes = sum(1 for r in items if r.success)
        run_errors.append(avg_error)
        stamp = items[0].created_at.strftime("%Y-%m-%d %H:%M")
        lines.append(
            f"  {run_id}  {stamp}"
            f" | agent={items[0].agent:<8} model={items[0].model:<10}"
            f" difficulty={items[0].difficulty:<8}"
            f" | episodes {len(items):>2}"
            f" | success {run_successes}/{len(items)}"
            f" | avg error {avg_error:.3f}"
            f" | avg reward {avg_reward:+.2f}"
        )
    lines.append("")

    lines.append("Average prediction error by run:")
    max_error = max(run_errors)
    for run_id, error in zip(runs, run_errors):
        if max_error > 0:
            bar = "#" * max(1, round(error / max_error * BAR_WIDTH))
        else:
            bar = ""
        lines.append(f"  {run_id}  {error:.3f} {bar}")
    lines.append("")

    # Average prediction error sits at a noise floor once the world is
    # stochastic (decisions #18), so outcomes are the first-class signal.
    lines.append("Outcomes by difficulty:")
    difficulty_groups: dict[str, list[EpisodeRecord]] = {}
    for record in records:
        difficulty_groups.setdefault(record.difficulty, []).append(record)
    for difficulty, items in difficulty_groups.items():
        solved = sum(1 for r in items if r.success)
        total_steps = sum(r.total_steps for r in items)
        total_hits = sum(r.hazard_hits for r in items)
        avg_reward = sum(r.total_reward for r in items) / len(items)
        line = (
            f"  {difficulty:<9} solved {solved}/{len(items)}"
            f" | avg reward {avg_reward:+.2f}"
        )
        if total_hits or difficulty != "basic":
            hits_per_step = total_hits / total_steps if total_steps else 0.0
            line += f" | hazard hits/step {hits_per_step:.4f}"
        lines.append(line)
    lines.append("")

    lines.append(_trend_line(records))

    for label, key in (
        ("Trend by agent:", lambda r: r.agent),
        ("Trend by difficulty:", lambda r: r.difficulty),
    ):
        groups: dict[str, list[EpisodeRecord]] = {}
        for record in records:
            groups.setdefault(key(record), []).append(record)
        if len(groups) > 1:
            lines.append("")
            lines.append(label)
            for name, items in groups.items():
                verdict = _trend_line(items).removeprefix("Trend: ")
                lines.append(f"  {name:<8} {verdict}")
    return "\n".join(lines)


def _trend_line(records: list[EpisodeRecord]) -> str:
    if len(records) < 2:
        return "Trend: not enough episodes to compare."
    midpoint = len(records) // 2
    earlier = records[:midpoint]
    recent = records[midpoint:]
    earlier_mean = sum(
        r.average_prediction_error for r in earlier
    ) / len(earlier)
    recent_mean = sum(r.average_prediction_error for r in recent) / len(recent)

    scale = max(earlier_mean, recent_mean)
    if scale == 0 or abs(earlier_mean - recent_mean) <= FLAT_TOLERANCE * scale:
        verdict = "flat"
    elif recent_mean < earlier_mean:
        verdict = "improving"
    else:
        verdict = "worsening"
    return (
        f"Trend: {verdict}"
        f" (earlier mean {earlier_mean:.4f} -> recent mean {recent_mean:.4f})"
    )
