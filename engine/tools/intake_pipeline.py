"""스테이지 1 ①: 인테이크 파이프라인 한 명령 (docs/rookery-stage1-infra-design.md).

사람이 손으로 잇던 네 단계를 한 번에, **멱등**으로:

    스캔(1단 A/B/C) → 검증(2단, 실행 기반 수용) → 코퍼스 동결 → 저장소별 원장에 enqueue

- 멱등성의 근거 두 겹: (1) `data/intake_seen.json` 레지스트리 - 이미
  검증한 이슈는 재검증(=재지출)하지 않는다 (환경 불능 'env'만 재시도),
  (2) 원장의 과제 id `live-<repo>_<issue>` - 이미 있는 과제(상태 불문)는
  다시 넣지 않는다 (store.add_task는 INSERT OR IGNORE, 여기서는 그 전에
  헤드 검증·커밋도 건너뛴다). 수용 기준: 목 2회 연속 실행에서 2회차
  추가 0건 (tests/test_intake_pipeline.py).
- `--mock`: 2단의 B형 유도는 가짜 모델, 지출 0. 스캔·헤드 실행은 실제.
- `--from-corpus <json>`: 스캔·검증을 건너뛰고 동결 코퍼스를 바로 enqueue
  (재검증의 corpus_b.json 같은 파일).
- 처리(drain)는 하지 않는다 - 그건 러너(tools/live_run0.py)나 ②의 상주
  서비스 몫. 이 명령은 "일감을 원장에 넣고 멈춘다".

  python tools/intake_pipeline.py --mock
  python tools/intake_pipeline.py --from-corpus data/corpus_b.json --mock --tag live_runC
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys
import textwrap
import time

sys.path.insert(0, os.getcwd())
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
SEEN = os.path.join(DATA, "intake_seen.json")
PROTOCOL = "docs/rookery-stage1-infra-design.md"


def _load(name: str):
    spec = importlib.util.spec_from_file_location(
        f"_intake_{name}", os.path.join(HERE, f"{name}.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ------------------------------------------------------------ registry


def load_seen(path: str = SEEN) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_seen(seen: dict, path: str = SEEN) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(seen, f, ensure_ascii=False, indent=1, sort_keys=True)


def key(repo_slug: str, number: int) -> str:
    return f"{repo_slug}#{number}"


# ---------------------------------------------------------- stage 1+2


def scan(pages: int, scan_file: str | None = None) -> dict:
    """1단: 기존 스캔 결과 파일을 쓰거나 새로 스캔 (무인증 API)."""
    if scan_file:
        with open(scan_file, encoding="utf-8") as f:
            return json.load(f)
    sc = _load("live_intake_scan")
    rows, per_repo = [], {}
    for slug in sc.REPOS:
        try:
            issues = [i for i in sc.fetch_issues(slug, pages)
                      if "pull_request" not in i]
        except Exception as exc:                 # noqa: BLE001
            per_repo[slug] = {"error": str(exc)[:120]}
            continue
        for i in issues:
            rows.append({"repo": slug, "number": i["number"],
                         "title": i["title"][:100],
                         "class": sc.classify(i),
                         "labels": [l["name"] for l in
                                    i.get("labels", [])]})
        per_repo[slug] = {"scanned": len(issues)}
        time.sleep(1)
    return {"scanned_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "per_repo": per_repo, "issues": rows}


def verify(cands: list[dict], mock: bool) -> list[dict]:
    """2단: 후보를 헤드에서 실행해 수용 판정 (live_intake_verify 재사용)."""
    vf = _load("live_intake_verify")
    provider = None
    if mock:
        provider = vf.MockProvider()
    elif any(c["class"] == "B" for c in cands):
        if not os.environ.get("ANTHROPIC_API_KEY"):
            try:
                with open(vf.ENV_FILE, encoding="utf-8") as f:
                    for line in f:
                        if line.strip().startswith("ANTHROPIC_API_KEY="):
                            os.environ["ANTHROPIC_API_KEY"] = (
                                line.split("=", 1)[1].strip().strip('"'))
            except OSError:
                pass
        os.environ.setdefault("GENESIS_SPEND", "i-approve")
        from genesis.mission7.proposers import AnthropicProvider
        provider = AnthropicProvider(vf.MODEL, 1.0, max_tokens=1500)
    wts: dict[str, str | None] = {}
    rows = []
    for c in cands:
        repo = vf.SLUG2DIR.get(c["repo"])
        if repo is None:
            rows.append({**c, "outcome": "env", "note": "unknown repo"})
            continue
        if repo not in wts:
            wts[repo] = vf.head_worktree(repo)
        wt = wts[repo]
        if wt is None:
            rows.append({**c, "outcome": "env", "note": "worktree 불가"})
            continue
        try:
            body = c.get("body") or vf.fetch_issue_body(c["repo"],
                                                        c["number"])
        except Exception as exc:                 # noqa: BLE001
            rows.append({**c, "outcome": "fetch_fail",
                         "note": str(exc)[:80]})
            continue
        if c["class"] == "A":
            test_src = vf.build_test_from_body(body)
        else:
            test_src = (vf.derive_test(provider, repo, c["title"], body)
                        if provider else None)
        if not test_src:
            rows.append({**c, "outcome": "derive_fail"})
            continue
        res = vf.run_test_at_head(wt, test_src, f"{repo}_{c['number']}")
        rows.append({**c, "outcome": res, "test_src": test_src[:6000]})
        print(f"  {c['repo']}#{c['number']} ({c['class']}): {res}",
              flush=True)
        time.sleep(0.5)
    return rows


# ------------------------------------------------------------ freeze


def freeze(rows: list[dict], source: str, out_dir: str = DATA) -> str:
    """수용된 행만 날짜 코퍼스로 동결. 같은 날 재실행은 덧붙인다
    (같은 이슈는 한 번만)."""
    path = os.path.join(out_dir, f"corpus_{time.strftime('%Y%m%d')}.json")
    existing = {"frozen_at": time.strftime("%Y-%m-%d"),
                "protocol": PROTOCOL, "source": source, "rows": []}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            existing = json.load(f)
    have = {(r["repo"], r["number"]) for r in existing["rows"]}
    for r in rows:
        if r.get("outcome") == "accepted" and \
                (r["repo"], r["number"]) not in have:
            existing["rows"].append(r)
            have.add((r["repo"], r["number"]))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=1)
    return path


# ----------------------------------------------------------- enqueue


def enqueue(rows: list[dict], tag: str, data_root: str = DATA,
            repos_root: str | None = None, slug2dir: dict | None = None,
            attempts: int = 2, tier: str | None = None,
            seen: dict | None = None) -> dict:
    """수용 행을 저장소별 원장에 넣는다. 멱등: 있는 과제는 건너뛴다.
    헤드에서 재현이 더는 실패하지 않으면(no_longer_fails) 넣지 않고
    레지스트리에 기록한다."""
    from genesis.rookery.engine.store import Store
    r0 = _load("live_run0")
    slug2dir = slug2dir or r0.SLUG2DIR
    repos_root = repos_root or os.path.join(DATA, "repos")
    seen = seen if seen is not None else {}
    counts = {"added": 0, "existing": 0, "no_longer_fails": 0,
              "title_filtered": 0, "truncated": 0, "unknown_repo": 0}
    added_ids = []
    for r in rows:
        if r.get("outcome", "accepted") != "accepted":
            continue
        if r0.WISH.search(r.get("title", "")):
            counts["title_filtered"] += 1
            continue
        repo = slug2dir.get(r["repo"])
        if repo is None:
            counts["unknown_repo"] += 1
            continue
        test_src = r.get("test_src", "")
        if len(test_src) >= 5990:
            counts["truncated"] += 1
            continue
        task_id = f"live-{repo}_{r['number']}"
        root = os.path.join(data_root, tag, repo)
        os.makedirs(root, exist_ok=True)
        store = Store(os.path.join(root, "engine.db"))
        try:
            if store.get(task_id) is not None:
                counts["existing"] += 1
                continue
            repo_path = os.path.join(repos_root, f"{repo}_head")
            tag_ = f"{repo}_{r['number']}"
            src = textwrap.dedent(test_src)
            if not r0.verify_fails(repo_path, src, tag_):
                counts["no_longer_fails"] += 1
                seen[key(r["repo"], r["number"])] = {
                    "outcome": "no_longer_fails",
                    "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
                continue
            fname = f"test_intake_{tag_}.py"
            with open(os.path.join(repo_path, fname), "w",
                      encoding="utf-8") as f:
                f.write(src)
            subprocess.run(["git", "add", fname], cwd=repo_path,
                           capture_output=True)
            subprocess.run(
                ["git", "-c", "user.name=intake", "-c", "user.email=i@i",
                 "commit", "-qm", f"intake test for #{r['number']}"],
                cwd=repo_path, capture_output=True)
            payload = {
                "file": "(미지정 - 직접 찾아라)",
                "repro_tests": [fname], "smoke_tests": [],
                "issue": f"[{r['repo']}#{r['number']}] {r['title']}",
                "change_kind": "code", "files_in_scope": 1,
                "covered_by_tests": True}
            if tier:
                payload["tier"] = tier
            if store.add_task(task_id, "agent_fix", payload,
                              max_attempts=attempts):
                counts["added"] += 1
                added_ids.append(task_id)
                seen[key(r["repo"], r["number"])] = {
                    "outcome": "queued", "task": task_id, "tag": tag,
                    "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
            else:
                counts["existing"] += 1
        finally:
            store.close()
    return {**counts, "added_ids": added_ids}


# -------------------------------------------------------------- main


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mock", action="store_true")
    ap.add_argument("--tag", default="live_auto",
                    help="원장 디렉터리 data/<tag>/<repo>/engine.db")
    ap.add_argument("--pages", type=int, default=1)
    ap.add_argument("--scan-file", default="",
                    help="기존 스캔 json 재사용 (네트워크 생략)")
    ap.add_argument("--from-corpus", default="",
                    help="스캔·검증 생략, 동결 코퍼스를 바로 enqueue")
    ap.add_argument("--limit", type=int, default=0,
                    help="검증 후보 상한 (지출 통제)")
    ap.add_argument("--attempts", type=int, default=2)
    ap.add_argument("--tier", default=None)
    ap.add_argument("--seen", default=SEEN)
    args = ap.parse_args(argv)

    seen = load_seen(args.seen)
    summary: dict = {"ran_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                     "mock": args.mock, "tag": args.tag}
    if args.from_corpus:
        with open(args.from_corpus, encoding="utf-8") as f:
            rows = json.load(f)["rows"]
        summary["source"] = args.from_corpus
        corpus_path = args.from_corpus
    else:
        sc = scan(args.pages, args.scan_file or None)
        cands = []
        for i in sc["issues"]:
            if i["class"] not in ("A", "B"):
                continue
            prev = seen.get(key(i["repo"], i["number"]))
            if prev and prev.get("outcome") != "env":
                continue
            cands.append(i)
        if args.limit:
            cands = cands[:args.limit]
        # 채팅 인박스(재현 테스트 없이 들어온 지시)도 같은 게이트로
        from genesis.rookery import inbox as _inbox
        inbox_path = os.path.join(DATA, "chat_inbox.json")
        inbox_cands = _inbox.to_candidates(_inbox.pending(inbox_path))
        cands += inbox_cands
        summary["scanned"] = len(sc["issues"])
        summary["candidates"] = len(cands)
        summary["inbox_candidates"] = len(inbox_cands)
        rows = verify(cands, args.mock)
        if inbox_cands:
            summary["inbox_recorded"] = _inbox.record(inbox_path, rows)
        outcomes: dict[str, int] = {}
        for r in rows:
            outcomes[r["outcome"]] = outcomes.get(r["outcome"], 0) + 1
            if r["outcome"] != "accepted":
                seen[key(r["repo"], r["number"])] = {
                    "outcome": r["outcome"],
                    "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
        summary["verify_outcomes"] = outcomes
        corpus_path = freeze(rows, source=args.scan_file or "scan")
        summary["corpus"] = corpus_path
    enq = enqueue(rows, args.tag, attempts=args.attempts,
                  tier=args.tier, seen=seen)
    summary["enqueue"] = enq
    save_seen(seen, args.seen)
    out = os.path.join(DATA, "intake_pipeline_last.json"
                       + (".mock" if args.mock else ""))
    with open(out, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
