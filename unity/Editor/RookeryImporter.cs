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
                    EditorPrefs.SetString(UrlKey, _url);
                    EditorPrefs.SetString(KeyKey, _key);
                    EditorPrefs.SetString(FolderKey, _folder);
                    Fetch();
                }
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
        [Serializable] class Payload
        {
            public string company;
            public int count;
            public FileEntry[] files;
            public ScriptEntry[] scripts;
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

            foreach (var s in payload.scripts ?? Array.Empty<ScriptEntry>())
            {
                var dir = Path.Combine(_folder, "Scripts", Safe(s.subject));
                Directory.CreateDirectory(dir);
                var dest = Path.Combine(dir, Path.GetFileName(s.path));
                // 이미 있으면 덮어쓰지 않는다 — 사람이 손댄 파일을 로키가 지우면 안 된다.
                if (File.Exists(dest)) { log.AppendLine($"  = {s.subject}/{Path.GetFileName(s.path)} 이미 있음, 건너뜀"); continue; }
                File.WriteAllText(dest, s.contents);
                log.AppendLine($"  ✓ {s.subject}/{Path.GetFileName(s.path)}");
                yield return true;
            }

            log.AppendLine();
            log.AppendLine("GLB 는 com.unity.cloud.gltfast 패키지가 있어야 열립니다. 100배 크면 임포트 Scale 0.01.");
            log.AppendLine("분홍 재질은 URP/Lit 으로, 하얀 모델은 재질 다시 추출. 콜라이더는 따로.");
            _status = log.ToString();
        }
    }

    static class CharArrayExt
    {
        public static bool Contains(this char[] arr, char c) => Array.IndexOf(arr, c) >= 0;
    }
}
