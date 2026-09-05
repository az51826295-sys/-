<!-- provenance: {"source_id": "docs/asset-judge-v0-draft.md", "source_kind": "normative", "parent_ids": [], "parent_hash": {}, "as_of": "2026-08-25T22:56:40", "generator": "tools/stamp_provenance.py --normative", "status": null} -->
# 자산 심판 v0 — 사장님 초안 원문 (2026-08-24 작성, 08-25 저장소 편입)

**상태: draft. 등록 아님. 문턱 미동결.** `registered_at: null`이므로 이 문서로는
어떤 판정도 내리지 않는다(원칙 ①: 산출물을 보기 전에 등록). 아래는 사장님이 준
원문 그대로이며, 내가 손대지 않는다. 파생물(기계용 규칙·측정기·해부)은
[asset-judge-v0-inheritance.md](asset-judge-v0-inheritance.md)에 따로 둔다.

```yaml
spec_id: asset_judge_v0
domains: [image, audio]
status: draft                    # 등록 아님. 문턱 미동결
registered_at: null              # ★ 산출물을 보기 전에 채울 것 (원칙 ①)
frozen_by: null
inherits_from: null              # ← 아이콘 심판 해부 후 규격 ID 기입
as_of: 2026-08-24

# 0. 이 문서가 정하는 것 / 정하지 않는 것
purpose: >
  게임 자산(그림·음악)을 대량 생성할 때, 사람 눈·귀에 올리기 전에
  기계가 탈락시킬 수 있는 것을 전부 탈락시킨다.
  목표는 "좋은 것을 고르는 것"이 아니라 "확실히 아닌 것을 지우는 것"이다.
non_purpose:
  - 아름다움·재미·감동을 판정하지 않는다 (순수 심판 없음. 영구 사람 몫)
  - 후보 간 순위를 매기지 않는다
  - 통과한 자산이 좋다고 주장하지 않는다   # 통과 = "탈락 사유 없음"

design_stance: >
  탈락 기반(reject-first). 통과 문턱이 아니라 탈락 문턱을 등록한다.
  이유: "이건 아니다"는 정확하고 싸지만 "이건 좋다"는 부정확하고 비싸다.
  운영 목표치: 후보 N개를 사람이 볼 3~5개로 줄인다.

# 1. 역할 분리
roles:
  중앙(Planner):
    does: [설문 수집, 자산 스펙 작성, 견적·기간 추정, 외부 모델 위임]
    cannot: [자기 산출물 채택 확정]
    model_calls: yes
  제안자(Generator):
    does: [자산 생성]
    implementer: 외부 모델 (Midjourney / Suno / 기타)
    note: 교체 가능한 부품. 여기에 해자 없음
  추출기(Extractor, G):
    does: [산출물에서 라벨·수치를 뽑기만 함]
    cannot: [판정, 비교, 원 스펙 열람]
    model_calls: 일부 허용 (§4 프롬프트)
  심판(Judge, J):
    signature: J(evidence, criterion) -> {pass, fail, undefined}
    implementer: 순수 함수. 모델 호출 금지
    note: >
      프롬프트로 짜는 부분은 전부 추출기이지 심판이 아니다.
      모델이 "통과/불통과"를 말하면 그것은 증거일 뿐 판정이 아니다.

pipeline:
  - 1. 중앙: 요청 → 자산 스펙 S (기계 판독 가능한 필드로)
  - 2. 제안자: S → 산출물 A
  - 3. 추출기: A → 복원 스펙 S'      # S 를 보지 않고
  - 4. 심판: d(S, S') 와 등록 문턱을 대조 → 3값
  - 5. 세트 심판: 통과한 A들의 집합 → 일관성 판정
  - 6. 사람: 살아남은 3~5개 중 선택

# 2. 낱개 층 (per-asset)
layer_single:
  image:
    mechanical:
      - name: canvas_size
        rule: 스펙 해상도와 정확히 일치
      - name: alpha_channel
        rule: 요구 시 존재, 배경 완전 투명 (경계 픽셀 알파 < 0.05)
      - name: bleed
        rule: 안전 여백 밖으로 불투명 픽셀이 나가지 않음
      - name: color_count
        rule: 등록된 상한 이하 (아이콘/픽셀 계열만 적용)
      - name: palette_conformance
        rule: 지정 팔레트 밖 색상 픽셀 비율 <= THRESH_PAL
      - name: file_integrity
        rule: 디코딩 성공, 손상 없음, 포맷 일치
      - name: license_provenance
        rule: 생성 출처·라이선스 필드 존재 (없으면 fail, 불명은 undefined)
    model_based:
      - name: subject_tags
        rule: 스펙 태그 집합과 자카드 거리 <= THRESH_TAG
      - name: forbidden_content
        rule: 금지 목록(워터마크, 텍스트, 서명, 여분 손가락 등) 검출 시 fail
    status_unbuilt:
      - name: style_conformance
        reason: 레퍼런스 임베딩 세트 미구축
  audio:
    mechanical:
      - name: duration
        rule: 스펙 길이 ± THRESH_DUR 초
      - name: bpm
        rule: 스펙 BPM ± THRESH_BPM  (배수 오검출 주의: 0.5x·2x 는 별도 기록)
      - name: key_mode
        rule: 조성(장/단) 일치. 근음은 THRESH_KEY 반음 이내
      - name: loudness_lufs
        rule: 목표 LUFS ± THRESH_LUFS
        note: |
          2026-08-26: **계측기는 생겼다**(genesis/loudness.py, BS.1770-4 게이트된
          라우드니스, EBU Tech 3341 시험 1로 검증). 목표 LUFS와 THRESH_LUFS는
          여전히 미동결이므로 규칙은 아직 등록하지 않는다 - 값만 낸다.
          즉 이 칸의 상태는 "미측정"이 아니라 "측정됨·미판정"이다.
      - name: true_peak
        rule: <= -1.0 dBTP (클리핑 fail)
      - name: silence_head_tail
        rule: 앞뒤 무음 <= THRESH_SIL 초
      - name: loop_seam
        rule: 루프 지정 시, 끝→시작 이음새의 스펙트럼 불연속 <= THRESH_SEAM
        note: |
          루프가 아닌 곡에는 적용하지 않음(undefined 아님, 미적용).
          2026-08-26: **계측기 생김** — genesis/loop_seam.py가 이음새 창과 곡
          내부 창들의 스펙트럼 거리 비율(seam_spectral)을 낸다. 합성 시료로
          이빨 확인(잘라 붙인 루프가 완벽한 루프의 7.7배). THRESH_SEAM은
          미동결이라 규칙은 아직 등록하지 않는다 → "측정됨·미판정".
      - name: dc_offset_and_dropout
        rule: DC 오프셋·구간 무음 결손 없음
      - name: file_integrity
        rule: 디코딩 성공, 채널·샘플레이트 일치
      - name: license_provenance
        rule: 생성 출처·라이선스 필드 존재
    model_based:
      - name: mood_tags
        rule: 스펙 분위기 태그와 자카드 거리 <= THRESH_MOOD
      - name: instrument_tags
        rule: 금지 악기(예: 보컬 없음 지정) 검출 시 fail
    status_unbuilt:
      - name: mood_roundtrip_calibrated
        reason: >
          오디오 → 분위기 태그 추출기의 신뢰도 미측정.
          널 통제 통과 전까지 이 필드는 판정에 넣지 않는다.

# 3. 세트 층 (per-set)
layer_set:
  rationale: >
    낱개가 전부 통과해도 세트는 망할 수 있다.
    그리고 "일관되는가"는 취향이 아니라 분산이므로 기계가 잘한다.
  scope_key: [region, asset_class]
  image:
    - name: hue_dispersion
      rule: 세트 내 지배 색상 분산 <= THRESH_HUE_VAR
    - name: value_range_alignment
      rule: 명도 히스토그램 중앙값 이탈 자산 비율 <= THRESH_VAL_OUT
    - name: saturation_alignment
      rule: 채도 중앙값 이탈 자산 비율 <= THRESH_SAT_OUT
    - name: line_weight_consistency
      rule: 평균 획 두께의 변동계수 <= THRESH_LINE_CV
    - name: outlier_detection
      rule: 세트 임베딩 중심에서 거리 상위 THRESH_OUT_PCT% 는 사람 검토로 격리
      note: fail 이 아니라 격리. 새 시도가 항상 이상치이므로
  audio:
    # 2026-08-26: genesis/audio_set.py로 셋을 잰다(설계 docs/audio-set-layer-v0-design.md).
    # 문턱은 전부 미동결 → 값만 내고 판정하지 않는다("측정됨·미판정").
    - name: key_conflict
      rule: 같은 지역 내 곡들의 조성이 불협 관계면 fail  (규칙표 별첨 필요)
      status: 미측정 — 요구된 규칙표가 없다. 없는 표를 지어내지 않는다
    - name: tempo_dispersion
      rule: 지역 내 BPM 변동계수 <= THRESH_TEMPO_CV
      status: |
        미측정 — BPM 배수 오검출(150↔75)이 구조적으로 남아 있다. 같은 템포가
        다른 값으로 잡히면 변동계수가 곡이 아니라 계측기의 흔들림을 잰다.
        오염된 입력으로 만든 분산은 분산이 아니다.
    - name: loudness_alignment
      rule: 지역 내 LUFS 최대-최소 <= THRESH_LUFS_SPREAD
      status: 측정됨·미판정 — audio_set.loudness_spread (값 없는 곡은 빼고 세며 개수를 남긴다)
    - name: transition_seam
      rule: 인접 재생 가능한 곡쌍의 전환 불연속 <= THRESH_TRANS
      status: 측정됨·미판정 — 루프 이음새와 같은 계산을 곡 사이로. 이빨 8.27배
    - name: duplication
      rule: 곡 간 유사도 >= THRESH_DUP 이면 중복으로 fail (같은 곡 재탕 방지)
      status: 측정됨·미판정 — 평균 로그 스펙트럼의 최소 거리(0~1 점수로 바꾸지 않는다)
  note: >
    세트 층은 자산 수가 늘어도 비용이 거의 증가하지 않는다(분산 계산).
    낱개 층이 O(N) 모델 호출인 반면 세트 층은 O(N) 수치 연산이다.

# 4. 추출기 프롬프트 전문 — 여기가 유일한 모델 호출부
extractor_contract:
  forbidden_inputs: [원_자산_스펙, 생성_프롬프트, 파일명, 폴더명, 메타데이터]
  reason: >
    G 가 정답을 보면 왕복 검사가 무너진다. 파일명도 정답 누출 경로다.
    입력은 픽셀/파형뿐. 위반 시 result=invalid, 집계 제외(삭제 금지).
  output_contract: JSON only. 판정어(통과·좋음·적합) 출력 금지.
  temperature: 0
  n_samples: 3                   # 3회 호출 후 다수결. 불일치 필드는 undefined

prompts:
  G_image_tags: |
    당신은 이미지 라벨 추출기다. 판정하지 말고 관찰만 하라.
    이 이미지가 무엇을 위해 만들어졌는지, 좋은지 나쁜지는 당신의 일이 아니다.

    아래 이미지를 보고 JSON만 출력하라. 설명·머리말·코드펜스 금지.

    {
      "subject": ["보이는 대상 명사. 최대 5개. 추측 금지, 확실한 것만"],
      "setting": "실내|실외|추상|불명",
      "time_of_day": "낮|밤|황혼|불명",
      "dominant_colors": ["상위 3개 색 이름"],
      "line_style": "굵은외곽선|가는선|외곽선없음|불명",
      "render_style": "픽셀|플랫|셀셰이딩|사실적|손그림|불명",
      "mood": ["분위기 형용사. 최대 3개"],
      "text_present": true|false,
      "watermark_or_signature": true|false,
      "anatomy_anomaly": true|false,
      "confidence": {"subject": 0.0~1.0, "mood": 0.0~1.0}
    }

    규칙:
    - 확신이 없으면 "불명" 또는 빈 배열을 쓰라. 채우려고 지어내지 마라.
    - mood 는 이미지에서 직접 보이는 근거가 있을 때만 쓰라.
    - 어떤 필드에도 평가어(좋다, 잘됐다, 어울린다)를 쓰지 마라.

  G_audio_tags: |
    당신은 오디오 라벨 추출기다. 판정하지 말고 관찰만 하라.
    이 음악이 무엇을 위해 만들어졌는지, 좋은지 나쁜지는 당신의 일이 아니다.

    아래 오디오를 듣고 JSON만 출력하라. 설명·머리말·코드펜스 금지.

    {
      "instruments": ["들리는 악기. 최대 5개"],
      "vocals_present": true|false,
      "vocal_type": "가사있음|허밍|없음|불명",
      "tempo_feel": "매우느림|느림|보통|빠름|매우빠름",
      "mode_feel": "밝음|어두움|중간|불명",
      "energy": "낮음|중간|높음",
      "texture": "희소|보통|빽빽함",
      "mood": ["분위기 형용사. 최대 3개"],
      "structure": "루프형|기승전결형|앰비언트|불명",
      "artifacts": ["끊김","잡음","급격한음량변화","없음"],
      "confidence": {"mood": 0.0~1.0, "instruments": 0.0~1.0}
    }

    규칙:
    - BPM·조성 같은 수치는 출력하지 마라. 그건 기계가 따로 잰다.
    - 확신이 없으면 "불명"을 쓰라. 채우려고 지어내지 마라.
    - 어떤 필드에도 평가어를 쓰지 마라.

  P_spec_normalize: |
    (중앙용. 심판 아님)
    사용자 요청과 설문 답변을 게임 자산 스펙으로 변환하라.
    모든 필드는 기계가 검사할 수 있는 형태여야 한다.
    "멋있게", "게임 느낌으로" 같은 검사 불가능한 표현은
    검사 가능한 필드로 바꾸거나, 바꿀 수 없으면
    unverifiable 배열에 그대로 남겨라. 임의로 해석하지 마라.

    출력 JSON:
    {
      "asset_class": "배경|캐릭터|아이콘|이펙트|BGM|효과음",
      "region": "적용 구역",
      "spec": { 검사 가능한 필드들 },
      "reference_ids": ["품질바로 박은 레퍼런스"],
      "unverifiable": ["기계로 검사 불가능한 요구사항 원문"]
    }

# 5. 적격성 게이트 — 점수 계산 이전. 미달이면 undefined
eligibility:
  - E1: 파일 디코딩 성공
  - E2: 스펙 S 에 필수 필드 전부 존재 (없으면 판정 불가)
  - E3: 추출기 독립성 계약 위반 0
  - E4: G 3회 호출 중 2회 이상 동일 필드값 (불일치 시 해당 필드 undefined)
  - E5: 골든 케이스 스위트가 이번 배치 직전에 통과
  - E6: 세트 층은 표본 n >= 5 일 때만 판정 (미만은 undefined)
on_fail: undefined

# 6. 판정 규칙 (3값)
decision:
  order: [적격성 → 낱개 mechanical → 낱개 model_based → 세트]
  fail_fast: true                # 기계 필드에서 떨어지면 모델 호출하지 않음 (비용)
  single_asset:
    fail: mechanical 중 하나라도 위반 OR forbidden_content 검출
    undefined: 적격성 미달 OR 필수 필드 추출 실패
    pass: otherwise
  set_level:
    fail: 세트 필드 위반
    quarantine: outlier_detection 해당 (fail 아님. 사람 검토 큐로)
  never:
    - 여러 필드 점수를 하나로 합산하지 않는다   # P30 사고 재발 방지
    - 문턱을 산출물을 본 뒤에 조정하지 않는다   # 원칙 ①
    - 동률·경계값 처리를 미정으로 두지 않는다   # P10·P16 교훈

boundary_rules:
  - 문턱과 정확히 같은 값은 pass 로 한다 (<= 표기 일관)
  - 배수 오검출(BPM 0.5x/2x)은 fail 이 아니라 undefined 로 보내고 별도 집계

# 7. 골든 케이스 = 심판의 심판. 본실행 전 반드시 통과
golden_cases:
  positive_control:
    take: 사람이 채택 확정한 기존 자산
    n_min: 10
    expect: pass
    threshold: 통과율 >= 0.90      # 미달 = 심판이 너무 빡빡함
  negative_control:
    take: 의도적 위반본 (팔레트 이탈, 클리핑, 밝은 장조를 야간 추격에 배치 등)
    n_min: 10
    expect: fail
    threshold: 탈락률 >= 0.90      # 미달 = 쓰레기를 통과시킴
  null_control:
    take: 스펙과 자산을 무작위로 재짝지음
    n_min: 20
    expect: fail
    threshold: 통과율 <= 0.05      # ★ 초과 = 왕복 검사가 신호가 아님
  rule: 하나라도 미달이면 본실행 금지. 특히 null_control 은 model_based 필드 전용 관문

# 8. 폐기 조건 — 미리 박는다
kill_criteria:
  - null_control 통과율 > 0.05        → 해당 model_based 필드 폐기
  - undefined 비율 > 0.50             → 심판으로 사용 불가
  - positive_control 통과율 < 0.90    → 문턱 재설계 (단, 재등록 절차를 거칠 것)
  - 사람 검토 큐 축소율 < 30%          → 운영 가치 없음. 낱개 층 재검토

# 9. 집계·기록
aggregation:
  report_always: [pass_n, fail_n, undefined_n, quarantine_n]
  stratify_by: [asset_class, region, generator_model]
  forbidden: 단일 "통과율" 대표값의 외부 인용
  log_fields: [asset_id, spec_hash, extractor_version, judge_spec_id, decided_at]

# 10. 미확정 — 사장님 결정 대기
open_decisions:
  - THRESH_* 12개 숫자 동결 (전부 미정)
  - inherits_from: 아이콘 심판 규격 ID — 해부 후 기입
  - key_conflict 의 불협 관계 규칙표 (음악 이론 규칙을 직접 박을지, 데이터로 뽑을지)
  - outlier_detection 의 격리 비율 THRESH_OUT_PCT
  - style_conformance 레퍼런스 임베딩 세트를 만들지 여부 (비용 발생 지점)

preregistration_checklist:
  - [ ] registered_at / frozen_by 기입
  - [ ] THRESH_* 전부 숫자로 동결
  - [ ] 골든 케이스 표본 ID 고정 (사후 표집 금지)
  - [ ] 추출기 프롬프트 해시 고정 (프롬프트 바뀌면 판정 무효·재등록)
  - [ ] 아이콘 심판과의 규격 차이 목록화
```
