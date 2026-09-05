// URP + 후처리를 코드로 켠다. 사람 손 0회.
//
// 2026-09-05 23:26 사장님: "유니티 엔진에 Meshy-6 쓰면서 이 정도 퀄리티인 게 말이 돼?
// … 화질이 부족해." 시험 프로젝트가 Built-in 이라 안티앨리어싱·톤매핑·블룸·AO 가
// 하나도 없었다. 어떤 캐릭터도 그 상태로는 게임 화면처럼 안 보인다.
//
// 이 파일은 URP 가 **없는** 프로젝트에서도 컴파일돼야 한다(있어야 설치를 시작할 수
// 있으니까). 그래서 URP 타입을 직접 쓰지 않고 리플렉션·SerializedObject 로만 만진다.
//
// 두 단계: ① 패키지 넣기(리로드가 온다) → ② 파이프라인 자산·후처리·변환기.
// 창에서는 SessionState 표시로 이어지고, 배치에서는 두 번 실행한다.
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace Rookery
{
    public static class RookeryRender
    {
        const string Package = "com.unity.render-pipelines.universal";
        const string Folder = "Assets/Rookery/Render";
        const string ContinueKey = "Rookery.Render.Continue";

        public static bool UrpInstalled =>
            Type.GetType("UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset, Unity.RenderPipelines.Universal.Runtime") != null;

        public static bool UrpActive => GraphicsSettings.defaultRenderPipeline != null;

        /// 창 버튼. 없으면 넣고(리로드 뒤 이어서), 있으면 바로 설정한다.
        public static string EnableUrpWithPostProcessing()
        {
            if (!UrpInstalled)
            {
                SessionState.SetBool(ContinueKey, true);
                var req = Client.Add(Package);
                // 배치에서는 여기서 기다려야 한다 — 리로드가 오면 정적 생성자가 이어 받는다.
                var until = DateTime.Now.AddMinutes(5);
                while (!req.IsCompleted && DateTime.Now < until) System.Threading.Thread.Sleep(200);
                if (req.Status == StatusCode.Failure) return "URP 패키지를 못 넣었다: " + req.Error?.message;
                return "URP 패키지를 넣었다 — 컴파일이 끝나면 이어서 설정한다.";
            }
            return Configure();
        }

        [InitializeOnLoadMethod]
        static void ContinueAfterReload()
        {
            if (!SessionState.GetBool(ContinueKey, false)) return;
            if (!UrpInstalled) return; // 아직 리로드 전
            SessionState.EraseBool(ContinueKey);
            EditorApplication.delayCall += () =>
            {
                Debug.Log("[Rookery] " + Configure());
                if (Application.isBatchMode) EditorApplication.Exit(0);
            };
        }

        /// 배치 입구: Unity -batchmode -executeMethod Rookery.RookeryRender.EnableUrpHeadless
        /// 패키지가 없으면 넣고 리로드 뒤 이어서 설정하고 끝난다. 있으면 바로 설정하고 끝난다.
        public static void EnableUrpHeadless()
        {
            var r = EnableUrpWithPostProcessing();
            Debug.Log("[Rookery] " + r);
            if (UrpInstalled && Application.isBatchMode) EditorApplication.Exit(0);
        }

        /// URP 자산·렌더러·후처리 Volume 을 만들고, 품질 단계마다 배정하고, 재질을 바꾼다.
        public static string Configure()
        {
            if (!UrpInstalled) return "URP 가 아직 없다.";
            var log = new System.Text.StringBuilder();
            Directory.CreateDirectory(Folder);

            // ── 렌더러 데이터 + 파이프라인 자산 ──
            var rendererType = Type.GetType("UnityEngine.Rendering.Universal.UniversalRendererData, Unity.RenderPipelines.Universal.Runtime");
            var assetType = Type.GetType("UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset, Unity.RenderPipelines.Universal.Runtime");
            var rendererPath = $"{Folder}/RookeryRenderer.asset";
            var assetPath = $"{Folder}/RookeryURP.asset";
            var rendererData = AssetDatabase.LoadAssetAtPath<ScriptableObject>(rendererPath);
            if (rendererData == null)
            {
                rendererData = ScriptableObject.CreateInstance(rendererType);
                AssetDatabase.CreateAsset(rendererData, rendererPath);
            }
            var pipeline = AssetDatabase.LoadAssetAtPath<RenderPipelineAsset>(assetPath);
            if (pipeline == null)
            {
                var create = assetType.GetMethod("Create", new[] { Type.GetType("UnityEngine.Rendering.Universal.ScriptableRendererData, Unity.RenderPipelines.Universal.Runtime") });
                pipeline = (RenderPipelineAsset)create.Invoke(null, new object[] { rendererData });
                AssetDatabase.CreateAsset(pipeline, assetPath);
            }
            // MSAA 4x, HDR, 그림자 거리 50, 부드러운 그림자, 캐스케이드 4.
            var so = new SerializedObject(pipeline);
            Set(so, "m_MSAA", 4);
            Set(so, "m_SupportsHDR", true);
            Set(so, "m_ShadowDistance", 50f);
            Set(so, "m_SoftShadowsSupported", true);
            Set(so, "m_ShadowCascadeCount", 4);
            Set(so, "m_MainLightShadowmapResolution", 4096);
            Set(so, "m_ColorGradingMode", 1); // HDR grading
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(pipeline);

            GraphicsSettings.defaultRenderPipeline = pipeline;
            var names = QualitySettings.names;
            var current = QualitySettings.GetQualityLevel();
            for (var i = 0; i < names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                QualitySettings.renderPipeline = pipeline;
            }
            QualitySettings.SetQualityLevel(current, false);
            log.AppendLine("✓ URP 자산 배정 (MSAA 4, HDR, 그림자 50 m/4096/4단)");

            // ── 후처리 Volume 프로필: ACES 톤매핑, 블룸, 비네트, 색 보정 ──
            var profilePath = $"{Folder}/RookeryPost.asset";
            var profileType = Type.GetType("UnityEngine.Rendering.VolumeProfile, Unity.RenderPipelines.Core.Runtime");
            var profile = AssetDatabase.LoadAssetAtPath<ScriptableObject>(profilePath);
            if (profile == null)
            {
                profile = ScriptableObject.CreateInstance(profileType);
                AssetDatabase.CreateAsset(profile, profilePath);
            }
            AddOverride(profile, profileType, "Tonemapping", ("mode", 2)); // ACES
            // 블룸 문턱 1.0 이면 흰 옷이 조금만 밝아도 번진다(00:58). 1.25 로.
            AddOverride(profile, profileType, "Bloom", ("intensity", 0.25f), ("threshold", 1.25f));
            AddOverride(profile, profileType, "Vignette", ("intensity", 0.22f));
            AddOverride(profile, profileType, "ColorAdjustments", ("contrast", 12f), ("saturation", 8f));
            EditorUtility.SetDirty(profile);
            log.AppendLine("✓ 후처리 프로필 (ACES·블룸·비네트·색 보정)");

            // ── 씬: 전역 Volume + 카메라 후처리 켜기 ──
            var scenes = EditorBuildSettings.scenes;
            if (scenes.Length > 0)
            {
                var scene = EditorSceneManager.OpenScene(scenes[scenes.Length - 1].path, OpenSceneMode.Single);
                log.AppendLine(ApplyToOpenScene());
                EditorSceneManager.SaveScene(scene);
            }

            // ── Built-in 재질을 URP 로 (공식 변환기, 배치용 입구) ──
            try
            {
                var converters = Type.GetType("UnityEditor.Rendering.Universal.Converters, Unity.RenderPipelines.Universal.Editor");
                var run = converters?.GetMethod("RunInBatchMode", new[] { typeof(string) });
                run?.Invoke(null, new object[] { "Built-in to URP" });
                log.AppendLine("✓ 재질 변환(Built-in → URP)");
            }
            catch (Exception e) { log.AppendLine("! 재질 변환 실패: " + e.Message); }

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            return log.ToString().TrimEnd();
        }

        /// 지금 열린 씬에 전역 Volume(후처리 프로필)과 카메라 후처리·SMAA 를 씌운다.
        /// Dev 의 씬 빌더는 씬을 매번 새로 짓는다 — 지은 뒤마다 이것을 다시 부른다.
        public static string ApplyToOpenScene()
        {
            if (!UrpInstalled || !UrpActive) return "URP 가 꺼져 있어 씬 후처리를 건너뜀";
            var profile = AssetDatabase.LoadAssetAtPath<ScriptableObject>($"{Folder}/RookeryPost.asset");
            if (profile == null) return "후처리 프로필이 없다 — 먼저 'URP + 후처리 켜기'";
            var volumeType = Type.GetType("UnityEngine.Rendering.Volume, Unity.RenderPipelines.Core.Runtime");
            var existing = UnityEngine.Object.FindObjectsByType(volumeType, FindObjectsSortMode.None);
            Component volume = existing.Length > 0 ? (Component)existing[0] : new GameObject("Rookery Post").AddComponent(volumeType);
            var vso = new SerializedObject(volume);
            if (vso.FindProperty("m_IsGlobal") != null) Set(vso, "m_IsGlobal", true); else if (vso.FindProperty("isGlobal") != null) Set(vso, "isGlobal", true);
            vso.FindProperty("sharedProfile").objectReferenceValue = profile;
            vso.ApplyModifiedPropertiesWithoutUndo();

            var cams = 0;
            foreach (var cam in UnityEngine.Object.FindObjectsByType<Camera>(FindObjectsSortMode.None))
            {
                var dataType = Type.GetType("UnityEngine.Rendering.Universal.UniversalAdditionalCameraData, Unity.RenderPipelines.Universal.Runtime");
                var data = cam.GetComponent(dataType) ?? cam.gameObject.AddComponent(dataType);
                var cso = new SerializedObject(data);
                Set(cso, "m_RenderPostProcessing", true);
                Set(cso, "m_Antialiasing", 2); // SMAA
                Set(cso, "m_AntialiasingQuality", 2);
                cso.ApplyModifiedPropertiesWithoutUndo();
                cam.allowHDR = true;
                cams++;
            }
            // Built-in 셰이더로 만든 재질은 URP 에서 분홍이다(23:54 사진 전체가 분홍).
            // Dev 의 빌더가 지을 때마다 새로 만드니 변환기(자산용)로는 못 잡는다 — 씬의
            // 렌더러를 돌며 바꾼다. 이름이 다른 속성은 옮긴다.
            var swapped = UpgradeSceneMaterials();
            var sc = EditorSceneManager.GetActiveScene();
            if (sc.isDirty) EditorSceneManager.SaveScene(sc);
            return $"✓ 씬 {sc.name}: 전역 Volume + 카메라 {cams}대 후처리·SMAA + 재질 {swapped}개 URP 로";
        }

        static int UpgradeSceneMaterials()
        {
            var lit = Shader.Find("Universal Render Pipeline/Lit");
            var particle = Shader.Find("Universal Render Pipeline/Particles/Unlit");
            if (lit == null) return 0;
            var n = 0;
            foreach (var r in UnityEngine.Object.FindObjectsByType<Renderer>(FindObjectsSortMode.None))
            {
                var mats = r.sharedMaterials;
                var changed = false;
                for (var i = 0; i < mats.Length; i++)
                {
                    var m = mats[i];
                    if (m == null) { if (r is ParticleSystemRenderer && particle != null) { mats[i] = new Material(particle); changed = true; n++; } continue; }
                    var name = m.shader ? m.shader.name : "";
                    if (name.StartsWith("Universal Render Pipeline/")) continue;
                    if (name == "Hidden/InternalErrorShader" || name == "Standard" || name.StartsWith("Legacy Shaders/") || name.StartsWith("Particles/"))
                    {
                        var isParticle = r is ParticleSystemRenderer;
                        var target = isParticle && particle != null ? particle : lit;
                        var color = m.HasProperty("_Color") ? m.GetColor("_Color") : Color.white;
                        var tex = m.HasProperty("_MainTex") ? m.GetTexture("_MainTex") : null;
                        var metallic = m.HasProperty("_Metallic") ? m.GetFloat("_Metallic") : 0f;
                        var smooth = m.HasProperty("_Glossiness") ? m.GetFloat("_Glossiness") : 0.3f;
                        var bump = m.HasProperty("_BumpMap") ? m.GetTexture("_BumpMap") : null;
                        var mg = m.HasProperty("_MetallicGlossMap") ? m.GetTexture("_MetallicGlossMap") : null;
                        m.shader = target;
                        if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", color);
                        if (m.HasProperty("_BaseMap")) m.SetTexture("_BaseMap", tex);
                        if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metallic);
                        if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smooth);
                        if (bump != null && m.HasProperty("_BumpMap")) { m.SetTexture("_BumpMap", bump); m.EnableKeyword("_NORMALMAP"); }
                        if (mg != null && m.HasProperty("_MetallicGlossMap")) { m.SetTexture("_MetallicGlossMap", mg); m.EnableKeyword("_METALLICSPECGLOSSMAP"); }
                        EditorUtility.SetDirty(m);
                        n++;
                    }
                }
                if (changed) r.sharedMaterials = mats;
            }
            return n;
        }

        static void Set(SerializedObject so, string name, object value)
        {
            var p = so.FindProperty(name);
            if (p == null) { Debug.LogWarning($"[Rookery] 필드 없음: {name}"); return; }
            switch (value)
            {
                case bool b: p.boolValue = b; break;
                case int i: if (p.propertyType == SerializedPropertyType.Enum) p.enumValueIndex = Math.Min(i, Math.Max(0, p.enumNames.Length - 1)); else p.intValue = i; break;
                case float f: p.floatValue = f; break;
            }
        }

        /// VolumeProfile.Add(Type) 로 컴포넌트를 넣고, 파라미터의 m_OverrideState/m_Value 를 채운다.
        static void AddOverride(ScriptableObject profile, Type profileType, string componentName, params (string field, object value)[] values)
        {
            var compType = Type.GetType($"UnityEngine.Rendering.Universal.{componentName}, Unity.RenderPipelines.Universal.Runtime");
            if (compType == null) { Debug.LogWarning("[Rookery] 후처리 타입 없음: " + componentName); return; }
            var has = profileType.GetMethod("Has", new[] { typeof(Type) });
            var add = profileType.GetMethod("Add", new[] { typeof(Type), typeof(bool) });
            // TryGet(Type, out VolumeComponent) — out 의 타입이 VolumeComponent 라 이름과 인자 수로 찾는다.
            var tryGet = profileType.GetMethods().FirstOrDefault(m => m.Name == "TryGet" && !m.IsGenericMethod
                && m.GetParameters().Length == 2 && m.GetParameters()[0].ParameterType == typeof(Type));
            UnityEngine.Object comp;
            if (!(bool)has.Invoke(profile, new object[] { compType }))
                comp = (UnityEngine.Object)add.Invoke(profile, new object[] { compType, false });
            else if (tryGet != null)
            {
                var args = new object[] { compType, null };
                tryGet.Invoke(profile, args);
                comp = (UnityEngine.Object)args[1];
            }
            else
            {
                // 못 찾으면 프로필의 components 목록에서 직접.
                var list = (System.Collections.IList)profileType.GetField("components").GetValue(profile);
                comp = list.Cast<UnityEngine.Object>().FirstOrDefault(c => c != null && c.GetType() == compType);
            }
            if (comp == null) return;
            var so = new SerializedObject(comp);
            Set(so, "active", true);
            foreach (var (field, value) in values)
            {
                var ov = so.FindProperty($"{field}.m_OverrideState");
                if (ov != null) ov.boolValue = true;
                var v = so.FindProperty($"{field}.m_Value");
                if (v == null) { Debug.LogWarning($"[Rookery] {componentName}.{field} 없음"); continue; }
                switch (value)
                {
                    case int i: if (v.propertyType == SerializedPropertyType.Enum) v.enumValueIndex = i; else v.intValue = i; break;
                    case float f: v.floatValue = f; break;
                    case bool b: v.boolValue = b; break;
                }
            }
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(comp);
        }
    }
}
