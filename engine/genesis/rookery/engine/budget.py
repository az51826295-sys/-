"""Alpha engine: budget guard (build order step 2).

Not a running total that workers check - a **reservation ledger**.
A sum-then-decide guard has a race: two workers both read 44,000 and
both proceed. Here every worker must first WIN a reservation inside
`BEGIN IMMEDIATE`, and the limit is enforced against
`settled + still-held` in that same transaction, so concurrent
workers cannot jointly exceed a ceiling no matter how they interleave.

Lifecycle of one call:

    reserve(est)  -> held        (only a winner may call the API)
      settle(actual)  -> settled (delta recorded, unused amount freed)
      release(code)   -> released(failure: the whole estimate is freed)
      [worker dies]   -> expired (lease expiry frees it, no cleanup
                                  hook needed - in a power loss none
                                  of them run)

Internal currency is KRW throughout; the source USD and the rate used
are stored on every row so a rate change never rewrites history.

Stage policy (spec): 35,000 warn / 40,000 restrict high-cost work and
force one candidate / 45,000 stop all new external API work / local
work - tests, log tidying, the daily report - keeps running at every
stage, and 50,000 must be unreachable by any path.
"""

from __future__ import annotations

import calendar
import time
from dataclasses import dataclass, field
from datetime import datetime

from genesis.rookery.engine.store import Store

OVERAGE_FLAG = "budget_overage_review"
DEFAULT_USD_KRW = 1400.0

# failure codes (spec item 10: these must stay distinguishable)
FC_INTERNAL = "budget_exceeded_internal"
FC_CREDIT = "api_credit_exhausted"
FC_TASK_CAP = "budget_task_cap"
FC_DAILY = "budget_daily_cap"
FC_STAGE = "budget_stage_stop"
FC_OVERAGE = "budget_overage_review"
FC_CALL_FAILED = "call_failed"

NORMAL, WARN, RESTRICTED, STOPPED = ("normal", "warn", "restricted",
                                     "stopped")


@dataclass
class BudgetPolicy:
    month_total_krw: float = 60_000.0
    warn_krw: float = 35_000.0
    restrict_krw: float = 40_000.0
    stop_krw: float = 45_000.0
    hard_ceiling_krw: float = 50_000.0     # must be unreachable
    fixed_monthly_krw: float = 15_000.0    # server, not metered here
    daily_krw: float = 5_000.0
    task_krw: float = 3_000.0
    usd_krw: float = DEFAULT_USD_KRW
    reservation_ttl_s: float = 900.0

    def stage(self, month_total_krw: float) -> str:
        if month_total_krw >= self.stop_krw:
            return STOPPED
        if month_total_krw >= self.restrict_krw:
            return RESTRICTED
        if month_total_krw >= self.warn_krw:
            return WARN
        return NORMAL

    def max_candidates(self, risk: str, stage: str) -> int:
        """Risk-based candidate budget, clamped by stage."""
        base = {"low": 1, "medium": 2, "high": 3}.get(risk, 1)
        if stage in (RESTRICTED, STOPPED):
            return 1
        return base

    def allows_high_cost(self, stage: str) -> bool:
        return stage in (NORMAL, WARN)


@dataclass
class Reservation:
    id: int
    est_krw: float
    task_id: str | None
    worker: str | None
    expires_at: float


@dataclass
class Denied:
    code: str
    reason: str
    stage: str = ""


@dataclass
class BudgetStatus:
    now: float
    stage: str
    settled_krw: float          # API, this month
    held_krw: float
    month_total_krw: float      # settled + held + fixed
    today_krw: float
    remaining_to_stop_krw: float
    projected_month_krw: float
    days_left: int
    detail: dict = field(default_factory=dict)

    @property
    def stopped(self) -> bool:
        return self.stage == STOPPED


def _day_key(now: float) -> str:
    return datetime.fromtimestamp(now).strftime("%Y-%m-%d")


def _month_key(now: float) -> str:
    return datetime.fromtimestamp(now).strftime("%Y-%m")


class BudgetGuard:
    """All spend passes through reserve -> settle/release."""

    def __init__(self, store: Store,
                 policy: BudgetPolicy | None = None):
        self.store = store
        self.policy = policy or BudgetPolicy()

    # ------------------------------------------------------ accounting

    def _sums(self, now: float) -> dict[str, float]:
        """settled + held, per month / day / (optionally) task.
        Expired holds are excluded by expires_at, so a dead worker's
        reservation stops blocking the budget on its own."""
        c = self.store.conn
        mk, dk = _month_key(now), _day_key(now)
        row = c.execute(
            "SELECT"
            " COALESCE(SUM(CASE WHEN state='settled'"
            "   THEN actual_krw END),0) settled,"
            " COALESCE(SUM(CASE WHEN state='held' AND expires_at > ?"
            "   THEN est_krw END),0) held"
            " FROM reservations WHERE month_key=?", (now, mk)).fetchone()
        drow = c.execute(
            "SELECT"
            " COALESCE(SUM(CASE WHEN state='settled'"
            "   THEN actual_krw END),0) settled,"
            " COALESCE(SUM(CASE WHEN state='held' AND expires_at > ?"
            "   THEN est_krw END),0) held"
            " FROM reservations WHERE day_key=?", (now, dk)).fetchone()
        return {"month_settled": row["settled"],
                "month_held": row["held"],
                "day_settled": drow["settled"],
                "day_held": drow["held"]}

    def _task_committed(self, task_id: str, now: float) -> float:
        row = self.store.conn.execute(
            "SELECT COALESCE(SUM(CASE WHEN state='settled'"
            "   THEN actual_krw WHEN state='held' AND expires_at > ?"
            "   THEN est_krw END),0) v"
            " FROM reservations WHERE task_id=?",
            (now, task_id)).fetchone()
        return row["v"]

    def status(self, now: float | None = None) -> BudgetStatus:
        now = now if now is not None else time.time()
        s = self._sums(now)
        api = s["month_settled"] + s["month_held"]
        total = api + self.policy.fixed_monthly_krw
        d = datetime.fromtimestamp(now)
        total_days = calendar.monthrange(d.year, d.month)[1]
        elapsed = max(d.day - 1 + (now % 86400) / 86400, 0.05)
        burn = s["month_settled"] / elapsed
        return BudgetStatus(
            now=now, stage=self.policy.stage(total),
            settled_krw=s["month_settled"], held_krw=s["month_held"],
            month_total_krw=total,
            today_krw=s["day_settled"] + s["day_held"],
            remaining_to_stop_krw=max(self.policy.stop_krw - total, 0),
            projected_month_krw=(self.policy.fixed_monthly_krw
                                 + burn * total_days),
            days_left=total_days - d.day,
            detail={"burn_krw_per_day": burn,
                    "day_settled": s["day_settled"],
                    "day_held": s["day_held"]})

    # -------------------------------------------------------- reserve

    def reserve(self, est_krw: float, task_id: str | None = None,
                run_id: int | None = None, worker: str | None = None,
                now: float | None = None,
                external: bool = True) -> Reservation | Denied:
        """Atomic: the ceiling check and the insert are one
        transaction, so eight workers cannot jointly overshoot."""
        now = now if now is not None else time.time()
        c = self.store.conn
        try:
            c.execute("BEGIN IMMEDIATE")
            flag = self.store.get_flag(OVERAGE_FLAG)
            if flag:
                # 초과 검토는 초과를 낸 과제의 다음 호출을 막는다 -
                # 다른 과제의 첫 호출을 막으면 안 된다 ((b) 재검증
                # A팔: 439의 마지막 초과가 310의 1차 시도를 1스텝에
                # 끝냈다). 주인이 다르면 플래그만 걷고 통과.
                self.store.clear_flag(OVERAGE_FLAG)
                owner = flag.get("task_id") if isinstance(flag, dict)                     else None
                if owner is None or owner == task_id:
                    c.execute("COMMIT")
                    self._log_denial(FC_OVERAGE, task_id,
                                     "직전 호출이 예상 비용을 초과 - "
                                     "다음 호출 1회 차단")
                    return Denied(FC_OVERAGE, "overage review", "")
            s = self._sums(now)
            api = s["month_settled"] + s["month_held"]
            total = api + self.policy.fixed_monthly_krw
            stage = self.policy.stage(total)

            if external and stage == STOPPED:
                c.execute("COMMIT")
                self._log_denial(FC_STAGE, task_id,
                                 f"월 {total:,.0f}원 - 신규 외부 API 중지")
                return Denied(FC_STAGE, "stage stop", stage)
            if total + est_krw > self.policy.stop_krw and external:
                c.execute("COMMIT")
                self._log_denial(
                    FC_INTERNAL, task_id,
                    f"예약 {est_krw:,.0f}원 시 정지선 초과 "
                    f"({total:,.0f} + {est_krw:,.0f} > "
                    f"{self.policy.stop_krw:,.0f})")
                return Denied(FC_INTERNAL, "would cross stop", stage)
            day = s["day_settled"] + s["day_held"]
            if day + est_krw > self.policy.daily_krw:
                c.execute("COMMIT")
                self._log_denial(FC_DAILY, task_id,
                                 f"일 한도 초과 ({day:,.0f} + "
                                 f"{est_krw:,.0f} > "
                                 f"{self.policy.daily_krw:,.0f})")
                return Denied(FC_DAILY, "daily cap", stage)
            if task_id is not None:
                used = self._task_committed(task_id, now)
                if used + est_krw > self.policy.task_krw:
                    c.execute("COMMIT")
                    self._log_denial(FC_TASK_CAP, task_id,
                                     f"작업 한도 초과 ({used:,.0f} + "
                                     f"{est_krw:,.0f} > "
                                     f"{self.policy.task_krw:,.0f})")
                    return Denied(FC_TASK_CAP, "task cap", stage)

            cur = c.execute(
                "INSERT INTO reservations (task_id, run_id, worker,"
                " state, est_krw, rate, day_key, month_key,"
                " created_at, expires_at)"
                " VALUES (?,?,?,'held',?,?,?,?,?,?)",
                (task_id, run_id, worker, est_krw,
                 self.policy.usd_krw, _day_key(now), _month_key(now),
                 now, now + self.policy.reservation_ttl_s))
            res_id = cur.lastrowid
            c.execute("COMMIT")
        except Exception:
            c.execute("ROLLBACK")
            raise
        self.store.log(task_id, run_id, "budget_reserved",
                       {"reservation": res_id, "est_krw": est_krw,
                        "stage": stage})
        return Reservation(id=res_id, est_krw=est_krw,
                           task_id=task_id, worker=worker,
                           expires_at=now + self.policy.reservation_ttl_s)

    def settle(self, res: Reservation, usd: float, tokens_in: int = 0,
               tokens_out: int = 0, now: float | None = None) -> float:
        """Record the real cost; the unused part of the estimate is
        freed automatically because only `actual_krw` counts once the
        row leaves 'held'. Returns the delta (actual - estimate)."""
        now = now if now is not None else time.time()
        actual = usd * self.policy.usd_krw
        delta = actual - res.est_krw
        self.store.conn.execute(
            "UPDATE reservations SET state='settled', actual_krw=?,"
            " delta_krw=?, usd=?, tokens_in=?, tokens_out=?,"
            " settled_at=? WHERE id=? AND state='held'",
            (actual, delta, usd, tokens_in, tokens_out, now, res.id))
        self.store.log(res.task_id, None, "budget_settled",
                       {"reservation": res.id, "est_krw": res.est_krw,
                        "actual_krw": round(actual, 2),
                        "delta_krw": round(delta, 2), "usd": usd,
                        "rate": self.policy.usd_krw})
        if delta > 0:
            # spec: record the overage AND block the next call so the
            # estimator is re-checked before more spend
            self.store.set_flag(OVERAGE_FLAG,
                                {"delta_krw": delta, "at": now,
                                 "reservation": res.id,
                                 "task_id": res.task_id})
            self.store.log(res.task_id, None, "budget_overage",
                           {"delta_krw": round(delta, 2)})
        return delta

    def release(self, res: Reservation, code: str = FC_CALL_FAILED,
                now: float | None = None) -> None:
        """Call failed: give the whole estimate back."""
        now = now if now is not None else time.time()
        self.store.conn.execute(
            "UPDATE reservations SET state='released', actual_krw=0,"
            " delta_krw=0, failure_code=?, settled_at=?"
            " WHERE id=? AND state='held'", (code, now, res.id))
        self.store.log(res.task_id, None, "budget_released",
                       {"reservation": res.id, "code": code,
                        "freed_krw": res.est_krw})

    def sweep_expired(self, now: float | None = None) -> int:
        """Reservations whose worker died. Startup + periodic."""
        now = now if now is not None else time.time()
        cur = self.store.conn.execute(
            "UPDATE reservations SET state='expired', actual_krw=0,"
            " delta_krw=0, failure_code='worker_lost', settled_at=?"
            " WHERE state='held' AND expires_at <= ?", (now, now))
        if cur.rowcount:
            self.store.log(None, None, "budget_reservation_expired",
                           {"count": cur.rowcount})
        return cur.rowcount

    def _log_denial(self, code: str, task_id: str | None,
                    reason: str) -> None:
        self.store.log(task_id, None, "budget_denied",
                       {"code": code, "reason": reason})

    # --------------------------------------------------------- policy

    def allow_new_work(self, now: float | None = None,
                       external: bool = True) -> tuple[bool, str]:
        st = self.status(now)
        if external and st.stopped:
            return False, (f"월 {st.month_total_krw:,.0f}원 "
                           f"≥ 정지선 {self.policy.stop_krw:,.0f}원")
        return True, ""

    def max_candidates(self, risk: str,
                       now: float | None = None) -> int:
        return self.policy.max_candidates(risk, self.status(now).stage)

    def krw(self, usd: float) -> float:
        return usd * self.policy.usd_krw

    def estimate_krw(self, tokens_in: int, tokens_out: int,
                     usd_per_mtok_in: float,
                     usd_per_mtok_out: float) -> float:
        usd = (tokens_in / 1e6 * usd_per_mtok_in
               + tokens_out / 1e6 * usd_per_mtok_out)
        return usd * self.policy.usd_krw

    # --------------------------------------------------------- report

    def daily_report(self, now: float | None = None) -> str:
        st = self.status(now)
        d = datetime.fromtimestamp(st.now)
        rows = self.store.conn.execute(
            "SELECT state, COUNT(*) n, COALESCE(SUM(actual_krw),0) a"
            " FROM reservations WHERE month_key=? GROUP BY state",
            (_month_key(st.now),)).fetchall()
        by_state = {r["state"]: (r["n"], r["a"]) for r in rows}
        lines = [
            f"[예산] {d:%Y-%m-%d}  단계={st.stage}",
            f"  오늘        {st.today_krw:>8,.0f}원 "
            f"/ 일한도 {self.policy.daily_krw:,.0f}원",
            f"  이달 확정   {st.settled_krw:>8,.0f}원 "
            f"(예약중 {st.held_krw:,.0f}원)",
            f"  고정비      {self.policy.fixed_monthly_krw:>8,.0f}원",
            f"  이달 합계   {st.month_total_krw:>8,.0f}원 "
            f"/ 한도 {self.policy.month_total_krw:,.0f}원",
            f"  정지선까지  {st.remaining_to_stop_krw:>8,.0f}원 "
            f"(잔여 {st.days_left}일)",
            f"  월말 예상   {st.projected_month_krw:>8,.0f}원 "
            f"(일 {st.detail['burn_krw_per_day']:,.0f}원 추세)",
            f"  예약 원장   " + ", ".join(
                f"{k} {v[0]}건" for k, v in sorted(by_state.items()))
            or "  예약 원장   없음",
        ]
        if st.projected_month_krw > self.policy.month_total_krw:
            lines.append("  ! 추세대로면 월 한도 초과 예상")
        if st.stage == STOPPED:
            lines.append("  ! 신규 외부 API 작업 중지 상태 "
                         "(로컬 작업은 계속 허용)")
        return "\n".join(lines)
