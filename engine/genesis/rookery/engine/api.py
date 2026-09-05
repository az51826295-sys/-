"""Alpha engine: guarded API client (build order step 2, spec
condition 6 - preflight, retry, balance-error handling).

Every model call in the engine goes through here so that three things
are true without the caller remembering them:

1. **A budget stop blocks the call**, not just the next task claim.
2. **Transient failures retry with backoff; permanent ones do not.**
   The distinction is what kept the 7-series alive: a 401 or an
   out-of-credit 400 costs nothing and retrying it just burns wall
   clock, while a 429 or a socket death is worth another try.
3. **Every call's tokens land in the ledger**, so the budget guard
   and the daily report read the same numbers.

The out-of-credit case is treated as a hard stop, not a failure of
the task: the task returns to the queue and the engine trips the
budget flag, because retrying against an empty balance can never
succeed and would spin every worker.
"""

from __future__ import annotations

import random
import re
import time
from dataclasses import dataclass, field

from genesis.rookery.engine.budget import (
    FC_CALL_FAILED, FC_CREDIT, BudgetGuard, Denied)
from genesis.rookery.engine.store import Store

# 400 with these markers means "no money", not "bad request"
CREDIT_MARKERS = ("credit balance", "insufficient", "quota",
                  "billing", "exceeded your current quota")
RETRYABLE_STATUS = (408, 409, 425, 429, 500, 502, 503, 504, 529)


class BudgetStopped(RuntimeError):
    """New spend is not permitted right now."""


class CreditExhausted(RuntimeError):
    """The account cannot pay for calls; retrying cannot help."""


class AuthFailed(RuntimeError):
    """Key missing, revoked or wrong; retrying cannot help."""


@dataclass
class CallResult:
    text: str
    tokens_in: int = 0
    tokens_out: int = 0
    attempts: int = 1
    seconds: float = 0.0
    cost_usd: float = 0.0
    delta_krw: float = 0.0


@dataclass
class Usage:
    calls: int = 0
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float = 0.0
    retries: int = 0
    errors: list[str] = field(default_factory=list)


def classify_error(exc: Exception) -> str:
    """-> 'credit' | 'auth' | 'retryable' | 'permanent'."""
    text = str(exc).lower()
    status = None
    m = re.search(r"http (\d{3})", text)
    if m:
        status = int(m.group(1))
    if any(k in text for k in CREDIT_MARKERS):
        return "credit"
    if status in (401, 403) or "authentication_error" in text \
            or "api key" in text:
        return "auth"
    if status in RETRYABLE_STATUS or "rate limit" in text \
            or "overloaded" in text or "timed out" in text \
            or "timeout" in text or "connection" in text:
        return "retryable"
    if status == 400:
        # a real malformed request - retrying repeats the mistake
        return "permanent"
    return "retryable" if status is None and "error" not in text \
        else "permanent"


class GuardedClient:
    """Wraps any object exposing
    `complete(prompt, temperature, a, b) -> str`."""

    def __init__(self, provider, store: Store, guard: BudgetGuard,
                 usd_per_mtok_in: float, usd_per_mtok_out: float,
                 max_retries: int = 4, base_delay: float = 2.0,
                 default_max_tokens: int = 4000, sleep=time.sleep):
        self.provider = provider
        self.store = store
        self.guard = guard
        self.price_in = usd_per_mtok_in
        self.price_out = usd_per_mtok_out
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.default_max_tokens = default_max_tokens
        self._sleep = sleep
        self.usage = Usage()

    # ------------------------------------------------------ preflight

    def preflight(self) -> tuple[bool, str]:
        """Cheap pre-run check: budget open and the provider reachable
        with the exact parameters the run will use (the P40 lesson -
        an unsupported parameter is a 400 on the first real call)."""
        ok, reason = self.guard.allow_new_work()
        if not ok:
            return False, f"budget: {reason}"
        try:
            self.complete("preflight check - reply OK", task_id=None,
                          max_tokens=16)
        except (CreditExhausted, AuthFailed) as exc:
            return False, f"{type(exc).__name__}: {exc}"
        except Exception as exc:                       # noqa: BLE001
            return False, f"call failed: {str(exc)[:200]}"
        return True, "ok"

    # ----------------------------------------------------------- call

    def estimate_krw(self, prompt: str, max_tokens: int) -> float:
        """Pre-call estimate: prompt chars / 4 in, max_tokens out -
        deliberately the worst case, because an under-estimate is what
        lets spend slip past a reservation."""
        return self.guard.estimate_krw(
            int(len(prompt) / 4) + 64, max_tokens,
            self.price_in, self.price_out)

    def complete(self, prompt: str, temperature: float = 1.0,
                 a: int = 0, b: int = 0,
                 task_id: str | None = None,
                 run_id: int | None = None,
                 worker: str | None = None,
                 max_tokens: int | None = None) -> CallResult:
        """reserve -> call -> settle/release. No path calls the API
        without holding a reservation."""
        est = self.estimate_krw(prompt,
                                max_tokens or self.default_max_tokens)
        res = self.guard.reserve(est, task_id=task_id, run_id=run_id,
                                 worker=worker, external=True)
        if isinstance(res, Denied):
            self.store.log(task_id, run_id, "call_blocked",
                           {"code": res.code, "reason": res.reason,
                            "est_krw": est})
            raise BudgetStopped(f"{res.code}: {res.reason}")

        t0 = time.time()
        last: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                before = dict(getattr(self.provider, "usage", {}) or {})
                text = self.provider.complete(prompt, temperature, a, b)
                after = dict(getattr(self.provider, "usage", {}) or {})
                ti = after.get("input_tokens", 0) - \
                    before.get("input_tokens", 0)
                to = after.get("output_tokens", 0) - \
                    before.get("output_tokens", 0)
                cost = (ti / 1e6 * self.price_in
                        + to / 1e6 * self.price_out)
                delta = self.guard.settle(res, cost, ti, to)
                self.usage.calls += 1
                self.usage.tokens_in += ti
                self.usage.tokens_out += to
                self.usage.cost_usd += cost
                self.store.log(task_id, run_id, "call", {
                    "attempt": attempt, "tokens_in": ti,
                    "tokens_out": to, "cost_usd": round(cost, 6),
                    "est_krw": round(est, 2),
                    "delta_krw": round(delta, 2)})
                return CallResult(text=text, tokens_in=ti,
                                  tokens_out=to, attempts=attempt,
                                  seconds=round(time.time() - t0, 2),
                                  cost_usd=cost, delta_krw=delta)
            except Exception as exc:                   # noqa: BLE001
                last = exc
                kind = classify_error(exc)
                self.usage.errors.append(f"{kind}: {str(exc)[:120]}")
                self.store.log(task_id, run_id, "call_error",
                               {"attempt": attempt, "kind": kind,
                                "error": str(exc)[:300]})
                if kind == "credit":
                    self.guard.release(res, FC_CREDIT)
                    raise CreditExhausted(str(exc)[:300]) from exc
                if kind == "auth":
                    self.guard.release(res, "api_auth_failed")
                    raise AuthFailed(str(exc)[:300]) from exc
                if kind == "permanent" or attempt >= self.max_retries:
                    self.guard.release(res, FC_CALL_FAILED)
                    raise
                delay = self.base_delay * (2 ** (attempt - 1))
                delay *= 0.75 + random.random() * 0.5      # jitter
                self.usage.retries += 1
                self._sleep(delay)
        self.guard.release(res, FC_CALL_FAILED)
        raise last if last else RuntimeError("unreachable")

    def snapshot(self) -> dict:
        return {"calls": self.usage.calls,
                "tokens_in": self.usage.tokens_in,
                "tokens_out": self.usage.tokens_out,
                "cost_usd": round(self.usage.cost_usd, 6),
                "retries": self.usage.retries}
