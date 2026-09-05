' 무창 실행기 (드라이런 2차 부검: schtasks 대화형 작업의 콘솔
' 창이 닫히며 CONTROL_C_EXIT로 사망 - 창을 아예 만들지 않는다)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\az518\Desktop\genesis-project"
sh.Run "cmd /c python tools\dryrun48.py 172800 > data\dryrun48_console.log 2> data\dryrun48_err.log", 0, False
