"""이전 세대(corpus_inc의 shortlist 밖 29건) 중 skip 파일에도 같은
진단을 적용 - 문서상 '63건 중 52건 탈락'의 나머지 절반을 덮는다.
테스트 파일 목록은 mine_candidates_{repo}.json에서 sha로 찾는다."""
import glob
import json
import os
import sys
from collections import Counter

sys.path.insert(0, os.getcwd())

from tools.diag_env_failures import diagnose  # noqa: E402

DATA = "data"
OUT = os.path.join(DATA, "corpus_inc")
REPORT = os.path.join(DATA, "env_failure_diagnosis_extra.json")

with open(os.path.join(DATA, "corpus_inc_shortlist.json"),
          encoding="utf-8") as f:
    sl_keys = {f"{r['repo']}_{r['sha']}" for r in json.load(f)}

cands = {}
for p in glob.glob(os.path.join(DATA, "mine_candidates_*.json")):
    repo = os.path.basename(p)[len("mine_candidates_"):-len(".json")]
    with open(p, encoding="utf-8") as f:
        for c in json.load(f):
            cands[f"{repo}_{c['sha'][:9]}"] = (repo, c["sha"][:9],
                                               c["test_files"])

rows = []
dist = Counter()
skipped_extra = []
for p in sorted(glob.glob(os.path.join(OUT, "*.json"))):
    key = os.path.basename(p).removesuffix(".json")
    if key in sl_keys:
        continue
    with open(p, encoding="utf-8") as f:
        d = json.load(f)
    if not d.get("skipped"):
        continue
    skipped_extra.append(key)
    if key not in cands:
        rows.append({"key": key, "cause": "no_manifest",
                     "log_tail": ""})
        dist["no_manifest"] += 1
        print(f"  {key:34} no_manifest", flush=True)
        continue
    repo, sha, tfiles = cands[key]
    cat, tail = diagnose(repo, sha, tfiles)
    rows.append({"key": key, "repo": repo, "sha": sha,
                 "cause": cat, "log_tail": tail})
    dist[cat] += 1
    print(f"  {key:34} {cat}", flush=True)

print(f"\n이전 세대 skip {len(skipped_extra)}건 분포: "
      f"{dict(dist.most_common())}")
with open(REPORT, "w", encoding="utf-8") as f:
    json.dump({"skipped_extra": skipped_extra, "diagnosis": rows},
              f, ensure_ascii=False, indent=1)
print(f"저장: {REPORT}")
