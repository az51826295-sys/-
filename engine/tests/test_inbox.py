"""채팅 인박스 → 파이프라인 후보 변환과 결말 기록."""

import json

from genesis.rookery import inbox


def test_pending_dedupes_and_skips_handled(tmp_path):
    p = str(tmp_path / "inbox.json")
    inbox.save(p, [
        {"repo": "toolz", "slug": "pytoolz/toolz", "issue": "tail(0) 고쳐줘?",
         "status": "awaiting_test"},
        {"repo": "toolz", "slug": "pytoolz/toolz", "issue": "tail(0) 고쳐줘?",
         "status": "awaiting_test"},                       # 같은 지시 두 번
        {"repo": "boltons", "slug": "mahmoud/boltons", "issue": "done already",
         "status": "queued"},
    ])
    pend = inbox.pending(p)
    assert len(pend) == 1 and pend[0]["repo"] == "toolz"


def test_candidates_carry_body_and_clean_title(tmp_path):
    cands = inbox.to_candidates([{"repo": "toolz", "slug": "pytoolz/toolz",
                                  "issue": "tail(0)이 전체를 돌려준다?"}])
    c = cands[0]
    assert c["repo"] == "pytoolz/toolz" and c["class"] == "B"
    assert c["number"].startswith("chat") and len(c["number"]) == 12
    assert "?" not in c["title"] and c["body"].endswith("?")
    assert c["source"] == "chat_inbox"


def test_record_marks_queued_or_rejected(tmp_path):
    p = str(tmp_path / "inbox.json")
    entries = [{"repo": "toolz", "slug": "pytoolz/toolz", "issue": "A"},
               {"repo": "toolz", "slug": "pytoolz/toolz", "issue": "B"}]
    inbox.save(p, entries)
    cands = inbox.to_candidates(inbox.pending(p))
    rows = [{**cands[0], "outcome": "accepted"},
            {**cands[1], "outcome": "not_reproducible"},
            {"repo": "x", "number": "9", "outcome": "accepted"}]   # 비인박스
    assert inbox.record(p, rows) == 2
    saved = {e["issue"]: e for e in json.load(open(p, encoding="utf-8"))}
    assert saved["A"]["status"] == "queued"
    assert saved["B"]["status"] == "rejected" and saved["B"]["outcome"] == "not_reproducible"
    assert inbox.pending(p) == []
