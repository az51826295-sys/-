using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;

namespace Rookery
{
    /// <summary>
    /// 원하는 스크립트를 말로 요청해 받는다.
    ///
    /// 로키는 코드를 실행하지 않는다 — 실행하면 회사의 모든 열쇠가 그 코드 안에
    /// 놓이기 때문이다. 그래서 로키가 낸 코드는 다른 곳에서는 "파싱은 됩니다"
    /// 까지만 말할 수 있다.
    ///
    /// 여기서는 다르다. 파일을 프로젝트에 쓰면 **유니티가 몇 초 뒤에 컴파일한다.**
    /// 그것이 진짜 판정이고, 오류가 나면 "컴파일 오류 고치기" 창으로 그대로
    /// 돌아간다. 로키가 아무것도 실행하지 않고도 검증 고리가 닫히는 자리다.
    ///
    /// 파일은 자동으로 쓰지 않는다. 무엇이 어디에 생기는지 보여 주고, 파일마다
    /// 따로 누른다 — 한 번에 다 적용하는 버튼을 두면 확인하지 않고 누르게 되고,
    /// 그러면 보여 준 의미가 없다.
    /// </summary>
    public class RookeryBuilder : EditorWindow
    {
        const string UrlKey = "Rookery.Url";
        const string KeyKey = "Rookery.Key";

        string _url = "https://rookery-web-production.up.railway.app";
        string _key = "";
        string _want = "";
        string _status = "";
        Vector2 _scroll;

        Built _built;

        [MenuItem("Window/Rookery/스크립트 만들기")]
        static void Open() => GetWindow<RookeryBuilder>("Rookery 만들기");

        void OnEnable()
        {
            _url = EditorPrefs.GetString(UrlKey, _url);
            _key = EditorPrefs.GetString(KeyKey, "");
        }

        void OnGUI()
        {
            _url = EditorGUILayout.TextField("주소", _url);
            _key = EditorGUILayout.PasswordField("열쇠", _key);

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("무엇을 만들까요?", EditorStyles.boldLabel);
            EditorGUILayout.LabelField(
                "동작·수치·어디에 붙일지까지 적을수록 정확해집니다.",
                EditorStyles.wordWrappedMiniLabel);
            _want = EditorGUILayout.TextArea(_want, GUILayout.Height(70));

            using (new EditorGUI.DisabledScope(
                       string.IsNullOrWhiteSpace(_key) ||
                       string.IsNullOrWhiteSpace(_want)))
            {
                if (GUILayout.Button("만들어 달라기", GUILayout.Height(28)))
                {
                    EditorPrefs.SetString(UrlKey, _url);
                    EditorPrefs.SetString(KeyKey, _key);
                    Request();
                }
            }

            _scroll = EditorGUILayout.BeginScrollView(_scroll);

            if (!string.IsNullOrEmpty(_status))
            {
                EditorGUILayout.HelpBox(_status, MessageType.None);
            }

            if (_built != null)
            {
                EditorGUILayout.Space();
                EditorGUILayout.LabelField(_built.title, EditorStyles.boldLabel);

                if (_built.criteria != null && _built.criteria.Length > 0)
                {
                    EditorGUILayout.Space(4);
                    EditorGUILayout.LabelField("합격 기준 (코드보다 먼저 쓰였습니다)",
                                               EditorStyles.miniBoldLabel);
                    foreach (var c in _built.criteria)
                    {
                        EditorGUILayout.LabelField(
                            "· " + c.when + " → " + c.then,
                            EditorStyles.wordWrappedMiniLabel);
                    }
                }

                if (!string.IsNullOrEmpty(_built.setup))
                {
                    EditorGUILayout.Space(4);
                    EditorGUILayout.LabelField("씬에서 할 것", EditorStyles.miniBoldLabel);
                    EditorGUILayout.LabelField(_built.setup,
                                               EditorStyles.wordWrappedMiniLabel);
                }

                if (_built.humanGate != null && _built.humanGate.Length > 0)
                {
                    EditorGUILayout.Space(4);
                    EditorGUILayout.LabelField("잴 수 없어 사람이 볼 것",
                                               EditorStyles.miniBoldLabel);
                    foreach (var h in _built.humanGate)
                    {
                        EditorGUILayout.LabelField("? " + h,
                                                   EditorStyles.wordWrappedMiniLabel);
                    }
                }

                EditorGUILayout.Space();
                foreach (var f in _built.files)
                {
                    EditorGUILayout.LabelField(f.path, EditorStyles.boldLabel);
                    EditorGUILayout.LabelField(f.purpose,
                                               EditorStyles.wordWrappedMiniLabel);

                    var exists = File.Exists(f.path);
                    if (exists)
                    {
                        // 덮어쓰는지 새로 만드는지 말해 준다. 있는 파일을 조용히
                        // 갈아 끼우면, 손으로 고쳐 둔 것이 사라진 줄도 모른다.
                        EditorGUILayout.HelpBox(
                            "이미 있는 파일입니다. 적용하면 덮어쓰고 원본은 " +
                            "*.before-rookery 로 남습니다.", MessageType.Warning);
                    }

                    if (GUILayout.Button(
                            (exists ? "덮어쓰기: " : "만들기: ") + Path.GetFileName(f.path),
                            GUILayout.Width(280)))
                    {
                        Apply(f);
                    }
                    EditorGUILayout.Space(6);
                }
            }

            EditorGUILayout.EndScrollView();
        }

        void Request()
        {
            var payload = "{\"want\":" + Quote(_want) +
                          ",\"unityVersion\":" + Quote(Application.unityVersion) + "}";

            var request = new UnityWebRequest(
                _url.TrimEnd('/') + "/api/unity/build", "POST")
            {
                uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(payload)),
                downloadHandler = new DownloadHandlerBuffer(),
            };
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("x-rookery-key", _key);

            _status = "만드는 중… (한참 걸릴 수 있습니다)";
            _built = null;
            Repaint();

            var op = request.SendWebRequest();
            op.completed += _ =>
            {
                if (request.result != UnityWebRequest.Result.Success)
                {
                    _status = "실패: " + request.responseCode + " " + request.error
                              + "\n" + request.downloadHandler.text;
                    Repaint();
                    return;
                }
                try
                {
                    _built = JsonUtility.FromJson<Built>(request.downloadHandler.text);
                    _status = _built.note;
                }
                catch (Exception e)
                {
                    _status = "응답을 읽지 못했습니다: " + e.Message;
                }
                Repaint();
            };
        }

        void Apply(BuiltFile f)
        {
            // 프로젝트 밖으로 나가는 경로는 쓰지 않는다. 모델이 낸 경로를 그대로
            // 믿고 파일을 쓰면, 상위 디렉터리를 타고 나가는 경로 하나로 프로젝트
            // 밖의 파일을 덮어쓸 수 있다.
            var path = f.path.Replace('\\', '/');
            if (!path.StartsWith("Assets/") || path.Contains(".."))
            {
                _status = "경로가 Assets/ 안이 아닙니다: " + f.path;
                return;
            }

            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

            if (File.Exists(path))
            {
                var backup = path + ".before-rookery";
                if (!File.Exists(backup)) File.Copy(path, backup);
            }

            File.WriteAllText(path, f.contents);
            AssetDatabase.Refresh();
            _status = path + " 저장. 유니티가 컴파일합니다 — 오류가 나면 " +
                      "Window → Rookery → 컴파일 오류 고치기 로 보내십시오.";
        }

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
        class Built
        {
            public string title;
            public Criterion[] criteria;
            public BuiltFile[] files;
            public string setup;
            public string[] humanGate;
            public string note;
        }

        [Serializable]
        public class Criterion
        {
            public string id;
            public string when;
            public string then;
        }

        [Serializable]
        public class BuiltFile
        {
            public string path;
            public string contents;
            public string purpose;
        }
    }
}
