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
    /// 컴파일 오류를 로키에 보내 고침을 받는다.
    ///
    /// 로키는 생성한 코드를 실행하지 않는다 — 서버에서 남의 코드를 돌리면 그건
    /// 임의 코드 실행이고, 그 문을 열면 회사의 모든 열쇠가 그 코드 안에 놓인다.
    /// 그래서 로키가 낸 코드는 지금까지 "파싱은 됩니다"까지만 말할 수 있었다.
    ///
    /// 그런데 유니티는 자기 프로젝트를 자기가 컴파일한다. 그 오류를 보내 주면
    /// 로키는 아무것도 실행하지 않고 진짜 오류를 알게 된다 — 실행의 위험은 원래
    /// 있던 자리(에디터)에 그대로 있고, 고치는 일만 넘어간다.
    ///
    /// 받은 수정을 자동으로 덮어쓰지 않는다. 무엇이 어떻게 바뀌는지 보여 주고,
    /// 누르는 것은 사람이다. 남의 디스크에 조용히 쓰는 것은 이 도구가 하지 않는
    /// 일이다.
    /// </summary>
    public class RookeryFixer : EditorWindow
    {
        const string UrlKey = "Rookery.Url";
        const string KeyKey = "Rookery.Key";

        static readonly List<string> Errors = new();

        string _url = "https://rookery-web-production.up.railway.app";
        string _key = "";
        string _status = "";
        Vector2 _scroll;
        Fix[] _fixes = Array.Empty<Fix>();
        Unresolved[] _unresolved = Array.Empty<Unresolved>();

        [MenuItem("Window/Rookery/컴파일 오류 고치기")]
        static void Open() => GetWindow<RookeryFixer>("Rookery 고치기");

        void OnEnable()
        {
            _url = EditorPrefs.GetString(UrlKey, _url);
            _key = EditorPrefs.GetString(KeyKey, "");
            CompilationPipeline.assemblyCompilationFinished += OnCompiled;
        }

        void OnDisable()
        {
            CompilationPipeline.assemblyCompilationFinished -= OnCompiled;
        }

        /// <summary>컴파일이 끝날 때마다 오류를 모아 둔다.</summary>
        static void OnCompiled(string assembly, CompilerMessage[] messages)
        {
            foreach (var m in messages)
            {
                if (m.type != CompilerMessageType.Error) continue;
                var line = m.file + "(" + m.line + "): " + m.message;
                if (!Errors.Contains(line)) Errors.Add(line);
            }
        }

        void OnGUI()
        {
            _url = EditorGUILayout.TextField("주소", _url);
            _key = EditorGUILayout.PasswordField("열쇠", _key);

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("모인 컴파일 오류: " + Errors.Count + "개");

            using (new EditorGUI.DisabledScope(
                       Errors.Count == 0 || string.IsNullOrWhiteSpace(_key)))
            {
                if (GUILayout.Button("로키에 보내 고침 받기", GUILayout.Height(28)))
                {
                    EditorPrefs.SetString(UrlKey, _url);
                    EditorPrefs.SetString(KeyKey, _key);
                    Send();
                }
            }

            if (GUILayout.Button("오류 목록 비우기"))
            {
                Errors.Clear();
                _fixes = Array.Empty<Fix>();
                _unresolved = Array.Empty<Unresolved>();
                _status = "";
            }

            _scroll = EditorGUILayout.BeginScrollView(_scroll);

            if (!string.IsNullOrEmpty(_status))
            {
                EditorGUILayout.HelpBox(_status, MessageType.None);
            }

            foreach (var f in _fixes)
            {
                EditorGUILayout.Space();
                EditorGUILayout.LabelField(f.path, EditorStyles.boldLabel);
                EditorGUILayout.LabelField(f.change, EditorStyles.wordWrappedMiniLabel);

                // 덮어쓰기는 파일마다 따로 누른다. 한 번에 다 적용하는 버튼을 두면
                // 확인하지 않고 누르게 되고, 그러면 보여 준 의미가 없다.
                if (GUILayout.Button(Path.GetFileName(f.path) + " 적용",
                                     GUILayout.Width(220)))
                {
                    Apply(f);
                }
            }

            foreach (var u in _unresolved)
            {
                EditorGUILayout.Space();
                EditorGUILayout.HelpBox("못 고침: " + u.error + "\n" + u.why,
                                        MessageType.Warning);
            }

            EditorGUILayout.EndScrollView();
        }

        void Send()
        {
            // 오류가 가리키는 파일만 보낸다. 프로젝트 전체를 보내면 느리고 비싸고,
            // 고칠 곳과 상관없는 코드가 답을 흐린다.
            var paths = new HashSet<string>();
            foreach (var e in Errors)
            {
                var open = e.IndexOf('(');
                if (open <= 0) continue;
                var path = e.Substring(0, open);
                if (File.Exists(path)) paths.Add(path);
            }

            if (paths.Count == 0)
            {
                _status = "오류가 가리키는 파일을 찾지 못했습니다.";
                return;
            }

            var sb = new StringBuilder();
            sb.Append("{\"errors\":[");
            for (var i = 0; i < Errors.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append(Quote(Errors[i]));
            }
            sb.Append("],\"files\":[");
            var first = true;
            foreach (var p in paths)
            {
                if (!first) sb.Append(',');
                first = false;
                sb.Append("{\"path\":").Append(Quote(p));
                sb.Append(",\"contents\":").Append(Quote(File.ReadAllText(p)));
                sb.Append('}');
            }
            sb.Append("]}");

            var request = new UnityWebRequest(
                _url.TrimEnd('/') + "/api/unity/fix", "POST")
            {
                uploadHandler = new UploadHandlerRaw(
                    Encoding.UTF8.GetBytes(sb.ToString())),
                downloadHandler = new DownloadHandlerBuffer(),
            };
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("x-rookery-key", _key);

            _status = Errors.Count + "개 오류, " + paths.Count + "개 파일을 보내는 중…";
            Repaint();

            var op = request.SendWebRequest();
            op.completed += _ =>
            {
                if (request.result != UnityWebRequest.Result.Success)
                {
                    // 실패를 조용히 넘기지 않는다. 아무 수정도 안 왔는데 성공처럼
                    // 보이면, 다음에 왜 여전히 안 되는지 찾을 곳이 없다.
                    _status = "실패: " + request.responseCode + " " + request.error
                              + "\n" + request.downloadHandler.text;
                    Repaint();
                    return;
                }

                try
                {
                    var payload = JsonUtility.FromJson<Payload>(
                        request.downloadHandler.text);
                    _fixes = payload.files ?? Array.Empty<Fix>();
                    _unresolved = payload.unresolved ?? Array.Empty<Unresolved>();
                    _status = _fixes.Length + "개 파일에 수정이 왔습니다. "
                              + "못 고친 것 " + _unresolved.Length + "개.\n"
                              + "각 파일을 확인하고 적용하십시오.";
                }
                catch (Exception e)
                {
                    _status = "응답을 읽지 못했습니다: " + e.Message;
                }
                Repaint();
            };
        }

        void Apply(Fix f)
        {
            if (!File.Exists(f.path))
            {
                _status = f.path + " 가 없습니다.";
                return;
            }

            // 원본을 남긴다. 고침이 더 나빴을 때 되돌릴 수 있어야 한다.
            var backup = f.path + ".before-rookery";
            if (!File.Exists(backup)) File.Copy(f.path, backup);

            File.WriteAllText(f.path, f.contents);
            AssetDatabase.Refresh();
            _status = f.path + " 적용. 원본은 "
                      + Path.GetFileName(backup) + " 에 있습니다.";
        }

        /// <summary>JSON 문자열 하나. 유니티에 JSON 직렬화기가 있지만 문자열
        /// 이스케이프만 필요해서 여기서 한다.</summary>
        static string Quote(string s)
        {
            var sb = new StringBuilder("\"");
            foreach (var c in s)
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
        class Payload
        {
            public Fix[] files;
            public Unresolved[] unresolved;
        }

        [Serializable]
        public class Fix
        {
            public string path;
            public string contents;
            public string change;
        }

        [Serializable]
        public class Unresolved
        {
            public string error;
            public string why;
        }
    }
}
