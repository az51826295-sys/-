# Rookery Alpha 배포 (build order step 8)

Linux 서버 + systemd 기준. 상주 서비스가 큐의 작업을 격리 워크트리
에서 처리하고, 검증·감사를 통과한 변경을 `rookery/*` 브랜치로 push
한다(자동 병합 없음). 재부팅·크래시 후 자동 복구.

## 1. 사전 준비

```bash
sudo useradd -r -m -d /opt/rookery/data rookery
sudo mkdir -p /opt/rookery/{data,repo} /etc/rookery
sudo chown -R rookery:rookery /opt/rookery

# 코드 배치
sudo -u rookery git clone <this-repo> /opt/rookery/genesis-project
sudo -u rookery python3 -m venv /opt/rookery/venv
sudo -u rookery /opt/rookery/venv/bin/pip install -e \
    /opt/rookery/genesis-project

# 대상 저장소 (엔진이 고칠 코드) 클론 + 원격 설정
sudo -u rookery git clone <target-repo> /opt/rookery/repo
```

## 2. 설정

```bash
sudo install -o rookery -g rookery -m 600 \
    /opt/rookery/genesis-project/deploy/rookery-alpha.env.example \
    /etc/rookery/alpha.env
sudoedit /etc/rookery/alpha.env      # 키·경로·단가 입력
```

**반드시 확인**: `ANTHROPIC_API_KEY`, `GENESIS_SPEND=i-approve`,
`ROOKERY_REPO`(git 저장소), 토큰 단가 `ROOKERY_PRICE_IN/OUT`
(현재 가격 대조 — 엔진은 단가를 추측하지 않음).

검증만 먼저:
```bash
sudo -u rookery bash -c 'set -a; . /etc/rookery/alpha.env; \
    cd /opt/rookery/genesis-project; \
    /opt/rookery/venv/bin/python -m genesis.rookery.engine.service --check'
```

## 3. 서비스 등록

```bash
sudo cp /opt/rookery/genesis-project/deploy/rookery-alpha.service \
    /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rookery-alpha     # 부팅 자동 시작 포함
```

## 4. 운영

```bash
systemctl status rookery-alpha
journalctl -u rookery-alpha -f                # 실시간 로그(heartbeat)
cat /opt/rookery/data/reports/today.txt       # 오늘 보고(살아있는 스냅샷)
ls /opt/rookery/data/reports/                 # 확정된 과거 보고
```

**검토 대기 PR**: `today.txt`의 "검토 대기 브랜치" 섹션 또는
```bash
cd /opt/rookery/repo && git fetch origin \
    && git branch -r | grep rookery/
```
사람이 각 `rookery/*` 브랜치를 검토·PR·병합한다. 엔진은 병합하지
않는다.

**감사 정지 복구**: heartbeat에 `***감사정지***`가 뜨면 auditor가
불일치를 발견해 엔진이 멈춘 것. 원인(로그의 `audit_disagree`)을
확인한 뒤에만 해제:
```python
from genesis.rookery.engine.store import Store
from genesis.rookery.engine.auditor import Auditor
s = Store("/opt/rookery/data/engine.db"); Auditor(s).resume(who="이름")
```

## 5. 작업 투입

작업은 큐에 넣어야 처리된다(엔진이 스스로 만들지 않음 — 실패 로그
유입은 §5 게이트를 통과한 것만). 최소 형태:
```python
from genesis.rookery.engine.store import Store
s = Store("/opt/rookery/data/engine.db")
s.add_task("fix-123", "fix", {
    "file": "pkg/mod.py",
    "repro_tests": ["tests/test_mod.py::test_x"],
    "smoke_tests": ["tests/test_mod.py::test_y"],
    "issue": "무엇이 어떻게 잘못됐는지",
    "focus_symbols": ["함수명"],
    "test_id": "tests/test_mod.py::test_x", "symbol": "함수명",
    "change_kind": "code", "files_in_scope": 1})
s.close()
```

## 6. 예산·안전 요약

- 월 45,000원 도달 시 신규 외부 API 작업 자동 중지(로컬 작업은 계속).
- 예약 방식이라 동시 워커에서도 한도 초과 불가.
- 격리 밖 파일 수정·위험 명령·비밀 접근·외부 배포·결제 차단.
- systemd 하드닝: `ProtectSystem=strict`, 쓰기 허용은 data·repo 뿐.

## 7. 비-systemd (개발/윈도우)

```bash
set -a; . /etc/rookery/alpha.env; set +a
python -m genesis.rookery.engine.service
```
윈도우는 NSSM 또는 작업 스케줄러로 위 명령을 상주시킨다. 단
심볼릭 링크 격리 방어는 Linux에서만 자동 검증된다(설계 브리프 §5.2).
