"""실험: 죽음은 학습에 기여하는가 (등록: docs/genesis-exp-death-design.md).

Three arms over the same worlds (world seed = episode index):

  A (immortal)    one individual accumulates for the whole run
  B (death)       episode failure kills the individual: model and
                  experience are erased, the next episode starts blank
  C (inheritance) failure kills the individual, but experiences whose
                  recorded prediction_error <= eps survive as a legacy
                  the next individual is rehydrated from

An "individual" is a world model + its experience list. Death is
endogenous (goal not reached). Nothing else differs between arms, so
any late-window gap is attributable to the mortality rule.

  python -m genesis.mortality --pilot            # calibration sweep
  python -m genesis.mortality --arm A --master-seed 0
  python -m genesis.mortality --all              # 3 arms x 20 seeds
  python -m genesis.mortality --report           # aggregate + D1-D3
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass, field

from genesis.agent.adaptive_agent import AdaptiveAgent
from genesis.agent.loop import AgentLoop
from genesis.config import GenesisConfig
from genesis.environment.world import GenesisWorld
from genesis.memory.experience_store import ExperienceStore
from genesis.models.experience import Experience
from genesis.world_model.similarity_model import SimilarityWorldModel

DATA_DIR = "data"
REPORT = os.path.join(DATA_DIR, "death_report.json")
PILOT = os.path.join(DATA_DIR, "death_pilot.json")

# ---- frozen after pilot (see the design doc; do not tune post hoc)
EPISODES = 100
MASTER_SEEDS = list(range(20))
LATE_WINDOW = slice(50, 100)          # ep 51..100
ENERGY = None                          # set by freeze_params()
EPS = None                             # inheritance filter


def frozen_params() -> tuple[int, float]:
    """Read the pilot-frozen parameters; refuse to run the main
    experiment before the pilot has written them."""
    if not os.path.exists(PILOT):
        raise SystemExit(
            "파일럿 미실행 - 보정값이 없음. 먼저 --pilot 을 실행하라.")
    with open(PILOT, encoding="utf-8") as f:
        p = json.load(f)
    return int(p["frozen_energy"]), float(p["frozen_eps"])


def make_config(energy: int) -> GenesisConfig:
    return GenesisConfig(
        num_door_sections=2, num_hazards=2, hazard_energy_damage=15,
        hazard_reward_penalty=-1.0, slip_probability=0.1,
        initial_energy=energy)


# ---------------------------------------------------------- individual


class MemoryStore(ExperienceStore):
    """Per-individual, throwaway experience store (in-memory sqlite:
    an individual's memory dies with it unless the arm says otherwise)."""

    def __init__(self):
        super().__init__(":memory:")

    def initialize(self) -> None:  # Path() mangles ':memory:'
        import sqlite3

        from genesis.memory.database import initialize_schema
        self._connection = sqlite3.connect(":memory:")
        self._connection.row_factory = sqlite3.Row
        initialize_schema(self._connection)


@dataclass
class Individual:
    config: GenesisConfig
    legacy: list[Experience] = field(default_factory=list)

    def __post_init__(self):
        self.model = SimilarityWorldModel(self.config)
        self.store = MemoryStore()
        self.store.initialize()
        self.inherited = len(self.legacy)
        if self.legacy:
            self.model.rehydrate(iter(self.legacy))

    def experiences(self) -> list[Experience]:
        return self.legacy + list(self.store.iter_all())

    def close(self):
        self.store.close()


# ---------------------------------------------------------------- run


def inherit(experiences: list[Experience], eps: float) -> list[Experience]:
    """C-arm legacy: only experiences whose recorded prediction error
    passed the frozen threshold survive the individual's death."""
    return [e for e in experiences if e.prediction_error <= eps]


def run_arm(arm: str, master_seed: int, episodes: int, energy: int,
            eps: float, verbose: bool = False) -> dict:
    config = make_config(energy)
    world = GenesisWorld(config)
    indiv = Individual(config)
    eps_log = []
    deaths = 0
    for ep in range(episodes):
        agent = AdaptiveAgent(
            indiv.model, seed=master_seed * 100_000 + ep,
            observation_radius=config.observation_radius, config=config)
        loop = AgentLoop(world, agent, indiv.model, indiv.store,
                         config=config, verbose=False)
        s = loop.run_episode(seed=ep)      # world seed = episode index
        eps_log.append({
            "ep": ep, "success": s.success,
            "err": round(s.average_prediction_error, 4),
            "steps": s.total_steps, "inherited": indiv.inherited})
        if not s.success and arm in ("B", "C"):
            deaths += 1
            legacy = []
            if arm == "C":
                legacy = inherit(indiv.experiences(), eps)
            indiv.close()
            indiv = Individual(config, legacy=legacy)
        if verbose:
            print(f"  ep{ep:3d} {'O' if s.success else 'X'} "
                  f"err={s.average_prediction_error:.3f}", flush=True)
    indiv.close()
    return {"arm": arm, "master_seed": master_seed, "energy": energy,
            "eps": eps, "deaths": deaths, "episodes": eps_log}


# -------------------------------------------------------------- pilot


def pilot(energies=(150, 110, 90, 75), seeds=(0, 1, 2),
          probe_eps=20) -> dict:
    """Calibrate ENERGY (fresh-run failure rate 20-40% over the first
    20 episodes) and EPS (median experience error -> inheritance rate
    near 50%), then freeze both into data/death_pilot.json."""
    os.makedirs(DATA_DIR, exist_ok=True)
    sweep = {}
    chosen = None
    for energy in energies:
        fails, errors = 0, []
        for ms in seeds:
            config = make_config(energy)
            world = GenesisWorld(config)
            indiv = Individual(config)
            for ep in range(probe_eps):
                agent = AdaptiveAgent(
                    indiv.model, seed=ms * 100_000 + ep,
                    observation_radius=config.observation_radius,
                    config=config)
                loop = AgentLoop(world, agent, indiv.model, indiv.store,
                                 config=config)
                s = loop.run_episode(seed=ep)
                fails += 0 if s.success else 1
            errors.extend(e.prediction_error
                          for e in indiv.store.iter_all())
            indiv.close()
        rate = fails / (probe_eps * len(seeds))
        errors.sort()
        med = errors[len(errors) // 2] if errors else 0.0
        share = (sum(1 for e in errors if e <= med) / len(errors)
                 if errors else 0.0)
        sweep[energy] = {"fail_rate": round(rate, 3),
                         "median_err": round(med, 4),
                         "inherit_share": round(share, 3)}
        print(f"energy={energy}: 실패율 {rate:.0%}, 오차중앙값 {med:.4f}"
              f" (상속률 {share:.0%})", flush=True)
        if chosen is None and 0.20 <= rate <= 0.40:
            chosen = (energy, med)
    if chosen is None:  # nearest to the band, recorded honestly
        best = min(sweep, key=lambda e: min(
            abs(sweep[e]["fail_rate"] - 0.20),
            abs(sweep[e]["fail_rate"] - 0.40)))
        chosen = (best, sweep[best]["median_err"])
        note = "구간 미달 - 최근접값으로 동결 (정직 기록)"
    else:
        note = "구간 내 동결"
    out = {"sweep": sweep, "frozen_energy": chosen[0],
           "frozen_eps": chosen[1], "note": note}
    with open(PILOT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"동결: energy={chosen[0]}, eps={chosen[1]:.4f} ({note})",
          flush=True)
    return out


# ------------------------------------------------------------- report


def _late(vals):
    v = vals[LATE_WINDOW]
    return sum(v) / len(v) if v else 0.0


def judge(runs: list[dict]) -> dict:
    by = {}
    for r in runs:
        by[(r["arm"], r["master_seed"])] = r
    seeds = sorted({r["master_seed"] for r in runs})

    def late_metric(arm, ms, key):
        eps_log = by[(arm, ms)]["episodes"]
        vals = [e["err"] if key == "err" else float(e["success"])
                for e in eps_log]
        return _late(vals)

    d1 = sum(1 for ms in seeds if late_metric("A", ms, "solve")
             >= late_metric("B", ms, "solve"))
    d2 = sum(1 for ms in seeds if late_metric("C", ms, "solve")
             >= late_metric("B", ms, "solve"))
    # 등록 규율: 동률=충족 (전 항목 공통) -> D3도 <= 로 판정
    d3 = sum(1 for ms in seeds if late_metric("C", ms, "err")
             <= late_metric("A", ms, "err"))
    n = len(seeds)
    return {
        "seeds": n,
        "D1_A_ge_B_solve": {"count": d1, "pass": d1 >= 15,
                            "criterion": ">=15/20"},
        "D2_C_ge_B_solve": {"count": d2, "pass": d2 >= 15,
                            "criterion": ">=15/20"},
        "D3_C_le_A_err": {"count": d3, "pass": d3 >= 13,
                          "criterion": ">=13/20"},
        "late_means": {
            arm: {"solve": round(sum(late_metric(arm, ms, "solve")
                                     for ms in seeds) / n, 3),
                  "err": round(sum(late_metric(arm, ms, "err")
                                   for ms in seeds) / n, 4)}
            for arm in ("A", "B", "C")},
        "deaths": {arm: sum(by[(arm, ms)]["deaths"] for ms in seeds)
                   for arm in ("A", "B", "C")},
    }


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="python -m genesis.mortality")
    p.add_argument("--pilot", action="store_true")
    p.add_argument("--arm", choices=["A", "B", "C"])
    p.add_argument("--master-seed", type=int, default=0)
    p.add_argument("--episodes", type=int, default=EPISODES)
    p.add_argument("--all", action="store_true")
    p.add_argument("--report", action="store_true")
    p.add_argument("--verbose", action="store_true")
    args = p.parse_args(argv)

    if args.pilot:
        pilot()
        return 0

    if args.report:
        with open(REPORT, encoding="utf-8") as f:
            runs = json.load(f)
        print(json.dumps(judge(runs), ensure_ascii=False, indent=1))
        return 0

    energy, eps = frozen_params()
    os.makedirs(DATA_DIR, exist_ok=True)
    runs = []
    if os.path.exists(REPORT):
        with open(REPORT, encoding="utf-8") as f:
            runs = json.load(f)
    done = {(r["arm"], r["master_seed"]) for r in runs}

    targets = ([(args.arm, args.master_seed)] if args.arm
               else [(a, ms) for a in ("A", "B", "C")
                     for ms in MASTER_SEEDS])
    for arm, ms in targets:
        if (arm, ms) in done:
            print(f"{arm}/seed{ms}: 이미 완료 - 스킵", flush=True)
            continue
        r = run_arm(arm, ms, args.episodes, energy, eps,
                    verbose=args.verbose)
        runs.append(r)
        with open(REPORT, "w", encoding="utf-8") as f:
            json.dump(runs, f, ensure_ascii=False)   # 원자성보다 재개성
        late_solve = _late([float(e["success"]) for e in r["episodes"]])
        print(f"{arm}/seed{ms}: 사망 {r['deaths']}, 후기 해결률 "
              f"{late_solve:.2f}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
