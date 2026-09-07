// 로키에서 만든 것을 이 유니티 프로젝트로 가져오는 창. Window → Rookery → 가져오기
//
// 2026-09-05 사장님: "엔진에 넣어야지, 유니티로." 로키(/ask)가 만든 메시(Vox)와
// C# 스크립트(Dev)는 이 창 한 버튼으로 프로젝트에 들어온다. 터미널도, 심부름꾼도
// 없다 — 유니티 안의 창 하나다.
//
// 무엇이 오나: 대화로 돌아온 것 전부, 판정과 함께. 떨어진 것도 온다(폴더 이름에
// FAIL 이 붙는다). 고르는 것은 이 창 앞의 사람이다.
//
// 열쇠는 회사당 하나, 읽기 전용. 이걸로는 아무것도 만들거나 지울 수 없다.
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;
using UnityEditor.TestTools.TestRunner.Api;
using UnityEditor.Compilation;
using System.Linq;
using System.Reflection;

namespace Rookery
{
    public class RookeryImporter : EditorWindow
    {
        const string UrlKey = "Rookery.Url";
        const string KeyKey = "Rookery.Key";
        const string FolderKey = "Rookery.Folder";

        string _url = "https://rookery-web-production.up.railway.app";
        string _key = "";
        string _folder = "Assets/Rookery";
        string _status = "";
        Vector2 _scroll;

        [MenuItem("Window/Rookery/가져오기")]
        static void Open() => GetWindow<RookeryImporter>("Rookery");

        void Remember()
        {
            EditorPrefs.SetString(UrlKey, _url);
            EditorPrefs.SetString(KeyKey, _key);
            EditorPrefs.SetString(FolderKey, _folder);
        }

        void OnEnable()
        {
            _url = EditorPrefs.GetString(UrlKey, _url);
            _key = EditorPrefs.GetString(KeyKey, "");
            _folder = EditorPrefs.GetString(FolderKey, _folder);
        }

        void OnGUI()
        {
            EditorGUILayout.LabelField("로키 연결", EditorStyles.boldLabel);
            _url = EditorGUILayout.TextField("주소", _url);
            _key = EditorGUILayout.PasswordField("회사 열쇠", _key);
            _folder = EditorGUILayout.TextField("받을 폴더", _folder);
            EditorGUILayout.Space();

            using (new EditorGUI.DisabledScope(string.IsNullOrWhiteSpace(_key)))
            {
                if (GUILayout.Button("로키에서 가져오기", GUILayout.Height(30)))
                {
                    Remember();
                    Fetch();
                }
                EditorGUILayout.Space(4);
                // 가져온 것으로 씬을 짓고, 합격 시험지로 잰다. 결과는 로키 대화로 돌아간다.
                // 09-05 저녁까지 이 두 단계는 사람(나)이 배치 명령으로 손으로 돌렸다.
                if (GUILayout.Button("짓고 재기 → 결과를 로키로", GUILayout.Height(26)))
                {
                    Remember();
                    _status = RookeryCheck.BuildAndTestWhenReady(_url, _key);
                }
            }
            EditorGUILayout.Space();
            using (new EditorGUILayout.HorizontalScope())
            {
                var label = RookeryRender.UrpActive ? "URP + 후처리 (켜져 있음 — 다시 설정)" : "URP + 후처리 켜기";
                if (GUILayout.Button(label))
                    _status = RookeryRender.EnableUrpWithPostProcessing();
            }

            if (!string.IsNullOrEmpty(_status))
            {
                EditorGUILayout.Space();
                _scroll = EditorGUILayout.BeginScrollView(_scroll);
                EditorGUILayout.HelpBox(_status, MessageType.None);
                EditorGUILayout.EndScrollView();
            }
        }

        // ── 응답 모양. JsonUtility 는 필드 이름이 같아야 읽는다. ──
        [Serializable] class FileEntry
        {
            public string id, deliverableId, subject, kind, filename, mime, verdict, createdAt, url;
            public long size;
            public bool wantRig;
        }
        [Serializable] class ScriptEntry
        {
            public string deliverableId, subject, path, contents, createdAt;
        }
        [Serializable] class TestEntry { public string path, contents; }
        [Serializable] class Payload
        {
            public string company;
            public int count;
            public FileEntry[] files;
            public ScriptEntry[] scripts;
            public TestEntry[] tests;
            public string note;
        }

        void Fetch()
        {
            var request = UnityWebRequest.Get($"{_url.TrimEnd('/')}/api/unity/assets");
            request.SetRequestHeader("x-rookery-key", _key);
            _status = "목록 가져오는 중…";
            Repaint();
            request.SendWebRequest().completed += _ =>
            {
                if (request.result != UnityWebRequest.Result.Success)
                {
                    _status = $"실패: {request.responseCode} {request.error}\n{request.downloadHandler.text}";
                    Repaint();
                    return;
                }
                Payload payload;
                try { payload = JsonUtility.FromJson<Payload>(request.downloadHandler.text); }
                catch (Exception e) { _status = $"응답을 읽지 못했습니다: {e.Message}"; Repaint(); return; }
                if (payload.count == 0)
                {
                    _status = "가져올 것이 없습니다. 로키 대화에서 일을 맡기고 결과가 돌아오면 여기로 옵니다.";
                    Repaint();
                    return;
                }
                EditorCoroutine(SaveAll(payload));
            };
        }

        // 에디터에는 코루틴 러너가 없다. 업데이트 틱으로 돌린다.
        void EditorCoroutine(IEnumerator<bool> steps)
        {
            void Tick()
            {
                if (steps.MoveNext()) return;
                EditorApplication.update -= Tick;
                AssetDatabase.Refresh();
                _status += "\n" + RookeryModels.PrepareAll();
                Repaint();
            }
            EditorApplication.update += Tick;
        }

        // 폴더 이름: <제목>[_FAIL]. 떨어진 것도 받되 이름으로 갈라 둔다.
        static string Safe(string s)
        {
            var sb = new StringBuilder();
            foreach (var c in s) sb.Append(Path.GetInvalidFileNameChars().Contains(c) || c == ' ' ? '_' : c);
            return sb.Length == 0 ? "asset" : sb.ToString();
        }

        IEnumerator<bool> SaveAll(Payload payload)
        {
            var log = new StringBuilder();
            log.AppendLine($"{payload.company} — 파일 {payload.files?.Length ?? 0}개, 스크립트 {payload.scripts?.Length ?? 0}개");
            Directory.CreateDirectory(_folder);

            foreach (var f in payload.files ?? Array.Empty<FileEntry>())
            {
                var dir = Path.Combine(_folder, Safe(f.subject) + (f.verdict == "PASS" ? "" : "_" + f.verdict));
                Directory.CreateDirectory(dir);
                var dest = Path.Combine(dir, f.filename);
                _status = $"받는 중: {f.subject}/{f.filename}";
                Repaint();
                // 이미 같은 크기로 있으면 안 받는다(헤드리스와 같은 규칙, 22:35).
                if (File.Exists(dest) && new FileInfo(dest).Length == f.size && File.Exists(dest + ".rookery.json"))
                {
                    log.AppendLine($"  = {f.subject}/{f.filename} (있음)");
                    continue;
                }

                var req = UnityWebRequest.Get(f.url);
                req.downloadHandler = new DownloadHandlerFile(dest);
                var op = req.SendWebRequest();
                while (!op.isDone) yield return true;

                if (req.result != UnityWebRequest.Result.Success)
                {
                    log.AppendLine($"  ✗ {f.subject}/{f.filename}: {req.error}");
                    continue;
                }
                // 어디서 왔고 무엇으로 판정됐는지. 반년 뒤에 물을 사람이 반드시 생긴다.
                File.WriteAllText(dest + ".rookery.json",
                    "{\"deliverableId\":\"" + f.deliverableId + "\",\"verdict\":\"" + f.verdict +
                    "\",\"wantRig\":" + (f.wantRig ? "true" : "false") + ",\"createdAt\":\"" + f.createdAt + "\"}");
                log.AppendLine($"  ✓ {f.subject}/{f.filename} ({f.size / 1024} KB, {f.verdict})" +
                               (f.wantRig && f.filename.EndsWith(".fbx") ? "  ← 캐릭터: Rig 를 Humanoid 로" : ""));
            }

            // 스크립트는 **낸 경로 그대로** 놓는다. 씬 빌더가 `Assets/Input/….inputactions` 를
            // 그 경로로 찾기 때문에, 제목 폴더로 옮기면 못 찾는다(09-05). 로키가 전에 쓴
            // 파일은 덮어쓰고, 사람이 만든 파일은 건드리지 않는다 — 구분은 manifest.
            foreach (var s in payload.scripts ?? Array.Empty<ScriptEntry>())
            {
                log.AppendLine("  " + RookeryFiles.WriteManaged(s.path, s.contents));
                RookeryCheck.RememberDeliverable(s.deliverableId);
                yield return true;
            }
            foreach (var t in payload.tests ?? Array.Empty<TestEntry>())
            {
                log.AppendLine("  " + RookeryFiles.WriteManaged(t.path, t.contents));
                yield return true;
            }

            log.AppendLine();
            log.AppendLine("GLB 는 com.unity.cloud.gltfast 패키지가 있어야 열립니다. 100배 크면 임포트 Scale 0.01.");
            log.AppendLine("분홍 재질은 URP/Lit 으로, 하얀 모델은 재질 다시 추출. 콜라이더는 따로.");
            _status = log.ToString();
        }
    }

    /// 창 없이 같은 일을 한다. 배치모드 시험용이고, 자동화에도 쓴다:
    ///   Unity -batchmode -quit -projectPath ... -executeMethod Rookery.RookeryHeadless.Import
    /// 환경변수 ROOKERY_URL, ROOKERY_KEY, ROOKERY_FOLDER(기본 Assets/Rookery).
    public static class RookeryHeadless
    {
        [Serializable] class FileEntry { public string id, deliverableId, subject, kind, filename, mime, verdict, createdAt, url; public long size; public bool wantRig; }
        [Serializable] class ScriptEntry { public string deliverableId, subject, path, contents, createdAt; }
        [Serializable] class TestEntry { public string path, contents; }
        [Serializable] class Payload { public string company; public int count; public FileEntry[] files; public ScriptEntry[] scripts; public TestEntry[] tests; public string note; }

        public static void Import()
        {
            var url = Environment.GetEnvironmentVariable("ROOKERY_URL") ?? "https://rookery-web-production.up.railway.app";
            var key = Environment.GetEnvironmentVariable("ROOKERY_KEY") ?? "";
            var folder = Environment.GetEnvironmentVariable("ROOKERY_FOLDER") ?? "Assets/Rookery";
            if (string.IsNullOrEmpty(key)) { Debug.LogError("[Rookery] ROOKERY_KEY 가 없습니다."); return; }

            using var http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromMinutes(5) }; // 기본 100초에 끊겼다(18:08)
            http.DefaultRequestHeaders.Add("x-rookery-key", key);
            var json = http.GetStringAsync($"{url.TrimEnd('/')}/api/unity/assets").GetAwaiter().GetResult();
            var payload = JsonUtility.FromJson<Payload>(json);
            Debug.Log($"[Rookery] {payload.company}: 파일 {payload.files?.Length ?? 0}, 스크립트 {payload.scripts?.Length ?? 0}");
            Directory.CreateDirectory(folder);
            var skipped = 0;

            foreach (var f in payload.files ?? Array.Empty<FileEntry>())
            {
                var dir = Path.Combine(folder, Safe(f.subject) + (f.verdict == "PASS" ? "" : "_" + f.verdict));
                Directory.CreateDirectory(dir);
                var dest = Path.Combine(dir, f.filename);
                var side = "{\"deliverableId\":\"" + f.deliverableId + "\",\"verdict\":\"" + f.verdict +
                    "\",\"wantRig\":" + (f.wantRig ? "true" : "false") + ",\"createdAt\":\"" + f.createdAt + "\"}";
                // 이미 같은 크기로 있으면 안 받는다. 매 바퀴 131개 1 GB 를 다시 받느라 8분 중 5분이 갔다(09-06 22:35).
                // 산출물 파일은 한 번 저장되면 안 바뀐다(같은 경로에 다시 쓰지 않는다) — 크기가 같으면 같은 파일이다.
                if (File.Exists(dest) && new FileInfo(dest).Length == f.size && File.Exists(dest + ".rookery.json"))
                {
                    File.WriteAllText(dest + ".rookery.json", side);
                    skipped++;
                    continue;
                }
                var bytes = http.GetByteArrayAsync(f.url).GetAwaiter().GetResult();
                File.WriteAllBytes(dest, bytes);
                File.WriteAllText(dest + ".rookery.json", side);
                Debug.Log($"[Rookery] ✓ {dest} ({bytes.Length / 1024} KB, {f.verdict})");
            }
            if (skipped > 0) Debug.Log($"[Rookery] 이미 있는 파일 {skipped}개는 안 받았다");
            foreach (var s in payload.scripts ?? Array.Empty<ScriptEntry>())
            {
                Debug.Log("[Rookery] " + RookeryFiles.WriteManaged(s.path, s.contents));
                RookeryCheck.RememberDeliverable(s.deliverableId);
            }
            foreach (var t in payload.tests ?? Array.Empty<TestEntry>())
                Debug.Log("[Rookery] " + RookeryFiles.WriteManaged(t.path, t.contents));
            AssetDatabase.Refresh();
            Debug.Log("[Rookery] " + RookeryModels.PrepareAll());
        }

        /// 가져온 뒤 짓고 재기까지. -quit 없이 부른다 — 시험이 끝나면 스스로 나간다.
        public static void ImportBuildTest()
        {
            Import();
            var url = Environment.GetEnvironmentVariable("ROOKERY_URL") ?? "https://rookery-web-production.up.railway.app";
            var key = Environment.GetEnvironmentVariable("ROOKERY_KEY") ?? "";
            Debug.Log("[Rookery] " + RookeryCheck.BuildAndTestWhenReady(url, key));
        }

        /// 따뜻한 유니티(09-07 E2): 에디터를 켜 둔 채 30초마다 최신 버전을 묻고, 새 버전이면 가져와 검사한다.
        /// 실행: Unity -batchmode -projectPath … -executeMethod Rookery.RookeryHeadless.Watch (-quit 없이).
        public static void Watch()
        {
            SessionState.SetBool(RookeryWatch.ModeKey, true);
            RookeryWatch.Arm();
        }

        static string Safe(string s)
        {
            var sb = new StringBuilder();
            foreach (var c in s) sb.Append(Array.IndexOf(Path.GetInvalidFileNameChars(), c) >= 0 || c == ' ' ? '_' : c);
            return sb.Length == 0 ? "asset" : sb.ToString();
        }
    }

    /// 받은 FBX 의 임포트 설정. Meshy FBX 는 법선 데이터가 나빠서 그대로 들이면 옷에
    /// 네모난 얼룩이 진다(09-06 01:24 실험: 노멀 맵도 텍스처도 아니었고, 법선을 다시
    /// 계산하니 사라졌다). 그리고 재질의 발광(베이스컬러가 발광 맵에도 들어감)은
    /// 씬 재질 정리에서 끈다(RookeryRender). 여기는 임포터만.
    public static class RookeryModels
    {
        public static string PrepareAll()
        {
            var n = 0;
            foreach (var guid in AssetDatabase.FindAssets("t:Model", new[] { "Assets/Rookery" }))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (!path.EndsWith(".fbx", StringComparison.OrdinalIgnoreCase)) continue;
                var imp = AssetImporter.GetAtPath(path) as ModelImporter;
                if (imp == null) continue;
                if (imp.importNormals == ModelImporterNormals.Calculate && Math.Abs(imp.normalSmoothingAngle - 180f) < 0.5f && imp.weldVertices) continue;
                imp.importNormals = ModelImporterNormals.Calculate;
                imp.normalCalculationMode = ModelImporterNormalCalculationMode.AreaAndAngleWeighted;
                imp.normalSmoothingAngle = 180f;
                imp.importTangents = ModelImporterTangents.CalculateMikk;
                imp.weldVertices = true;
                imp.SaveAndReimport();
                n++;
            }
            return n == 0 ? "FBX 법선: 이미 정리됨" : $"✓ FBX {n}개 법선 다시 계산(180°·용접)";
        }
    }

    /// 로키가 쓴 파일과 사람이 쓴 파일을 가른다. manifest 에 있는 것만 덮어쓴다.
    public static class RookeryFiles
    {
        const string Manifest = "Assets/Rookery/.rookery-manifest.txt";

        static HashSet<string> Load()
        {
            var set = new HashSet<string>();
            if (File.Exists(Manifest))
                foreach (var line in File.ReadAllLines(Manifest)) if (line.Length > 0) set.Add(line.Trim());
            return set;
        }

        public static string WriteManaged(string relPath, string contents)
        {
            var path = relPath.Replace('\\', '/');
            if (!path.StartsWith("Assets/")) path = "Assets/Rookery/" + path.TrimStart('/');
            var managed = Load();
            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            if (File.Exists(path))
            {
                if (File.ReadAllText(path) == contents) return $"= {path} (같음)";
                // 시험지(Assets/RookeryTests/)는 언제나 로키 것이다 — 저장소 unity/Tests 가
                // 원본이고 사람이 고치면 자가 바뀐다. manifest 이전에 놓인 것도 덮는다.
                // 20:23 사진 시험을 더한 시험지가 "사람이 만든 파일" 로 막혀 옛 자가 돌았다.
                if (!managed.Contains(path) && !path.StartsWith("Assets/RookeryTests/"))
                    return $"! {path} 사람이 만든 파일 — 건너뜀";
            }
            File.WriteAllText(path, contents);
            if (!managed.Contains(path))
            {
                managed.Add(path);
                Directory.CreateDirectory("Assets/Rookery");
                File.WriteAllLines(Manifest, managed);
            }
            return $"✓ {path}";
        }
    }

    /// 짓고 재기. Rookery/ 메뉴의 BuildOrRebuild 를 전부 돌린 뒤 PlayMode 시험을 돌리고,
    /// 결과를 /api/unity/checks 로 보낸다. 콜백은 도메인 리로드에 날아가므로
    /// [InitializeOnLoad] 에서 매번 다시 건다; 어느 산출물의 시험인지는 SessionState 에.
    /// 켜 둔 에디터가 스스로 새 버전을 집는다. 리로드가 나도 [InitializeOnLoad] 가 다시 건다.
    [InitializeOnLoad]
    public static class RookeryWatch
    {
        public const string ModeKey = "Rookery.Watch.Mode";
        const string LastKey = "Rookery.Watch.Last";
        const string BusyKey = "Rookery.Watch.Busy";
        const string BusySinceKey = "Rookery.Watch.BusySince";
        static double _next;
        [Serializable] class Latest { public string id, title, at, @checked; }

        public static bool Active => SessionState.GetBool(ModeKey, false);

        static RookeryWatch()
        {
            if (Active) Arm();
        }

        public static void Arm()
        {
            EditorApplication.update -= Tick;
            EditorApplication.update += Tick;
            _next = EditorApplication.timeSinceStartup + 3;
            Debug.Log("[Rookery] 감시 중(따뜻한 유니티) — 마지막: " + SessionState.GetString(LastKey, "(없음)"));
        }

        public static void Done()
        {
            SessionState.SetBool(BusyKey, false);
            _next = EditorApplication.timeSinceStartup + 5;
            Debug.Log("[Rookery] 검사 끝, 다시 감시");
        }

        static void Tick()
        {
            if (EditorApplication.timeSinceStartup < _next) return;
            _next = EditorApplication.timeSinceStartup + 30;
            if (EditorApplication.isCompiling || EditorApplication.isUpdating || EditorApplication.isPlaying) return;
            if (SessionState.GetBool(BusyKey, false))
            {
                // 15분 넘게 바쁘면 죽은 것으로 보고 푼다.
                if (EditorApplication.timeSinceStartup - SessionState.GetFloat(BusySinceKey, 0f) > 900) { Debug.LogWarning("[Rookery] 15분째 바쁨 — 푼다"); SessionState.SetBool(BusyKey, false); }
                return;
            }
            try
            {
                var url = Environment.GetEnvironmentVariable("ROOKERY_URL") ?? "https://rookery-web-production.up.railway.app";
                var key = Environment.GetEnvironmentVariable("ROOKERY_KEY") ?? "";
                using var http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(30) };
                http.DefaultRequestHeaders.Add("x-rookery-key", key);
                var json = http.GetStringAsync($"{url.TrimEnd('/')}/api/unity/latest").GetAwaiter().GetResult();
                var latest = JsonUtility.FromJson<Latest>(json);
                // 다시 재기 신호(ai-workforce/data/unity_recheck 파일): 같은 버전이라도 한 번 더 가져와 검사한다(자를 고쳤을 때).
                var recheck = @"C:\Users\az518\Desktop\ai-workforce\data\unity_recheck";
                var forced = File.Exists(recheck);
                if (forced) File.Delete(recheck);
                if (latest == null || string.IsNullOrEmpty(latest.id) || (!forced && latest.id == SessionState.GetString(LastKey, ""))) return;
                SessionState.SetBool(BusyKey, true);
                SessionState.SetFloat(BusySinceKey, (float)EditorApplication.timeSinceStartup);
                SessionState.SetString(LastKey, latest.id);
                Debug.Log($"[Rookery] 새 버전 {latest.id.Substring(0, 8)} ({latest.title}) — 가져와 검사");
                RookeryHeadless.ImportBuildTest();
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Rookery] 감시 묻기 실패: " + e.Message);
            }
        }
    }

    [InitializeOnLoad]
    public static class RookeryCheck
    {
        const string PendingUrl = "Rookery.Check.Url";
        const string PendingKey = "Rookery.Check.Key";
        const string PendingDeliverable = "Rookery.Check.Deliverable";
        const string LastDeliverable = "Rookery.Last.Deliverable";

        const string Continue = "Rookery.Check.Continue";

        static RookeryCheck()
        {
            var api = ScriptableObject.CreateInstance<TestRunnerApi>();
            api.RegisterCallbacks(new Reporter());

            // 새 스크립트를 넣은 직후에는 컴파일 전이라 씬 빌더가 아직 없다(19:43 에
            // "BuildOrRebuild 가 없습니다" 로 못 잼 6). 그래서 "짓고 재기" 는 리로드 뒤에
            // 이어서 돈다 — 리로드 전에 표시를 남기고, 여기(리로드 직후)서 집어 든다.
            if (SessionState.GetBool(Continue, false))
            {
                SessionState.EraseBool(Continue);
                var url = SessionState.GetString(PendingUrl, "");
                var key = SessionState.GetString(PendingKey, "");
                EditorApplication.delayCall += () => Debug.Log("[Rookery] " + BuildAndTest(url, key, afterReload: true));
            }
        }

        /// 컴파일이 필요한 상태면 표시만 남기고 리로드에 맡긴다. 아니면 바로 짓고 잰다.
        public static string BuildAndTestWhenReady(string url, string key)
        {
            SessionState.SetString(PendingUrl, url);
            SessionState.SetString(PendingKey, key);
            SessionState.SetString(PendingDeliverable, SessionState.GetString(LastDeliverable, ""));
            if (EditorApplication.isCompiling || EditorApplication.isUpdating)
            {
                SessionState.SetBool(Continue, true);
                ArmCompileWatch();
                return "컴파일이 끝나면 이어서 짓고 잽니다…";
            }
            return BuildAndTest(url, key, afterReload: false);
        }

        // ── 컴파일이 깨지면 리로드가 안 일어나 이어서 짓기가 영영 안 온다 ──
        // 21:50 Dev 가 없는 이름(CopyFromOtherAvatar)을 써서 컴파일이 깨졌고, 배치
        // 유니티가 멈춘 채 10분을 넘겼다. 오류는 판정이다: "컴파일" 한 줄 떨어짐으로
        // 대화에 보내고, 배치면 끝낸다. 그러면 "고쳐 줘" 가 그 줄을 들고 간다.
        static readonly List<string> _compileErrors = new List<string>();

        static void ArmCompileWatch()
        {
            _compileErrors.Clear();
            CompilationPipeline.assemblyCompilationFinished -= OnAssemblyDone;
            CompilationPipeline.assemblyCompilationFinished += OnAssemblyDone;
            CompilationPipeline.compilationFinished -= OnCompilationDone;
            CompilationPipeline.compilationFinished += OnCompilationDone;
        }

        static void OnAssemblyDone(string assembly, CompilerMessage[] messages)
        {
            foreach (var m in messages)
                if (m.type == CompilerMessageType.Error)
                    _compileErrors.Add($"{m.file}({m.line}): {m.message}");
        }

        static void OnCompilationDone(object _)
        {
            if (_compileErrors.Count == 0) return; // 성공이면 리로드가 오고 정적 생성자가 이어 받는다
            SessionState.EraseBool(Continue);
            var url = SessionState.GetString(PendingUrl, "");
            var key = SessionState.GetString(PendingKey, "");
            var deliverable = SessionState.GetString(PendingDeliverable, "");
            SessionState.EraseString(PendingUrl);
            SessionState.EraseString(PendingKey);
            var errs = _compileErrors.Distinct().Take(10).ToList();
            var msg = "컴파일 오류 " + _compileErrors.Distinct().Count() + "개:\n" + string.Join("\n", errs);
            Debug.LogError("[Rookery] " + msg);
            var cases = new List<string> { "{\"name\":\"컴파일이_된다\",\"result\":\"Failed\",\"message\":\"" + J(msg) + "\"}" };
            PostChecks(url, key, deliverable, "", 0, 1, 0, cases, "", failedExit: 4);
        }

        /// 결과를 로키로. 시험 뒤에도, 컴파일이 깨졌을 때도 같은 문으로 간다.
        static void PostChecks(string url, string key, string deliverable, string scene,
                               int passed, int failed, int inconclusive, List<string> cases, string shot, int failedExit = 3, string portrait = "", string walk = "", string jump = "")
        {
            if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(key)) return;
            var json = "{\"deliverableId\":\"" + J(deliverable) + "\",\"scene\":\"" + J(scene) + "\",\"passed\":" + passed +
                       ",\"failed\":" + failed + ",\"inconclusive\":" + inconclusive + ",\"cases\":[" + string.Join(",", cases) + "]" +
                       (shot.Length > 0 ? ",\"screenshot\":\"" + shot + "\"" : "") +
                       (portrait.Length > 0 ? ",\"portrait\":\"" + portrait + "\"" : "") +
                       (walk.Length > 0 ? ",\"walk\":\"" + walk + "\"" : "") +
                       (jump.Length > 0 ? ",\"jump\":\"" + jump + "\"" : "") + "}";
            var req = new UnityWebRequest($"{url.TrimEnd('/')}/api/unity/checks", "POST")
            {
                uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json)),
                downloadHandler = new DownloadHandlerBuffer(),
            };
            req.SetRequestHeader("Content-Type", "application/json");
            req.SetRequestHeader("x-rookery-key", key);
            req.SendWebRequest().completed += _ =>
            {
                Debug.Log($"[Rookery] 시험 결과 보냄: 통과 {passed} 떨어짐 {failed} 못 잼 {inconclusive} → {req.responseCode} {req.downloadHandler.text}");
                if (Application.isBatchMode)
                {
                    // 따뜻한 유니티(09-07 E2): 감시 모드면 나가지 않고 다음 버전을 기다린다. 시작 87초가 0 이 된다.
                    if (RookeryWatch.Active) RookeryWatch.Done(); else EditorApplication.Exit(failed > 0 ? failedExit : 0);
                }
            };
        }

        public static void RememberDeliverable(string id)
        {
            if (!string.IsNullOrEmpty(id)) SessionState.SetString(LastDeliverable, id);
        }

        public static string BuildAndTest(string url, string key, bool afterReload = false)
        {
            var built = BuildAll();
            if (!afterReload && built.Contains("BuildOrRebuild 가 없습니다") && !SessionState.GetBool(Continue, false))
            {
                // 빌더가 아직 안 보인다 — 방금 넣은 스크립트가 컴파일 전일 수 있다.
                // 한 번은 리로드 뒤로 미룬다. 두 번째에도 없으면 정말 없는 것이다.
                SessionState.SetBool(Continue, true);
                AssetDatabase.Refresh();
                return built + "\n(방금 넣은 스크립트가 컴파일되면 이어서 잽니다)";
            }
            SessionState.SetString(PendingUrl, url);
            SessionState.SetString(PendingKey, key);
            SessionState.SetString(PendingDeliverable, SessionState.GetString(LastDeliverable, ""));
            var api = ScriptableObject.CreateInstance<TestRunnerApi>();
            api.Execute(new ExecutionSettings(new Filter
            {
                testMode = TestMode.PlayMode,
                assemblyNames = new[] { "Rookery.Tests.PlayMode" },
            }));
            return built + "\n시험을 돌립니다… 끝나면 결과가 로키 대화에 붙습니다.";
        }

        /// Rookery/ 메뉴에 달린 BuildOrRebuild 를 전부 부른다. 하나가 죽어도 나머지는 돈다.
        static string BuildAll()
        {
            var log = new StringBuilder();
            var count = 0;
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types;
                try { types = asm.GetTypes(); } catch { continue; }
                foreach (var t in types)
                {
                    var m = t.GetMethod("BuildOrRebuild", BindingFlags.Public | BindingFlags.Static, null, Type.EmptyTypes, null);
                    if (m == null) continue;
                    var menu = m.GetCustomAttribute<MenuItem>();
                    if (menu == null || !menu.menuItem.StartsWith("Rookery/")) continue;
                    try
                    {
                        m.Invoke(null, null); log.AppendLine($"✓ 지음: {menu.menuItem}"); count++;
                        // 새로 지은 씬에는 후처리가 없다. URP 가 켜져 있으면 다시 씌운다(23:45).
                        if (RookeryRender.UrpActive) log.AppendLine("  " + RookeryRender.ApplyToOpenScene());
                    }
                    catch (Exception e) { log.AppendLine($"✗ {menu.menuItem}: {(e.InnerException ?? e).Message}"); }
                }
            }
            if (count == 0) log.AppendLine("Rookery/ 메뉴에 BuildOrRebuild 가 없습니다 — 먼저 가져오십시오.");
            return log.ToString();
        }

        static string J(string s) => (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", " ").Replace("\r", "");

        class Reporter : ICallbacks
        {
            public void RunStarted(ITestAdaptor testsToRun) { }
            public void TestStarted(ITestAdaptor test) { }
            public void TestFinished(ITestResultAdaptor result) { }

            public void RunFinished(ITestResultAdaptor result)
            {
                var url = SessionState.GetString(PendingUrl, "");
                var key = SessionState.GetString(PendingKey, "");
                if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(key)) return; // 우리가 건 시험이 아니다
                SessionState.EraseString(PendingUrl);
                SessionState.EraseString(PendingKey);
                var deliverable = SessionState.GetString(PendingDeliverable, "");

                var cases = new List<string>();
                int passed = 0, failed = 0, inconclusive = 0;
                void Walk(ITestResultAdaptor r)
                {
                    if (r.HasChildren) { foreach (var c in r.Children) Walk(c); return; }
                    var status = r.TestStatus.ToString();
                    // 사진 찍기는 판정이 아니다. 세지 않고 목록에도 안 넣는다.
                    if (r.Test.Name == "화면을_찍는다") return;
                    if (status == "Passed") passed++;
                    else if (status == "Failed") failed++;
                    else inconclusive++;
                    cases.Add("{\"name\":\"" + J(r.Test.Name) + "\",\"result\":\"" + status + "\",\"message\":\"" + J(r.Message) + "\"}");
                }
                Walk(result);
                var scene = "";
                var scenes = EditorBuildSettings.scenes;
                if (scenes.Length > 0) scene = Path.GetFileNameWithoutExtension(scenes[scenes.Length - 1].path);
                // 시험지가 찍어 둔 화면 한 장. 있으면 같이 보내고 지운다 — 다음 판의
                // 사진이 이번 판 것으로 오해되지 않게.
                var shot = "";
                var shotPath = Path.GetFullPath("Library/Rookery/screenshot.png");
                if (File.Exists(shotPath))
                {
                    try { shot = Convert.ToBase64String(File.ReadAllBytes(shotPath)); File.Delete(shotPath); }
                    catch (Exception e) { Debug.LogWarning("[Rookery] 사진을 못 읽었습니다: " + e.Message); }
                }
                var portrait = "";
                var portraitPath = Path.GetFullPath("Library/Rookery/portrait.png");
                if (File.Exists(portraitPath))
                {
                    try { portrait = Convert.ToBase64String(File.ReadAllBytes(portraitPath)); File.Delete(portraitPath); }
                    catch (Exception e) { Debug.LogWarning("[Rookery] 얼굴 사진을 못 읽었습니다: " + e.Message); }
                }
                var walk = "";
                var walkPath = Path.GetFullPath("Library/Rookery/walk.png");
                if (File.Exists(walkPath))
                {
                    try { walk = Convert.ToBase64String(File.ReadAllBytes(walkPath)); File.Delete(walkPath); }
                    catch (Exception e) { Debug.LogWarning("[Rookery] 걷기 사진을 못 읽었습니다: " + e.Message); }
                }
                var jump = "";
                var jumpPath = Path.GetFullPath("Library/Rookery/jump.png");
                if (File.Exists(jumpPath))
                {
                    try { jump = Convert.ToBase64String(File.ReadAllBytes(jumpPath)); File.Delete(jumpPath); }
                    catch (Exception e) { Debug.LogWarning("[Rookery] 점프 사진을 못 읽었습니다: " + e.Message); }
                }
                PostChecks(url, key, deliverable, scene, passed, failed, inconclusive, cases, shot, portrait: portrait, walk: walk, jump: jump);
            }
        }
    }

    static class CharArrayExt
    {
        public static bool Contains(this char[] arr, char c) => Array.IndexOf(arr, c) >= 0;
    }
}
