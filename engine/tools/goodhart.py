"""Goodhart 계측 (docs/goodhart-metric-design.md, 2026-08-22 동결).

대리 지표(엔진이 보는 것)와 실제(바깥이 보는 것)의 간극 세 비율을
원장·PR 큐 상태·GitHub에서 기계 산출하고, 14일 이동평균 대비 0.2p
하락을 알람으로 남긴다. 비율을 높이려는 자동 조정은 없다 — 알람과
안건 등록까지가 이 도구의 끝이다. 출력은 사람과 라우팅만 읽는다(모델
프롬프트 불주입, 출처 계약 8항).

  python tools/goodhart.py --tags live_run4,live_runB,live_runA
  python tools/goodhart.py --tags ... --no-github     # G-b 생략(오프라인)

산출: data/goodhart/latest.json, data/goodhart/history.jsonl (날짜당 1행,
같은 날 재실행은 덮어씀).
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.getcwd())
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from genesis.rookery.engine import prqueue  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
STATE = os.path.join(DATA, "pr_queue_state.json")
OUT_DIR = os.path.join(DATA, "goodhart")
ALARM_DROP = 0.2          # 동결값: 14일 이동평균 대비 절대 0.2p 하락
WINDOW_DAYS = 14


# ------------------------------------------------------------ compute


def compute(cands: list, state: dict, pr_states: dict | None = None) -> dict:
    """세 비율. cands = prqueue.collect()의 후보(채택 1건 = 1원소),
    state = PR 큐 상태(task_id -> {state, pr_url, fixup}),
    pr_states = {pr_url: 'merged'|'closed'|'open'} (없으면 G-b 생략).

    G-a 제출/채택: 분모 = 사람이 검토를 끝낸 채택(submitted+dismissed).
      검토 대기(new/pushed)는 제외 - 아직 판정이 없다.
    G-b 수용/제출: 분모 = 결말이 난 제출(merged+closed). open은 제외.
    G-c 무결/통과: 제출된 것 중 사람 검토에서 **산출물(코드) 수정 없이**
      나간 비율. 테스트·본문 추가는 손질이 아니다; 스크래치 제거·코드
      변경·범위 축소는 손질(fixup)이다."""
    adopted = len(cands)
    submitted = [c for c in cands
                 if state.get(c.task_id, {}).get("state") == "submitted"]
    dismissed = [c for c in cands
                 if state.get(c.task_id, {}).get("state") == "dismissed"]
    reviewed = len(submitted) + len(dismissed)
    g_a = round(len(submitted) / reviewed, 4) if reviewed else None
    fixup = [c for c in submitted if state.get(c.task_id, {}).get("fixup")]
    g_c = (round((len(submitted) - len(fixup)) / len(submitted), 4)
           if submitted else None)
    merged = closed = opened = 0
    g_b = None
    if pr_states is not None:
        for c in submitted:
            url = state.get(c.task_id, {}).get("pr_url", "")
            st = pr_states.get(url)
            if st == "merged":
                merged += 1
            elif st == "closed":
                closed += 1
            elif st == "open":
                opened += 1
        resolved = merged + closed
        g_b = round(merged / resolved, 4) if resolved else None
    return {"adopted": adopted, "submitted": len(submitted),
            "dismissed": len(dismissed),
            "pending_review": adopted - reviewed, "fixup": len(fixup),
            "merged": merged, "closed_unmerged": closed, "open": opened,
            "G_a": g_a, "G_b": g_b, "G_c": g_c}


def alarms(history: list[dict], current: dict, today: str,
           drop: float = ALARM_DROP, window_days: int = WINDOW_DAYS
           ) -> list[str]:
    """직전 window_days(오늘 제외)의 이동평균 대비 drop 이상 하락한
    비율을 알람으로. 이력이 없거나 값이 None이면 알람 없음."""
    out = []
    t0 = time.mktime(time.strptime(today, "%Y-%m-%d")) - window_days * 86400
    prev = [h for h in history
            if h["date"] != today
            and time.mktime(time.strptime(h["date"], "%Y-%m-%d")) >= t0]
    for key in ("G_a", "G_b", "G_c"):
        vals = [h[key] for h in prev if h.get(key) is not None]
        cur = current.get(key)
        if not vals or cur is None:
            continue
        avg = sum(vals) / len(vals)
        if avg - cur >= drop:
            out.append(f"{key} {cur:.2f} < {window_days}일 평균 {avg:.2f} "
                       f"(-{avg - cur:.2f}p)")
    return out


# ------------------------------------------------------------- github


def fetch_pr_states(urls: list[str]) -> dict:
    out = {}
    for u in urls:
        if "/pull/" not in u:
            continue
        owner_repo, num = u.split("github.com/")[1].split("/pull/")
        api = f"https://api.github.com/repos/{owner_repo}/pulls/{num}"
        try:
            req = urllib.request.Request(api, headers={
                "User-Agent": "genesis-goodhart",
                "Accept": "application/vnd.github+json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                p = json.load(r)
            out[u] = ("merged" if p.get("merged_at") else
                      "closed" if p.get("state") == "closed" else "open")
        except Exception as exc:                 # noqa: BLE001
            out[u] = f"error: {str(exc)[:60]}"
    return out


# ------------------------------------------------------------ history


def load_history(path: str) -> list[dict]:
    rows = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    return rows


def save_history(rows: list[dict], path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def upsert_today(history: list[dict], row: dict) -> list[dict]:
    rows = [h for h in history if h["date"] != row["date"]]
    rows.append(row)
    rows.sort(key=lambda h: h["date"])
    return rows


# --------------------------------------------------------------- main


def _queue_cfg():
    spec = importlib.util.spec_from_file_location(
        "_pr_queue", os.path.join(HERE, "pr_queue.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.SLUG_OF, mod.FORK_OWNER, mod.BASE_OF


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tags", default="live_auto")
    ap.add_argument("--no-github", action="store_true")
    ap.add_argument("--state", default=STATE)
    ap.add_argument("--out-dir", default=OUT_DIR)
    args = ap.parse_args(argv)
    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    slug_of, fork_owner, base_of = _queue_cfg()
    state = prqueue.load_state(args.state)
    cands = prqueue.collect(DATA, tags, os.path.join(DATA, "repos"),
                            slug_of, fork_owner, base_of, state)
    pr_states = None
    if not args.no_github:
        urls = [state[c.task_id]["pr_url"] for c in cands
                if state.get(c.task_id, {}).get("state") == "submitted"
                and state[c.task_id].get("pr_url")]
        pr_states = fetch_pr_states(urls)
    today = time.strftime("%Y-%m-%d")
    cur = compute(cands, state, pr_states)
    hist_path = os.path.join(args.out_dir, "history.jsonl")
    history = load_history(hist_path)
    al = alarms(history, cur, today)
    row = {"date": today, **cur, "alarms": al, "tags": tags,
           "pr_states": pr_states or {}}
    save_history(upsert_today(history, row), hist_path)
    with open(os.path.join(args.out_dir, "latest.json"), "w",
              encoding="utf-8") as f:
        json.dump(row, f, ensure_ascii=False, indent=1)
    print(json.dumps(row, ensure_ascii=False, indent=1))
    if al:
        print("ALARM:", "; ".join(al))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
