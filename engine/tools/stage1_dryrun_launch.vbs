' 스테이지 1 ④ 48h 목 드라이런 무창 실행기 (docs/stage1-dryrun48.md).
' 드라이런 2차 부검의 교훈 그대로: 콘솔 창을 만들지 않는다.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.Run "cmd /c tools\stage1_dryrun48.cmd", 0, False
