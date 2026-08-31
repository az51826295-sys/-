// 유니티 AI 생성기를 로키가 부르는 자리.
//
// `com.unity.ai.generators` 는 에디터 창 안에서 사람이 쓰는 물건으로 알려져
// 있었지만, 패키지 안에 **문서화된 공개 API** 가 있다:
//
//     Unity.AI.Generators.Tools.AssetGenerators.GenerateAsync(parameters, token)
//     "Provides a simplified, high-level API for the Unity AI Assistant to generate assets."
//
// 유니티 어시스턴트가 쓰라고 만들어 둔 문인데, 우리도 같은 문으로 들어간다.
//
// ## 이 파일이 여는 것과 안 여는 것
//
// 여는 것: 그림(Sprite/Image) · **메시(GameObject)** · 소리 · 재질 · 애니메이션.
// 3D 를 하겠다면 메시가 그 자리다 — GPT 로는 못 만드는 것이고, 유니티 생성기의
// 본령이기도 하다.
//
// 안 여는 것: **판정.** 유니티가 만든 것도 우리 자로 잰다. 만드는 곳이 재는 곳을
// 겸하면 계측기가 두 벌이 되고, 두 벌은 언젠가 서로 다른 답을 낸다.
//
// ## 배치모드에서 도는가 — 아직 모른다
//
// 이 API 는 비동기이고, 생성은 유니티 클라우드에 로그인된 계정과 AI Points 를
// 쓴다. 배치모드(창 없이)에서 그 둘이 되는지는 **확인된 적이 없다.** 그래서
// 이 파일은 두 길을 다 낸다: 메뉴(창이 열려 있을 때)와 CLI(배치모드). 어느
// 쪽이 되는지는 돌려 봐야 알고, 그것이 `tools/unity_ai_probe.py` 가 하는 일이다.
//
// **`-quit` 와 같이 쓰지 마라.** `-executeMethod` 가 돌아오는 순간 유니티가
// 꺼지는데, 이 일은 비동기라 그때 아직 안 끝나 있다. 끝나면 우리가 끈다.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Unity.AI.Generators.Tools;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Rookery.AI
{
    /// <summary>무엇을 만들라는 주문. 심부름꾼이 JSON 으로 준다.</summary>
    [Serializable]
    public class RookeryAiJob
    {
        /// <summary>sprite · image · mesh · sound · material · animation</summary>
        public string kind = "sprite";
        public string prompt = "";
        /// <summary>Assets/ 아래. 비우면 임시 자산으로 만들어진다.</summary>
        public string savePath = "";
        /// <summary>0 이면 기본값. 유니티 문서상 지정하려면 modelId 도 있어야 한다.</summary>
        public int width;
        public int height;
        public bool removeBackground = true;
        public float seconds = 3f;
        public string modelId = "";
        /// <summary>
        /// 이 주문에 쓸 수 있는 AI Points 상한. 견적이 이보다 크면 **만들지 않고
        /// 거절한다.** 유니티가 견적을 먼저 주기 때문에 쓸 수 있는 자리다 —
        /// 우리 지출 한도와 같은 규율이고, 없으면 포인트는 조용히 녹는다.
        /// 0 이면 상한 없음.
        /// </summary>
        public long maxPoints;
        /// <summary>초. 넘으면 실패로 적고 끝낸다.</summary>
        public int timeoutSeconds = 300;
    }

    /// <summary>돌려주는 것. 성공만이 아니라 **왜 안 됐는지**도 여기 적힌다.</summary>
    [Serializable]
    public class RookeryAiResult
    {
        public bool ok;
        public string kind = "";
        /// <summary>실제로 저장된 자산 경로. 못 만들었으면 비어 있다.</summary>
        public string assetPath = "";
        /// <summary>유니티가 매긴 값. 0 은 "공짜"가 아니라 "못 읽었다"일 수 있다.</summary>
        public long pointCost;
        public string[] messages = Array.Empty<string>();
        public string error = "";
        public bool batchmode;
        public double seconds;
    }

    public static class RookeryUnityAI
    {
        /// <summary>
        /// 한 장(또는 한 덩이) 만든다.
        ///
        /// 던지지 않는다. 실패도 결과로 돌려준다 — 부르는 쪽이 예외를 잡느냐
        /// 마느냐에 따라 "못 만들었다"가 사라지면 안 된다.
        /// </summary>
        public static async Task<RookeryAiResult> GenerateAsync(
            RookeryAiJob job,
            CancellationToken token = default)
        {
            var startedAt = DateTime.UtcNow;
            var result = new RookeryAiResult
            {
                kind = job.kind,
                batchmode = Application.isBatchMode,
            };

            try
            {
                if (string.IsNullOrWhiteSpace(job.prompt))
                    throw new ArgumentException("prompt 가 비어 있습니다.");

                EnsureFolder(job.savePath);

                var handle = Dispatch(job, token);

                // 견적을 먼저 본다. 유니티가 만들기 전에 값을 알려 주는 자리가
                // 있어서, 우리 지출 한도와 같은 규율을 여기에도 건다.
                await handle.ValidationTask;
                result.pointCost = handle.PointCost;
                if (job.maxPoints > 0 && handle.PointCost > job.maxPoints)
                {
                    result.error =
                        $"견적 {handle.PointCost} 포인트 > 상한 {job.maxPoints} 포인트. 만들지 않았습니다.";
                    result.messages = Snapshot(handle.Messages);
                    return result;
                }

                var asset = await handle.DownloadTask;

                result.pointCost = handle.PointCost;
                result.messages = Snapshot(handle.Messages);

                if (asset == null)
                {
                    // 메시지가 비어 있는 실패가 제일 나쁘다. 그때는 그렇게 적는다 —
                    // 빈 것을 성공으로 읽으면, 못 볼수록 잘 통과한다.
                    result.error = result.messages.Length > 0
                        ? string.Join(" / ", result.messages)
                        : "만들어진 자산이 없습니다(이유가 안 실려 왔습니다).";
                    return result;
                }

                result.assetPath = AssetDatabase.GetAssetPath(asset);
                result.ok = !string.IsNullOrEmpty(result.assetPath);
                if (!result.ok)
                    result.error = "자산은 생겼는데 프로젝트 경로가 없습니다(임시 자산).";
            }
            catch (Exception e)
            {
                result.error = e.GetType().Name + ": " + e.Message;
            }
            finally
            {
                result.seconds = (DateTime.UtcNow - startedAt).TotalSeconds;
            }

            return result;
        }

        /// <summary>주문 종류에 따라 설정을 갈라 준다. 여기 없는 종류는 거절한다.</summary>
        static GenerationHandle<Object> Dispatch(RookeryAiJob job, CancellationToken token)
        {
            var modelId = string.IsNullOrWhiteSpace(job.modelId) ? null : job.modelId;
            var savePath = string.IsNullOrWhiteSpace(job.savePath) ? null : job.savePath;

            switch ((job.kind ?? "").ToLowerInvariant())
            {
                case "sprite":
                    return AssetGenerators.GenerateAsync(
                        new GenerationParameters<SpriteSettings>
                        {
                            AssetType = typeof(Texture2D),
                            Prompt = job.prompt,
                            SavePath = savePath,
                            ModelId = modelId,
                            Settings = new SpriteSettings
                            {
                                Width = job.width,
                                Height = job.height,
                                RemoveBackground = job.removeBackground,
                            },
                        }, token);

                case "image":
                    return AssetGenerators.GenerateAsync(
                        new GenerationParameters<ImageSettings>
                        {
                            AssetType = typeof(Texture2D),
                            Prompt = job.prompt,
                            SavePath = savePath,
                            ModelId = modelId,
                            Settings = new ImageSettings
                            {
                                Width = job.width,
                                Height = job.height,
                                RemoveBackground = job.removeBackground,
                            },
                        }, token);

                // 3D. GPT 로는 못 만드는 것이고, 이 도구의 본령이다.
                case "mesh":
                    return AssetGenerators.GenerateAsync(
                        new GenerationParameters<MeshSettings>
                        {
                            AssetType = typeof(GameObject),
                            Prompt = job.prompt,
                            SavePath = savePath,
                            ModelId = modelId,
                            Settings = new MeshSettings(),
                        }, token);

                case "material":
                    return AssetGenerators.GenerateAsync(
                        new GenerationParameters<MaterialSettings>
                        {
                            AssetType = typeof(Material),
                            Prompt = job.prompt,
                            SavePath = savePath,
                            ModelId = modelId,
                            Settings = new MaterialSettings(),
                        }, token);

                case "sound":
                    return AssetGenerators.GenerateAsync(
                        new GenerationParameters<SoundSettings>
                        {
                            AssetType = typeof(AudioClip),
                            Prompt = job.prompt,
                            SavePath = savePath,
                            ModelId = modelId,
                            Settings = new SoundSettings { DurationInSeconds = job.seconds },
                        }, token);

                case "animation":
                    return AssetGenerators.GenerateAsync(
                        new GenerationParameters<AnimationSettings>
                        {
                            AssetType = typeof(AnimationClip),
                            Prompt = job.prompt,
                            SavePath = savePath,
                            ModelId = modelId,
                            Settings = new AnimationSettings { DurationInSeconds = job.seconds },
                        }, token);

                default:
                    throw new ArgumentException(
                        $"모르는 종류입니다: \"{job.kind}\". " +
                        "sprite · image · mesh · material · sound · animation 중 하나여야 합니다.");
            }
        }

        static string[] Snapshot(IReadOnlyList<string> messages) =>
            messages == null ? Array.Empty<string>() : messages.ToArray();

        /// <summary>저장할 폴더가 없으면 만든다. 없는 폴더에 저장하면 그냥 실패한다.</summary>
        static void EnsureFolder(string savePath)
        {
            if (string.IsNullOrWhiteSpace(savePath)) return;
            var folder = Path.GetDirectoryName(savePath)?.Replace("\\", "/");
            if (string.IsNullOrEmpty(folder) || AssetDatabase.IsValidFolder(folder)) return;

            var parts = folder.Split('/');
            var running = parts[0];
            for (var i = 1; i < parts.Length; i++)
            {
                var next = running + "/" + parts[i];
                if (!AssetDatabase.IsValidFolder(next))
                    AssetDatabase.CreateFolder(running, parts[i]);
                running = next;
            }
        }
    }

    /// <summary>
    /// 배치모드에서 부르는 자리.
    ///
    ///     Unity -batchmode -nographics -projectPath &lt;프로젝트&gt; \
    ///           -executeMethod Rookery.AI.RookeryUnityAICli.Run \
    ///           -rookeryAiJob &lt;주문.json&gt; -rookeryAiOut &lt;결과.json&gt;
    ///
    /// **`-quit` 를 붙이지 않는다.** 이 일은 비동기라 메서드가 돌아오는 시점에
    /// 아직 안 끝나 있다. 다 되면 여기서 끈다.
    /// </summary>
    public static class RookeryUnityAICli
    {
        public static void Run()
        {
            var jobPath = Arg("-rookeryAiJob");
            var outPath = Arg("-rookeryAiOut");

            RookeryAiJob job = null;
            var parseError = "";
            try
            {
                if (string.IsNullOrEmpty(jobPath))
                    parseError = "-rookeryAiJob <경로> 가 없습니다.";
                else if (!File.Exists(jobPath))
                    parseError = $"주문 파일이 없습니다: {jobPath}";
                else
                    job = JsonUtility.FromJson<RookeryAiJob>(File.ReadAllText(jobPath));
            }
            catch (Exception e)
            {
                parseError = e.GetType().Name + ": " + e.Message;
            }

            if (job == null)
            {
                Write(outPath, new RookeryAiResult
                {
                    error = string.IsNullOrEmpty(parseError) ? "주문을 못 읽었습니다." : parseError,
                    batchmode = Application.isBatchMode,
                });
                Quit(1);
                return;
            }

            var cancel = new CancellationTokenSource(TimeSpan.FromSeconds(Math.Max(10, job.timeoutSeconds)));
            var task = RookeryUnityAI.GenerateAsync(job, cancel.Token);

            // 끝날 때까지 에디터 루프를 계속 돌린다. 여기서 `.Wait()` 로 막으면
            // 이어질 일들이 메인 스레드를 기다리다 서로 물려 멈춘다.
            var deadline = DateTime.UtcNow.AddSeconds(Math.Max(10, job.timeoutSeconds) + 30);
            void Tick()
            {
                if (!task.IsCompleted && DateTime.UtcNow < deadline) return;

                EditorApplication.update -= Tick;

                var result = task.IsCompleted && task.Exception == null
                    ? task.Result
                    : new RookeryAiResult
                    {
                        kind = job.kind,
                        batchmode = Application.isBatchMode,
                        error = task.Exception != null
                            ? task.Exception.GetBaseException().Message
                            : $"{job.timeoutSeconds}초 안에 안 끝났습니다.",
                    };

                Write(outPath, result);
                Quit(result.ok ? 0 : 1);
            }

            EditorApplication.update += Tick;
        }

        static void Write(string outPath, RookeryAiResult result)
        {
            var json = JsonUtility.ToJson(result, true);
            // 로그에도 남긴다. 파일을 못 쓰는 경우에도 심부름꾼이 읽을 수 있게 —
            // 결과가 아무 데도 없는 것이 제일 나쁘다.
            Debug.Log("ROOKERY_AI_RESULT " + JsonUtility.ToJson(result));
            if (string.IsNullOrEmpty(outPath)) return;
            try
            {
                var folder = Path.GetDirectoryName(outPath);
                if (!string.IsNullOrEmpty(folder)) Directory.CreateDirectory(folder);
                File.WriteAllText(outPath, json);
            }
            catch (Exception e)
            {
                Debug.LogError("결과 파일을 못 썼습니다: " + e.Message);
            }
        }

        static void Quit(int code)
        {
            if (Application.isBatchMode) EditorApplication.Exit(code);
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

    /// <summary>
    /// 창이 열려 있을 때 눈으로 확인하는 자리.
    ///
    /// 배치모드가 안 되더라도 **여기서는 되는지**를 먼저 갈라야 한다. 둘 다 안
    /// 되는 것과 배치모드만 안 되는 것은 완전히 다른 이야기이고, 고치는 데도 다르다.
    /// </summary>
    public static class RookeryUnityAIMenu
    {
        const string Folder = "Assets/Rookery/AITest";

        [MenuItem("Window/Rookery/Unity AI — 시험 생성(스프라이트)")]
        public static void ProbeSprite() => Probe(new RookeryAiJob
        {
            kind = "sprite",
            prompt = "Pixel art sprite of a single round gold coin, chunky visible pixels, " +
                     "hard edges, limited palette, transparent background, no text.",
            savePath = Folder + "/probe_coin.png",
            maxPoints = 0,
        });

        [MenuItem("Window/Rookery/Unity AI — 시험 생성(3D 메시)")]
        public static void ProbeMesh() => Probe(new RookeryAiJob
        {
            kind = "mesh",
            prompt = "A simple low-poly wooden treasure chest, closed, game-ready.",
            savePath = Folder + "/probe_chest.prefab",
            maxPoints = 0,
            timeoutSeconds = 600,
        });

        static async void Probe(RookeryAiJob job)
        {
            Debug.Log($"[Rookery] 유니티 AI 시험 생성 시작 — {job.kind}. 이 판은 AI Points 를 씁니다.");
            var result = await RookeryUnityAI.GenerateAsync(job);
            if (result.ok)
                Debug.Log($"[Rookery] 됐습니다 — {result.assetPath} · {result.pointCost} 포인트 · {result.seconds:F1}초");
            else
                Debug.LogError($"[Rookery] 안 됐습니다 — {result.error} · {result.seconds:F1}초");
        }
    }
}
