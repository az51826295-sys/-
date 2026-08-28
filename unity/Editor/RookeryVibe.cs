using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEditor.Compilation;
using UnityEngine;
using UnityEngine.Networking;

namespace Rookery
{
    /// <summary>
    /// 유니티와 **돌면서** 만든다.
    ///
    /// 만들기 창은 한 번 받아 붙이고 끝이었다. 오류가 나면 사람이 콘솔에서
    /// 긁어 다른 창에 옮겨 붙여야 했고, 그건 협업이 아니라 심부름이었다.
    ///
    /// 여기서는 고리가 스스로 돈다: 받는다 → 쓴다 → 유니티가 컴파일한다 →
    /// 오류를 모아 돌려보낸다 → 고친 것을 받는다. 사람은 시작할 때와 멈출 때만
    /// 손을 댄다.
    ///
    /// 고리를 끊는 것은 **도메인 리로드**다. 스크립트를 쓰면 유니티가 컴파일하고,
    /// 컴파일이 끝나면 에디터의 C# 세상이 통째로 새로 뜬다 — 창이 들고 있던
    /// 변수는 그때 다 사라진다. 그래서 이 고리의 상태는 창이 아니라
    /// <see cref="SessionState"/> 에 있고, 다시 뜬 뒤 <c>[InitializeOnLoad]</c>
    /// 가 이어받는다. 창을 닫아도 고리는 돈다.
    ///
    /// 자동으로 도는 물건이라 울타리를 친다: 세션이 정한 폴더 밖에는 쓰지
    /// 않는다. 그리고 판 수에 뚜껑이 있다 — 같은 오류를 반복하면 서버가
    /// 멈추라고 하고, 여기서도 세지 않고 무한히 돌지 않는다.
    /// </summary>
    [InitializeOnLoad]
    // 창이 public 이고 그 안의 필드가 여기 있는 Reply 를 들고 있어서, 이 클래스도
    // public 이어야 한다. 아니면 "덜 열린 타입"이라고 컴파일러가 거절한다.
    public static class RookeryVibeLoop
    {
        // 세션 상태는 도메인 리로드를 넘어 살아남고, 에디터를 끄면 지워진다.
        // 고리의 수명이 딱 그만큼이라 이 저장소가 맞다.
        const string KState = "Rookery.Vibe.State";      // "" | awaiting | ready | sending
        const string KErrors = "Rookery.Vibe.Errors";    // 모으는 중인 오류 JSON
        const string KDone = "Rookery.Vibe.CompileDone";
        const string KSession = "Rookery.Vibe.Session";
        const string KRound = "Rookery.Vibe.Round";
        const string KSince = "Rookery.Vibe.Since";
        const string KLog = "Rookery.Vibe.Log";
        const string KScope = "Rookery.Vibe.Scope";

        // 설정은 에디터를 껐다 켜도 남아야 한다.
        public const string KUrl = "Rookery.Url";
        public const string KKey = "Rookery.Key";

        /// <summary>서버와 같은 뚜껑. 여기서도 세는 이유는 응답이 끊겼을 때
        /// 클라이언트가 혼자 계속 돌지 않게 하기 위해서다.</summary>
        public const int MaxRounds = 6;

        /// <summary>컴파일이 아예 안 일어났을 때 얼마나 기다렸다 넘어갈지.
        /// 낸 파일이 지금 것과 같으면 유니티는 컴파일하지 않고, 그러면 끝나기를
        /// 기다리는 쪽은 영원히 기다린다.</summary>
        const double QuietSeconds = 6.0;

        static RookeryVibeLoop()
        {
            CompilationPipeline.assemblyCompilationFinished += OnAssembly;
            CompilationPipeline.compilationFinished += OnCompilationFinished;
            EditorApplication.update += Tick;
        }

        // ── 바깥에서 부르는 것들 ─────────────────────────────────

        public static bool Running => !string.IsNullOrEmpty(State);

        public static string State
        {
            get => SessionState.GetString(KState, "");
            private set => SessionState.SetString(KState, value);
        }

        public static string Log => SessionState.GetString(KLog, "");

        public static void Say(string line)
        {
            var log = Log;
            SessionState.SetString(KLog, log + (log.Length > 0 ? "\n" : "") + line);
            Repaint();
        }

        public static void Stop(string why)
        {
            State = "";
            SessionState.SetString(KSession, "");
            Say("멈췄습니다 — " + why);
        }

        /// <summary>첫 판. 세션이 없으니 무엇을 만들지만 보낸다.</summary>
        public static void Start(string want, string scope)
        {
            SessionState.SetString(KSession, "");
            SessionState.SetInt(KRound, 0);
            SessionState.SetString(KScope, scope);
            SessionState.SetString(KLog, "");
            SessionState.SetString(KErrors, "");
            Say("만들 것: " + want);
            State = "sending";
            Send(want);
        }

        // ── 컴파일 결과 줍기 ────────────────────────────────────

        static void OnAssembly(string assembly, CompilerMessage[] messages)
        {
            if (!Running) return;
            var sb = new StringBuilder(SessionState.GetString(KErrors, ""));
            foreach (var m in messages)
            {
                if (m.type != CompilerMessageType.Error) continue;
                // 한 줄에 하나씩 쌓는다. 리로드를 넘어야 해서 객체로 못 들고 있다.
                if (sb.Length > 0) sb.Append('\n');
                sb.Append(Escape(m.file)).Append('␟')
                  .Append(m.line).Append('␟')
                  .Append(Escape(m.message));
            }
            SessionState.SetString(KErrors, sb.ToString());
        }

        static void OnCompilationFinished(object _)
        {
            if (!Running) return;
            SessionState.SetBool(KDone, true);
        }

        /// <summary>
        /// 오류 한 줄을 한 줄로 유지한다.
        ///
        /// 칸 구분자와 줄바꿈이 메시지 안에 들어오면 다시 읽을 때 칸이 밀리고,
        /// 밀린 오류는 엉뚱한 파일 이름을 달고 로키에게 간다.
        /// </summary>
        static string Escape(string s) =>
            (s ?? "").Replace('␟', ' ').Replace('\n', ' ').Replace('\r', ' ');

        // ── 고리 ────────────────────────────────────────────────

        /// <summary>파일을 쓴 뒤 얼마나 지났나. 문화권에 따라 소수점이 쉼표가
        /// 되는 곳이 있어, 쓸 때와 읽을 때 같은 규칙을 못 박는다.</summary>
        static double Since()
        {
            double.TryParse(SessionState.GetString(KSince, "0"),
                            System.Globalization.NumberStyles.Float,
                            System.Globalization.CultureInfo.InvariantCulture,
                            out var then);
            return EditorApplication.timeSinceStartup - then;
        }

        static void Tick()
        {
            var state = State;

            if (state == "awaiting")
            {
                if (SessionState.GetBool(KDone, false))
                {
                    state = "ready";
                }
                else if (!EditorApplication.isCompiling && Since() > QuietSeconds)
                {
                    // 컴파일이 아예 안 일어났다. 낸 것이 이미 있던 것과 같다는
                    // 뜻이라 **오류 없음**으로 본다. 여기서 계속 기다리면 고리가
                    // 조용히 멈추고, 사람은 아직 도는 줄 안다.
                    state = "ready";
                }
                else
                {
                    return;
                }
                State = state;
            }

            if (state != "ready") return;

            // 컴파일이나 임포트가 아직 돌고 있으면 보내지 않는다 — 그 와중에
            // 파일을 쓰면 방금 시작한 컴파일과 엉킨다. **여기서 그냥 돌아가되
            // 상태는 "ready" 로 남긴다.** 예전에는 "awaiting" 일 때만 이 함수가
            // 일했기 때문에, 이 자리에서 한 번 돌아가면 고리가 영영 안 깨어났다.
            if (EditorApplication.isCompiling || EditorApplication.isUpdating) return;

            State = "sending";
            Send(null);
        }

        static void Send(string want)
        {
            var url = EditorPrefs.GetString(KUrl, "");
            var key = EditorPrefs.GetString(KKey, "");
            var session = SessionState.GetString(KSession, "");
            var scope = SessionState.GetString(KScope, "Assets/Rookery/");
            var round = SessionState.GetInt(KRound, 0);

            if (round >= MaxRounds)
            {
                Stop(MaxRounds + "판을 채웠습니다. 남은 오류는 콘솔에 있습니다.");
                return;
            }

            var errors = ReadErrors();
            SessionState.SetString(KErrors, "");
            SessionState.SetBool(KDone, false);

            var sb = new StringBuilder("{");
            if (!string.IsNullOrEmpty(session))
                sb.Append("\"sessionId\":").Append(Quote(session)).Append(',');
            if (!string.IsNullOrEmpty(want))
                sb.Append("\"want\":").Append(Quote(want)).Append(',');
            sb.Append("\"scope\":").Append(Quote(scope)).Append(',');
            sb.Append("\"unityVersion\":").Append(Quote(Application.unityVersion)).Append(',');
            sb.Append("\"errors\":[");
            for (var i = 0; i < errors.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append("{\"file\":").Append(Quote(errors[i].file))
                  .Append(",\"line\":").Append(errors[i].line)
                  .Append(",\"message\":").Append(Quote(errors[i].message)).Append('}');
            }
            sb.Append("],\"project\":[");
            var project = ReadScope(scope);
            for (var i = 0; i < project.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append("{\"path\":").Append(Quote(project[i].path))
                  .Append(",\"contents\":").Append(Quote(project[i].contents)).Append('}');
            }
            sb.Append("]}");

            Say(errors.Count == 0
                ? (round == 0 ? "로키에게 보냅니다…" : "컴파일 통과. 확인 중…")
                : "컴파일 오류 " + errors.Count + "개를 로키에게 보냅니다…");

            var request = new UnityWebRequest(url.TrimEnd('/') + "/api/unity/vibe", "POST")
            {
                uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(sb.ToString())),
                downloadHandler = new DownloadHandlerBuffer(),
            };
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("x-rookery-key", key);

            var op = request.SendWebRequest();
            op.completed += _ =>
            {
                if (request.result != UnityWebRequest.Result.Success)
                {
                    Stop("연결이 안 됩니다: " + request.responseCode + " " +
                         request.error + " " + request.downloadHandler.text);
                    return;
                }
                Receive(request.downloadHandler.text);
            };
        }

        static void Receive(string json)
        {
            Reply reply;
            try
            {
                reply = JsonUtility.FromJson<Reply>(json);
            }
            catch (Exception e)
            {
                Stop("응답을 읽지 못했습니다: " + e.Message);
                return;
            }

            SessionState.SetString(KSession, reply.sessionId ?? "");
            SessionState.SetInt(KRound, reply.round);
            if (!string.IsNullOrEmpty(reply.scope))
                SessionState.SetString(KScope, reply.scope);

            if (!string.IsNullOrEmpty(reply.note)) Say(reply.round + "판: " + reply.note);
            if (reply.refused != null && reply.refused.Length > 0)
            {
                // 울타리 밖으로 나가려 한 것은 조용히 버리지 않는다.
                Say("울타리 밖이라 쓰지 않은 파일: " + string.Join(", ", reply.refused));
            }

            if (reply.status != "running")
            {
                RookeryVibeWindow.LastResult = reply;
                Stop(reply.why ?? reply.status);
                return;
            }

            if (reply.files == null || reply.files.Length == 0)
            {
                Stop("낼 파일이 없다고 합니다.");
                return;
            }

            var scope = SessionState.GetString(KScope, "Assets/Rookery/");
            var written = 0;
            foreach (var f in reply.files)
            {
                if (!Write(f, scope)) continue;
                written++;
            }
            if (written == 0)
            {
                Stop("쓸 수 있는 파일이 하나도 없었습니다.");
                return;
            }

            Say(written + "개 파일을 썼습니다. 유니티가 컴파일합니다…");
            RookeryVibeWindow.LastResult = reply;

            State = "awaiting";
            SessionState.SetString(
                KSince,
                EditorApplication.timeSinceStartup.ToString(
                    "R", System.Globalization.CultureInfo.InvariantCulture));
            SessionState.SetBool(KDone, false);
            SessionState.SetString(KErrors, "");
            AssetDatabase.Refresh();
        }

        /// <summary>
        /// 울타리 안에만 쓴다.
        ///
        /// 사람이 판마다 확인하지 않는 대신 이 검사가 있다. 여기가 뚫리면 자동으로
        /// 도는 물건이 프로젝트 아무 데나 쓸 수 있고, 그건 협업이 아니라 사고다.
        /// </summary>
        static bool Write(ReplyFile f, string scope)
        {
            var path = (f.path ?? "").Replace('\\', '/');
            if (!path.StartsWith(scope) || path.Contains("..") ||
                !path.StartsWith("Assets/"))
            {
                Say("울타리 밖이라 건너뜁니다: " + f.path);
                return false;
            }

            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

            if (File.Exists(path))
            {
                // 백업은 **처음 한 번만.** 판마다 덮으면 몇 판 뒤엔 백업이
                // 로키가 지난 판에 쓴 것이 되어, 원본이 사라진다.
                var backup = path + ".before-rookery";
                if (!File.Exists(backup)) File.Copy(path, backup);
            }

            File.WriteAllText(path, f.contents);
            return true;
        }

        static List<(string file, int line, string message)> ReadErrors()
        {
            var list = new List<(string, int, string)>();
            var raw = SessionState.GetString(KErrors, "");
            if (string.IsNullOrEmpty(raw)) return list;
            foreach (var line in raw.Split('\n'))
            {
                var parts = line.Split('␟');
                if (parts.Length != 3) continue;
                int.TryParse(parts[1], out var n);
                list.Add((parts[0], n, parts[2]));
            }
            return list;
        }

        /// <summary>
        /// 울타리 안의 현재 파일들. 고치려면 지금 뭐가 있는지 봐야 한다.
        ///
        /// 크기에 뚜껑을 씌운다 — 프로젝트가 커지면 요청이 코드로만 가득 차고,
        /// 정작 오류가 묻힌다.
        /// </summary>
        static List<(string path, string contents)> ReadScope(string scope)
        {
            var list = new List<(string, string)>();
            if (!Directory.Exists(scope)) return list;
            var total = 0;
            foreach (var p in Directory.GetFiles(scope, "*.cs", SearchOption.AllDirectories))
            {
                var path = p.Replace('\\', '/');
                var text = File.ReadAllText(path);
                total += text.Length;
                if (total > 120000 || list.Count >= 24)
                {
                    // 자른 것을 말한다. 조용히 자르면 "다 봤다"로 읽힌다.
                    Say("파일이 많아 일부만 보냈습니다 (" + list.Count + "개).");
                    break;
                }
                list.Add((path, text));
            }
            return list;
        }

        static void Repaint()
        {
            foreach (var w in Resources.FindObjectsOfTypeAll<RookeryVibeWindow>())
                w.Repaint();
        }

        static string Quote(string s)
        {
            var sb = new StringBuilder("\"");
            foreach (var c in s ?? "")
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
            return sb.ToString();
        }

        [Serializable]
        public class Reply
        {
            public string sessionId;
            public int round;
            public string status;
            public string scope;
            public string title;
            public Criterion[] criteria;
            public string setup;
            public string[] humanGate;
            public ReplyFile[] files;
            public string[] refused;
            public string note;
            public string why;
            public RemainingError[] remaining;
        }

        [Serializable]
        public class Criterion
        {
            public string id;
            public string when;
            public string then;
        }

        [Serializable]
        public class ReplyFile
        {
            public string path;
            public string contents;
            public string purpose;
        }

        [Serializable]
        public class RemainingError
        {
            public string file;
            public int line;
            public string message;
        }
    }

    /// <summary>
    /// 고리를 보는 창.
    ///
    /// 창은 고리를 **들고 있지 않다.** 컴파일할 때마다 창의 기억은 지워지므로,
    /// 창은 시작·멈춤 버튼과 기록을 보여 줄 뿐이다. 닫아도 고리는 돈다.
    /// </summary>
    public class RookeryVibeWindow : EditorWindow
    {
        public static RookeryVibeLoop.Reply LastResult;

        string _url = "https://rookery-web-production.up.railway.app";
        string _key = "";
        string _want = "";
        string _scope = "Assets/Rookery/";
        Vector2 _scroll;

        [MenuItem("Window/Rookery/같이 만들기 (바이브)")]
        static void Open() => GetWindow<RookeryVibeWindow>("Rookery 같이 만들기");

        void OnEnable()
        {
            _url = EditorPrefs.GetString(RookeryVibeLoop.KUrl, _url);
            _key = EditorPrefs.GetString(RookeryVibeLoop.KKey, "");
        }

        void OnGUI()
        {
            _url = EditorGUILayout.TextField("주소", _url);
            _key = EditorGUILayout.PasswordField("열쇠", _key);
            _scope = EditorGUILayout.TextField("쓸 폴더", _scope);
            EditorGUILayout.LabelField(
                "이 폴더 밖에는 쓰지 않습니다. 판마다 묻지 않는 대신 울타리를 칩니다.",
                EditorStyles.wordWrappedMiniLabel);

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("무엇을 만들까요?", EditorStyles.boldLabel);
            _want = EditorGUILayout.TextArea(_want, GUILayout.Height(60));

            var running = RookeryVibeLoop.Running;

            using (new EditorGUI.DisabledScope(
                       running || string.IsNullOrWhiteSpace(_key) ||
                       string.IsNullOrWhiteSpace(_want)))
            {
                if (GUILayout.Button("같이 만들기 시작", GUILayout.Height(28)))
                {
                    EditorPrefs.SetString(RookeryVibeLoop.KUrl, _url);
                    EditorPrefs.SetString(RookeryVibeLoop.KKey, _key);
                    LastResult = null;
                    var scope = _scope.EndsWith("/") ? _scope : _scope + "/";
                    RookeryVibeLoop.Start(_want, scope);
                }
            }

            using (new EditorGUI.DisabledScope(!running))
            {
                if (GUILayout.Button("멈추기"))
                {
                    RookeryVibeLoop.Stop("사람이 멈췄습니다.");
                }
            }

            _scroll = EditorGUILayout.BeginScrollView(_scroll);

            var log = RookeryVibeLoop.Log;
            if (!string.IsNullOrEmpty(log))
            {
                EditorGUILayout.Space();
                EditorGUILayout.LabelField("진행", EditorStyles.miniBoldLabel);
                EditorGUILayout.LabelField(log, EditorStyles.wordWrappedMiniLabel);
            }

            var r = LastResult;
            if (r != null)
            {
                if (r.criteria != null && r.criteria.Length > 0)
                {
                    EditorGUILayout.Space();
                    EditorGUILayout.LabelField(
                        "합격 기준 — **아직 확인되지 않았습니다.** 컴파일은 문법이 " +
                        "맞다는 뜻이지 원하던 것이 됐다는 뜻이 아닙니다.",
                        EditorStyles.wordWrappedMiniLabel);
                    foreach (var c in r.criteria)
                        EditorGUILayout.LabelField("· " + c.when + " → " + c.then,
                                                   EditorStyles.wordWrappedMiniLabel);
                }

                if (!string.IsNullOrEmpty(r.setup))
                {
                    EditorGUILayout.Space(4);
                    EditorGUILayout.LabelField("씬에서 할 것", EditorStyles.miniBoldLabel);
                    EditorGUILayout.LabelField(r.setup, EditorStyles.wordWrappedMiniLabel);
                }

                if (r.humanGate != null && r.humanGate.Length > 0)
                {
                    EditorGUILayout.Space(4);
                    EditorGUILayout.LabelField("잴 수 없어 사람이 볼 것",
                                               EditorStyles.miniBoldLabel);
                    foreach (var h in r.humanGate)
                        EditorGUILayout.LabelField("? " + h,
                                                   EditorStyles.wordWrappedMiniLabel);
                }

                if (r.remaining != null && r.remaining.Length > 0)
                {
                    EditorGUILayout.Space(4);
                    EditorGUILayout.LabelField("못 고친 오류", EditorStyles.miniBoldLabel);
                    foreach (var e in r.remaining)
                        EditorGUILayout.LabelField(
                            e.file + "(" + e.line + "): " + e.message,
                            EditorStyles.wordWrappedMiniLabel);
                }
            }

            EditorGUILayout.EndScrollView();
        }
    }
}
