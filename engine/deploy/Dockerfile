# Rookery Reproduce — 웹훅 수신기 + 대시보드 + 엔진
FROM python:3.12-slim

# git 필요 (고객 저장소 클론·격리 워크트리)
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY deploy/requirements.txt /app/deploy/requirements.txt
RUN pip install --no-cache-dir -r deploy/requirements.txt

COPY . /app
ENV PYTHONUNBUFFERED=1 REVIEW_MODE=1

# 웹훅·대시보드 (개인키·시크릿은 런타임 env/volume으로 주입, 이미지에 넣지 말 것)
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "tools.webhook_server:app", \
     "--host", "0.0.0.0", "--port", "8000"]
