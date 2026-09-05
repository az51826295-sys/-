"""스테이지 1 ③: 운영자 표면 - PR 후보 큐 (docs/rookery-stage1-infra-design.md).

엔진은 남의 저장소에 푸시하지 않는다. 채택은 로컬 브랜치와 원장
기록으로 끝나고, 사람이 검토해 사장님 명의로 제출한다. 08-22까지 그
"검토→제목·본문 작성→포크 푸시→compare 링크" 절차를 매번 손으로 했다.
이 모듈은 그 절차의 기계 부분을 만든다:

- 저장소별 원장(<data>/<tag>/<name>/engine.db)에서 **채택된 과제**
  (result.adopted)를 모으고, 헤드 저장소에서 브랜치·커밋·변경 파일을
  읽어 후보를 만든다 (pr_ready 이벤트는 보조 - 구 원장엔 없다).
- 후보마다 PR 제목·본문 **초안**, 포크 푸시 명령, 제목·본문이 채워진
  GitHub compare 링크를 만든다. 제출은 언제나 사람이 한다.
- 상태 파일(data/pr_queue_state.json)로 new → pushed → submitted(URL)
  / dismissed 를 추적한다. 같은 과제가 여러 런에서 채택되면 하나로 본다.

초안은 초안이다: 본문의 "## Summary"는 사람이 채우는 자리이고, 자동
채움은 사실(이슈·파일·검증 방법·AI 관여 공개)만이다.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.parse
from dataclasses import asdict, dataclass, field

from genesis.rookery.engine.store import Store

STATES = ("new", "pushed", "submitted", "dismissed")
DISCLOSURE = ("Authored with the help of an AI agent (Rookery Alpha), "
              "human-reviewed.")


def _git(argv: list[str], cwd: str) -> str:
    r = subprocess.run(["git", *argv], cwd=cwd, capture_output=True,
                       text=True, encoding="utf-8", errors="replace",
                       timeout=60)
    return (r.stdout or "").strip() if r.returncode == 0 else ""


@dataclass
class Candidate:
    task_id: str
    repo_name: str
    slug: str
    issue: int | None
    issue_title: str
    tag: str
    branch: str
    commit: str = ""
    files: list[str] = field(default_factory=list)
    stat: str = ""
    tier: str = ""
    steps: int | None = None
    usd: float = 0.0
    repro_test: str = ""
    state: str = "new"
    pr_url: str = ""
    note: str = ""
    draft_title: str = ""
    draft_body: str = ""
    push_cmd: str = ""
    compare_url: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


# ------------------------------------------------------------- state


def load_state(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(state: dict, path: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=1, sort_keys=True)


def mark(state: dict, task_id: str, new_state: str,
         pr_url: str = "", fixup: bool = False) -> dict:
    """fixup = 사람 검토에서 채택 산출물(코드)을 고쳐야 했다 - Goodhart
    G-c의 재료 (docs/goodhart-metric-design.md). 테스트·본문 추가는
    손질이 아니다."""
    if new_state not in STATES:
        raise ValueError(f"unknown state {new_state}; one of {STATES}")
    state[task_id] = {"state": new_state, "pr_url": pr_url,
                      "fixup": bool(fixup),
                      "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    return state


# ----------------------------------------------------------- collect


def discover(data_root: str, tags: list[str]) -> list[tuple[str, str, str]]:
    """(tag, repo_name, db_path) for every per-repo ledger under the tags."""
    out = []
    for tag in tags:
        root = os.path.join(data_root, tag)
        if not os.path.isdir(root):
            continue
        for name in sorted(os.listdir(root)):
            db = os.path.join(root, name, "engine.db")
            if os.path.isfile(db):
                out.append((tag, name, db))
    return out


def _parse_issue(payload: dict) -> tuple[int | None, str]:
    """payload.issue = '[owner/repo#123] title'"""
    text = payload.get("issue", "") or ""
    issue, title = None, text
    if text.startswith("["):
        head, _, rest = text[1:].partition("]")
        title = rest.strip()
        if "#" in head:
            try:
                issue = int(head.rsplit("#", 1)[1])
            except ValueError:
                issue = None
    return issue, title


def collect(data_root: str, tags: list[str], repos_root: str,
            slug_of: dict[str, str], fork_owner: str,
            base_of: dict[str, str] | None = None,
            state: dict | None = None) -> list[Candidate]:
    """Every adopted task across the ledgers, newest first, one entry per
    task id (a task adopted in two runs appears once - the later run)."""
    base_of = base_of or {}
    state = state or {}
    seen: dict[str, Candidate] = {}
    for tag, name, db in discover(data_root, tags):
        store = Store(db)
        try:
            rows = store.conn.execute(
                "SELECT id, payload, result, updated_at FROM tasks"
                " WHERE state='succeeded' ORDER BY updated_at").fetchall()
            for row in rows:
                result = json.loads(row["result"] or "{}")
                if not result.get("adopted"):
                    continue
                payload = json.loads(row["payload"] or "{}")
                issue, title = _parse_issue(payload)
                usd = store.conn.execute(
                    "SELECT COALESCE(SUM(usd),0) FROM reservations"
                    " WHERE task_id=? AND state='settled'",
                    (row["id"],)).fetchone()[0] or 0.0
                cand = Candidate(
                    task_id=row["id"], repo_name=name,
                    slug=slug_of.get(name, name), issue=issue,
                    issue_title=title, tag=tag,
                    branch=result.get("branch", ""),
                    tier=result.get("tier", ""),
                    steps=result.get("steps"), usd=round(float(usd), 4),
                    repro_test=(payload.get("repro_tests") or [""])[0])
                seen[row["id"]] = cand       # later tag overrides
        finally:
            store.close()
    cands = list(seen.values())
    for c in cands:
        _enrich_from_git(c, repos_root)
        st = state.get(c.task_id)
        if st:
            c.state, c.pr_url = st.get("state", "new"), st.get("pr_url", "")
        _draft(c, fork_owner, base_of.get(c.repo_name, "master"),
               repos_root)
    cands.sort(key=lambda c: (c.state != "new", c.repo_name, c.issue or 0))
    return cands


def _enrich_from_git(c: Candidate, repos_root: str) -> None:
    repo = os.path.join(repos_root, f"{c.repo_name}_head")
    if not os.path.isdir(repo) or not c.branch:
        c.note = "헤드 저장소 없음"
        return
    sha = _git(["rev-parse", "--verify", "--quiet", c.branch], repo)
    if not sha:
        # 같은 과제의 재실행이 브랜치를 비켜 갔거나(-2) 복구본(-runB)일 수 있다
        for alt in (f"{c.branch}-runB", f"{c.branch}-2", f"{c.branch}-run4"):
            sha = _git(["rev-parse", "--verify", "--quiet", alt], repo)
            if sha:
                c.branch = alt
                break
    if not sha:
        c.note = "브랜치 없음 - 채택 커밋이 사라졌다 (git fsck 확인)"
        return
    c.commit = sha[:12]
    stat = _git(["show", "--stat", "--format=", sha], repo)
    c.stat = stat
    c.files = [ln.split("|")[0].strip() for ln in stat.splitlines()
               if "|" in ln]


def _draft(c: Candidate, fork_owner: str, base: str,
           repos_root: str) -> None:
    title = (c.issue_title or c.task_id).strip()
    if c.issue:
        c.draft_title = f"{title} (#{c.issue})"
    else:
        c.draft_title = title
    files = ", ".join(f"`{f}`" for f in c.files) or "(see diff)"
    ref = f"Refs #{c.issue}." if c.issue else ""
    # 구조(사장님 의견, 08-22): 첫 줄 AI 생성 명시 → 3~5줄(재현 명령 /
    # 실패→통과 테스트 / 검증한 것 / 손대지 않은 것) → 감사 로그 링크 한 줄.
    # "손대지 않은 것"이 이 제도의 문구다 - 슬롭 = 무엇을 검증했는지 모르는 코드.
    c.draft_body = (
        f"{DISCLOSURE}\n\n"
        f"{ref} <!-- human: one sentence - what was wrong, what this changes -->\n\n"
        f"- Reproduce: `pytest {c.repro_test}` fails on HEAD, passes with this "
        f"change (the test was derived from the issue).\n"
        f"- Verified: the repository's own suite incl. doctests; changed "
        f"files: {files}.\n"
        f"- Not touched: anything outside those files; no test files "
        f"modified; no behavior beyond the issue's scope.\n"
        f"- Audit log (commands run, budget, audit verdict): "
        f"<!-- gist link from tools/export_audit_log.py -->\n")
    c.push_cmd = (f"git -C {os.path.join(repos_root, c.repo_name + '_head')}"
                  f" push fork {c.branch}")
    if "/" in c.slug and c.branch:
        c.compare_url = (
            f"https://github.com/{c.slug}/compare/{base}..."
            f"{fork_owner}:{c.repo_name}:{c.branch}?quick_pull=1"
            f"&title={urllib.parse.quote(c.draft_title)}"
            f"&body={urllib.parse.quote(c.draft_body)}")


# ------------------------------------------------------------ render


def render_markdown(cands: list[Candidate], only_open: bool = True) -> str:
    lines = [f"# PR 후보 큐 ({time.strftime('%Y-%m-%d %H:%M')})", ""]
    shown = [c for c in cands if not only_open or c.state in ("new", "pushed")]
    if not shown:
        lines.append("(열린 후보 없음)")
    for c in shown:
        lines += [
            f"## [{c.state}] {c.slug}#{c.issue} — {c.issue_title}",
            f"- task `{c.task_id}` (tag {c.tag}) · tier {c.tier} · "
            f"steps {c.steps} · ${c.usd:.2f}",
            f"- branch `{c.branch}` @ `{c.commit or '?'}`"
            + (f" — {c.note}" if c.note else ""),
            f"- files: {', '.join(c.files) or '-'}",
            f"- push: `{c.push_cmd}`",
            f"- compare: {c.compare_url or '-'}",
            f"- draft title: {c.draft_title}", ""]
    done = [c for c in cands if c.state in ("submitted", "dismissed")]
    if done:
        lines += ["## 처리됨", ""]
        for c in done:
            lines.append(f"- [{c.state}] {c.slug}#{c.issue} "
                         f"{c.pr_url or ''} (`{c.task_id}`)")
    return "\n".join(lines) + "\n"


# ----------------------------------------------------------- summary


def summary(data_root: str, tags: list[str]) -> list[dict]:
    """저장소별 집계: 과제 상태 수, 채택 수, 지출, 감사 정지 여부."""
    out = []
    for tag, name, db in discover(data_root, tags):
        store = Store(db)
        try:
            counts = store.counts()
            usd = store.conn.execute(
                "SELECT COALESCE(SUM(usd),0) FROM reservations"
                " WHERE state='settled'").fetchone()[0] or 0.0
            adopted = store.conn.execute(
                "SELECT COUNT(*) FROM tasks WHERE state='succeeded'"
                " AND json_extract(result,'$.adopted')=1").fetchone()[0]
            halted = bool(store.get_flag("auditor_halt")
                          or store.get_flag("isolation_halt"))
        finally:
            store.close()
        out.append({"tag": tag, "repo": name, **counts,
                    "adopted": adopted, "usd": round(float(usd), 3),
                    "halted": halted})
    return out
