"""Week 1 — GitHub App 웹훅 수신기 (docs/mvp-build-playbook.md, 그림3 [1]).

GitHub App이 보내는 이벤트를 받아 서명을 검증하고, 이슈가 열리면 버티컬
슬라이스(reproduce_and_post)를 백그라운드로 트리거한다. 수신은 즉시 200을
반환하고 실제 재현은 스레드에서 — GitHub 재전송 타임아웃 회피.

  # 로컬 실행 (공개 URL은 배포/ngrok, Week 4)
  set WEBHOOK_SECRET=아무비밀
  set GITHUB_APP_ID=4689482
  set GITHUB_APP_KEY=C:/.../app.pem
  python -m uvicorn tools.webhook_server:app --port 8000

엔드포인트:
  GET  /health            헬스체크
  POST /webhook           GitHub 이벤트 (X-Hub-Signature-256 검증)

지금 범위: 우리가 헤드 클론을 가진 저장소만 재현(reproduce_and_post). 그 외는
'unsupported'로 로그 — 고객 저장소 클론은 Week 2. 발송은 이슈가 온 저장소에
되보낸다(APP 권한 필요). 테스트는 tests/test_webhook_server.py.
"""
from __future__ import annotations

import hashlib
import hmac
import importlib.util
import logging
import os
import threading

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse

log = logging.getLogger("rookery.webhook")
logging.basicConfig(level=logging.INFO)

HERE = os.path.dirname(os.path.abspath(__file__))
# 우리가 클론해둔 저장소만 지금 처리 (slug -> 별칭)
SUPPORTED = {"mahmoud/boltons": "boltons", "dateutil/dateutil": "dateutil",
             "marshmallow-code/marshmallow": "marshmallow",
             "more-itertools/more-itertools": "more-itertools",
             "grantjenks/python-sortedcontainers": "sortedcontainers",
             "msiemens/tinydb": "tinydb", "pytoolz/toolz": "toolz"}

def _bootstrap_key():
    """배포 편의: 개인키를 GITHUB_APP_KEY_B64(base64)로 주면 시작 시 파일로
    풀어 GITHUB_APP_KEY 경로를 세팅한다. 파일 마운트가 어려운 PaaS용."""
    b64 = os.environ.get("GITHUB_APP_KEY_B64")
    if b64 and not (os.environ.get("GITHUB_APP_KEY")
                    and os.path.exists(os.environ["GITHUB_APP_KEY"])):
        import base64
        import tempfile
        path = os.path.join(tempfile.gettempdir(), "rookery_app.pem")
        with open(path, "wb") as f:
            f.write(base64.b64decode(b64))
        os.environ["GITHUB_APP_KEY"] = path
        log.info("개인키를 B64에서 %s 로 복원", path)


_bootstrap_key()
app = FastAPI(title="Rookery webhook")


def _mod(name):
    spec = importlib.util.spec_from_file_location(
        f"_wh_{name}", os.path.join(HERE, f"{name}.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def verify_signature(body: bytes, sig_header: str | None, secret: str) -> bool:
    if not sig_header or not sig_header.startswith("sha256="):
        return False
    mac = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest("sha256=" + mac, sig_header)


def handle_issue_opened(repo_full: str, issue: int, post_back: bool = True):
    """열린 이슈 하나를 재현 시도 → 실패하면 그 이슈에 코멘트, 못 만들면 침묵.
    지원 저장소만; 그 외는 로그(Week 2 고객 클론)."""
    rp = _mod("reproduce_and_post")
    # 검토 모드(기본): 자동 발송 대신 사람 검토 큐에 쌓는다.
    review = os.environ.get("REVIEW_MODE", "1") != "0"
    alias = SUPPORTED.get(repo_full)
    if alias is None:
        # Week 2: 미리 클론 안 한 저장소는 온보딩해서 재현 (순수 파이썬 한정)
        log.info("onboarding %s#%s (일반 경로)", repo_full, issue)
        token = os.environ.get("INSTALLATION_TOKEN")  # 사설이면 필요
        out = rp.reproduce_generic(
            repo_full, issue, token=token,
            post_to=None if review else (repo_full if post_back else None),
            post_issue=issue, dry_run=review or not post_back)
        if review and out.get("status") == "reproduced" and out.get("comment"):
            rid = _review_store().add(repo_full, issue, out["comment"])
            log.info("검토 큐 등록 %s#%s -> %s", repo_full, issue, rid)
            return {"status": "queued_for_review", "id": rid}
        log.info("generic %s#%s -> %s", repo_full, issue, out.get("status"))
        return out
    argv = ["--repo", alias, "--issue", str(issue)]
    if post_back:
        argv += ["--post-to", repo_full, "--post-issue", str(issue)]
    else:
        argv += ["--dry-run"]
    try:
        rp.main(argv)
        return {"status": "processed", "repo": repo_full, "issue": issue}
    except SystemExit as exc:            # reproduce_and_post의 명시적 중단
        log.info("skip %s#%s: %s", repo_full, issue, exc)
        return {"status": "skipped", "detail": str(exc)}
    except Exception:                    # noqa: BLE001
        log.exception("handle_issue_opened 실패 %s#%s", repo_full, issue)
        return {"status": "error"}


def dispatch(event: str, payload: dict, post_back: bool = True) -> dict:
    if event == "issues" and payload.get("action") in ("opened", "reopened"):
        repo = payload.get("repository", {}).get("full_name")
        num = payload.get("issue", {}).get("number")
        if repo and num:
            threading.Thread(target=handle_issue_opened,
                             args=(repo, num, post_back), daemon=True).start()
            return {"dispatched": "issues", "repo": repo, "issue": num}
    if event == "installation":
        act = payload.get("action")
        acct = payload.get("installation", {}).get("account", {}).get("login")
        log.info("installation %s: %s", act, acct)
        return {"dispatched": "installation", "action": act}
    return {"dispatched": None, "event": event}


def _review_store():
    rs = _mod("review_store")
    return rs.ReviewStore()


import html as _html


def _dashboard_html() -> str:
    rs = _review_store()
    c = rs.counts()
    pending = rs.pending()
    cards = (f'<div class=row>'
             f'<div class=card><div class=lbl>검토 대기</div>'
             f'<div class=num>{len(pending)}</div></div>'
             f'<div class=card><div class=lbl>발송됨</div>'
             f'<div class=num>{c.get("posted", 0)}</div></div>'
             f'<div class=card><div class=lbl>기각</div>'
             f'<div class=num>{c.get("dismissed", 0)}</div></div>'
             f'<div class=card><div class=lbl>연결 저장소</div>'
             f'<div class=num>{len(SUPPORTED)}</div></div></div>')
    items = []
    for r in pending:
        code = _html.escape(r.get("comment", ""))
        items.append(
            f'<div class=item><div class=head><b>{_html.escape(r["repo"])}'
            f'#{r["issue"]}</b> <span class=id>{r["id"]}</span></div>'
            f'<pre>{code}</pre>'
            f'<form method=post action="/review/{r["id"]}/approve" '
            f'style="display:inline"><button class=ok>승인·발송</button></form> '
            f'<form method=post action="/review/{r["id"]}/dismiss" '
            f'style="display:inline"><button>기각</button></form></div>')
    body = "".join(items) or "<p class=empty>검토 대기 없음. 조용합니다.</p>"
    return (
        "<!doctype html><meta charset=utf-8><title>Rookery</title>"
        "<style>body{font:15px/1.6 system-ui;max-width:760px;margin:2rem auto;"
        "padding:0 1rem;color:#111}.row{display:flex;gap:12px;margin:1rem 0}"
        ".card{flex:1;background:#f5f5f3;border-radius:8px;padding:14px}"
        ".lbl{font-size:13px;color:#666}.num{font-size:26px;font-weight:500}"
        ".item{border:1px solid #e2e2dd;border-radius:10px;padding:14px;"
        "margin:12px 0}.head{margin-bottom:8px}.id{color:#999;font-size:12px}"
        "pre{background:#f7f7f5;padding:10px;border-radius:6px;overflow:auto;"
        "font-size:13px;white-space:pre-wrap}button{padding:7px 14px;"
        "border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer}"
        ".ok{border-color:#1d9e75;color:#0f6e56}.empty{color:#888}"
        "h1{font-size:20px;font-weight:500}</style>"
        "<h1>Rookery — 검토 큐</h1>" + cards + body)


@app.get("/", response_class=HTMLResponse)
def dashboard():
    return _dashboard_html()


@app.post("/review/{rid}/approve")
def approve(rid: str):
    rs = _review_store()
    r = rs.get(rid)
    if r and r["state"] == "pending":
        app_id = os.environ.get("GITHUB_APP_ID")
        key = os.environ.get("GITHUB_APP_KEY")
        if app_id and key:
            spike = _mod("spike_github_app")
            try:
                st, url = spike.comment(app_id, key, r["repo"], r["issue"],
                                        r["comment"])
                rs.mark(rid, "posted", url or "")
                log.info("승인·발송 %s -> HTTP %s", rid, st)
            except Exception:            # noqa: BLE001
                log.exception("발송 실패 %s", rid)
        else:
            rs.mark(rid, "posted", "(no app creds - marked only)")
    return RedirectResponse("/", status_code=303)


@app.post("/review/{rid}/dismiss")
def dismiss(rid: str):
    _review_store().mark(rid, "dismissed")
    return RedirectResponse("/", status_code=303)


@app.get("/health")
def health():
    return {"ok": True, "supported_repos": len(SUPPORTED)}


@app.post("/webhook")
async def webhook(request: Request,
                  x_github_event: str = Header(default=""),
                  x_hub_signature_256: str | None = Header(default=None)):
    body = await request.body()
    secret = os.environ.get("WEBHOOK_SECRET", "")
    if secret and not verify_signature(body, x_hub_signature_256, secret):
        raise HTTPException(status_code=401, detail="bad signature")
    import json
    try:
        payload = json.loads(body or b"{}")
    except ValueError:
        raise HTTPException(status_code=400, detail="bad json")
    return dispatch(x_github_event, payload)
