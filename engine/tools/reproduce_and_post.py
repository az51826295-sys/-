"""버티컬 슬라이스 — 제품의 전체 루프 한 명령 (docs/product-vision.md).

  진짜 GitHub 이슈 → 재현 테스트 유도 → HEAD에서 실패 검증 → 실패하면
  코멘트로 발송. 못 만들면 침묵(아무것도 안 보냄).

두 반쪽을 잇는다: 엔진(재현·검증, live_intake_verify) + GitHub App 코멘트
(spike_github_app). 이게 도는 순간 "제품이 존재한다".

  # 소스 이슈(우리가 클론해둔 head repo)에서 재현 → 우리 테스트 저장소에 데모 발송
  python tools/reproduce_and_post.py --repo toolz --issue 626 \
      --post-to az51826295-sys/legendary-octo-spork --post-issue 1

  --mock         유도를 가짜로 (지출 0, A형만 됨)
  --dry-run      발송 안 하고 무엇을 보낼지만 출력
환경: GITHUB_APP_ID, GITHUB_APP_KEY (코멘트 발송용). 유도는 ANTHROPIC_API_KEY
(B형, Haiku ~$0.002) 또는 --mock.
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import sys

sys.path.insert(0, os.getcwd())
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
SLUG_OF = {"boltons": "mahmoud/boltons", "dateutil": "dateutil/dateutil",
           "marshmallow": "marshmallow-code/marshmallow",
           "more-itertools": "more-itertools/more-itertools",
           "sortedcontainers": "grantjenks/python-sortedcontainers",
           "tinydb": "msiemens/tinydb", "toolz": "pytoolz/toolz"}
PKG = {"boltons": "boltons", "dateutil": "dateutil", "marshmallow": "marshmallow",
       "more-itertools": "more_itertools", "sortedcontainers": "sortedcontainers",
       "tinydb": "tinydb", "toolz": "toolz"}


def _mod(name):
    spec = importlib.util.spec_from_file_location(
        f"_vs_{name}", os.path.join(HERE, f"{name}.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


COMMENT = """\U0001F52C **Rookery**: 이 이슈를 재현하는 실패 테스트를 만들었습니다.

```python
{test}
```

이 테스트는 현재 HEAD에서 **실패**합니다(버그 존재). 고치시면 통과합니다.

- 재현: `pytest` 로 이 테스트를 돌리면 실패
- 검증: 격리된 워크트리에서 실제 실행해 실패를 확인함 (추측 아님)
- 손대지 않은 것: 코드 수정 없음 — 재현 테스트만

_못 만드는 이슈엔 아무것도 보내지 않습니다. (AI agent Rookery, 사람 검토)_"""


def reproduce_generic(slug: str, issue: int, token: str | None = None,
                      post_to: str | None = None, post_issue: int | None = None,
                      dry_run: bool = False) -> dict:
    """임의 저장소(별칭 불필요): 클론 온보딩 → 유도 → 재현 → 발송/침묵.
    웹훅이 미리 클론 안 한 저장소에 쓴다. 반환: 상태 dict."""
    vf = _mod("live_intake_verify")
    cr = _mod("customer_repo")
    try:
        repo = cr.onboard(slug, token)
    except Exception as exc:                 # noqa: BLE001  (클론 실패 등)
        return {"status": "silent", "reason": f"onboard 실패: {str(exc)[:100]}"}
    if not repo["importable"]:
        return {"status": "silent", "reason": repo["detail"] or "not importable"}
    pkg = repo["pkg"]
    body = vf.fetch_issue_body(slug, issue)
    test_src = vf.build_test_from_body(body)
    if not test_src:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            try:
                for line in open(vf.ENV_FILE, encoding="utf-8"):
                    if line.strip().startswith("ANTHROPIC_API_KEY="):
                        os.environ["ANTHROPIC_API_KEY"] = \
                            line.split("=", 1)[1].strip().strip('"')
            except OSError:
                pass
        os.environ.setdefault("GENESIS_SPEND", "i-approve")
        import urllib.request as _u, json as _j
        req = _u.Request(f"https://api.github.com/repos/{slug}/issues/{issue}",
                         headers={"User-Agent": "rookery",
                                  "Accept": "application/vnd.github+json"})
        title = _j.load(_u.urlopen(req, timeout=30)).get("title", "")
        from genesis.mission7.proposers import AnthropicProvider
        test_src = vf.derive_test(AnthropicProvider(vf.MODEL, 1.0,
                                                    max_tokens=1500),
                                  pkg, title, body)
    if not test_src:
        return {"status": "silent", "reason": "no reproduction test"}
    res = cr.reproduce_in(repo, test_src, f"{pkg}_{issue}")
    if res != "accepted":
        return {"status": "silent", "reason": res}
    comment = COMMENT.format(test=test_src.strip())
    if dry_run or not post_to:
        return {"status": "reproduced", "comment": comment, "posted": False}
    spike = _mod("spike_github_app")
    app = os.environ.get("GITHUB_APP_ID"); key = os.environ.get("GITHUB_APP_KEY")
    if not app or not key:
        return {"status": "reproduced", "posted": False,
                "reason": "no app creds"}
    st, url = spike.comment(app, key, post_to, post_issue, comment)
    return {"status": "posted", "http": st, "url": url}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="소스 저장소 별칭 (toolz 등)")
    ap.add_argument("--issue", type=int, required=True)
    ap.add_argument("--post-to", help="코멘트 발송 대상 owner/repo (기본: 발송 안 함)")
    ap.add_argument("--post-issue", type=int)
    ap.add_argument("--mock", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    vf = _mod("live_intake_verify")
    repo, slug, pkg = args.repo, SLUG_OF[args.repo], PKG[args.repo]

    wt = vf.head_worktree(repo)
    if wt is None:
        raise SystemExit(f"헤드 워크트리 불가: {repo}")
    body = vf.fetch_issue_body(slug, args.issue)

    # 1. 재현 테스트 유도 (A형 본문 추출 / B형 모델)
    test_src = vf.build_test_from_body(body)
    if not test_src:
        if args.mock:
            provider = vf.MockProvider()
        else:
            if not os.environ.get("ANTHROPIC_API_KEY"):
                try:
                    for line in open(vf.ENV_FILE, encoding="utf-8"):
                        if line.strip().startswith("ANTHROPIC_API_KEY="):
                            os.environ["ANTHROPIC_API_KEY"] = \
                                line.split("=", 1)[1].strip().strip('"')
                except OSError:
                    pass
            os.environ.setdefault("GENESIS_SPEND", "i-approve")
            from genesis.mission7.proposers import AnthropicProvider
            provider = AnthropicProvider(vf.MODEL, 1.0, max_tokens=1500)
        # 이슈 제목
        import urllib.request, json
        req = urllib.request.Request(
            f"https://api.github.com/repos/{slug}/issues/{args.issue}",
            headers={"User-Agent": "rookery", "Accept": "application/vnd.github+json"})
        title = json.load(urllib.request.urlopen(req, timeout=30)).get("title", "")
        test_src = vf.derive_test(provider, pkg, title, body)
    if not test_src:
        print(f"침묵: {slug}#{args.issue} — 재현 테스트를 만들지 못함")
        return 0

    # 2. HEAD에서 실행 — 실패해야 재현 성공
    res = vf.run_test_at_head(wt, test_src, f"{repo}_{args.issue}")
    print(f"{slug}#{args.issue}: {res}")
    if res != "accepted":
        reason = {"not_reproducible": "HEAD에서 통과(이미 고쳐졌거나 무관)",
                  "invalid": "테스트가 수집/실행 불가", "env": "환경 불능"}.get(res, res)
        print(f"침묵: {reason} — 아무것도 안 보냄")
        return 0

    # 3. 재현됨 → 코멘트 발송
    comment = COMMENT.format(test=test_src.strip())
    if args.dry_run or not args.post_to:
        print("--- 발송할 코멘트 (dry-run) ---")
        print(comment)
        return 0
    spike = _mod("spike_github_app")
    app = os.environ.get("GITHUB_APP_ID"); key = os.environ.get("GITHUB_APP_KEY")
    if not app or not key:
        raise SystemExit("발송하려면 GITHUB_APP_ID / GITHUB_APP_KEY 필요")
    st, url = spike.comment(app, key, args.post_to, args.post_issue, comment)
    print(f"발송 HTTP {st} -> {url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
