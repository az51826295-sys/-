"""설계도 엔진 v0 — 정보수집 → 재구성해서 되묻기 → 설계도.

docs/director-ai-vision.md의 첫 모듈. "연출가 AI"의 심장인 '재구성해서
되묻기'를 코드로 증명하는 최소 조각이다. 게임 한 편을 만드는 게 아니라,
막연한 요청을 심판 가능한 설계도로 옮길 수 있는지부터 본다.

규율: 모델 호출 0(결정적). 목 먼저, 지출 0. 능력은 이름으로 분기하지 않고
data/capability_atoms.json 레지스트리로 등록한다.

파이프라인:
  intake(want)      요청을 능력 원자로 분해 (원 요청, 있는 그대로)
  reconstruct(...)  진짜·검증가능만 남기고, 거짓/심판없음은 재구성 대상으로 치환
  ask_back(...)     사람에게 되묻는 텍스트 ("이걸로 갈까요?")
  blueprint(...)    승인 시 두 층 설계도: (a)사람이 읽는 비전 (b)기계 체크리스트

한계(정직): v0의 분해는 레지스트리 별칭 substring 매칭이라 거칠다. 자유로운
문장을 파싱하고 레지스트리에 없는 원자를 '제안'하는 LLM Proposer는 다음 층이며,
이 v0은 그 제안을 검증할 레지스트리(Validator)쪽 절반이다.

  python -X utf8 tools/blueprint_engine.py --want "휴대폰 백신 청소 앱" \
      --ref "플레이스토어 출시급" --days 30 --approve
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY = os.path.join(ROOT, "data", "capability_atoms.json")

try:
    from tools import artifact_adapter as adapters
    from tools import judge_bench as judge
    from tools import spec_sensitivity as sensitivity
except ModuleNotFoundError:                     # 스크립트로 직접 실행 시
    sys.path.insert(0, ROOT)
    from tools import artifact_adapter as adapters
    from tools import judge_bench as judge
    from tools import spec_sensitivity as sensitivity


def load_registry(path: str = REGISTRY) -> list:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _alias_spans(want: str, registry: list) -> list:
    """(시작, 끝, 원자, 별칭) — 요청 안에서 별칭이 등장한 모든 자리."""
    w = (want or "").lower()
    out = []
    for a in registry:
        for alias in a.get("aliases", []):
            token = alias.lower()
            if not token:
                continue
            start = w.find(token)
            while start != -1:
                out.append((start, start + len(token), a, alias))
                start = w.find(token, start + 1)
    return out


def intake(want: str, registry: list) -> list:
    """요청을 능력 원자로 분해한다(원 요청, 재구성 전). 별칭 substring 매칭.

    **겹친 자리에서는 긴 별칭이 이긴다**(2026-08-26, 설계
    docs/intake-bench-v0-design.md 부록 A). 그 전에는 `픽토그램` 요청에
    `램`(RAM 부스터)이 딸려 와서, 아이콘을 달라는 사람에게 "RAM 부스터는
    거짓입니다"라고 답하고 저장공간 청소 셋을 추천했다.

    판단이 아니라 **구간 포함**이라는 기계적 사실로만 거른다: 어떤 별칭의
    등장이 다른 별칭의 등장 안에 통째로 들어가면 그 등장은 세지 않는다.
    서로 다른 자리에 나온 별칭들은 둘 다 남는다.
    """
    spans = _alias_spans(want, registry)
    hits, seen = [], set()
    for start, end, atom, _alias in spans:
        covered = any(other_atom["id"] != atom["id"]
                      and o_start <= start and end <= o_end
                      and (o_end - o_start) > (end - start)
                      for o_start, o_end, other_atom, _o in spans)
        if covered or atom["id"] in seen:
            continue
        hits.append(atom)
        seen.add(atom["id"])
    # 레지스트리 순서를 유지한다 - 분해 결과의 순서가 실행마다 흔들리면 안 된다
    order = {a["id"]: i for i, a in enumerate(registry)}
    return sorted(hits, key=lambda a: order[a["id"]])


def reconstruct(matched: list, registry: list) -> dict:
    """진짜·검증가능(verdict=real)만 남기고, 거짓/심판없음은 그 원자의
    reconstruct_to로 치환한다. 무엇을 왜 떨궜는지 전부 기록(되묻기용)."""
    by_id = {a["id"]: a for a in registry}
    keep: dict = {}
    drops: list = []
    for a in matched:
        if a["verdict"] == "real":
            keep.setdefault(a["id"], a)
        else:
            repl = [by_id[r] for r in a.get("reconstruct_to", []) if r in by_id]
            for r in repl:
                if r["verdict"] == "real":
                    keep.setdefault(r["id"], r)
            drops.append({
                "dropped": a["id"], "verdict": a["verdict"],
                "reason": a["reason"],
                "replaced_by": [r["id"] for r in repl if r["verdict"] == "real"],
                # 대안이 없으면 **선언된 사유**를 들고 와야 한다. "(대체 없음)"이라고
                # 조용히 적는 것은 재구성을 못 한 것인지 안 한 것인지를 감춘다.
                "no_reconstruction": a.get("no_reconstruction"),
            })
    return {"keep": list(keep.values()), "drops": drops}


def ask_back(want: str, recon: dict) -> str:
    """사람에게 되묻는 텍스트. 거절도 삼킴도 아닌 '재구성 + 확인'."""
    keep, drops = recon["keep"], recon["drops"]
    if not keep and not drops:
        return ("이 요청을 아는 능력 원자로 분해하지 못했습니다(레지스트리에 없음). "
                "자유 문장을 원자로 제안하는 LLM Proposer가 필요합니다 — v0 미탑재.")
    lines = [f'요청: "{want}"', ""]
    if drops:
        lines.append("빼야 할 것 (심판이 없거나 거짓):")
        for d in drops:
            tag = {"no_judge": "심판 없음", "snake_oil": "거짓/플라시보"}.get(
                d["verdict"], d["verdict"])
            lines.append(f'  - {d["dropped"]} [{tag}]: {d["reason"]}')
            if d["replaced_by"]:
                lines.append(f'    → 재구성: {", ".join(d["replaced_by"])}')
            elif d.get("no_reconstruction"):
                lines.append(f'    → 재구성 없음(선언됨): {d["no_reconstruction"]}')
            else:
                lines.append('    → 재구성 없음 — **사유가 선언되지 않았다**'
                             '(레지스트리 결함)')
        lines.append("")
    if keep:
        lines.append("추천 항목 (기계가 보증 가능 - 원하는 것만 골라 담으세요):")
        for a in keep:
            lines.append(f'  - {a["id"]}: {a["reason"]}')
        lines += ["", "추천입니다. 전부/일부를 고르세요(--pick). 각 코인가는 견적에."]
    else:
        lines += ["", "남길 게 없습니다 — 요청 전부가 심판 불가/거짓입니다. "
                  "재구성 대상이 없으면 우리 상품이 아닙니다."]
    return "\n".join(lines)


# 노력 → 코인 단가. 자리표시(PLACEHOLDER): 실측 전의 감이며 오차가 크다.
# 빌드 1건으로 교체할 값. AI 사용료+빌드 노력만 담고, 사람 시간은 코인에 안 넣는다.
COIN_BY_EFFORT = {"S": 10, "M": 30, "L": 80}
# 투명 페그(자리표시): 코인이 가격을 숨기지 않도록 원 환산을 항상 같이 보여준다.
COIN_TO_WON = 1000


def _coins(a: dict) -> int:
    return COIN_BY_EFFORT.get(a.get("effort"), 0)


def estimate(recon: dict, pick: list | None = None) -> dict:
    """추천 메뉴 + 코인 견적. 확정으로 들이밀지 않고 '추천'하고 고르게 한다.

    recommended: 재구성으로 남은 real 원자 전체(추천 메뉴, 각 코인가).
    selected:    사장님이 고른 것(pick). 기본은 전체.
    정직: 코인 단가·페그는 자리표시값, 원 환산 항상 노출, 사람 시간은 별도.
    """
    # `None`(안 고르심) 과 `[]`(아무것도 안 고르심)은 다르다. 예전에는 둘 다
    # "전체"로 접혀서, **아무것도 안 고른 견적이 전부 값으로 나갔다.**
    # 돈이 나가는 자리에서 조용한 기본값은 금지다.
    picks = None if pick is None else set(pick)

    def row(a):
        # 표시용은 역할(벤더명 없음), 내부 구현자는 기계 출력에만 남긴다.
        # 벤더는 감춰도 되지만 AI라는 사실은 감추지 않는다(2026-08-25 결정).
        return {"atom": a["id"],
                "worker": a.get("worker_role") or a.get("worker") or "미배정",
                "implementer": a.get("worker_impl"),
                "effort": a.get("effort"), "coins": _coins(a)}

    recommended = [row(a) for a in recon["keep"]]
    selected = [r for r in recommended if picks is None or r["atom"] in picks]
    picked_none = picks is not None and not picks
    total = sum(r["coins"] for r in selected)
    return {
        "recommended": recommended,          # 추천 메뉴(전체) - 골라 담으세요
        "selected": selected,                # 고른 것(기본 전체)
        "total_coins": total,
        "picked_none": picked_none,          # 빈 선택은 전체가 아니다
        "coin_to_won": COIN_TO_WON,
        "won_equiv": total * COIN_TO_WON,
        "human_time": "미측정 - 별도(사장님 검토·방향 시간은 코인에 없음)",
        "note_workers": ("표시 이름은 역할이다. 어느 벤더인지는 내부 정보이며, "
                         "AI가 만든다는 사실은 감추지 않는다."),
        "disclaimer": "코인 단가·원 페그는 자리표시값(실측 전). 빌드 1건으로 교체.",
    }


def blueprint(recon: dict, refs: list | None = None,
              days: int | None = None, want: str = "") -> dict:
    """승인 시 두 층 설계도. (a) 사람이 읽는 비전 / (b) 기계 체크리스트.

    (b)에 들어가는 자격은 **세 축**을 다 통과하는 것이다:
    ① 심판대에서 자기 반례를 거절할 것(이빨, docs/judge-design.md),
    ② 그 심판의 재료가 기계가 잰 값일 것(measured) + 잴 어댑터가 있을 것,
    ③ **그 심판이 설계도를 읽을 것**(스펙 민감도, docs/spec-sensitivity-v1-design.md
       부록 B). 설계도를 바꿔도 판정이 그대로인 심판을 체크리스트에 넣으면
       "설계도대로 채점합니다"가 거짓이 된다.

    설계도 입력이 아예 없는 심판(예: 중복 파일 = 자기일관성 검사)은 빼지 않고
    `spec_sensitive: null` + 사유로 **정확히 적는다**. 약속을 부풀리지 않는
    방법은 항목을 빼는 것이 아니라 무엇으로 채점하는지 밝히는 것이다."""
    keep = recon["keep"]
    cache: dict = {}
    checklist, human_gate = [], []
    for a in keep:
        st = judge.atom_status(a, cache)
        binding = adapters.binding_status(a)
        sens = sensitivity.run_atom(a)
        reads_spec = {"pass": True, "fail": False}.get(sens["state"])
        row = {"atom": a["id"], "check": a.get("check", ""),
               "judge": st["kind"], "teeth": st["teeth"],
               "evidence": st["evidence"], "binding": binding["status"],
               "adapter": binding["adapter"],
               "spec_sensitive": reads_spec,
               "spec_sensitivity": {"state": sens["state"], "n": sens["n"],
                                    "rate": sens["rate"], "why": sens["why"]}}
        if not (st["autonomous"] and binding["status"] == "bound"):
            why = st["reason"] if not st["autonomous"] else binding["reason"]
            human_gate.append({**row, "why": why, "bench": st["verdict"]})
        elif reads_spec is False:
            human_gate.append({**row, "bench": st["verdict"],
                               "why": f'설계도를 읽지 않는 심판 — {sens["why"]}'})
        else:
            checklist.append(row)
    coverage = round(len(checklist) / len(keep), 4) if keep else 0.0
    reading = [r for r in checklist if r["spec_sensitive"] is True]
    spec_cov = round(len(reading) / len(checklist), 4) if checklist else 0.0
    return {
        "vision": {                                   # (a) 사람이 읽는
            "want": want,
            "quality_refs": refs or [],               # "플레이스토어 출시급" 등
            "duration_days": days,
            "scope": [a["id"] for a in keep],
            "machine_coverage": coverage,             # 혼자 굴러갈 수 있는 비율
            # 혼자가 아니라 **사장님 설계도를 따라** 굴러가는 비율
            "spec_sensitive_coverage": spec_cov,
        },
        "checklist": checklist,                       # (b) 기계가 채점(이빨 확인됨)
        "human_gate": human_gate,                     # 심판 못 세운 것 - 사람 눈
        "dropped": recon["drops"],                    # 왜 뺐는지 보존
        "note": "checklist = 이빨(반례 거절) + 측정 재료 + 잴 어댑터 + 설계도를 "
                "읽는 심판, 넷 다 통과한 항목만. 나머지는 human_gate — 사람 눈이 "
                "심판이면 한 달 자율은 그만큼 줄어든다. spec_sensitive=null은 "
                "설계도 입력이 없는 심판(자기일관성으로 채점)이라는 뜻이다.",
    }


def run(want: str, refs=None, days=None, approve=False, pick=None,
        registry=None, matched=None) -> dict:
    reg = registry if registry is not None else load_registry()
    # matched를 주면 intake를 건너뛴다(LLM Proposer가 이미 분해한 경우).
    if matched is None:
        matched = intake(want, reg)
    recon = reconstruct(matched, reg)
    out = {
        "want": want,
        "intake": [a["id"] for a in matched],
        "reconstruction": {
            "keep": [a["id"] for a in recon["keep"]],
            "drops": recon["drops"],
        },
        "ask_back": ask_back(want, recon),
    }
    if approve:
        out["blueprint"] = blueprint(recon, refs=refs, days=days, want=want)
        out["estimate"] = estimate(recon, pick=pick)
    return out


def _print_human(out: dict) -> None:
    print("=" * 60)
    print("1) 원 요청 분해 (intake):", ", ".join(out["intake"]) or "(없음)")
    print("=" * 60)
    print("2) 재구성해서 되묻기:\n")
    print(out["ask_back"])
    if "blueprint" in out:
        bp = out["blueprint"]
        print("\n" + "=" * 60)
        print("3) 설계도 (승인됨)")
        print("=" * 60)
        v = bp["vision"]
        print(f'  (a) 비전 — 품질기준: {v["quality_refs"]}  기간: {v["duration_days"]}일')
        print(f'      범위: {", ".join(v["scope"]) or "(비어있음)"}')
        print(f'  (b) 기계 체크리스트 (심판대 통과분 — 커버리지 '
              f'{v["machine_coverage"]:.0%}, 그중 설계도를 읽는 심판 '
              f'{v["spec_sensitive_coverage"]:.0%}):')
        for c in bp["checklist"]:
            print(f'      - {c["atom"]} [{c["judge"]}, 반례 {c["teeth"]}건 거절, '
                  f'재료=측정({c["adapter"]})]')
            print(f'          {c["check"]}')
            if c["spec_sensitive"] is True:
                sv = c["spec_sensitivity"]
                print(f'          설계도 읽음: 구성 {sv["n"]}개 전부 판정이 '
                      f'따라 바뀜')
            else:                       # None - 설계도 입력이 없는 심판
                print(f'          ※ 설계도가 아니라 자기일관성으로 채점됨 '
                      f'({c["spec_sensitivity"]["why"]})')
        if bp["human_gate"]:
            print("  (c) 사람 눈 게이트 (기계가 못 채점 — 자율 못 함):")
            for h in bp["human_gate"]:
                print(f'      - {h["atom"]} [{h["bench"]}/{h["binding"]}]: '
                      f'{h["why"]}')
    if "estimate" in out:
        est = out["estimate"]
        print("\n" + "=" * 60)
        print("4) 추천 + 예상 견적 (코인)")
        print("=" * 60)
        print("  추천 메뉴 (원하는 것만 --pick 으로 고르세요):")
        for r in est["recommended"]:
            print(f'      - {r["atom"]}  [{r["worker"]}]  {r["coins"]}코인')
        chosen = ", ".join(r["atom"] for r in est["selected"]) or "(없음)"
        tc, peg, won = est["total_coins"], est["coin_to_won"], est["won_equiv"]
        print(f'\n  고른 것: {chosen}')
        print(f'  ▶ 이 설계도는 {tc}코인으로 만들 수 있습니다 '
              f'(약 {won:,}원, 1코인={peg:,}원) [자리표시값]')
        print(f'  사람 시간: {est["human_time"]}')
        print(f'  주의: {est["disclaimer"]}')


def main(argv=None):
    ap = argparse.ArgumentParser(description="설계도 엔진 v0")
    ap.add_argument("--want", required=True, help="막연한 요청")
    ap.add_argument("--ref", action="append", default=[],
                    help="품질 레퍼런스(반복 가능): 갓오브워급 등")
    ap.add_argument("--days", type=int, default=None, help="기간(일)")
    ap.add_argument("--approve", action="store_true",
                    help="되묻기 승인 → 설계도 + 추천 견적 산출")
    ap.add_argument("--pick", default=None,
                    help="추천 중 고를 항목(쉼표구분). 생략 시 전체")
    ap.add_argument("--json", action="store_true", help="기계용 JSON 출력")
    args = ap.parse_args(argv)
    pick = [s.strip() for s in args.pick.split(",")] if args.pick else None
    out = run(args.want, refs=args.ref, days=args.days, approve=args.approve,
              pick=pick)
    if args.json:
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        _print_human(out)
    return out


if __name__ == "__main__":
    main()
