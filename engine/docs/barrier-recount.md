<!-- provenance: {"source_id": "docs/barrier-recount.md", "source_kind": "derived", "parent_ids": ["data/mission7b_R_deadlock_ms0_registry.json", "data/mission7b_R_deadlock_ms1_registry.json", "data/mission7b_R_deadlock_ms2_registry.json", "data/mission7b_R_deadlock_ms3_registry.json", "data/mission7b_R_deadlock_ms4_registry.json", "data/mission7b_TM_deadlock_ms0_registry.json", "data/mission7b_TM_deadlock_ms1_registry.json", "data/mission7b_TM_deadlock_ms2_registry.json", "data/mission7b_TM_deadlock_ms3_registry.json", "data/mission7b_TM_deadlock_ms4_registry.json", "data/mission7b_TP_deadlock_ms0_registry.json", "data/mission7b_TP_deadlock_ms1_registry.json", "data/mission7b_TP_deadlock_ms2_registry.json", "data/mission7b_TP_deadlock_ms3_registry.json", "data/mission7b_TP_deadlock_ms4_registry.json", "data/mission7b_TS_deadlock_ms0_registry.json", "data/mission7b_TS_deadlock_ms1_registry.json", "data/mission7b_TS_deadlock_ms2_registry.json", "data/mission7b_TS_deadlock_ms3_registry.json", "data/mission7b_TS_deadlock_ms4_registry.json", "data/mission7b_T_deadlock_ms0_registry.json", "data/mission7b_T_deadlock_ms0_t0.3_registry.json", "data/mission7b_T_deadlock_ms1_registry.json", "data/mission7b_T_deadlock_ms1_t0.3_registry.json", "data/mission7b_T_deadlock_ms2_registry.json", "data/mission7b_T_deadlock_ms2_t0.3_registry.json", "data/mission7b_T_deadlock_ms3_registry.json", "data/mission7b_T_deadlock_ms3_t0.3_registry.json", "data/mission7b_T_deadlock_ms4_registry.json", "data/mission7b_T_deadlock_ms4_t0.3_registry.json"], "parent_hash": {"data/mission7b_R_deadlock_ms0_registry.json": "a26e9f1f70e8", "data/mission7b_R_deadlock_ms1_registry.json": "bb616aad76b0", "data/mission7b_R_deadlock_ms2_registry.json": "f20dca9b9d2e", "data/mission7b_R_deadlock_ms3_registry.json": "e13cfd1d4050", "data/mission7b_R_deadlock_ms4_registry.json": "382fd35fd456", "data/mission7b_TM_deadlock_ms0_registry.json": "c5ce77e59314", "data/mission7b_TM_deadlock_ms1_registry.json": "87e16bdc1bab", "data/mission7b_TM_deadlock_ms2_registry.json": "bf785bbf6144", "data/mission7b_TM_deadlock_ms3_registry.json": "f8ad37da82f3", "data/mission7b_TM_deadlock_ms4_registry.json": "826708f371d8", "data/mission7b_TP_deadlock_ms0_registry.json": "c4193a105eac", "data/mission7b_TP_deadlock_ms1_registry.json": "931371328fec", "data/mission7b_TP_deadlock_ms2_registry.json": "cd3544874e55", "data/mission7b_TP_deadlock_ms3_registry.json": "95ec52810f49", "data/mission7b_TP_deadlock_ms4_registry.json": "31514b38092f", "data/mission7b_TS_deadlock_ms0_registry.json": "3c14670b6681", "data/mission7b_TS_deadlock_ms1_registry.json": "5af587d6639a", "data/mission7b_TS_deadlock_ms2_registry.json": "eca723910e0f", "data/mission7b_TS_deadlock_ms3_registry.json": "e7251418f359", "data/mission7b_TS_deadlock_ms4_registry.json": "43c6ae80d8b3", "data/mission7b_T_deadlock_ms0_registry.json": "b02e20280e60", "data/mission7b_T_deadlock_ms0_t0.3_registry.json": "db94e00d85e4", "data/mission7b_T_deadlock_ms1_registry.json": "4297624c92fe", "data/mission7b_T_deadlock_ms1_t0.3_registry.json": "ccab1e61d6ac", "data/mission7b_T_deadlock_ms2_registry.json": "cbae238832c6", "data/mission7b_T_deadlock_ms2_t0.3_registry.json": "b54de327efb4", "data/mission7b_T_deadlock_ms3_registry.json": "da04563dccc0", "data/mission7b_T_deadlock_ms3_t0.3_registry.json": "be24e5f37b18", "data/mission7b_T_deadlock_ms4_registry.json": "01fcc3b28d93", "data/mission7b_T_deadlock_ms4_t0.3_registry.json": "cb668b4f1020"}, "as_of": "2026-08-08T15:29:31", "generator": "tools/barrier_recount.py", "status": null} -->
# 7C·7D 장벽 재집계 표 (기술 통계 전용)

결론을 붙이지 않는다. 기계적 정의와 런별 수치만 기록한다.

- 관측 founding(직접 기록 17런): `0.5056906611906613`
- 장벽 A 문턱 0.72 — 인접 관측 점수 (0.7084820346, 0.7705188312): 이 열린 구간 안 어떤 문턱도 동일 판정
- 장벽 B 문턱 0.8 — 인접 관측 점수 (0.7915160534, 0.8487975709): 동일 판정 구간
- v0 기록 분모: 직접 7 + 무변화 후보 10 + partial 13 = 30 (partial은 추정 보간 없이 미기록으로 집계)

| run | arm | seed | v0기록 | gen1 채택 | A통과 세대 | B돌파 세대 | 최종 | v | 마지막 채택 | 고착 세대수 |
|---|---|---|---|---|---|---|---|---|---|---|
| R_deadlock_ms0 | R | ms0 | registry_direct | rollback | — | — | 0.5057 | 0 | — | 20 |
| R_deadlock_ms1 | R | ms1 | registry_direct | rollback | — | — | 0.5057 | 0 | — | 20 |
| R_deadlock_ms2 | R | ms2 | registry_direct | rollback | — | — | 0.5057 | 0 | — | 20 |
| R_deadlock_ms3 | R | ms3 | registry_direct | rollback | — | — | 0.5057 | 0 | — | 20 |
| R_deadlock_ms4 | R | ms4 | registry_direct | rollback | — | — | 0.5057 | 0 | — | 20 |
| T_deadlock_ms0 | T | ms0 | partial | 0.7915160533910534 | 1 | — | 0.7915 | 1 | 1 | 19 |
| T_deadlock_ms1 | T | ms1 | null_candidate | 0.7705188311688312 | 1 | — | 0.7705 | 1 | 1 | 19 |
| T_deadlock_ms2 | T | ms2 | partial | 0.7915160533910534 | 1 | — | 0.7915 | 1 | 1 | 19 |
| T_deadlock_ms3 | T | ms3 | null_candidate | 0.7705188311688312 | 1 | — | 0.7705 | 1 | 1 | 19 |
| T_deadlock_ms4 | T | ms4 | partial | 0.7705188311688312 | 1 | — | 0.7705 | 1 | 1 | 19 |
| TM_deadlock_ms0 | TM | ms0 | registry_direct | rollback | 2 | — | 0.7915 | 1 | 2 | 18 |
| TM_deadlock_ms1 | TM | ms1 | null_candidate | 0.7705188311688312 | 1 | — | 0.7705 | 1 | 1 | 19 |
| TM_deadlock_ms2 | TM | ms2 | registry_direct | rollback | 2 | 7 | 0.8500 | 3 | 9 | 11 |
| TM_deadlock_ms3 | TM | ms3 | null_candidate | 0.7084820346320346 | — | — | 0.7085 | 1 | 1 | 19 |
| TM_deadlock_ms4 | TM | ms4 | null_candidate | 0.7084820346320346 | 13 | 13 | 0.8859 | 2 | 13 | 7 |
| TP_deadlock_ms0 | TP | ms0 | partial | 0.7915160533910534 | 1 | 12 | 0.8490 | 2 | 12 | 8 |
| TP_deadlock_ms1 | TP | ms1 | partial | 0.7705188311688312 | 1 | — | 0.7705 | 1 | 1 | 19 |
| TP_deadlock_ms2 | TP | ms2 | partial | 0.7705188311688312 | 1 | 10 | 0.8569 | 2 | 10 | 10 |
| TP_deadlock_ms3 | TP | ms3 | partial | 0.7705188311688312 | 1 | 15 | 0.8569 | 2 | 15 | 5 |
| TP_deadlock_ms4 | TP | ms4 | partial | 0.7705188311688312 | 1 | 9 | 0.8569 | 2 | 9 | 11 |
| TS_deadlock_ms0 | TS | ms0 | null_candidate | 0.7705188311688312 | 1 | — | 0.7705 | 1 | 1 | 19 |
| TS_deadlock_ms1 | TS | ms1 | null_candidate | 0.7705188311688312 | 1 | — | 0.7705 | 1 | 1 | 19 |
| TS_deadlock_ms2 | TS | ms2 | null_candidate | 0.7705188311688312 | 1 | 3 | 0.8569 | 2 | 3 | 17 |
| TS_deadlock_ms3 | TS | ms3 | null_candidate | 0.7705188311688312 | 1 | — | 0.7705 | 1 | 1 | 19 |
| TS_deadlock_ms4 | TS | ms4 | null_candidate | 0.7705188311688312 | 1 | 2 | 0.8488 | 2 | 2 | 18 |
| T_deadlock_ms0_t0.3 | T_t0.3 | ms0 | partial | 0.7705188311688312 | 1 | — | 0.7705 | 1 | 1 | 19 |
| T_deadlock_ms1_t0.3 | T_t0.3 | ms1 | partial | 0.7705188311688312 | 1 | — | 0.7705 | 1 | 1 | 19 |
| T_deadlock_ms2_t0.3 | T_t0.3 | ms2 | partial | 0.7705188311688312 | 1 | — | 0.7705 | 1 | 1 | 19 |
| T_deadlock_ms3_t0.3 | T_t0.3 | ms3 | partial | 0.7705188311688312 | 1 | — | 0.7705 | 1 | 1 | 19 |
| T_deadlock_ms4_t0.3 | T_t0.3 | ms4 | partial | 0.7705188311688312 | 1 | — | 0.7705 | 1 | 1 | 19 |
