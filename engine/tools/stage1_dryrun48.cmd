@echo off
rem 스테이지 1 ④: 상주 파이프라인 48h 목 드라이런 (docs/stage1-dryrun48.md).
rem 지출 0: ROOKERY_MOCK=1 (모델 호출 가짜) + ROOKERY_INTAKE_MOCK=1.
rem 원장: data\stage1_dry48\<repo>\engine.db (인테이크 파이프라인과 같은 배치)
rem 로그: data\rookery.log (서비스), data\stage1_dryrun_console.log / _err.log
cd /d C:\Users\az518\Desktop\genesis-project
set PYTHONUTF8=1
set ROOKERY_MOCK=1
set ROOKERY_INTAKE_MOCK=1
set ROOKERY_REPOS=boltons,toolz,tinydb,marshmallow,dateutil,more-itertools,sortedcontainers
set ROOKERY_REPOS_ROOT=data\repos
set ROOKERY_DATA=data
set ROOKERY_TAG=stage1_dry48
set ROOKERY_LOCAL_ONLY_PR=1
set ROOKERY_WORKERS=1
set ROOKERY_TICK_SECONDS=300
set ROOKERY_INTAKE_INTERVAL_S=3600
set ROOKERY_STOP_AFTER_S=172800
set ROOKERY_EXIT_WHEN_IDLE=0
python -m genesis.rookery.engine.service > data\stage1_dryrun_console.log 2> data\stage1_dryrun_err.log
