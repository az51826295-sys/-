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
    /// 로키가 승인한 자산을 프로젝트로 가져온다.
    ///
    /// 사람이 브라우저에서 파일을 하나씩 저장해 끌어다 놓는 단계를 없애는 것이
    /// 목적이지만, 진짜 이유는 그 단계가 **기록을 끊기 때문**이다. 손으로 옮기면
    /// 게임 안의 그림과 로키 안의 그림이 언제부터 달랐는지 아무도 모른다. 여기서
    /// 가져오면 각 파일 옆에 어느 산출물에서 왔고 무엇으로 통과했는지가 같이 남는다.
    ///
    /// **승인된 것만 온다.** 검토 중이거나 떨어진 후보는 서버가 안 보낸다 —
    /// 게임에 들어가는 것과 매니저가 승인한 것이 같아야 하고, 그 둘이 어긋나면
    /// 승인이라는 절차가 아무 의미가 없다.
    /// </summary>
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

        [MenuItem("Window/Rookery/자산 가져오기")]
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
            _key = EditorGUILayout.PasswordField("열쇠", _key);
            _folder = EditorGUILayout.TextField("받을 폴더", _folder);

            EditorGUILayout.Space();
            using (new EditorGUI.DisabledScope(string.IsNullOrWhiteSpace(_key)))
            {
                if (GUILayout.Button("가져오기", GUILayout.Height(30)))
                {
                    Remember();
                    Fetch();
                }

                EditorGUILayout.Space(4);

                // 유니티에도 생성기가 있다. 거기서 뽑은 것을 그대로 게임에 넣으면
                // 로키를 거쳐 온 자산과 **다른 자로 잰 것**이 한 화면에 섞인다.
                // 그래서 어디서 만들었든 판정은 한 곳에서 받는다.
                var picked = Selection.objects;
                var count = 0;
                foreach (var o in picked) if (o is Texture2D) count++;

                using (new EditorGUI.DisabledScope(count == 0))
                {
                    if (GUILayout.Button(
                            count == 0
                                ? "판정할 스프라이트를 고르세요"
                                : $"고른 {count}장 판정하기",
                            GUILayout.Height(26)))
                    {
                        Remember();
                        JudgeSelection();
                    }
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

        void Remember()
        {
            EditorPrefs.SetString(UrlKey, _url);
            EditorPrefs.SetString(KeyKey, _key);
            EditorPrefs.SetString(FolderKey, _folder);
        }

        /// <summary>
        /// 프로젝트에서 고른 스프라이트를 로키 판정기로 보낸다.
        ///
        /// 유니티 생성기로 뽑았든 손으로 그렸든 상관없다 — 같은 자로 재야 화면이
        /// 한 세계가 된다.
        /// </summary>
        void JudgeSelection()
        {
            var images = new List<string>();
            foreach (var obj in Selection.objects)
            {
                if (obj is not Texture2D tex) continue;
                var path = AssetDatabase.GetAssetPath(tex);
                if (string.IsNullOrEmpty(path)) continue;
                // 원본 파일을 그대로 보낸다. 유니티가 임포트하며 압축·필터를
                // 걸어 둔 사본을 보내면, 재는 것이 원본이 아니라 임포트 설정이 된다.
                images.Add(Convert.ToBase64String(File.ReadAllBytes(path)));
            }

            if (images.Count == 0)
            {
                _status = "고른 것 중에 읽을 수 있는 텍스처가 없습니다.";
                return;
            }

            var payload = "{\"images\":[" +
                          string.Join(",", images.ConvertAll(b => "\"" + b + "\"")) +
                          "]}";
            var request = new UnityWebRequest(
                $"{_url.TrimEnd('/')}/api/unity/judge", "POST")
            {
                uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(payload)),
                downloadHandler = new DownloadHandlerBuffer(),
            };
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("x-rookery-key", _key);

            _status = $"{images.Count}장 판정 중…";
            Repaint();

            var op = request.SendWebRequest();
            op.completed += _ =>
            {
                if (request.result != UnityWebRequest.Result.Success)
                {
                    // 판정기에 못 닿은 것을 통과로 읽지 않는다. 미측정은 실패도
                    // 성공도 아니고, 그 구분이 사라지면 판정이 있으나 마나다.
                    _status = $"판정하지 못했습니다: {request.responseCode} {request.error}
" +
                              request.downloadHandler.text;
                    Repaint();
                    return;
                }
                _status = "판정 결과

" + request.downloadHandler.text;
                Repaint();
            };
        }

        void Fetch()
        {
            var request = UnityWebRequest.Get($"{_url.TrimEnd('/')}/api/unity/assets");
            request.SetRequestHeader("x-rookery-key", _key);

            _status = "가져오는 중…";
            Repaint();

            var op = request.SendWebRequest();
            op.completed += _ =>
            {
                if (request.result != UnityWebRequest.Result.Success)
                {
                    // 실패를 조용히 넘기지 않는다. 아무것도 안 들어왔는데 성공처럼
                    // 보이면, 다음에 게임이 옛 그림으로 도는 이유를 못 찾는다.
                    _status = $"실패: {request.responseCode} {request.error}\n{request.downloadHandler.text}";
                    Repaint();
                    return;
                }

                try
                {
                    var payload = JsonUtility.FromJson<Payload>(request.downloadHandler.text);
                    _status = Save(payload);
                }
                catch (Exception e)
                {
                    _status = $"응답을 읽지 못했습니다: {e.Message}";
                }
                Repaint();
            };
        }

        string Save(Payload payload)
        {
            if (payload.assets == null || payload.assets.Length == 0)
            {
                return "승인된 자산이 없습니다.\n" +
                       "로키에서 산출물을 승인하면 여기로 옵니다.";
            }

            Directory.CreateDirectory(_folder);
            var log = new StringBuilder();
            log.AppendLine($"{payload.company} — {payload.assets.Length}개");
            log.AppendLine();

            foreach (var a in payload.assets)
            {
                // data:image/png;base64,XXXX 에서 뒤쪽만 쓴다.
                var comma = a.image.IndexOf(',');
                var b64 = comma >= 0 ? a.image.Substring(comma + 1) : a.image;
                var bytes = Convert.FromBase64String(b64);

                var safe = string.Join("_", a.name.Split(Path.GetInvalidFileNameChars()));
                var path = Path.Combine(_folder, safe + ".png");
                File.WriteAllBytes(path, bytes);

                // 어디서 왔고 무엇으로 통과했는지를 파일 옆에 남긴다. 이게 없으면
                // 반년 뒤에 이 그림이 어느 판정을 통과한 것인지 알 방법이 없다.
                File.WriteAllText(
                    Path.Combine(_folder, safe + ".rookery.json"),
                    JsonUtility.ToJson(a, true));

                log.AppendLine($"· {safe}.png");
            }

            AssetDatabase.Refresh();
            log.AppendLine();
            log.AppendLine("픽셀 아트는 Import 설정에서 Filter Mode 를 Point,");
            log.AppendLine("Compression 을 None 으로 두어야 흐려지지 않습니다.");
            return log.ToString();
        }

        [Serializable]
        class Payload
        {
            public string company;
            public int count;
            public Asset[] assets;
        }

        [Serializable]
        class Asset
        {
            public string deliverableId;
            public string name;
            public string title;
            public string image;
            public string createdAt;
        }
    }
}
