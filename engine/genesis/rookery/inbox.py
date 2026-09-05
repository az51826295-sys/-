"""채팅 인박스 (루키 채팅 쓰기 경로 v1 → 인테이크 파이프라인).

재현 테스트 없이 들어온 사장님 지시는 과제가 아니라 **인박스 항목**이다
(data/chat_inbox.json). 이 모듈은 인박스를 파이프라인의 2단(검증) 입력
형식으로 바꾸고, 결과를 인박스에 되적는다. 규율은 GitHub 이슈와 같다 -
유도된 재현 테스트가 HEAD에서 실패해야 수용, 통과·유도 실패는 기각.

파이프라인 연결(48h 드라이런 후, tools/intake_pipeline.py 두 곳):
  - main(): ``cands += inbox.to_candidates(inbox.pending(INBOX))``
  - verify(): ``body = c.get("body") or vf.fetch_issue_body(...)``
    (인박스 후보는 GitHub 이슈가 없으므로 body를 직접 들고 다닌다)
  - verify 뒤: ``inbox.record(INBOX, rows)`` 로 결말(accepted/...) 기록.
"""

from __future__ import annotations

import hashlib
import json
import os
import time

AWAITING, QUEUED, REJECTED = "awaiting_test", "queued", "rejected"


def load(path: str) -> list[dict]:
    try:
        with open(path, encoding="utf-8") as f:
            rows = json.load(f)
        return rows if isinstance(rows, list) else []
    except (OSError, ValueError):
        return []


def save(path: str, rows: list[dict]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)


def key_of(entry: dict) -> str:
    """인박스 항목의 안정 id: 저장소+내용 해시 (같은 지시 두 번 = 하나)."""
    h = hashlib.sha1(f"{entry.get('repo')}|{entry.get('issue', '').strip()}"
                     .encode("utf-8")).hexdigest()[:8]
    return f"chat{h}"


def pending(path: str) -> list[dict]:
    seen = set()
    out = []
    for e in load(path):
        if e.get("status", AWAITING) != AWAITING:
            continue
        k = key_of(e)
        if k in seen:
            continue
        seen.add(k)
        out.append(e)
    return out


def to_candidates(entries: list[dict]) -> list[dict]:
    """파이프라인 verify() 후보 형식. B형(유도 필요)으로 보내되, 본문을
    직접 들고 간다 (GitHub 이슈 없음). title은 제목 필터(WISH)에 걸리지
    않게 물음표를 뗀다 - 사장님의 지시는 질문이 아니라 일감이다."""
    cands = []
    for e in entries:
        issue = (e.get("issue") or "").strip()
        cands.append({"repo": e.get("slug") or e.get("repo"),
                      "number": key_of(e),
                      "title": issue.replace("?", "").strip()[:100]
                      or "chat request",
                      "class": "B", "labels": ["chat"],
                      "body": issue, "source": "chat_inbox"})
    return cands


def record(path: str, verified_rows: list[dict]) -> int:
    """검증 결과를 인박스에 되적는다. 반환: 갱신 건수."""
    rows = load(path)
    by_key = {key_of(e): e for e in rows}
    n = 0
    for r in verified_rows:
        if r.get("source") != "chat_inbox":
            continue
        e = by_key.get(r.get("number"))
        if e is None:
            continue
        outcome = r.get("outcome")
        e["verified_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        e["outcome"] = outcome
        e["status"] = QUEUED if outcome == "accepted" else REJECTED
        n += 1
    if n:
        save(path, rows)
    return n
