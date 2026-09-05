// 만들어진 게임이 **실제로 도는가**를 재는 자리.
//
// 지금까지 이 고리가 잰 것은 컴파일뿐이었다. 컴파일은 문법이 맞다는 뜻일 뿐이라
// 이런 것들이 전부 통과했다: 없는 그림을 참조해서 화면이 빈 씬, 씬을 안 짓고
// 지었다고 말한 판, 그리고 **꺼진 입력 API 를 써서 키를 눌러도 아무 일이 없는
// 게임**. 셋 다 컴파일러가 못 보는 자리다.
//
// ## 왜 이 시험지를 사람이 쓰는가
//
// 합격 기준은 로키가 판마다 새로 쓴다. 그런데 **만든 쪽이 시험지도 쓰면 통과하게
// 쓸 수 있다.** 그래서 여기 있는 것은 게임마다 달라지는 기준이 아니라, 어떤 2D
// 게임이든 지켜야 하는 것들이다. 한 번 쓰고 안 바꾼다.
//
// ## 못 재는 것은 못 쟀다고 한다
//
// `Assert.Inconclusive` 는 통과가 아니다. 옛 입력만 켜진 프로젝트에서는 입력을
// 흉내 낼 수 없어서 그렇게 낸다 — 통과로 세면 못 잴수록 잘 통과한다.
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
// `KeyboardState` 는 여기 있다. 이걸 빼면 컴파일이 깨지고, 그러면 시험이 아예
// 안 돌아서 **떨어진 것이 아니라 잰 적이 없는** 상태가 된다.
using UnityEngine.InputSystem.LowLevel;
#endif

namespace Rookery.Tests
{
    public class RookeryAcceptance
    {
        /// <summary>씬이 자리를 잡을 때까지. 물리와 첫 프레임이 지나야 본다.</summary>
        const int SettleFrames = 10;
        /// <summary>입력을 주고 기다리는 프레임. 너무 짧으면 안 움직인 것과 구분이 안 된다.</summary>
        const int InputFrames = 40;
        /// <summary>키를 누르고 있는 **시간**. 물리는 프레임이 아니라 시간으로 돈다.</summary>
        const float HoldSeconds = 0.6f;

        readonly List<string> _problems = new();

        [SetUp]
        public void Watch()
        {
            _problems.Clear();
            Application.logMessageReceived += Collect;
        }

        [TearDown]
        public void Unwatch() => Application.logMessageReceived -= Collect;

        void Collect(string message, string stack, LogType type)
        {
            if (type == LogType.Exception || type == LogType.Error)
                _problems.Add($"{type}: {message}");
        }

        /// <summary>
        /// 어느 씬을 볼 것인가. 로키가 지은 씬은 빌드 설정 **끝에** 붙으므로
        /// 마지막 것을 본다. `ROOKERY_SCENE` 이 있으면 그 이름을 우선한다.
        /// </summary>
        static string TargetScenePath()
        {
            // **러너의 씬은 후보가 아니다.** 테스트 러너는 PlayMode 를 돌릴 때
            // 자기 `InitTestScene…` 을 빌드 설정에 잠깐 끼워 넣는다. 09-03 에
            // 그걸 우리 씬으로 골라 Single 로 다시 불러왔고 — 러너 자신이 죽어
            // 여섯 개가 전부 0으로 찍혔다. 결과 파일에는 그 흔적이 "찾은 것 1,
            // 사라진 것 1, 활성 씬 InitTestScene" 으로 남아 있었다.
            var paths = new System.Collections.Generic.List<string>();
            for (var i = 0; i < SceneManager.sceneCountInBuildSettings; i++)
            {
                var candidate = SceneUtility.GetScenePathByBuildIndex(i);
                if (candidate.Contains("InitTestScene")) continue;
                paths.Add(candidate);
            }
            var count = paths.Count;
            if (count == 0) return null;

            var wanted = System.Environment.GetEnvironmentVariable("ROOKERY_SCENE");
            if (!string.IsNullOrEmpty(wanted))
            {
                for (var i = 0; i < count; i++)
                {
                    var path = paths[i];
                    if (path.Contains(wanted)) return path;
                }
                return null;
            }
            return paths[count - 1];
        }

        /// 대조군. 게임 스크립트가 서는 바로 그 자리(Update)에서 키를 읽는다.
        /// 시험 자신이 `InputSystem.Update()` 직후에 읽는 값은 여기와 다를 수 있다 —
        /// 09-03 에 그 둘이 실제로 달랐다(시험은 눌림을 봤고 게임은 못 봤다).
        class InputProbe : MonoBehaviour
        {
            public bool Saw;
            void Update()
            {
                var k = Keyboard.current;
                if (k != null && k.anyKey.isPressed) Saw = true;
            }
        }

        // 호출하는 쪽은 `for (var load = LoadTarget(); load.MoveNext();) yield return load.Current;`
        // 로 안쪽 열거자를 직접 밟는다. 09-03 에 "러너가 넘겨받은 열거자를 안 밟는다"
        // 고 의심해서 이렇게 바꿨는데, **그 의심은 증명되지 않았다** — 진짜 원인은
        // `TargetScenePath` 가 러너의 InitTestScene 을 고른 것이었고, 바꾸기 전에도
        // 이 함수는 돌고 있었다(그래서 검사가 안 울린 것이다: 활성 씬 == 고른 씬).
        // 직접 밟는 쪽이 러너가 무엇을 지원하든 같게 도니 남겨 둔다. 다만 이것이
        // 무엇을 고쳤다고 읽지는 말 것.
        IEnumerator LoadTarget()
        {
            var path = TargetScenePath();
            if (path == null)
                Assert.Inconclusive("빌드 설정에 씬이 없습니다 — 잴 대상이 없습니다.");

            // **끝났는지를 직접 본다.** `yield return op` 에 맡겼더니 09-03 에
            // 시험이 씬이 바뀌는 도중에 쟀다 — 찾은 물체 1개(러너 씬의 것),
            // 그것도 재는 사이 사라졌고, 활성 씬은 여전히 InitTestScene 이었다.
            // 그 상태로 러너까지 죽어 여섯 개가 전부 0으로 찍혔다. 무엇을
            // 기다리는지 모르는 기다림은 기다림이 아니다.
            var op = SceneManager.LoadSceneAsync(path, LoadSceneMode.Single);
            if (op == null)
                Assert.Inconclusive($"씬을 못 불러왔습니다: {path}");
            while (!op.isDone) yield return null;
            for (var i = 0; i < SettleFrames; i++) yield return null;

            // 불러온 뒤에 **정말 그 씬인지** 본다. 다른 씬을 잰 결과는 틀린
            // 결과가 아니라 결과가 아니다 — 이름을 붙여 세운다.
            var active = SceneManager.GetActiveScene();
            if (active.path != path)
                Assert.Inconclusive(
                    $"불러온 뒤에도 활성 씬이 '{active.name}' 입니다 — '{path}' 가 아닙니다.");
        }

        /// 애니메이터가 붙은 물체의 **아래**(뼈·메시)인가. 애니메이터 물체 자신과 그 부모는 아니다.
        static bool IsUnderAnimator(Transform t)
        {
            for (var p = t.parent; p != null; p = p.parent)
                if (p.GetComponent<Animator>() != null) return true;
            return false;
        }

        static IEnumerable<GameObject> Roots() =>
            SceneManager.GetActiveScene().GetRootGameObjects();

        // ── 1. 씬이 열리고 조용한가 ──────────────────────────────
        //
        // 이것이 꺼진 입력 API 를 잡는 자리다. `UnityEngine.Input` 이 꺼진
        // 프로젝트에서 그걸 부르면 **매 프레임 예외가 난다.** 컴파일은 통과하고,
        // 화면은 그려지고, 아무도 안 걸린다.
        [UnityTest]
        public IEnumerator 씬이_열리고_예외가_없다()
        {
            for (var load = LoadTarget(); load.MoveNext();) yield return load.Current;
            for (var i = 0; i < InputFrames; i++) yield return null;

            Assert.IsEmpty(
                _problems,
                "씬이 도는 동안 오류가 났습니다:\n  " + string.Join("\n  ", _problems));
        }

        // ── 0. 화면을 찍는다 ─────────────────────────────────────
        //
        // 판정이 아니라 **사진**이다. 09-05 저녁 사장님이 "비슷한 앱을 찾아 고치자"
        // 해서 본 것: Rosebud 는 대화 옆에 게임 화면이 늘 보인다. 우리 게임은 유니티
        // 안에 살아서 브라우저가 못 그리니, 자가 돌 때 한 장 찍어 대화에 붙인다.
        // 못 찍으면(그래픽 장치가 없는 -nographics) 못 찍었다고 낸다 — 검은 사진을
        // 보내지 않는다.
        public const string ScreenshotPath = "Library/Rookery/screenshot.png";

        [UnityTest]
        public IEnumerator 화면을_찍는다()
        {
            for (var load = LoadTarget(); load.MoveNext();) yield return load.Current;
            // 동전이 돌고 뜨는 것이 보이게 조금 기다린다.
            for (var i = 0; i < InputFrames; i++) yield return null;
            yield return new WaitForEndOfFrame();

            if (SystemInfo.graphicsDeviceType == UnityEngine.Rendering.GraphicsDeviceType.Null)
                Assert.Inconclusive("그래픽 장치가 없어(-nographics) 화면을 못 찍습니다.");
            var cam = Camera.main;
            if (cam == null) Assert.Inconclusive("Main Camera 가 없어 화면을 못 찍습니다.");

            // 1080p + MSAA. 960×540 에 MSAA 1 로 찍은 사진은 어떤 캐릭터도 계단투성이로
            // 보인다(23:26 사장님: "화질이 부족해"). 사진은 게임의 얼굴이니 게임 화질대로 찍는다.
            const int W = 1920, H = 1080;
            var rt = new RenderTexture(W, H, 24);
            rt.antiAliasing = Mathf.Max(1, QualitySettings.antiAliasing);
            var prev = cam.targetTexture;
            cam.targetTexture = rt;
            cam.Render();
            cam.targetTexture = prev;
            var tex = new Texture2D(W, H, TextureFormat.RGB24, false);
            var active = RenderTexture.active;
            RenderTexture.active = rt;
            tex.ReadPixels(new Rect(0, 0, W, H), 0, 0);
            tex.Apply();
            RenderTexture.active = active;
            var png = tex.EncodeToPNG();
            Object.Destroy(tex);
            rt.Release();
            Object.Destroy(rt);

            var full = System.IO.Path.GetFullPath(ScreenshotPath);
            System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(full));
            System.IO.File.WriteAllBytes(full, png);
            Assert.Greater(png.Length, 0, "빈 사진이 나왔습니다.");
        }

        // ── 2. 화면에 보이는 것이 있는가 ─────────────────────────
        [UnityTest]
        public IEnumerator 카메라와_보이는_것이_있다()
        {
            for (var load = LoadTarget(); load.MoveNext();) yield return load.Current;

            var cameras = Object.FindObjectsByType<Camera>()
                .Where(c => c.isActiveAndEnabled).ToArray();
            Assert.IsNotEmpty(cameras, "켜진 카메라가 없습니다. 빈 씬에는 아무것도 안 보입니다.");

            var renderers = Object.FindObjectsByType<Renderer>()
                .Where(r => r.enabled && r.gameObject.activeInHierarchy).ToArray();
            Assert.IsNotEmpty(renderers, "그려지는 것이 하나도 없습니다.");
        }

        // ── 2-b. 3D 인데 조명이 있는가 ───────────────────────────
        //
        // 3D 물체는 조명이 없으면 **검게 그려진다.** 씬은 지어지고 물체도 다
        // 있는데 화면만 까맣다 — 컴파일러도, 위의 "보이는 것이 있다" 도 못 잡는다.
        // 2D 스프라이트는 조명이 필요 없으므로, 3D 물체가 있을 때만 묻는다.
        [UnityTest]
        public IEnumerator 삼차원이면_조명이_있다()
        {
            for (var load = LoadTarget(); load.MoveNext();) yield return load.Current;

            var meshes = Object.FindObjectsByType<MeshRenderer>()
                .Where(r => r.enabled && r.gameObject.activeInHierarchy).ToArray();
            if (meshes.Length == 0)
                Assert.Inconclusive("3D 물체가 없습니다 — 이 게임은 2D 입니다.");

            var lights = Object.FindObjectsByType<Light>()
                .Where(l => l.isActiveAndEnabled).ToArray();
            Assert.IsNotEmpty(
                lights,
                $"3D 물체가 {meshes.Length}개 있는데 켜진 조명이 없습니다. 화면이 검게 나옵니다.");
        }

        // ── 3. 그림이 진짜 파일인가 ──────────────────────────────
        //
        // 코드로 만든 `Texture2D` 는 이름이 없고 파일이 없다. 그것만으로 채워진
        // 화면이 어제의 **초록 사각형**이었다. 그린 그림이 실제로 쓰였는지는
        // 여기서만 갈린다.
        [UnityTest]
        public IEnumerator 그림이_코드가_아니라_파일에서_온다()
        {
            for (var load = LoadTarget(); load.MoveNext();) yield return load.Current;

            var sprites = Object.FindObjectsByType<SpriteRenderer>()
                .Where(s => s.enabled && s.sprite != null)
                .ToArray();
            if (sprites.Length == 0)
                Assert.Inconclusive("스프라이트를 쓰는 물체가 없습니다 — 이 게임은 다르게 그립니다.");

            // 파일에서 온 텍스처에는 이름이 붙어 있다. 코드로 찍은 것은 비어 있다.
            var fromFile = sprites.Count(s => !string.IsNullOrEmpty(s.sprite.texture.name));
            Assert.Greater(
                fromFile, 0,
                $"보이는 스프라이트 {sprites.Length}개가 전부 코드로 만든 텍스처입니다. " +
                "그린 그림이 쓰이지 않았습니다.");
        }

        // ── 4. 입력을 주면 무언가 움직이는가 ─────────────────────
        [UnityTest]
        public IEnumerator 입력을_주면_무언가_움직인다()
        {
#if ENABLE_INPUT_SYSTEM
            for (var load = LoadTarget(); load.MoveNext();) yield return load.Current;

            // **씬의 모든 물체를 본다. Rigidbody 만 보지 않는다.**
            //
            // 원래 Rigidbody 가 붙은 것만 봤다. 그런데 09-03 에 나온 게임은
            // Rigidbody 없이 `transform.position` 을 직접 움직였고, 이 시험은
            // "움직일 수 있는 물체가 없다"며 물러났다. 그 말이 결과 파일에 여섯
            // 번 적혔는데 고리는 "시험이 0개 돌았다"로만 읽었다. **게임이 아니라
            // 시험이 좁았다.** 바로 위 주석이 "무엇이든 움직였는지만 보면 된다"고
            // 해 놓고 코드는 반대였다.
            //
            // 다만 아무거나 움직였다고 통과시키면 안 된다. 저 혼자 도는 동전,
            // 흔들리는 풀은 입력과 무관하게 움직인다. 그래서 **먼저 가만히 두고**,
            // 그동안 스스로 움직인 것은 뺀다. 남은 것이 입력을 받고 움직여야
            // "입력에 반응했다"다.
            // 애니메이터 아래의 뼈(Spine·neck…)는 입력 없이도 움직이는 것이 정상이다 —
            // 22:24 첫 사람 캐릭터의 뼈가 "스스로 움직인 물체" 로 잡혔다. 뼈는 빼고
            // 루트(플레이어 물체 자체)는 남긴다. 루트가 저 혼자 움직이면 그건 진짜 결함이다.
            var all = Object.FindObjectsByType<Transform>(FindObjectsSortMode.None)
                .Where(t => !IsUnderAnimator(t))
                .ToArray();
            var start = all.Select(t => t.position).ToArray();
            var idleUntil = Time.time + HoldSeconds;
            while (Time.time < idleUntil) yield return null;
            var moving = all
                .Where((t, i) => t != null && Vector3.Distance(start[i], t.position) <= 0.01f)
                .ToArray();
            // 입력 없이 움직여서 뺀 것들. 09-05 에 플레이어가 여기 들어갔다 — 바닥에
            // 묻힌 채 저장돼 시작하자마자 물리가 밀어 올렸고, 자는 "입력이 안 닿았다" 고
            // 엉뚱한 진단을 냈다. 무엇을 뺐는지 적어야 사람이 그 자리를 본다.
            var driftedNames = string.Join(", ", all
                .Where((t, i) => t != null && Vector3.Distance(start[i], t.position) > 0.01f)
                .Select((t) => t.name).Take(8));
            if (moving.Length == 0)
            {
                // 무엇을 봤는지 숫자로 적는다. "하나도 없다"만 남기면 다음 사람이
                // 또 추측한다 — 사라진 것인지, 정말 다 움직인 것인지, 애초에 못
                // 찾은 것인지는 셋 다 다른 고장이다.
                var gone = all.Count(t => t == null);
                var drifted = all.Where((t, i) => t != null && Vector3.Distance(start[i], t.position) > 0.01f).Count();
                var names = string.Join(", ", all.Where(t => t != null).Select(t => t.name).Take(8));
                var scene = SceneManager.GetActiveScene();
                Assert.Inconclusive(
                    $"가만히 있는 물체가 없습니다 — 찾은 것 {all.Length}, 그 사이 사라진 것 {gone}, " +
                    $"입력 없이 움직인 것 {drifted}. 지금 씬 '{scene.name}' (뿌리 {scene.rootCount}개), " +
                    $"남은 이름: [{names}]. 입력의 효과를 가를 수 없습니다.");
            }

            var before = moving.Select(t => t.position).ToArray();

            // **포커스가 없어도 장치를 켜 둔다.** 기본값(ResetAndDisableNonBackgroundDevices)
            // 은 `-batchmode` 에서 `Application.isFocused` 가 거짓이라 키보드를 통째로
            // 끈다. 그러면 이 시험은 `Update()` 직후 자기 눈으로는 눌린 것을 보는데
            // 게임의 MonoBehaviour 는 끝까지 못 본다 — **어떤 게임도 "안 움직인다"로
            // 찍힌다.** 09-03 에 깨끗한 프로젝트로 확인했다. 재는 자가 못 보는 것을
            // 게임 탓으로 적는 자리라, 여기서 켜고 끝나면 되돌린다.
            var savedBackground = InputSystem.settings.backgroundBehavior;
            InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
            // **에디터 안에서는 이것까지 켜야 한다.** 09-03 에 IgnoreFocus 만 켜고
            // "장치는 켜졌는데 게임은 못 본다" 를 봤다. 입력 시스템 소스
            // (InputManager.cs) 를 읽으니 이유가 이렇다: 에디터는 게임 뷰에
            // 포커스가 없으면 키보드·포인터 이벤트를 플레이어 갱신에서 **에디터
            // 갱신으로 미룬다**(editorInputBehaviorInPlayMode 의 기본값
            // PointersAndKeyboardsRespectGameViewFocus). 그리고 `InputSystem.Update()`
            // 도 포커스가 없으면 에디터 갱신으로 돈다. 그래서 이 시험은 에디터
            // 상태 버퍼에서 눌림을 읽었고, 게임의 Update 는 플레이어 버퍼를 읽어
            // 아무것도 못 봤다 — 둘이 다른 버퍼를 보고 있었다.
            // `gameHasFocus` 가 참이 되는 조건은 IgnoreFocus **그리고**
            // AllDeviceInputAlwaysGoesToGameView, 둘 다다. 시험 끝에 되돌린다.
            var savedEditorBehavior = InputSystem.settings.editorInputBehaviorInPlayMode;
            InputSystem.settings.editorInputBehaviorInPlayMode =
                InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
            var keyboard = InputSystem.AddDevice<Keyboard>();
            // 포커스가 없어 꺼진 장치를 명시적으로 켠다. IgnoreFocus 만으로는 09-03 에
            // 대조군이 여전히 키를 못 봤다.
            Application.runInBackground = true;
            InputSystem.EnableDevice(keyboard);

            // **대조군.** 게임과 같은 자리(MonoBehaviour 의 Update)에서 같은 키를
            // 읽는 물체를 하나 둔다. 이것이 못 봤으면 게임도 못 본 것이고, 그때
            // "안 움직인다"는 게임의 결함이 아니라 시험의 결함이다. 이것은 봤는데
            // 게임만 안 움직였을 때에만 게임 탓이라고 적는다.
            var probe = new GameObject("RookeryInputProbe").AddComponent<InputProbe>();

            // **한 조합만 눌러 보면 안 된다.**
            //
            // 여기 원래 오른쪽 화살표와 스페이스만 눌렀다. 그런데 09-03 에 나온
            // 게임은 WASD 를 읽었고, 그래서 이 시험이 "안 움직인다"고 떨어뜨렸다 —
            // **게임이 아니라 시험이 틀린 것이다.** 안 눌러 본 것을 안 되는 것으로
            // 읽은 것이고, 이 저장소가 계속 밟는 바로 그 자리다.
            //
            // 어느 키를 쓰는지는 게임마다 다르므로, 흔한 것을 차례로 눌러 본다.
            var keys = new[]
            {
                new[] { Key.W }, new[] { Key.A }, new[] { Key.S }, new[] { Key.D },
                new[] { Key.UpArrow }, new[] { Key.RightArrow },
                new[] { Key.Space },
            };

            var moved = 0;
            var pressReached = false;
            foreach (var combo in keys)
            {
                InputSystem.QueueStateEvent(keyboard, new KeyboardState(combo));
                InputSystem.Update();
                // 눌렀다는 것이 입력 시스템까지 갔는가. 이게 거짓이면 게임이
                // 안 움직인 것이 아니라 **우리가 못 누른 것**이다. 둘을 같게
                // 읽으면 못 누를수록 게임이 나빠 보인다.
                // **게임이 읽는 자리에서 확인한다.** 우리가 만든 장치가 눌렸는지가
                // 아니라, 게임이 보는 `Keyboard.current` 가 눌렸다고 하는지를 본다.
                // 키보드가 둘이면 `current` 가 다른 것일 수 있고, 그러면 우리는
                // 눌렀는데 게임은 못 본다 — 그건 게임 탓이 아니다.
                var seen = Keyboard.current;
                if (seen != null && seen.anyKey.isPressed) pressReached = true;

                // **프레임이 아니라 시간으로 기다린다.**
                //
                // `yield return null` 은 프레임 하나를 넘길 뿐이고, 배치모드에서는
                // 프레임이 아주 빨라서 40 프레임을 넘겨도 게임 시간은 몇십 ms 밖에
                // 안 흐른다. 물리는 시간으로 도므로 그동안 `FixedUpdate` 가 한두
                // 번 돌고 만다 — 그러면 "안 움직였다"가 나오는데 그건 게임이
                // 아니라 우리가 안 기다린 것이다.
                // **매 프레임 다시 누른다.**
                //
                // 한 번만 큐에 넣으면 그 상태가 계속 눌린 채로 남을 것 같지만,
                // 실제 장치가 없는 배치모드에서는 입력 시스템이 다음 갱신에
                // 상태를 되돌릴 수 있다. 그러면 게임은 "한 프레임 눌렸다 뗐다"
                // 를 보고, 우리는 "1초 눌렀는데 안 움직인다"고 적는다 —
                // **멀쩡한 게임을 고치라고 시키게 된다.**
                var until = Time.time + HoldSeconds;
                while (Time.time < until)
                {
                    InputSystem.QueueStateEvent(keyboard, new KeyboardState(combo));
                    InputSystem.Update();
                    yield return null;
                }

                // 그 사이 사라진 물체는 "안 움직인 것"으로 친다. 없어진 것을
                // 움직인 것으로 세면 부서지는 게임이 잘 움직이는 게임이 된다.
                var now = moving.Select((t, i) => t == null ? before[i] : t.position).ToArray();
                moved = before.Where((p, i) => Vector3.Distance(p, now[i]) > 0.01f).Count();

                InputSystem.QueueStateEvent(keyboard, new KeyboardState());
                InputSystem.Update();
                yield return null;

                if (moved > 0) break;
            }

            var probeSaw = probe.Saw;
            var deviceOn = keyboard.enabled;
            Object.Destroy(probe.gameObject);
            InputSystem.RemoveDevice(keyboard);
            InputSystem.settings.backgroundBehavior = savedBackground;
            InputSystem.settings.editorInputBehaviorInPlayMode = savedEditorBehavior;

            if (moved == 0 && !probeSaw)
                Assert.Inconclusive(
                    $"대조군도 키를 못 봤습니다(장치 켜짐: {deviceOn}) — 게임이 아니라 시험이 " +
                    "못 누른 것입니다. 게임의 조작을 고치지 마십시오.");

            if (!pressReached)
            {
                Assert.Inconclusive(
                    "키를 눌렀는데 입력 시스템이 눌렸다고 하지 않습니다 — " +
                    "게임이 안 움직인 것이 아니라 우리가 못 누른 것입니다.");
            }

            Assert.Greater(
                moved, 0,
                "WASD·화살표·스페이스를 차례로 눌렀는데 가만히 있던 물체 중 아무것도 안 움직였습니다. " +
                (driftedNames.Length > 0
                    ? $"입력 없이 스스로 움직여서 재지 않은 물체: [{driftedNames}] — 플레이어가 여기 있으면 " +
                      "시작 위치가 바닥에 묻혔거나 무언가가 시작하자마자 밀고 있는 것입니다."
                    : "입력이 코드에 닿지 않았거나 조작이 붙지 않았습니다."));
#else
            // 옛 입력만 켜진 프로젝트에서는 흉내 낼 길이 없다. 통과로 세지 않는다.
            yield return null;
            Assert.Inconclusive(
                "이 프로젝트는 새 입력 시스템이 꺼져 있어 입력을 흉내 낼 수 없습니다 — 못 쟀습니다.");
#endif
        }
    }
}
