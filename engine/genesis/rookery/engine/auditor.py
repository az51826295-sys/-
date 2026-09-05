"""Alpha engine: Validator Auditor (build order step 4).

    작업 결과 -> Validator 판정 -> Auditor 역검증
              -> 일치하면 채택 / 불일치하면 자동 정지

The auditor never recomputes the validator's answer. Repeating a
computation reproduces its bug; the three instrument incidents in the
research series all produced *plausible* numbers, and two of them
produced the **same** number the correct code would have produced.
What separated right from wrong every time was a different invariant.

So each check here answers a question the validator never asked:

  I1  did the evidence tests actually fail before the patch?
      (§8.3: a discriminator that fails at the fix commit too proves
      nothing - fail->fail was accepted as an event for a whole run)
  I2  does the reference patch pass them? if not, the test is broken,
      not the candidate
  I3  is this task already spent? (§9.2: a task used in five earlier
      experiments was admitted as fresh and nearly reported)
  I4  is everything zero? then suspect paths and parsing before
      believing it (§9.1: Windows node ids made every intersection
      empty, and the buggy answer equalled the true one)
  I5  did quality jump to perfect? then suspect a ceiling or a leak -
      starting with "did the patch edit the tests?"
  I6  did the patch bring new files? (능력 실험 4: two empty agent
      scratch files rode `git add -A` into an adopted commit while
      files_in_scope=1 - a new file that survives the pre-commit
      sweep is either load-bearing beyond scope or smuggled, and
      both need a human)

A halt-severity finding stops the engine durably: the flag lives in
the store, so a reboot cannot clear it. Only an explicit human
`resume()` does.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

HALT_FLAG = "auditor_halt"

I1 = "pre_fail_post_pass"
I2 = "reference_validity"
I3 = "no_spent_reuse"
I4 = "all_zero_suspicion"
I5 = "implausible_perfection"
I6 = "new_file_discipline"

HALT, WARN = "halt", "warn"

TEST_PATH = re.compile(r"(^|[\\/])(tests?|testing)[\\/]|(^|[\\/])test_"
                       r"|_test\.py$|conftest\.py$", re.IGNORECASE)


def is_test_file(path: str) -> bool:
    p = path.replace("\\", "/")
    return bool(TEST_PATH.search(p)) or \
        os.path.basename(p).startswith("test_")


@dataclass
class ValidatorVerdict:
    """What the validator concluded, plus the evidence it used.

    `kind` selects which invariants the auditor applies. code_fix uses
    I1-I5 (fail->pass evidence); other kinds carry their independent
    checks in `checks` (e.g. doc: behavior_preserved; test_add:
    catches_mutation), each a DIFFERENT invariant than the handler's
    own success test - the auditor's whole purpose."""

    task_id: str
    accepted: bool
    kind: str = "code_fix"
    evidence_tests: list[str] = field(default_factory=list)
    before: dict[str, str] = field(default_factory=dict)
    after: dict[str, str] = field(default_factory=dict)
    reference: dict[str, str] | None = None
    changed_files: list[str] = field(default_factory=list)
    new_files: list[str] = field(default_factory=list)
    metrics: dict[str, float] = field(default_factory=dict)
    baseline_metrics: dict[str, float] | None = None
    checks: dict[str, bool] = field(default_factory=dict)


@dataclass
class Finding:
    code: str
    invariant: str
    message: str
    severity: str = HALT


@dataclass
class AuditResult:
    agree: bool
    findings: list[Finding] = field(default_factory=list)
    halted: bool = False

    @property
    def halting(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == HALT]

    def __bool__(self) -> bool:
        return self.agree


@dataclass
class AuditorConfig:
    perfect_threshold: float = 1.0
    suspicious_jump: float = 0.4     # baseline -> perfect in one step
    require_reference: bool = False


class Auditor:
    def __init__(self, store, config: AuditorConfig | None = None,
                 spent_task_ids: set[str] | None = None):
        self.store = store
        self.config = config or AuditorConfig()
        self.spent = set(spent_task_ids or ())

    # ----------------------------------------------------- invariants

    def _i1(self, v: ValidatorVerdict) -> list[Finding]:
        out = []
        if not v.accepted:
            return out
        for tid in v.evidence_tests:
            before = v.before.get(tid)
            after = v.after.get(tid)
            if before is None or after is None:
                out.append(Finding(
                    I1, "부모 실패·수정 통과",
                    f"증거 테스트 {tid}의 전/후 결과가 없음 "
                    f"(before={before}, after={after})"))
                continue
            if before == "pass":
                out.append(Finding(
                    I1, "부모 실패·수정 통과",
                    f"{tid}는 패치 전에도 통과 - 판별력 없음"))
            if after != "pass":
                out.append(Finding(
                    I1, "부모 실패·수정 통과",
                    f"{tid}가 패치 후에도 통과하지 않음 "
                    f"({after}) - 채택 근거 불성립"))
        return out

    def _i2(self, v: ValidatorVerdict) -> list[Finding]:
        if v.reference is None:
            if self.config.require_reference and v.accepted:
                return [Finding(I2, "정답 패치 검증",
                                "참조 패치 결과가 없어 테스트 유효성 "
                                "미확인", WARN)]
            return []
        out = []
        for tid in v.evidence_tests:
            got = v.reference.get(tid)
            if got is None:
                out.append(Finding(I2, "정답 패치 검증",
                                   f"{tid}의 참조 결과 없음", WARN))
            elif got != "pass":
                out.append(Finding(
                    I2, "정답 패치 검증",
                    f"{tid}는 정답 패치에서도 실패({got}) - "
                    f"테스트 자체가 무효"))
        return out

    def _i3(self, v: ValidatorVerdict) -> list[Finding]:
        if v.task_id in self.spent:
            return [Finding(I3, "소진 과제 재사용",
                            f"{v.task_id}는 이미 소진된 과제")]
        row = self.store.get(v.task_id) if self.store else None
        if row and row["state"] == "succeeded" and v.accepted:
            return [Finding(I3, "소진 과제 재사용",
                            f"{v.task_id}는 이미 성공 처리된 작업 - "
                            f"재등장")]
        return []

    def _i4(self, v: ValidatorVerdict) -> list[Finding]:
        out = []
        if v.accepted and not v.evidence_tests:
            out.append(Finding(
                I4, "전부 0 의심",
                "채택인데 증거 테스트가 0건 - 경로·파싱 오류 의심"))
        if v.accepted and not v.after:
            out.append(Finding(
                I4, "전부 0 의심",
                "패치 후 테스트 결과가 비어 있음 - 수집 실패 의심"))
        if v.metrics and all(float(x) == 0.0
                             for x in v.metrics.values()):
            out.append(Finding(
                I4, "전부 0 의심",
                f"전 지표가 0 ({sorted(v.metrics)}) - 경로·파싱 "
                f"오류를 먼저 배제해야 함"))
        if v.after and all(o == "error" for o in v.after.values()):
            # 다른 불변식으로 가른다: 같은 작업공간에서 패치 전
            # 테스트가 실행됐다면(error 아님) 환경은 멀쩡했고,
            # 전부 error는 후보의 파손이다 - 기각이 맞고 정지는
            # 과잉 ((b) 재검증 B팔 0차: 한 건의 구문 파손이 저장소
            # 잔여 5건을 멈춰 세웠다). 전에도 전부 error였거나
            # 전 결과가 없으면 환경 의심이 실재하므로 정지.
            env_worked = bool(v.before) and any(
                o != "error" for o in v.before.values())
            if env_worked and not v.accepted:
                out.append(Finding(
                    I4, "전부 0 의심",
                    "패치 후 모든 테스트가 error - 패치 전에는 "
                    "실행됐으므로 환경이 아니라 후보의 파손 (기각)",
                    WARN))
            else:
                out.append(Finding(
                    I4, "전부 0 의심",
                    "모든 테스트가 error - 환경·경로 문제 의심"))
        return out

    def _i5(self, v: ValidatorVerdict) -> list[Finding]:
        out = []
        edited = [f for f in v.changed_files if is_test_file(f)]
        if edited:
            out.append(Finding(
                I5, "천장·누출 검사",
                f"패치가 테스트 파일을 수정함 {edited} - "
                f"통과가 누출일 수 있음"))
        if not v.metrics:
            return out
        perfect = [k for k, x in v.metrics.items()
                   if float(x) >= self.config.perfect_threshold]
        if perfect and v.baseline_metrics:
            for k in perfect:
                base = v.baseline_metrics.get(k)
                if base is None:
                    continue
                if float(x_ := v.metrics[k]) - float(base) >= \
                        self.config.suspicious_jump:
                    out.append(Finding(
                        I5, "천장·누출 검사",
                        f"{k}가 {base}에서 {x_}로 급등 - 천장·누출 "
                        f"검사 필요"))
        return out

    def _i6(self, v: ValidatorVerdict) -> list[Finding]:
        if not v.accepted or not v.new_files:
            return []
        return [Finding(
            I6, "신규 파일 규율",
            f"채택된 수정에 신규 파일 {v.new_files} - 커밋 전 위생 "
            f"규칙을 통과해 살아남은 파일은 범위 밖 수정이거나 "
            f"혼입 - 사람 검토 필요")]

    # ---------------------------------------------------------- audit

    # --------------------------------------- kind-specific invariants

    def _doc_checks(self, v: ValidatorVerdict) -> list[Finding]:
        out = self._i3(v)                # spent-reuse is universal
        if not v.accepted:
            return out
        if any(is_test_file(f) for f in v.changed_files):
            out.append(Finding(
                "doc_touched_test", "문서 작업이 테스트 수정",
                f"doc 작업이 테스트 파일을 건드림 {v.changed_files}"))
        if not v.checks.get("behavior_preserved"):
            out.append(Finding(
                "doc_behavior_changed", "동작 보존",
                "docstring 외 코드가 바뀜 - 문서 작업은 동작을 "
                "바꾸면 안 됨"))
        if not v.checks.get("docstring_added"):
            out.append(Finding(
                "doc_no_docstring", "문서 추가 확인",
                "채택인데 docstring이 추가되지 않음"))
        return out

    def _testadd_checks(self, v: ValidatorVerdict) -> list[Finding]:
        out = self._i3(v)
        if not v.accepted:
            return out
        non_test = [f for f in v.changed_files if not is_test_file(f)]
        if non_test:
            out.append(Finding(
                "testadd_touched_source", "테스트만 수정",
                f"테스트 추가 작업이 소스를 건드림 {non_test}"))
        if not v.checks.get("new_test_passes"):
            out.append(Finding(
                "testadd_not_passing", "현재 통과 확인",
                "새 테스트가 현재 코드에서 통과하지 않음"))
        if not v.checks.get("catches_mutation"):
            out.append(Finding(
                "testadd_no_teeth", "이빨 확인",
                "대상을 망가뜨려도 새 테스트가 통과 - 무의미한 테스트"))
        return out

    def _data_checks(self, v: ValidatorVerdict) -> list[Finding]:
        out = self._i3(v)
        if not v.accepted:
            return out
        if any(is_test_file(f) for f in v.changed_files):
            out.append(Finding(
                "data_touched_test", "데이터 작업이 테스트 수정",
                f"data 작업이 테스트 파일을 건드림 {v.changed_files}"))
        if len(v.changed_files) != 1:
            out.append(Finding(
                "data_file_discipline", "단일 산출 파일",
                "data 변환은 정확히 한 파일만 써야 하는데 "
                f"{len(v.changed_files)}개가 바뀜 {v.changed_files}"))
        for key in ("count_match", "schema_ok", "preserved_ok",
                    "spot_ok"):
            if not v.checks.get(key):
                out.append(Finding(
                    f"data_{key}_missing", "보존 불변식",
                    f"채택인데 {key} 확인이 없거나 거짓"))
        return out

    def _art_checks(self, v: ValidatorVerdict) -> list[Finding]:
        out = self._i3(v)
        if not v.accepted:
            return out
        if any(is_test_file(f) for f in v.changed_files):
            out.append(Finding(
                "art_touched_test", "아트 작업이 테스트 수정",
                f"art 작업이 테스트 파일을 건드림 {v.changed_files}"))
        if not v.changed_files:
            out.append(Finding(
                "art_no_files", "산출물 존재",
                "채택인데 산출 파일이 없음 - 경로·수집 오류 의심"))
        for key in ("files_present", "spec_ok"):
            if not v.checks.get(key):
                out.append(Finding(
                    f"art_{key}_missing", "규격 불변식",
                    f"채택인데 {key} 확인이 없거나 거짓"))
        return out

    # ---------------------------------------------------------- audit

    def audit(self, v: ValidatorVerdict,
              run_id: int | None = None) -> AuditResult:
        findings: list[Finding] = []
        if v.kind == "doc":
            findings = self._doc_checks(v)
        elif v.kind == "test_add":
            findings = self._testadd_checks(v)
        elif v.kind == "data":
            findings = self._data_checks(v)
        elif v.kind == "art":
            findings = self._art_checks(v)
        elif v.kind == "code_fix":
            for check in (self._i1, self._i2, self._i3, self._i4,
                          self._i5, self._i6):
                findings.extend(check(v))
        else:
            findings = [Finding("unknown_kind", "알 수 없는 종류",
                                f"감사 규칙 없는 작업 종류: {v.kind}")]
        halting = [f for f in findings if f.severity == HALT]
        agree = not halting
        if self.store is not None:
            self.store.log(
                v.task_id, run_id,
                "audit_pass" if agree else "audit_disagree",
                {"accepted": v.accepted,
                 "findings": [{"code": f.code, "sev": f.severity,
                               "msg": f.message} for f in findings]})
        halted = False
        if not agree:
            self.halt(v.task_id, halting)
            halted = True
        return AuditResult(agree=agree, findings=findings,
                           halted=halted)

    def accept_if_audited(self, v: ValidatorVerdict,
                          run_id: int | None = None
                          ) -> tuple[bool, AuditResult]:
        """The only sanctioned adoption path: a candidate is adopted
        when the validator accepted it AND the auditor agrees."""
        result = self.audit(v, run_id)
        return (v.accepted and result.agree), result

    # ----------------------------------------------------------- halt

    def halt(self, task_id: str | None,
             findings: list[Finding]) -> None:
        """Durable: survives a reboot, cleared only by resume()."""
        if self.store is None:
            return
        if not self.store.get_flag(HALT_FLAG):
            self.store.set_flag(HALT_FLAG, {
                "task_id": task_id,
                "findings": [{"code": f.code, "msg": f.message}
                             for f in findings]})
            self.store.log(task_id, None, "engine_halt",
                           {"reason": "auditor disagreement",
                            "codes": [f.code for f in findings]})

    def halted(self) -> bool:
        return bool(self.store and self.store.get_flag(HALT_FLAG))

    def halt_reason(self) -> dict | None:
        return self.store.get_flag(HALT_FLAG) if self.store else None

    def resume(self, who: str = "human") -> None:
        if self.store is None:
            return
        self.store.clear_flag(HALT_FLAG)
        self.store.log(None, None, "engine_resume", {"by": who})


ISOLATION_HALT_FLAG = "isolation_halt"


def engine_halted(store) -> bool:
    """Cheap gate for the worker loop: never claim work while the
    auditor - or an isolation violation (4개월차 2주차: 위반은 사후
    발견이 아니라 즉시 중단) - has stopped the engine."""
    return bool(store.get_flag(HALT_FLAG)
                or store.get_flag(ISOLATION_HALT_FLAG))
