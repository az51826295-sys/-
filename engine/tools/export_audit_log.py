"""채택 1건의 감사 로그 내보내기 - 출처 표시용 (2026-08-22, 사장님 답변 Q4).

"AI 생성 명시 + 감사 로그 공개 링크"는 제도를 파는 회사의 첫 증거물이다.
이 도구는 원장에서 한 과제의 **기계 기록**만 뽑아 사람이 읽는 마크다운으로
만든다: 임대·실행된 명령(허용/거부)·예산 예약/정산·검증 전후·감사 판정·위생
규칙·채택·PR 준비. 모델 응답 원문은 넣지 않는다(건수만) - 감사 로그는
"무엇이 검증됐나"지 "모델이 뭐라 했나"가 아니다.

  python tools/export_audit_log.py live-toolz_496 --tags live_runB
  → data/audit/live-toolz_496.md  (공개는 사람이 결정: gist/포크 wiki/PR 본문 링크)
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sqlite3
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
DISCLOSURE = ("This change was produced by an AI agent (Rookery Alpha) inside "
              "an isolated worktree, under a budget ledger, and adopted only "
              "after a reproduction test went fail→pass and an independent "
              "audit agreed; a human reviewed it before submission.")
SHOW = ("task_added", "claimed", "candidate_plan", "budget_reserved",
        "budget_settled", "budget_denied", "command_allowed",
        "command_blocked", "agent_loop_stats", "scratch_sweep",
        "scratch_restore", "agent_truncated", "audit_pass", "audit_disagree",
        "engine_halt", "pr_ready", "failed_retry", "failed_final",
        "completed", "agent_outcome", "infra_requeue", "routed_smart")


def find(task_id: str, tags: list[str]) -> list[tuple[str, str]]:
    out = []
    for tag in tags:
        for db in sorted(glob.glob(os.path.join(DATA, tag, "*", "engine.db"))):
            c = sqlite3.connect(db)
            n = c.execute("SELECT COUNT(*) FROM tasks WHERE id=?",
                          (task_id,)).fetchone()[0]
            c.close()
            if n:
                out.append((tag, db))
    return out


def _ts(t: float) -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t))


def export(task_id: str, db: str, tag: str) -> str:
    c = sqlite3.connect(db)
    c.row_factory = sqlite3.Row
    task = c.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    payload = json.loads(task["payload"] or "{}")
    result = json.loads(task["result"] or "{}")
    events = c.execute("SELECT * FROM events WHERE task_id=? ORDER BY id",
                       (task_id,)).fetchall()
    res = c.execute("SELECT run_id, state, usd, tokens_in, tokens_out"
                    " FROM reservations WHERE task_id=? ORDER BY id",
                    (task_id,)).fetchall()
    c.close()
    usd = sum(float(r["usd"] or 0) for r in res if r["state"] == "settled")
    calls = sum(1 for r in res if r["state"] == "settled")
    n_resp = sum(1 for e in events if e["kind"] == "agent_response")
    cmds = [e for e in events if e["kind"] in ("command_allowed",
                                                "command_blocked")]
    blocked = [e for e in cmds if e["kind"] == "command_blocked"]
    audits = [e for e in events if e["kind"] in ("audit_pass",
                                                  "audit_disagree")]
    lines = [f"# Rookery audit trail — `{task_id}`", "",
             f"_{DISCLOSURE}_", "",
             "## Task", "",
             f"- issue: {payload.get('issue', '')}",
             f"- reproduction test: `{(payload.get('repro_tests') or [''])[0]}`"
             f" (must fail before, pass after)",
             f"- ledger: `{tag}` · state: **{task['state']}** · attempts: "
             f"{task['attempts']}",
             f"- adopted: {result.get('adopted')} · tier: {result.get('tier')}"
             f" · steps: {result.get('steps')} · branch: "
             f"`{result.get('branch', '')}` · files: "
             f"{', '.join(result.get('changed_files') or [])}",
             "", "## Budget", "",
             f"- model calls: {calls} · spend: ${usd:.4f} (every call reserved "
             f"before and settled after; denials: "
             f"{sum(1 for e in events if e['kind'] == 'budget_denied')})",
             "", "## Commands executed in the isolated worktree", "",
             f"- total {len(cmds)} · blocked {len(blocked)} (an allowlist: "
             f"python/pytest/git subcommands only; no network tools, no push)"]
    for e in cmds[:60]:
        d = json.loads(e["data"] or "{}")
        lines.append(f"  - {_ts(e['ts'])} {e['kind'].split('_')[1]}: "
                     f"`{d.get('command', '')[:120]}`")
    if len(cmds) > 60:
        lines.append(f"  - … {len(cmds) - 60} more")
    lines += ["", "## Verification and audit", ""]
    for e in audits:
        d = json.loads(e["data"] or "{}")
        lines.append(f"- {_ts(e['ts'])} **{e['kind']}** accepted="
                     f"{d.get('accepted')} findings="
                     f"{[f.get('code') for f in d.get('findings', [])]}")
    hyg = [e for e in events if e["kind"].startswith("scratch_")]
    if hyg:
        lines.append("- hygiene: " + ", ".join(
            f"{e['kind']} {json.loads(e['data']).get('files')}" for e in hyg))
    out = [e for e in events if e["kind"] == "agent_outcome"]
    for e in out:
        d = json.loads(e["data"])
        lines.append(f"- attempt {d.get('attempt')} ({d.get('tier')}): "
                     f"accepted={d.get('accepted')} steps={d.get('steps')} "
                     f"usd={d.get('usd')}")
    pr = [e for e in events if e["kind"] == "pr_ready"]
    for e in pr:
        d = json.loads(e["data"])
        lines.append(f"- pr_ready: branch `{d.get('branch')}` commit "
                     f"`{(d.get('commit') or '')[:12]}` pushed={d.get('pushed')}")
    lines += ["", "## Not included", "",
              f"- model response texts ({n_resp} turns) are kept in the "
              f"ledger for postmortems but are not part of the audit trail.",
              "", f"_exported {time.strftime('%Y-%m-%d %H:%M:%S')} by "
              f"tools/export_audit_log.py_"]
    return "\n".join(lines) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("task_id")
    ap.add_argument("--tags", default="live_auto")
    ap.add_argument("--out-dir", default=os.path.join(DATA, "audit"))
    args = ap.parse_args(argv)
    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    hits = find(args.task_id, tags)
    if not hits:
        print("원장에 없음:", args.task_id)
        return 1
    tag, db = hits[-1]
    md = export(args.task_id, db, tag)
    os.makedirs(args.out_dir, exist_ok=True)
    path = os.path.join(args.out_dir, f"{args.task_id}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(md)
    print(md[:1200])
    print(f"... 저장: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
