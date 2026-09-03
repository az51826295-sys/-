// 씬 안에 **실제로** 무엇이 있는지 한 장으로 꺼낸다.
//
// 합격 기준을 표로 옮길 때 모델이 겨눌 이름이 필요하다. 그 이름을 안 주면
// 모델은 짐작한다 — 기준에 "열매" 라고 적혀 있으니 `Fruit` 이라고 쓰는데,
// 씬에는 `Apple_0` 이 있다. 그러면 시험이 떨어지고, 그건 게임이 틀린 것이
// 아니라 **표가 틀린** 것이다. 둘을 못 가르면 판정이 무의미해진다.
//
//     Unity.exe -batchmode -quit -nographics -projectPath <p> \
//       -executeMethod Rookery.RookeryScenePeek.Dump -rookeryPeekOut <json>
//
// 씬을 **열기만** 하고 아무것도 안 바꾼다. 저장하지 않는다.
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Rookery
{
    public static class RookeryScenePeek
    {
        [Serializable]
        public class Shape
        {
            public bool ok;
            public string error = "";
            public string scenePath = "";
            public string[] names = Array.Empty<string>();
            public string[] components = Array.Empty<string>();
        }

        public static void Dump()
        {
            var outPath = Arg("-rookeryPeekOut");
            var wanted = Arg("-rookeryScene");
            var shape = new Shape();

            try
            {
                var scenePath = Pick(wanted);
                if (string.IsNullOrEmpty(scenePath))
                {
                    shape.error = "빌드 설정에 씬이 없습니다.";
                }
                else
                {
                    var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                    shape.scenePath = scenePath;
                    var roots = scene.GetRootGameObjects();
                    var all = roots.SelectMany(r => r.GetComponentsInChildren<Transform>(true))
                                   .Select(t => t.gameObject)
                                   .ToList();
                    shape.names = all.Select(g => g.name).Distinct().OrderBy(n => n).ToArray();
                    shape.components = all
                        .SelectMany(g => g.GetComponents<Component>())
                        .Where(c => c != null)
                        .Select(c => c.GetType().Name)
                        .Distinct().OrderBy(n => n).ToArray();
                    shape.ok = true;
                }
            }
            catch (Exception e)
            {
                shape.error = e.GetType().Name + ": " + e.Message;
            }

            var json = JsonUtility.ToJson(shape, true);
            Debug.Log("ROOKERY_SCENE_SHAPE " + JsonUtility.ToJson(shape));
            if (!string.IsNullOrEmpty(outPath))
            {
                try
                {
                    var folder = Path.GetDirectoryName(outPath);
                    if (!string.IsNullOrEmpty(folder)) Directory.CreateDirectory(folder);
                    File.WriteAllText(outPath, json);
                }
                catch (Exception e)
                {
                    Debug.LogError("씬 목록을 못 썼습니다: " + e.Message);
                }
            }
            if (Application.isBatchMode) EditorApplication.Exit(shape.ok ? 0 : 1);
        }

        /// <summary>로키가 지은 씬은 빌드 설정 **끝에** 붙는다. 시험기와 같은 규칙을 쓴다.</summary>
        static string Pick(string wanted)
        {
            var count = SceneManager.sceneCountInBuildSettings;
            if (count == 0) return null;
            if (!string.IsNullOrEmpty(wanted))
            {
                for (var i = 0; i < count; i++)
                {
                    var p = SceneUtility.GetScenePathByBuildIndex(i);
                    if (p != null && p.ToLowerInvariant().Contains(wanted.ToLowerInvariant()))
                        return p;
                }
            }
            return SceneUtility.GetScenePathByBuildIndex(count - 1);
        }

        static string Arg(string name)
        {
            var args = Environment.GetCommandLineArgs();
            for (var i = 0; i < args.Length - 1; i++)
                if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase))
                    return args[i + 1];
            return null;
        }
    }
}
