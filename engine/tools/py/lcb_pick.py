"""LiveCodeBench test6 에서 40문제를 고정 씨앗으로 뽑고, 비공개 테스트를 안전하게 푼다 (11-23).
python -I engine/tools/py/lcb_pick.py <test6.jsonl> <out.json> [hard]
비공개 테스트는 base64+zlib+pickle 이다. pickle 은 코드를 돌릴 수 있어서 **전역 이름을 하나도 못 부르는** 풀개로만 푼다(문자열만 나온다)."""
import sys, json, base64, zlib, pickle, io, random

class 문자열만(pickle.Unpickler):
    def find_class(self, module, name):
        raise pickle.UnpicklingError(f"막음: {module}.{name}")

def 비공개(s):
    raw = zlib.decompress(base64.b64decode(s))
    v = 문자열만(io.BytesIO(raw)).load()
    return json.loads(v) if isinstance(v, str) else v

src, out = sys.argv[1], sys.argv[2]
어려움 = ("hard",) if len(sys.argv) > 3 and sys.argv[3] == "hard" else ("medium", "hard")
rows = [json.loads(l) for l in open(src, encoding="utf-8")]
후보 = [r for r in rows if r["platform"] == "atcoder" and r["difficulty"] in 어려움 and json.loads(r["public_test_cases"])[0]["testtype"] == "stdin"]
후보.sort(key=lambda r: r["question_id"])
뽑음 = random.Random(20261123).sample(후보, 40)
res = []
for r in 뽑음:
    pub = json.loads(r["public_test_cases"])
    pri = 비공개(r["private_test_cases"])
    res.append({"id": r["question_id"], "title": r["question_title"], "difficulty": r["difficulty"], "question": r["question_content"],
                "public": [{"input": t["input"], "output": t["output"]} for t in pub],
                "private": [{"input": t["input"], "output": t["output"]} for t in pri]})
json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False)
from collections import Counter
print(len(후보), "후보 →", len(res), "뽑음", Counter(r["difficulty"] for r in res), "비공개 테스트 합", sum(len(r["private"]) for r in res))
print(",".join(r["id"] for r in res))
