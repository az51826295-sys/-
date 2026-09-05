"""연출가 AI 베타 서버 — **진짜 실험이 도는 자리.**

  python -X utf8 -m uvicorn server.app:app --host 0.0.0.0 --port 8000

2026-08-27 사장님: *"우린 베타테스트 서버를 만들자"* / *"그게 아니라 우리 에이아이"*
그리고: *"넌 실험이 뭔지 몰라?"*

맞는 지적이다. 나는 하루 종일 명암폭·팔레트 거리 같은 것에 실험 규율(사전 등록·
표본 단위·문턱 동결)을 붙였고, **정작 이 제품의 실험은 한 번도 안 돌렸다** —
*사람이 이걸 써서 자기가 간직할 결과를 얻는가.*

**그러므로 이 서버가 실험 장치다.** 게임 화면을 서비스하는 곳이 아니라,
사람이 연출가 AI와 실제로 일해 보는 곳이다.

## 이 서버가 재는 것 (판정식은 여기 적고 얼린다)

세션 하나 = 표본 하나. 사람이 요청을 넣은 순간 시작되고, 아래 중 하나로 끝난다.

  kept        후보를 **골라서 가져갔다**  ← 성공
  none_passed 기계가 전부 걸러 고를 게 없었다
  abandoned   중간에 떠났다 (어느 칸에서 떠났는지 기록)
  error       우리 쪽이 터졌다

**성공률 = kept / 전체.** 이 수를 처음 재는 것이 이 서버의 목적이다.
지금은 기준선이 없다 — **첫 회차는 기준선을 만드는 회차이지 판정하는 회차가 아니다.**
문턱을 나중에 결과를 보고 붙이지 않는다(measurement-rules §4).

## 안 하는 것

- 기계가 후보에 순위를 매기는 것. 거를 뿐이다(영구 human_gate).
- 떠난 사람을 성공으로 세는 것.
"""
from __future__ import annotations

import json
import os
import sys
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from fastapi import FastAPI, Request                           # noqa: E402
from fastapi.responses import FileResponse, JSONResponse       # noqa: E402
from fastapi.staticfiles import StaticFiles                    # noqa: E402

from genesis import director_chat as dc                        # noqa: E402
from genesis import prompt_book as pb                          # noqa: E402

STATIC = os.path.join(ROOT, "server", "static")
SESSIONS = os.path.join(ROOT, "data", "beta_sessions.jsonl")
CATALOGUE = os.path.join(ROOT, "data", "choice_catalogue.json")

app = FastAPI(title="연출가 AI 베타")

# 판정 API. 로키가 이 경로로 자산을 검사한다 — 계측기를 두 벌 만들지 않으려고
# 서비스로 연다.
from server.judge_api import router as judge_router   # noqa: E402
app.include_router(judge_router)


def _now(request: Request) -> str:
    """시각은 **요청이 준 것**을 쓴다 - 서버 시계를 내가 만들어 쓰면 재현이 안 된다."""
    return request.headers.get("x-client-time", "")


def log(row: dict) -> None:
    os.makedirs(os.path.dirname(SESSIONS), exist_ok=True)
    with open(SESSIONS, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def catalogue() -> dict:
    with open(CATALOGUE, encoding="utf-8") as fh:
        return json.load(fh)


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC, "index.html"))


@app.post("/api/start")
async def start(request: Request):
    """요청 한 줄을 받고 **선택지를 내민다.** 질문이 아니라 고르게 한다."""
    body = await request.json()
    sid = uuid.uuid4().hex[:12]
    log({"event": "start", "session": sid, "want": body.get("want", ""),
         "at": _now(request)})
    return {"session": sid, "rounds": catalogue()["rounds"]}


@app.post("/api/choose")
async def choose(request: Request):
    """고른 것을 기록하고, 그것이 **어떤 수치·문구가 되는지 그대로 보여준다.**

    고른 것이 곧 명세가 된다는 것을 사람이 볼 수 있어야 한다. 안 보이면
    "취향을 물어본 뒤 버리는 것"과 구별이 안 된다.
    """
    body = await request.json()
    picks = body.get("picks", {})
    cat = catalogue()
    targets, fragments, params = {}, [], {}
    for r in cat["rounds"]:
        key = picks.get(r["id"])
        opt = next((o for o in r["options"] if o["key"] == key), None)
        if not opt:
            continue
        targets.update(opt.get("targets", {}))
        fragments += opt.get("fragments", [])
        params.update(opt.get("params", {}))
    log({"event": "choose", "session": body.get("session"), "picks": picks,
         "at": _now(request)})
    return {"targets": targets, "fragments": fragments, "params": params,
            "note": "고르신 것이 그대로 판정 수치와 발주 문구가 됩니다"}


@app.post("/api/lint")
async def lint(request: Request):
    """주문 문장을 검사한다. 누가 썼든(사람·GPT·나) 같은 검사를 받는다."""
    body = await request.json()
    return pb.lint(body.get("text", ""))


@app.post("/api/end")
async def end(request: Request):
    """세션의 끝을 **사람이 아니라 사실**로 기록한다."""
    body = await request.json()
    outcome = body.get("outcome")
    if outcome not in ("kept", "none_passed", "abandoned", "error"):
        return JSONResponse({"error": f"모르는 결말: {outcome}"}, 400)
    log({"event": "end", "session": body.get("session"), "outcome": outcome,
         "stage": body.get("stage"), "picked": body.get("picked"),
         "at": _now(request)})
    return {"ok": True}


# 세션별 대화 상태. 서버가 죽으면 사라진다 - 기록은 SESSIONS 파일에 남는다.
CHATS: dict = {}


@app.post("/api/chat")
async def chat(request: Request):
    """대화 한 턴. **이것이 제품이다** (director-ai-vision 1단계).

    사람이 말하면 AI가 **선택지를 내민다.** 고른 것이 명세가 되고, 수치로 못 옮긴
    것은 사람 눈 게이트로 남는다. 매 턴 **분해율**을 같이 낸다 - 취향이 얼마나
    기계 기준으로 옮겨졌는지가 이 제품의 진짜 지표다.
    """
    body = await request.json()
    sid = body.get("session") or uuid.uuid4().hex[:12]
    st = CHATS.setdefault(sid, {"history": [], "measurables": [],
                                "human_gate": [], "fragments": [],
                                "picks": []})
    msg = body.get("message", "").strip()
    picked = body.get("picked")
    if picked:
        # 고른 것을 명세에 쌓는다. **고른 것이 곧 명세다.**
        opt = next((o for o in st.get("last_choices", [])
                    if o["key"] == picked), None)
        if opt:
            st["measurables"] += opt.get("measurables", [])
            st["human_gate"] += opt.get("human_gate", [])
            st["fragments"] += opt.get("fragments", [])
            st["picks"].append({"key": picked, "label": opt["label"]})
            msg = msg or f'선택: {opt["label"]}'
    if not msg:
        return JSONResponse({"error": "할 말이 없다"}, 400)
    st["history"].append({"role": "user", "content": msg})
    log({"event": "chat_in", "session": sid, "message": msg,
         "picked": picked, "at": _now(request)})
    try:
        out = dc.turn(st["history"])
    except Exception as exc:
        log({"event": "end", "session": sid, "outcome": "error",
             "why": str(exc)[:300], "at": _now(request)})
        return JSONResponse({"error": str(exc)[:300]}, 502)
    st["history"].append({"role": "assistant",
                          "content": json.dumps(out, ensure_ascii=False)})
    st["last_choices"] = out.get("choices", [])
    decomp = dc.decomposition(st)
    log({"event": "chat_out", "session": sid, "done": out.get("done"),
         "n_choices": len(out.get("choices", [])), "decomposition": decomp,
         "at": _now(request)})
    return {"session": sid, "reply": out["reply"],
            "choices": out.get("choices", []), "done": out.get("done"),
            "blueprint": out.get("blueprint"),
            "spec": {"measurables": st["measurables"],
                     "human_gate": st["human_gate"],
                     "picks": st["picks"]},
            "decomposition": decomp}


@app.get("/api/stats")
def stats():
    """지금까지의 세션 결말. **기준선을 만드는 중이지 판정하는 중이 아니다.**"""
    if not os.path.exists(SESSIONS):
        return {"sessions": 0, "note": "아직 아무도 안 왔다"}
    rows = [json.loads(l) for l in open(SESSIONS, encoding="utf-8") if l.strip()]
    starts = {r["session"] for r in rows if r["event"] == "start"}
    ends = {r["session"]: r for r in rows if r["event"] == "end"}
    counts: dict = {}
    for r in ends.values():
        counts[r["outcome"]] = counts.get(r["outcome"], 0) + 1
    open_now = len(starts - set(ends))
    return {"sessions": len(starts), "outcomes": counts,
            "still_open": open_now,
            "kept_rate": (round(counts.get("kept", 0) / len(starts), 3)
                          if starts else None),
            "note": ("첫 회차는 **기준선을 만드는 회차**다. 문턱을 결과를 보고 "
                     "붙이지 않는다(measurement-rules §4)")}


app.mount("/static", StaticFiles(directory=STATIC), name="static")
