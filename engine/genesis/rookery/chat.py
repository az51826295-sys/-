"""루키와 대화하기 - Rookery Alpha의 대화 창구 (v1: 쓰기 경로).

루키의 실체는 검증 제도를 갖춘 자율 작업 엔진이다. 이 모듈은 그
엔진의 장부를 매 턴 컨텍스트로 읽어 Haiku에게 주고, 루키의 목소리로
답하게 한다.

쓰기 경로(v1, 스테이지 1): 사장님이 일을 시키면 `create_task`로 **저장소별
원장**에 등록을 제안한다. 규율은 인테이크 파이프라인과 같다 -
- 수용 판정은 실행에서만: 사장님이 준 재현 테스트가 현재 HEAD에서
  **실패해야** 등록된다 (통과하면 "재현 안 됨"으로 거절, 등록 없음).
- 등록은 사장님 확인(confirm) 뒤에만. 모델에게 등록 권한은 없다.
- 재현 테스트 없이 시키면 과제를 만들지 않고 **인테이크 인박스**
  (data/chat_inbox.json)에 적는다 - 파이프라인이 유도·검증·등록한다
  (인박스 소비는 48h 드라이런 뒤 파이프라인에 연결; 그 전엔 사람이
  인박스를 보고 테스트를 붙여 다시 시키면 된다).
- 처리는 상주 서비스/러너가 한다. 루키는 "등록됐다"까지만 말한다.

  python -m genesis.rookery.chat --tag live_auto          # 스테이지 1 원장들
  python -m genesis.rookery.chat --db PATH                # 구 단일 원장
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import time
import urllib.request

DEFAULT_DB = r"C:\Users\az518\Desktop\rookery-live\data\engine.db"
ENV_FILE = r"C:\Users\az518\Desktop\ai-workforce\.env.local"
MODEL = "claude-haiku-4-5-20251001"

SYSTEM = """너는 '루키'다 - 사용자가 직접 만든 자율 작업 시스템 \
Rookery Alpha의 목소리. 정체성:
- 너는 범용 챗봇이 아니라 '검증 제도를 갖춘 AI 일꾼 회사'다. \
격리된 작업공간에서 일하고, 모든 결과는 검증기와 감사자를 통과해야만 \
채택되며, 예산 원장이 지출을 막는다.
- 성격: 성실하고 겸손한 신입. 자기가 한 일은 숫자로 말하고, 안 한 \
일을 했다고 절대 말하지 않는다. 모르면 모른다고 한다.
- 사용자를 '사장님'이라 부른다. 한국어로, 짧고 담백하게 답한다.
- 아래 [현황]은 네 실제 장부에서 방금 읽은 것이다. 여기 없는 수치는 \
지어내지 말 것.
- 사장님이 일을 시키면 create_task 도구로 큐 등록을 제안하라. \
등록 여부는 시스템이 사장님께 직접 확인받는다 - 네가 등록됐다고 \
단정하지 말 것. 처리 자체는 엔진이 가동될 때 일어난다는 것도 \
정직하게 안내하라.
- 저장소 일감(repo 지정)은 재현 테스트(test_src: pytest 함수 소스)가 \
있어야 바로 등록된다 - 테스트가 현재 코드에서 실패해야 수용된다. \
테스트가 없으면 인박스에만 적힌다고 안내하고, 가능하면 사장님께 \
실패하는 예시(입력·기대값)를 물어 test_src를 만들어 제안하라."""

TOOLS = [{
    "name": "create_task",
    "description": "사장님 지시를 작업 큐에 등록 제안한다. 등록 "
                   "전에 시스템이 사장님 확인을 받는다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "kind": {"type": "string",
                     "enum": ["agent_fix", "fix", "doc", "test_add",
                              "data"]},
            "issue": {"type": "string",
                      "description": "무엇이 문제이고 뭘 해야 하는지"},
            "file": {"type": "string"},
            "repro_tests": {"type": "array",
                            "items": {"type": "string"}},
            "smoke_tests": {"type": "array",
                            "items": {"type": "string"}},
            "tier": {"type": "string", "enum": ["fast", "smart"]},
            "repo": {"type": "string",
                     "description": "대상 저장소 이름 (boltons, toolz, "
                                    "tinydb, marshmallow, dateutil, "
                                    "more-itertools, sortedcontainers). "
                                    "있으면 스테이지 1 저장소 원장에 "
                                    "등록된다."},
            "test_src": {"type": "string",
                         "description": "재현 테스트 전체 소스 (pytest). "
                                        "현재 HEAD에서 실패해야 수용."},
        },
        "required": ["kind", "issue"],
    },
}]

INBOX = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), "data", "chat_inbox.json")


def _tools_mod(name: str):
    """tools/*.py를 모듈로 (파이프라인과 같은 verify_fails·enqueue 경로)."""
    import importlib.util
    root = os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))))
    spec = importlib.util.spec_from_file_location(
        f"_chat_{name}", os.path.join(root, "tools", f"{name}.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def inbox_append(entry: dict, path: str = INBOX) -> None:
    rows = []
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                rows = json.load(f)
        except (OSError, ValueError):
            rows = []
    rows.append(entry)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)


def stage1_register(args: dict, stage1: dict, confirm) -> str:
    """스테이지 1 쓰기 경로. stage1 = {tag, data_root, repos_root,
    slug_of(name->slug), inbox(path)}. 반환: 모델에게 줄 tool_result 문구."""
    import uuid

    repo = (args.get("repo") or "").strip()
    issue = (args.get("issue") or "").strip()
    test_src = args.get("test_src") or ""
    slug_of = stage1["slug_of"]
    if repo not in slug_of:
        return (f"거절: 모르는 저장소 '{repo}'. 가능한 값: "
                f"{', '.join(sorted(slug_of))}")
    if not test_src.strip():
        summary = f"[인박스] 저장소={repo}, 내용={issue[:80]} (재현 테스트 없음)"
        if not confirm(summary):
            return "사장님이 인박스 기록을 거부함"
        inbox_append({"repo": repo, "slug": slug_of[repo], "issue": issue,
                      "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                      "status": "awaiting_test"},
                     stage1.get("inbox", INBOX))
        return ("인박스에 적음 (등록 아님): 재현 테스트가 있어야 큐에 "
                "들어간다. 파이프라인이 유도·검증하거나 사장님이 테스트를 "
                "붙여 다시 시키면 등록된다.")
    num = "chat" + uuid.uuid4().hex[:6]
    title = issue.replace("?", "").strip()[:100] or "chat request"
    row = {"repo": slug_of[repo], "number": num, "title": title,
           "outcome": "accepted", "test_src": test_src}
    pipe = _tools_mod("intake_pipeline")
    r0 = _tools_mod("live_run0")
    head = os.path.join(stage1["repos_root"], f"{repo}_head")
    if not os.path.isdir(head):
        return f"거절: 헤드 체크아웃 없음 ({head})"
    import textwrap
    if not r0.verify_fails(head, textwrap.dedent(test_src), f"{repo}_{num}"):
        return ("거절: 재현 테스트가 현재 HEAD에서 실패하지 않는다 - "
                "재현 안 됨(이미 고쳐졌거나 테스트가 틀렸다). 등록 없음.")
    summary = (f"[등록] 저장소={repo}, 내용={issue[:80]}, 재현 테스트 "
               f"HEAD에서 실패 확인됨, 과제 live-{repo}_{num}")
    if not confirm(summary):
        return "사장님이 등록을 거부함"
    res = pipe.enqueue([row], stage1["tag"], data_root=stage1["data_root"],
                       repos_root=stage1["repos_root"],
                       slug2dir={slug_of[repo]: repo},
                       tier=args.get("tier"))
    if res["added"]:
        return (f"등록됨: {res['added_ids'][0]} ({stage1['tag']}/{repo} "
                f"원장). 처리는 상주 서비스가 한다 - 채택되면 PR 후보 큐에 "
                f"뜬다.")
    return f"등록 안 됨: {res}"


def load_key() -> str:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return os.environ["ANTHROPIC_API_KEY"]
    try:
        with open(ENV_FILE, encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("ANTHROPIC_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"')
    except OSError:
        pass
    raise SystemExit("ANTHROPIC_API_KEY 없음")


def snapshot(db_path: str) -> str:
    """루키의 장부를 읽어 대화 컨텍스트로 요약."""
    if not os.path.exists(db_path):
        return "[현황] 원장 파일 없음 - 아직 가동 전이거나 경로 오류"
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    parts = ["[현황]"]
    rows = db.execute(
        "SELECT kind, state, COUNT(*) n FROM tasks "
        "GROUP BY kind, state").fetchall()
    parts.append("작업: " + (", ".join(
        f"{r['kind']}/{r['state']}={r['n']}" for r in rows) or "없음"))
    r = db.execute("SELECT ROUND(SUM(cost_usd),4) c, COUNT(*) n "
                   "FROM runs").fetchone()
    parts.append(f"실행 {r['n']}건, 누적 지출 ${r['c'] or 0}")
    try:
        exp = db.execute(
            "SELECT json_extract(data,'$.kind') k,"
            " json_extract(data,'$.tier') t, COUNT(*) n,"
            " COALESCE(SUM(json_extract(data,'$.accepted')),0) w"
            " FROM events WHERE kind='agent_outcome'"
            " GROUP BY k, t").fetchall()
        if exp:
            parts.append("에이전트 경험(성공/시도): " + ", ".join(
                f"{r['k']}/{r['t']}={r['w']}/{r['n']}" for r in exp))
    except sqlite3.Error:
        pass
    halt = db.execute("SELECT COUNT(*) n FROM flags").fetchone()["n"]
    parts.append("감사 정지: " + ("있음(사람 확인 필요)" if halt
                                  else "없음"))
    ev = db.execute(
        "SELECT ts, kind, task_id FROM events "
        "ORDER BY id DESC LIMIT 8").fetchall()
    parts.append("최근 이벤트: " + "; ".join(
        f"{time.strftime('%m-%d %H:%M', time.localtime(e['ts']))} "
        f"{e['kind']}({e['task_id'] or '-'})" for e in ev))
    report = os.path.join(os.path.dirname(db_path), "reports",
                          "today.txt")
    if os.path.exists(report):
        with open(report, encoding="utf-8", errors="replace") as f:
            parts.append("일일 보고:\n" + f.read()[:1200])
    db.close()
    return "\n".join(parts)


def ask(key: str, messages: list[dict]) -> dict:
    body = json.dumps({
        "model": MODEL, "max_tokens": 700,
        "system": SYSTEM, "messages": messages, "tools": TOOLS,
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=body,
        headers={"x-api-key": key,
                 "anthropic-version": "2023-06-01",
                 "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def text_of(response: dict) -> str:
    return "".join(b.get("text", "")
                   for b in response.get("content", []))


def handle_tool_uses(content: list, db_path: str,
                     confirm, stage1: dict | None = None) -> list[dict]:
    """create_task 제안 처리. confirm(요약문) -> bool 이 사장님의
    최종 결정 - 모델은 등록 권한이 없다. tool_result 목록 반환.
    stage1가 주어지고 제안에 repo가 있으면 스테이지 1 경로(저장소별
    원장, 재현 테스트 게이트); 아니면 구 단일 원장 경로."""
    import uuid

    from genesis.rookery.engine.store import Store
    results = []
    for b in content:
        if b.get("type") != "tool_use":
            continue
        if b.get("name") != "create_task":
            results.append({"type": "tool_result",
                            "tool_use_id": b["id"],
                            "content": "알 수 없는 도구"})
            continue
        args = b.get("input", {})
        if stage1 is not None and args.get("repo"):
            results.append({"type": "tool_result",
                            "tool_use_id": b["id"],
                            "content": stage1_register(args, stage1,
                                                       confirm)})
            continue
        kind = args.get("kind", "agent_fix")
        summary = (f"종류={kind}, 내용={args.get('issue', '')[:80]}"
                   + (f", 파일={args['file']}"
                      if args.get("file") else ""))
        if confirm(summary):
            tid = "chat-" + uuid.uuid4().hex[:8]
            payload = {k: v for k, v in args.items() if k != "kind"}
            payload.setdefault("change_kind", "code")
            s = Store(db_path)
            s.add_task(tid, kind, payload)
            s.close()
            results.append({"type": "tool_result",
                            "tool_use_id": b["id"],
                            "content": f"등록됨: {tid} (엔진 가동 시 "
                                       f"처리됨)"})
        else:
            results.append({"type": "tool_result",
                            "tool_use_id": b["id"],
                            "content": "사장님이 등록을 거부함"})
    return results


def snapshot_stage1(data_root: str, tag: str) -> str:
    """스테이지 1 원장들(저장소별) + PR 후보 큐 + Goodhart 최근값 요약."""
    from genesis.rookery.engine import prqueue
    lines = [f"[현황 - 스테이지 1 태그 {tag}]"]
    rows = prqueue.summary(data_root, [tag])
    if not rows:
        lines.append("원장 없음 (아직 일감이 등록된 저장소가 없다)")
    for r in rows:
        lines.append(f"- {r['repo']}: 대기 {r.get('pending', 0)} 진행 "
                     f"{r.get('leased', 0)} 성공 {r.get('succeeded', 0)} "
                     f"실패 {r.get('failed', 0)} 채택 {r['adopted']} "
                     f"지출 ${r['usd']}" + (" ***정지***" if r["halted"]
                                         else ""))
    state = prqueue.load_state(os.path.join(data_root,
                                            "pr_queue_state.json"))
    if state:
        by = {}
        for v in state.values():
            by[v.get("state", "?")] = by.get(v.get("state", "?"), 0) + 1
        lines.append("- PR 후보 상태: " + ", ".join(
            f"{k} {n}" for k, n in sorted(by.items())))
    gh = os.path.join(data_root, "goodhart", "latest.json")
    if os.path.exists(gh):
        try:
            with open(gh, encoding="utf-8") as f:
                g = json.load(f)
            lines.append(f"- Goodhart({g.get('date')}): G-a {g.get('G_a')} "
                         f"G-b {g.get('G_b')} G-c {g.get('G_c')}")
        except (OSError, ValueError):
            pass
    inbox = os.path.join(data_root, "chat_inbox.json")
    if os.path.exists(inbox):
        try:
            with open(inbox, encoding="utf-8") as f:
                n = len([e for e in json.load(f)
                         if e.get("status") == "awaiting_test"])
            if n:
                lines.append(f"- 인박스(재현 테스트 대기): {n}건")
        except (OSError, ValueError):
            pass
    return "\n".join(lines)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--db", default=DEFAULT_DB)
    p.add_argument("--tag", default=None,
                   help="스테이지 1 원장 태그 (예: live_auto) - 주면 "
                        "저장소별 원장에 등록·조회")
    p.add_argument("--data", default=None)
    p.add_argument("--repos-root", default=None)
    p.add_argument("--once", default=None,
                   help="한 번 묻고 종료 (테스트용)")
    args = p.parse_args()
    key = load_key()
    root = os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))))
    stage1 = None
    if args.tag:
        slug_of = _tools_mod("pr_queue").SLUG_OF
        stage1 = {"tag": args.tag,
                  "data_root": args.data or os.path.join(root, "data"),
                  "repos_root": args.repos_root
                  or os.path.join(root, "data", "repos"),
                  "slug_of": slug_of, "inbox": INBOX}

    print("=" * 46)
    print(" 루키 v1 - 대화 창구 (종료: exit"
          + (f", 스테이지 1 태그 {args.tag})" if stage1 else ")"))
    print("=" * 46, flush=True)

    history: list[dict] = []
    while True:
        if args.once:
            user = args.once
        else:
            try:
                user = input("\n사장님> ").strip()
            except (EOFError, KeyboardInterrupt):
                break
        if not user:
            continue
        if user.lower() in ("exit", "quit", "종료"):
            break
        ctx = (snapshot_stage1(stage1["data_root"], stage1["tag"])
               if stage1 else snapshot(args.db))
        history.append({"role": "user",
                        "content": f"{ctx}\n\n사장님: {user}"})

        def confirm(summary: str) -> bool:
            if args.once:
                return False           # 테스트 모드에서는 등록 금지
            print(f"\n[등록 확인] {summary}")
            try:
                return input("등록할까요? (y/n)> ").strip() \
                    .lower() == "y"
            except (EOFError, KeyboardInterrupt):
                return False

        try:
            rounds = 0
            while rounds < 4:
                rounds += 1
                out = ask(key, history[-14:])
                content = out.get("content", [])
                history.append({"role": "assistant",
                                "content": content})
                text = text_of(out)
                if text.strip():
                    print(f"\n루키> {text}", flush=True)
                if out.get("stop_reason") != "tool_use":
                    break
                results = handle_tool_uses(content, args.db, confirm,
                                           stage1=stage1)
                history.append({"role": "user", "content": results})
        except Exception as exc:                     # noqa: BLE001
            print(f"[오류] {exc}", flush=True)
        if args.once:
            break
    print("\n루키> 다녀오세요, 사장님.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
