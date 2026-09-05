"""Week 0 스파이크: GitHub App이 이슈에 코멘트 하나 다는 것 최소 증명.

MVP 크리티컬 패스 (docs/mvp-build-playbook.md Week 0). 이게 되면 나머지는
"이미 있는 엔진 + 알려진 조각". 지출 0 (모델 안 씀), GitHub App 설치 토큰만.

**개인키(.pem)는 절대 이 저장소에 두지 마라.** repo 밖 경로에 두고 경로만 준다
(예: C:/Users/az518/rookery-secrets/app.pem). .gitignore에 *.pem 추가됨.

설정 (환경변수 또는 인자):
  GITHUB_APP_ID    앱 등록 후 나오는 숫자 App ID
  GITHUB_APP_KEY   개인키 .pem 파일 경로 (repo 밖)

사용:
  # 1) 설치 목록 확인 (앱을 어느 저장소에 설치했나)
  python tools/spike_github_app.py installs
  # 2) 코멘트 발송 (스파이크 완료 조건)
  python tools/spike_github_app.py comment --repo you/testrepo --issue 1 --text "hello from Rookery"
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request

import jwt  # PyJWT

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = "https://api.github.com"


def _load_key(path: str) -> str:
    with open(path, encoding="utf-8") as f:
        return f.read()


def app_jwt(app_id: str, key_pem: str) -> str:
    now = int(time.time())
    payload = {"iat": now - 60, "exp": now + 9 * 60, "iss": str(app_id)}
    return jwt.encode(payload, key_pem, algorithm="RS256")


def _req(url: str, token: str, method="GET", data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "rookery-spike",
        "X-GitHub-Api-Version": "2022-11-28"})
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, json.load(r)


def installations(app_id, key_path):
    j = app_jwt(app_id, _load_key(key_path))
    _, data = _req(f"{API}/app/installations", j)
    return [{"id": i["id"], "account": i["account"]["login"],
             "selection": i.get("repository_selection")} for i in data]


def install_token(app_id, key_path, installation_id):
    j = app_jwt(app_id, _load_key(key_path))
    _, data = _req(f"{API}/app/installations/{installation_id}/access_tokens",
                   j, method="POST")
    return data["token"]


def comment(app_id, key_path, repo, issue, text):
    owner = repo.split("/")[0]
    insts = installations(app_id, key_path)
    inst = next((i for i in insts if i["account"].lower() == owner.lower()),
                None)
    if inst is None:
        raise SystemExit(
            f"'{owner}'에 앱이 설치돼 있지 않다. 설치된 계정: "
            f"{[i['account'] for i in insts]}")
    tok = install_token(app_id, key_path, inst["id"])
    st, data = _req(f"{API}/repos/{repo}/issues/{issue}/comments", tok,
                    method="POST", data={"body": text})
    return st, data.get("html_url")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["installs", "comment"])
    ap.add_argument("--repo")
    ap.add_argument("--issue", type=int)
    ap.add_argument("--text", default="hello from Rookery")
    ap.add_argument("--app-id", default=os.environ.get("GITHUB_APP_ID", ""))
    ap.add_argument("--key", default=os.environ.get("GITHUB_APP_KEY", ""))
    args = ap.parse_args(argv)
    if not args.app_id or not args.key:
        raise SystemExit("GITHUB_APP_ID / GITHUB_APP_KEY (또는 --app-id --key) 필요")
    if not os.path.exists(args.key):
        raise SystemExit(f"개인키 파일 없음: {args.key}")
    if args.cmd == "installs":
        for i in installations(args.app_id, args.key):
            print(i)
    else:
        if not args.repo or not args.issue:
            raise SystemExit("--repo you/testrepo --issue N 필요")
        st, url = comment(args.app_id, args.key, args.repo, args.issue,
                          args.text)
        print(f"HTTP {st} -> {url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
