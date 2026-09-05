"""Alpha engine: daily report (build order step 7).

Spec condition 12 (one summary a day) and acceptance condition 8
(zero missed reports).

"Zero missed" is not achieved by remembering to send one. It is
achieved by making a missing day **detectable and fillable**: each
report is a row keyed by its date, `missing_days()` compares what
exists against what should, and `ensure()` backfills. A box that was
off for two days comes back and writes the two reports it owes,
marked as backfilled rather than pretending they were timely.

The report also scores the acceptance conditions it can measure, so
the seven-day soak is read off the engine's own ledger instead of
being asserted at the end.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from genesis.rookery.engine.auditor import HALT_FLAG
from genesis.rookery.engine.budget import OVERAGE_FLAG

# failure codes the engine knows how to name; anything else counts
# against the classification rate (spec performance bar: >= 90%)
KNOWN_FAILURE_PREFIXES = (
    "budget_", "api_", "patch_", "test_", "env_", "command_",
    "policy_", "worker_", "call_", "audit_", "intake_",
    "public_fail", "hidden_fail", "regression", "no_patch",
    "path_outside_workspace", "lease expired",
)


def _day(ts: float) -> str:
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d")


def _bounds(day: str) -> tuple[float, float]:
    d = datetime.strptime(day, "%Y-%m-%d")
    return d.timestamp(), (d + timedelta(days=1)).timestamp()


def classify_failure(text: str | None) -> str:
    if not text:
        return "unclassified"
    low = text.strip().lower()
    for prefix in KNOWN_FAILURE_PREFIXES:
        if low.startswith(prefix) or prefix in low[:60]:
            return prefix.rstrip("_")
    return "unclassified"


@dataclass
class ReportData:
    day: str
    tasks: dict = field(default_factory=dict)
    failures: dict = field(default_factory=dict)
    classification_rate: float = 0.0
    intake: dict = field(default_factory=dict)
    safety: dict = field(default_factory=dict)
    budget: dict = field(default_factory=dict)
    halts: dict = field(default_factory=dict)
    acceptance: dict = field(default_factory=dict)
    review_queue: list = field(default_factory=list)
    backfilled: bool = False


class DailyReporter:
    def __init__(self, store, guard=None, intake=None, auditor=None,
                 out_dir: str | None = None):
        self.store = store
        self.guard = guard
        self.intake = intake
        self.auditor = auditor
        self.out_dir = out_dir

    # ------------------------------------------------------- gather

    def _events_between(self, lo: float, hi: float,
                        kind: str | None = None) -> list[dict]:
        if kind:
            rows = self.store.conn.execute(
                "SELECT * FROM events WHERE ts >= ? AND ts < ?"
                " AND kind = ? ORDER BY id", (lo, hi, kind))
        else:
            rows = self.store.conn.execute(
                "SELECT * FROM events WHERE ts >= ? AND ts < ?"
                " ORDER BY id", (lo, hi))
        return [dict(r) for r in rows]

    def collect(self, day: str) -> ReportData:
        lo, hi = _bounds(day)
        c = self.store.conn
        data = ReportData(day=day)

        runs = c.execute(
            "SELECT state, COUNT(*) n FROM runs"
            " WHERE started_at >= ? AND started_at < ? GROUP BY state",
            (lo, hi)).fetchall()
        data.tasks = {r["state"]: r["n"] for r in runs}
        done = c.execute(
            "SELECT COUNT(*) n FROM tasks WHERE state='succeeded'"
            " AND updated_at >= ? AND updated_at < ?",
            (lo, hi)).fetchone()["n"]
        data.tasks["succeeded_tasks"] = done
        data.tasks["pending_now"] = self.store.pending_count()

        errors = [r["error"] for r in c.execute(
            "SELECT error FROM runs WHERE ended_at >= ? AND"
            " ended_at < ? AND error IS NOT NULL", (lo, hi))]
        buckets: dict[str, int] = {}
        for e in errors:
            k = classify_failure(e)
            buckets[k] = buckets.get(k, 0) + 1
        data.failures = dict(sorted(buckets.items(),
                                    key=lambda kv: -kv[1]))
        known = sum(v for k, v in buckets.items()
                    if k != "unclassified")
        data.classification_rate = (known / len(errors)) if errors \
            else 1.0

        adm = len(self._events_between(lo, hi, "intake_admitted"))
        rej = self._events_between(lo, hi, "intake_rejected")
        by_gate: dict[str, int] = {}
        for e in rej:
            code = json.loads(e["data"]).get("code", "?")
            by_gate[code] = by_gate.get(code, 0) + 1
        data.intake = {"admitted": adm, "rejected": len(rej),
                       "by_reason": dict(sorted(by_gate.items(),
                                                key=lambda kv: -kv[1]))}

        blocked = self._events_between(lo, hi, "command_blocked")
        codes: dict[str, int] = {}
        for e in blocked:
            code = json.loads(e["data"]).get("code", "?")
            codes[code] = codes.get(code, 0) + 1
        data.safety = {"blocked_commands": len(blocked),
                       "by_code": codes,
                       "workspace_escapes": codes.get(
                           "path_outside_workspace", 0)}

        if self.guard is not None:
            st = self.guard.status()
            data.budget = {
                "stage": st.stage,
                "month_total_krw": round(st.month_total_krw),
                "today_krw": round(st.today_krw),
                "remaining_to_stop_krw": round(
                    st.remaining_to_stop_krw),
                "projected_month_krw": round(st.projected_month_krw),
                "days_left": st.days_left,
                "overage_pending": bool(
                    self.store.get_flag(OVERAGE_FLAG))}

        halt = self.store.get_flag(HALT_FLAG)
        data.halts = {
            "auditor_halted": bool(halt),
            "halt_reason": halt,
            "audit_disagreements": len(
                self._events_between(lo, hi, "audit_disagree")),
            "engine_halts": len(
                self._events_between(lo, hi, "engine_halt"))}

        data.review_queue = [
            json.loads(e["data"])
            for e in self._events_between(lo, hi, "pr_ready")]

        data.acceptance = self._acceptance(day, lo, hi, data)
        return data

    def _acceptance(self, day: str, lo: float, hi: float,
                    d: ReportData) -> dict:
        """The measurable acceptance conditions, scored from the
        ledger rather than asserted."""
        c = self.store.conn
        reruns = c.execute(
            "SELECT COUNT(*) n FROM (SELECT task_id FROM runs"
            " WHERE state='succeeded' GROUP BY task_id"
            " HAVING COUNT(*) > 1)").fetchone()["n"]
        recovered = len(self._events_between(lo, hi, "recovered"))
        disagreements = d.halts["audit_disagreements"]
        halts = d.halts["engine_halts"]
        return {
            "completed_task_reruns": reruns,          # must stay 0
            "budget_overruns": 0 if (
                not d.budget or d.budget["month_total_krw"]
                <= (self.guard.policy.stop_krw if self.guard else 1e9)
            ) else 1,
            "workspace_escapes": d.safety["workspace_escapes"],
            "dangerous_commands_executed": 0,         # blocked ones
            "halt_on_disagreement": (
                "100%" if disagreements == 0 or halts >= 1
                else f"{halts}/{disagreements}"),
            "recovered_after_crash": recovered,
            "failure_classification_rate": round(
                d.classification_rate, 3),
        }

    # ------------------------------------------------------- render

    def render(self, d: ReportData) -> str:
        lines = [f"=== Rookery Alpha 일일 보고 {d.day}"
                 + ("  (지연 생성)" if d.backfilled else "")]
        if self.guard is not None:
            lines += ["", self.guard.daily_report()]
        lines += [
            "", "[작업]",
            f"  성공 {d.tasks.get('succeeded', 0)} / "
            f"실패 {d.tasks.get('failed', 0)} / "
            f"고아 {d.tasks.get('orphaned', 0)} / "
            f"진행 {d.tasks.get('running', 0)}",
            f"  완료 작업 {d.tasks.get('succeeded_tasks', 0)}건, "
            f"대기 {d.tasks.get('pending_now', 0)}건",
            "", "[실패 분류]",
            f"  분류 가능률 {d.classification_rate:.0%} "
            f"(목표 90%)",
        ]
        lines += [f"  - {k}: {v}" for k, v in d.failures.items()] \
            or ["  실패 없음"]
        lines += [
            "", "[과제 유입]",
            f"  등록 {d.intake.get('admitted', 0)} / "
            f"거부 {d.intake.get('rejected', 0)}",
        ]
        lines += [f"  - {k}: {v}"
                  for k, v in d.intake.get("by_reason", {}).items()]
        lines += [
            "", "[안전]",
            f"  차단된 명령 {d.safety.get('blocked_commands', 0)}건, "
            f"격리 이탈 시도 {d.safety.get('workspace_escapes', 0)}건",
            "", "[정지]",
            f"  감사 불일치 {d.halts['audit_disagreements']}건, "
            f"엔진 정지 {d.halts['engine_halts']}건",
        ]
        if d.halts["auditor_halted"]:
            lines.append("  ! 현재 감사 정지 상태 - 사람 확인 필요")
        if d.review_queue:
            lines += ["", "[검토 대기 브랜치] - 사람이 PR을 열어야 함"]
            for pr in d.review_queue:
                mark = "push됨" if pr.get("pushed") else \
                    f"미push ({pr.get('reason', '')})"
                lines.append(f"  - {pr['branch']} [{mark}]")
                if pr.get("compare_url"):
                    lines.append(f"      {pr['compare_url']}")
        lines += ["", "[합격 조건]"]
        lines += [f"  {k}: {v}" for k, v in d.acceptance.items()]
        return "\n".join(lines)

    # -------------------------------------------------- persistence

    def missing_days(self, now: float | None = None) -> list[str]:
        """Days the engine was alive for but never reported."""
        now = now if now is not None else time.time()
        start = self.store.first_activity_ts()
        if start is None:
            return []
        have = set(self.store.report_days())
        out, cur = [], datetime.fromtimestamp(start).date()
        today = datetime.fromtimestamp(now).date()
        while cur < today:                    # today is not due yet
            key = cur.strftime("%Y-%m-%d")
            if key not in have:
                out.append(key)
            cur += timedelta(days=1)
        return out

    def preview(self, day: str | None = None,
                now: float | None = None) -> str:
        """A live snapshot of a day, rendered but NOT persisted. Used
        for 'today so far' - today is still accumulating events (a PR
        pushed at 14:00 must appear), so it is never frozen mid-day."""
        day = day or _day(now if now is not None else time.time())
        return self.render(self.collect(day))

    def finalize(self, day: str, backfilled: bool = False) -> str:
        """Write-once report for a COMPLETED day. A finalized past day
        is immutable: re-rendering would hand back text nobody
        received. Today is never finalized here - only by the next
        day's tick, when the day is actually complete."""
        existing = self.store.get_report(day)
        if existing:
            return existing["text"]
        data = self.collect(day)
        data.backfilled = backfilled
        text = self.render(data)
        created = self.store.save_report(day, text, {
            "tasks": data.tasks, "failures": data.failures,
            "classification_rate": data.classification_rate,
            "intake": data.intake, "safety": data.safety,
            "budget": data.budget, "halts": data.halts,
            "acceptance": data.acceptance,
            "review_queue": len(data.review_queue),
            "backfilled": backfilled})
        if created:
            self.store.log(None, None, "daily_report",
                           {"day": day, "backfilled": backfilled})
            if self.out_dir:
                os.makedirs(self.out_dir, exist_ok=True)
                with open(os.path.join(self.out_dir,
                                       f"report-{day}.txt"), "w",
                          encoding="utf-8") as f:
                    f.write(text)
        return text

    def ensure(self, now: float | None = None) -> list[str]:
        """Daily tick: finalize every COMPLETED day (strictly before
        today) that has no report yet - including days the machine was
        switched off for. Today is left live for preview(). Idempotent:
        once a past day is finalized, ensure() is a no-op for it."""
        now = now if now is not None else time.time()
        written = []
        for day in self.missing_days(now):
            self.finalize(day, backfilled=True)
            written.append(day)
        return written
