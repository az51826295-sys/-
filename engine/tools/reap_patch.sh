#!/bin/sh
# openHeadless 의 reap 을 "프로필 폴더로 찾아 죽이기" 로 바꾼다 (09-24).
# 윈도우 Edge 는 띄운 pid 가 곧 exit 0 하고 진짜 브라우저는 다른 부모 밑에 남는다 — taskkill /T 가 못 닿는다.
# 그래서 명령줄에 우리 프로필(--user-data-dir=...rk-hl-...)이 든 프로세스를 전부 죽인다.
f=src/lib/video/headless.ts
python - "$f" <<'PYEOF'
import io,sys
p=sys.argv[1]
s=io.open(p,encoding='utf-8').read()
old_start=s.index('  const reap = () => {')
old_end=s.index('\n', s.index('process.once("exit", reap);'))
new='''  // **프로필 폴더로 찾아 죽인다**(09-24 두 번째 고침). 윈도우 Edge 는 띄운 pid 가 곧 exit 0 하고
  // 진짜 브라우저는 다른 부모 밑에 남아 `taskkill /T` 가 못 닿았다 — 첫 고침 뒤에도 30개가 또 쌓였다.
  // 명령줄에 이 프로필 경로가 든 msedge 를 전부 죽인다. 리눅스(Railway)에서는 트리 종료로 충분하다.
  const reap = () => {
    try {
      if (process.platform === "win32") {
        const tag = path.basename(profile);
        spawn("powershell", ["-NoProfile", "-Command",
          `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -match '${tag}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
          { stdio: "ignore", windowsHide: true, detached: true }).unref();
      }
      if (proc.pid && proc.exitCode == null) proc.kill();
    } catch { /* */ }
  };
  process.once("exit", reap); process.once("SIGINT", reap); process.once("SIGTERM", reap);'''
s=s[:old_start]+new+s[old_end:]
io.open(p,'w',encoding='utf-8',newline='').write(s)
print('reap 을 프로필 기준으로')
PYEOF
