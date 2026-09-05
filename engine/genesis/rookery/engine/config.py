"""Alpha engine: service configuration (build order step 8 support).

Twelve-factor: everything comes from the environment, so systemd's
EnvironmentFile is the single source and no secret is ever written in
code. `validate()` returns a list of problems instead of raising, so
the service can log every one at startup rather than dying on the
first - an operator fixing a fresh box wants the whole list.

Budget defaults are the frozen spec values (60k total / 45k stop /
40k restrict / 35k warn / 5k daily / 3k task / 15k fixed). Prices are
per-million-token USD; the engine never guesses them, so they must be
set (defaults here are the Haiku figures the smoke used and are
flagged for operator confirmation).
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from genesis.rookery.engine.budget import BudgetPolicy


def _f(env, key, default):
    v = env.get(key)
    return float(v) if v not in (None, "") else default


def _i(env, key, default):
    v = env.get(key)
    return int(v) if v not in (None, "") else default


def _b(env, key, default):
    v = env.get(key)
    if v in (None, ""):
        return default
    return str(v).strip().lower() in ("1", "true", "yes", "on")


@dataclass
class ServiceConfig:
    repo: str
    data_dir: str
    work_root: str
    model: str = "claude-haiku-4-5-20251001"
    base_branch: str = "main"
    remote: str = "origin"
    workers: int = 2
    max_tokens: int = 4000
    tick_seconds: float = 300.0

    usd_krw: float = 1400.0
    price_in_per_mtok: float = 1.0        # operator to confirm
    price_out_per_mtok: float = 5.0       # operator to confirm

    # 실패 역산 위임(engine/routing.py)이 쓰는 승급 모델. 단가는
    # 운영자가 넣은 값만 쓴다 (추측 금지 - 진화 2단계와 동일 원칙).
    smart_model: str = "claude-sonnet-5"
    smart_price_in_per_mtok: float = 3.0   # operator to confirm
    smart_price_out_per_mtok: float = 15.0  # operator to confirm

    month_total_krw: float = 60_000.0
    stop_krw: float = 45_000.0
    restrict_krw: float = 40_000.0
    warn_krw: float = 35_000.0
    daily_krw: float = 5_000.0
    task_krw: float = 3_000.0
    fixed_monthly_krw: float = 15_000.0

    # 스테이지 1 ②: 다중 저장소 상주 (docs/rookery-stage1-infra-design.md).
    # ROOKERY_REPOS가 비어 있지 않으면 다중 모드 - 저장소별 엔진·원장을
    # 인테이크 파이프라인과 같은 배치(<data>/<tag>/<name>/engine.db)로
    # 띄운다. 외부(남의) 저장소가 기본이므로 PR은 로컬 전용.
    repo_names: tuple = ()
    repos_root: str = "data/repos"
    tag: str = "live_auto"
    local_only_pr: bool = True
    exit_when_idle: bool = False        # 배치 모드: 큐가 비면 종료
    intake_interval_s: float = 0.0      # 0 = 주기 인테이크 끔
    intake_mock: bool = False
    # 스테이지 1 ④: 48h 목 드라이런 - 모델 호출 전부 가짜(지출 0),
    # 인테이크도 목, 정해진 시간 뒤 스스로 종료.
    mock: bool = False
    stop_after_s: float = 0.0           # 0 = 신호까지 상주
    goodhart_interval_s: float = 86400.0   # 0 = 끔

    # ------------------------------------------------------- from env

    @classmethod
    def from_env(cls, env: dict | None = None) -> "ServiceConfig":
        env = dict(os.environ if env is None else env)
        return cls(
            repo=env.get("ROOKERY_REPO", ""),
            data_dir=env.get("ROOKERY_DATA", "data/alpha"),
            work_root=env.get("ROOKERY_WORK", "data/alpha/work"),
            model=env.get("ROOKERY_MODEL",
                          "claude-haiku-4-5-20251001"),
            base_branch=env.get("ROOKERY_BASE_BRANCH", "main"),
            remote=env.get("ROOKERY_REMOTE", "origin"),
            workers=_i(env, "ROOKERY_WORKERS", 2),
            max_tokens=_i(env, "ROOKERY_MAX_TOKENS", 4000),
            tick_seconds=_f(env, "ROOKERY_TICK_SECONDS", 300.0),
            usd_krw=_f(env, "ROOKERY_USD_KRW", 1400.0),
            price_in_per_mtok=_f(env, "ROOKERY_PRICE_IN", 1.0),
            price_out_per_mtok=_f(env, "ROOKERY_PRICE_OUT", 5.0),
            smart_model=env.get("ROOKERY_SMART_MODEL",
                                "claude-sonnet-5"),
            smart_price_in_per_mtok=_f(env, "ROOKERY_SMART_PRICE_IN",
                                       3.0),
            smart_price_out_per_mtok=_f(
                env, "ROOKERY_SMART_PRICE_OUT", 15.0),
            month_total_krw=_f(env, "ROOKERY_MONTH_KRW", 60_000.0),
            stop_krw=_f(env, "ROOKERY_STOP_KRW", 45_000.0),
            restrict_krw=_f(env, "ROOKERY_RESTRICT_KRW", 40_000.0),
            warn_krw=_f(env, "ROOKERY_WARN_KRW", 35_000.0),
            daily_krw=_f(env, "ROOKERY_DAILY_KRW", 5_000.0),
            task_krw=_f(env, "ROOKERY_TASK_KRW", 3_000.0),
            fixed_monthly_krw=_f(env, "ROOKERY_FIXED_KRW", 15_000.0),
            repo_names=tuple(x.strip() for x in
                             env.get("ROOKERY_REPOS", "").split(",")
                             if x.strip()),
            repos_root=env.get("ROOKERY_REPOS_ROOT", "data/repos"),
            tag=env.get("ROOKERY_TAG", "live_auto"),
            local_only_pr=_b(env, "ROOKERY_LOCAL_ONLY_PR", True),
            exit_when_idle=_b(env, "ROOKERY_EXIT_WHEN_IDLE", False),
            intake_interval_s=_f(env, "ROOKERY_INTAKE_INTERVAL_S", 0.0),
            intake_mock=_b(env, "ROOKERY_INTAKE_MOCK", False),
            mock=_b(env, "ROOKERY_MOCK", False),
            stop_after_s=_f(env, "ROOKERY_STOP_AFTER_S", 0.0),
            goodhart_interval_s=_f(env, "ROOKERY_GOODHART_INTERVAL_S",
                                   86400.0))

    # ------------------------------------------------------- derived

    def db_path(self) -> str:
        return os.path.join(self.data_dir, "engine.db")

    # ------------------------------------------------ multi-repo paths

    @property
    def multi(self) -> bool:
        return bool(self.repo_names)

    def repo_path(self, name: str) -> str:
        return os.path.join(self.repos_root, f"{name}_head")

    def repo_data_dir(self, name: str) -> str:
        return os.path.join(self.data_dir, self.tag, name)

    def repo_db_path(self, name: str) -> str:
        return os.path.join(self.repo_data_dir(name), "engine.db")

    def repo_work_root(self, name: str) -> str:
        return os.path.join(self.repo_data_dir(name), "work")

    def repo_reports_dir(self, name: str) -> str:
        return os.path.join(self.repo_data_dir(name), "reports")

    def reports_dir(self) -> str:
        return os.path.join(self.data_dir, "reports")

    def log_path(self) -> str:
        return os.path.join(self.data_dir, "rookery.log")

    def budget_policy(self) -> BudgetPolicy:
        return BudgetPolicy(
            month_total_krw=self.month_total_krw,
            stop_krw=self.stop_krw, restrict_krw=self.restrict_krw,
            warn_krw=self.warn_krw, daily_krw=self.daily_krw,
            task_krw=self.task_krw,
            fixed_monthly_krw=self.fixed_monthly_krw,
            usd_krw=self.usd_krw)

    # ------------------------------------------------------- validate

    def validate(self, env: dict | None = None,
                 require_api: bool = True) -> list[str]:
        """Every problem, not just the first. require_api=False lets a
        dry build (tests, a mock run) skip the key/spend-gate checks."""
        env = dict(os.environ if env is None else env)
        problems = []
        if self.multi:
            for name in self.repo_names:
                # 워크트리는 .git이 파일이다 - isdir가 아니라 exists
                if not os.path.exists(os.path.join(self.repo_path(name),
                                                   ".git")):
                    problems.append(f"ROOKERY_REPOS의 {name}: git 저장소 "
                                    f"아님 ({self.repo_path(name)})")
            if not self.tag:
                problems.append("ROOKERY_TAG 미설정")
        elif not self.repo:
            problems.append("ROOKERY_REPO 미설정")
        elif not os.path.isdir(os.path.join(self.repo, ".git")):
            problems.append(f"ROOKERY_REPO가 git 저장소가 아님: "
                            f"{self.repo}")
        if not self.data_dir:
            problems.append("ROOKERY_DATA 미설정")
        if self.workers < 1:
            problems.append("ROOKERY_WORKERS는 1 이상이어야 함")
        if self.price_in_per_mtok <= 0 or self.price_out_per_mtok <= 0:
            problems.append("토큰 단가(ROOKERY_PRICE_IN/OUT)는 양수여야 함")
        if self.stop_krw >= self.month_total_krw:
            problems.append("정지선이 월 한도 이상 - 정지 전 한도 초과 가능")
        if require_api:
            if not env.get("ANTHROPIC_API_KEY"):
                problems.append("ANTHROPIC_API_KEY 미설정")
            if env.get("GENESIS_SPEND") != "i-approve":
                problems.append("GENESIS_SPEND=i-approve 미설정 "
                                "(지출 게이트)")
        return problems
