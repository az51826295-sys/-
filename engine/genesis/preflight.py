"""Pre-registration capability preflight (lesson from P40: the
temperature-gate design was frozen without checking that the API
accepts temperature > 1.0 — a 400 on the first call killed the lane).

Run this BEFORE freezing any design that spends: it exercises every
API parameter the design will use with one minimal real call, checks
the key and the spend gate, and optionally checks local resources.
Paste the verdict line into the design doc.

  python -m genesis.preflight --model claude-haiku-4-5-20251001 \
      --temperature 1.0 --max-tokens 4000 \
      [--worktrees mi_running_minmax_stability,du_isotime_midnight]
"""

from __future__ import annotations

import argparse
import datetime
import os


def main() -> None:
    parser = argparse.ArgumentParser(prog="genesis.preflight")
    parser.add_argument("--model", required=True)
    parser.add_argument("--temperature", type=float, default=1.0)
    parser.add_argument("--max-tokens", type=int, default=4000)
    parser.add_argument("--worktrees", default="",
                        help="rookery task_ids whose work worktrees "
                             "must exist, comma separated")
    args = parser.parse_args()

    checks: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        checks.append((name, ok, detail))
        print(f"  {name}: {'OK' if ok else 'FAIL'}"
              + (f" ({detail})" if detail and not ok else ""))

    check("ANTHROPIC_API_KEY 존재",
          bool(os.environ.get("ANTHROPIC_API_KEY")))
    check("GENESIS_SPEND 게이트",
          os.environ.get("GENESIS_SPEND") == "i-approve")

    api_ok, api_detail = False, ""
    if checks[0][1] and checks[1][1]:
        from genesis.mission7.proposers import AnthropicProvider
        try:
            provider = AnthropicProvider(
                args.model, args.temperature,
                max_tokens=args.max_tokens)
            reply = provider.complete(
                "preflight check - reply with the single word OK",
                args.temperature, 0, 0)
            api_ok, api_detail = bool(reply.strip()), ""
        except Exception as exc:            # record, never raise
            api_detail = str(exc)[:200]
    check(f"API 호출 (model={args.model}, temp={args.temperature}, "
          f"max_tokens={args.max_tokens})", api_ok, api_detail)

    for task_id in filter(None, args.worktrees.split(",")):
        path = os.path.join("data", "repos", f"{task_id}_work")
        check(f"워크트리 {task_id}", os.path.isdir(path))

    ok = all(c[1] for c in checks)
    stamp = datetime.date.today().isoformat()
    print(f"\npreflight {stamp}: "
          + ("전부 통과 — 등록 동결 가능"
             if ok else "실패 — 동결 전 해결 필요"))
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
