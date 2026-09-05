' 7일 무인 본시도 무창 실행기 (드라이런 3차 통과 후, 사용자
' "시작" 게이트 전용). 절차: docs/unattended-ops-rules.md §8.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = CreateObject("Scripting.FileSystemObject") _
    .GetParentFolderName(CreateObject("Scripting.FileSystemObject") _
    .GetParentFolderName(WScript.ScriptFullName))
sh.Run "cmd /c python tools\dryrun48.py 604800 > data\soak7d_console.log 2> data\soak7d_err.log", 0, False
