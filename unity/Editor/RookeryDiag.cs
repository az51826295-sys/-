// 진단 전용. 씬을 열어 렌더러마다 재질·셰이더·텍스처·크기를 적는다.
// 사진만 보고 추측하지 않으려고(23:26 분홍 조각·평평한 셔츠).
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Rookery
{
    public static class RookeryDiag
    {
        public static void DumpScene()
        {
            var scenes = EditorBuildSettings.scenes;
            var path = scenes.Length > 0 ? scenes[scenes.Length - 1].path : "";
            if (string.IsNullOrEmpty(path)) { Debug.Log("[Diag] 씬이 없다"); return; }
            var scene = EditorSceneManager.OpenScene(path, OpenSceneMode.Single);
            Debug.Log($"[Diag] 씬 {scene.name}, MSAA={QualitySettings.antiAliasing}, shadows={QualitySettings.shadows} dist={QualitySettings.shadowDistance}");
            foreach (var r in Object.FindObjectsByType<Renderer>(FindObjectsSortMode.None))
            {
                var mats = r.sharedMaterials;
                var b = r.bounds;
                var desc = string.Join(" | ", mats.Select(m => m == null ? "(null)" :
                    $"{m.name}<{(m.shader ? m.shader.name : "null")}> main={(m.HasProperty("_MainTex") && m.GetTexture("_MainTex") ? m.GetTexture("_MainTex").name : "-")} bump={(m.HasProperty("_BumpMap") && m.GetTexture("_BumpMap") ? m.GetTexture("_BumpMap").name : "-")} mg={(m.HasProperty("_MetallicGlossMap") && m.GetTexture("_MetallicGlossMap") ? m.GetTexture("_MetallicGlossMap").name : "-")} kw=[{string.Join(",", m.shaderKeywords)}]"));
                Debug.Log($"[Diag] {Path(r.transform)} {r.GetType().Name} pos={r.transform.position} size={b.size} :: {desc}");
            }
            foreach (var l in Object.FindObjectsByType<Light>(FindObjectsSortMode.None))
                Debug.Log($"[Diag] Light {l.name} {l.type} i={l.intensity} rot={l.transform.eulerAngles} shadows={l.shadows}");
            var cam = Camera.main;
            if (cam) Debug.Log($"[Diag] Camera pos={cam.transform.position} rot={cam.transform.eulerAngles} fov={cam.fieldOfView} near={cam.nearClipPlane} msaa={cam.allowMSAA}");
            foreach (var a in Object.FindObjectsByType<Animator>(FindObjectsSortMode.None))
                Debug.Log($"[Diag] Animator {a.name} ctrl={(a.runtimeAnimatorController ? a.runtimeAnimatorController.name : "null")} avatar={(a.avatar ? a.avatar.name + (a.avatar.isHuman ? "(human)" : "(generic)") : "null")} rootMotion={a.applyRootMotion} scale={a.transform.lossyScale}");
        }

        static string Path(Transform t) => t.parent == null ? t.name : Path(t.parent) + "/" + t.name;
    }
}
