// 승인된 텍스처를 씬에 입힌다. **이름으로 찾는다.**
//
// 09-01 에 쓰는 판에 "그림이 있으면 불러 쓰는 자리를 만들어라"고 계약을 줬는데,
// 만들어진 코드에는 그 자리가 없었다. 문구는 프롬프트에 그대로 실려 갔고 모델이
// 안 썼다. 계약을 고쳐 다시 시켜 볼 수도 있지만, **매번 지켜졌는지 확인해야 하는
// 자리를 하나 더 만드는 셈**이다.
//
// 그래서 자리를 코드가 아니라 **이름**으로 잡는다. 씬 빌더는 물체에 이름을
// 붙인다(`Ground`, `Player`, `Trunk`, `Crown`, `NPC`, `Rock`, `Box`). 그 이름으로
// `<울타리>Textures/<이름>.png` 를 찾아 재질에 입힌다. 생성된 코드가 협조하든
// 안 하든 된다.
//
// ## 없으면 아무것도 안 한다
//
// 파일이 없는 자리는 건드리지 않는다. 프로토타입은 도형과 단색으로 그대로 돈다 —
// 그게 프로토타입 우선의 뜻이다.
//
// ## 이 파일은 울타리 밖에 둔다
//
// `Assets/Editor/` 에 놓는다. 로키가 쓰는 폴더(`Assets/Rookery/`) 안에 두면 다음
// 판에 덮어써질 수 있고, 그러면 자리를 잡아 주는 도구가 자리에 따라 사라진다.
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Rookery.EditorTools
{
    public static class RookeryArtBinder
    {
        const string TextureFolder = "Assets/Rookery/Textures";

        [MenuItem("Window/Rookery/승인된 텍스처를 씬에 입히기")]
        public static void BindMenu()
        {
            var report = Bind();
            if (report.applied == 0 && report.missing.Count > 0)
                Debug.LogWarning("[Rookery] " + report);
            else
                Debug.Log("[Rookery] " + report);
        }

        /// <summary>배치모드에서 부르는 자리. `-executeMethod` 로 온다.</summary>
        public static void BindBatch()
        {
            var report = Bind();
            Debug.Log("ROOKERY_ART_BIND " + report);
            if (Application.isBatchMode) EditorApplication.Exit(0);
        }

        public class Report
        {
            public int applied;
            public int textures;
            public readonly List<string> missing = new();
            public override string ToString() =>
                textures == 0
                    ? $"{TextureFolder} 에 텍스처가 없습니다 — 입힐 것이 없습니다."
                    : $"텍스처 {textures}장 중 {applied}곳에 입혔습니다." +
                      (missing.Count > 0
                          ? " 이름이 맞는 물체를 못 찾은 것: " + string.Join(", ", missing)
                          : "");
        }

        public static Report Bind()
        {
            var report = new Report();
            if (!AssetDatabase.IsValidFolder(TextureFolder)) return report;

            var byName = new Dictionary<string, Texture2D>(System.StringComparer.OrdinalIgnoreCase);
            foreach (var path in Directory.GetFiles(TextureFolder, "*.png"))
            {
                var assetPath = path.Replace("\\", "/");
                var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(assetPath);
                if (tex != null) byName[Path.GetFileNameWithoutExtension(assetPath)] = tex;
            }
            report.textures = byName.Count;
            if (report.textures == 0) return report;

            var scene = EditorSceneManager.GetActiveScene();
            var renderers = scene.GetRootGameObjects()
                .SelectMany(r => r.GetComponentsInChildren<Renderer>(true))
                .ToArray();

            foreach (var pair in byName)
            {
                // 이름이 같은 물체 **전부**에 입힌다. 나무가 여럿이면 줄기도 여럿이다.
                var targets = renderers
                    .Where(r => string.Equals(r.gameObject.name, pair.Key,
                        System.StringComparison.OrdinalIgnoreCase))
                    .ToArray();
                if (targets.Length == 0)
                {
                    // 못 찾은 것을 조용히 넘기지 않는다. 그러면 "입혔다"는 말이
                    // 몇 장에 대한 것인지 알 수 없어진다.
                    report.missing.Add(pair.Key);
                    continue;
                }

                foreach (var r in targets)
                {
                    // 공유 재질을 바꾸면 프로젝트의 다른 씬까지 물든다. 이 씬의
                    // 이 물체만 바꾸도록 새 재질을 만들어 붙인다.
                    var source = r.sharedMaterial;
                    var mat = source != null
                        ? new Material(source)
                        : new Material(Shader.Find("Universal Render Pipeline/Lit")
                                       ?? Shader.Find("Standard"));
                    mat.name = pair.Key + "_Rookery";
                    if (mat.HasProperty("_BaseMap")) mat.SetTexture("_BaseMap", pair.Value);
                    if (mat.HasProperty("_MainTex")) mat.SetTexture("_MainTex", pair.Value);
                    r.sharedMaterial = mat;
                    report.applied++;
                }
            }

            if (report.applied > 0)
            {
                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);
            }
            return report;
        }
    }
}
