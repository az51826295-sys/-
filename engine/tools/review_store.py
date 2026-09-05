"""Week 3 — 사람 검토 큐 (docs/product-vision.md '사장님은 마지막 사람 한 명').

재현된 테스트는 자동 발송하지 않고 이 큐에 쌓인다. 대시보드에서 사장님이
승인하면 그때 코멘트가 나간다. 낮은 볼륨이라 json 파일로 충분.

  from tools.review_store import ReviewStore
  rs = ReviewStore()
  rid = rs.add(repo="pytoolz/toolz", issue=626, comment="...", test_src="...")
  rs.pending(); rs.mark(rid, "posted", url="https://...")
"""
from __future__ import annotations

import json
import os
import time
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_PATH = os.path.join(ROOT, "data", "review_queue.json")
STATES = ("pending", "posted", "dismissed")


class ReviewStore:
    def __init__(self, path: str = DEFAULT_PATH):
        self.path = path
        self._rows = self._load()

    def _load(self) -> list:
        try:
            with open(self.path, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return []

    def _save(self) -> None:
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self._rows, f, ensure_ascii=False, indent=1)

    def add(self, repo: str, issue: int, comment: str,
            test_src: str = "", title: str = "") -> str:
        # 멱등: 같은 repo#issue가 pending이면 새로 안 만든다
        for r in self._rows:
            if r["repo"] == repo and r["issue"] == issue \
                    and r["state"] == "pending":
                return r["id"]
        rid = "rv" + uuid.uuid4().hex[:8]
        self._rows.append({
            "id": rid, "repo": repo, "issue": issue, "title": title,
            "comment": comment, "test_src": test_src, "state": "pending",
            "url": "", "at": time.strftime("%Y-%m-%dT%H:%M:%S")})
        self._save()
        return rid

    def pending(self) -> list:
        return [r for r in self._rows if r["state"] == "pending"]

    def get(self, rid: str) -> dict | None:
        return next((r for r in self._rows if r["id"] == rid), None)

    def mark(self, rid: str, state: str, url: str = "") -> bool:
        if state not in STATES:
            raise ValueError(f"unknown state {state}")
        r = self.get(rid)
        if r is None:
            return False
        r["state"] = state
        r["url"] = url
        r["decided_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        self._save()
        return True

    def counts(self) -> dict:
        c = {s: 0 for s in STATES}
        for r in self._rows:
            c[r["state"]] = c.get(r["state"], 0) + 1
        return c
