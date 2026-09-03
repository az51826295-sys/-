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
            var count = SceneManager.sceneCountInBuildSettings;
            if (count == 0) return null;

            var wanted = System.Environment.GetEnvironmentVariable("ROOKERY_SCENE");
            if (!string.IsNullOrEmpty(wanted))
            {
                for (var i = 0; i < count; i++)
                {
                    var path = SceneUtility.GetScenePathByBuildIndex(i);
                    if (path.Contains(wanted)) return path;
                }
                return null;
            }
            return SceneUtility.GetScenePathByBuildIndex(count - 1);
        }

        IEnumerator LoadTarget()
        {
            var path = TargetScenePath();
            if (path == null)
                Assert.Inconclusive("빌드 설정에 씬이 없습니다 — 잴 대상이 없습니다.");

            yield return SceneManager.LoadSceneAsync(path, LoadSceneMode.Single);
            for (var i = 0; i < SettleFrames; i++) yield return null;
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
            yield return LoadTarget();
            for (var i = 0; i < InputFrames; i++) yield return null;

            Assert.IsEmpty(
                _problems,
                "씬이 도는 동안 오류가 났습니다:\n  " + string.Join("\n  ", _problems));
        }

        // ── 2. 화면에 보이는 것이 있는가 ─────────────────────────
        [UnityTest]
        public IEnumerator 카메라와_보이는_것이_있다()
        {
            yield return LoadTarget();

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
            yield return LoadTarget();

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
            yield return LoadTarget();

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
            yield return LoadTarget();

            // 2D 든 3D 든 본다. 차원을 알 필요가 없다 — 움직일 수 있는 것이
            // 무엇이든 움직였는지만 보면 된다.
            var moving = Object.FindObjectsByType<Rigidbody2D>()
                .Select(r => r.transform)
                .Concat(Object.FindObjectsByType<Rigidbody>().Select(r => r.transform))
                .Distinct()
                .ToArray();
            if (moving.Length == 0)
                Assert.Inconclusive("움직일 수 있는 물체(Rigidbody / Rigidbody2D)가 없습니다.");

            var before = moving.Select(t => t.position).ToArray();

            var keyboard = InputSystem.AddDevice<Keyboard>();

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
                var until = Time.time + HoldSeconds;
                while (Time.time < until) yield return null;

                var now = moving.Select(t => t.position).ToArray();
                moved = before.Where((p, i) => Vector3.Distance(p, now[i]) > 0.01f).Count();

                InputSystem.QueueStateEvent(keyboard, new KeyboardState());
                InputSystem.Update();
                yield return null;

                if (moved > 0) break;
            }

            InputSystem.RemoveDevice(keyboard);

            if (!pressReached)
            {
                Assert.Inconclusive(
                    "키를 눌렀는데 입력 시스템이 눌렸다고 하지 않습니다 — " +
                    "게임이 안 움직인 것이 아니라 우리가 못 누른 것입니다.");
            }

            Assert.Greater(
                moved, 0,
                "WASD·화살표·스페이스를 차례로 눌렀는데 아무것도 안 움직였습니다. " +
                "입력이 코드에 닿지 않았거나 조작이 붙지 않았습니다.");
#else
            // 옛 입력만 켜진 프로젝트에서는 흉내 낼 길이 없다. 통과로 세지 않는다.
            yield return null;
            Assert.Inconclusive(
                "이 프로젝트는 새 입력 시스템이 꺼져 있어 입력을 흉내 낼 수 없습니다 — 못 쟀습니다.");
#endif
        }
    }
}
