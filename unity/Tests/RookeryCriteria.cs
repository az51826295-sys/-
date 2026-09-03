// 로키가 **그 판에 약속한 것**을 눌러 보는 자리.
//
// `RookeryAcceptance.cs` 는 어떤 게임이든 지켜야 하는 것을 잰다(씬이 열리는가,
// 보이는 것이 있는가, 입력이 코드에 닿는가). 여기는 다르다 — **이 게임이 이번에
// 약속한 열몇 줄**을 잰다. "나무를 흔들면 열매가 떨어진다" 같은 것.
//
// ## 시험기는 사람이 쓰고, 모델은 표만 채운다
//
// 만든 쪽이 시험지도 쓰면 통과하게 쓴다. `Assert.Pass()` 한 줄이면 열한 개가
// 다 통과한다. 그래서 **코드는 여기 고정**이고, 모델이 낼 수 있는 것은
// `criteria.json` 한 장뿐이다:
//
//     { "index": 3, "criterion": "스페이스를 6번 누르면 열매가 떨어진다",
//       "action": "press", "key": "space", "seconds": 0,
//       "observe": "countUp", "target": "Fruit" }
//
// 모델은 "통과" 라고 쓸 수 없다. 무엇을 누르고 무엇이 달라지는지만 말하고,
// 달라졌는지 아닌지는 이 파일이 본다.
//
// ## 못 잰 것은 통과가 아니다
//
// 표가 없거나, 겨눈 이름이 씬에 없거나, 입력을 흉내 낼 수 없으면
// `Assert.Inconclusive` 다. 통과로 세면 **못 잴수록 잘 통과한다** — 이 저장소가
// 여섯 번 밟은 자리다.
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
#endif

namespace Rookery.Tests
{
    public class RookeryCriteria
    {
        const int SettleFrames = 10;
        const int ObserveFrames = 50;

        [System.Serializable]
        public class Check
        {
            public int index;
            public string criterion;
            public string action;
            public string key;
            public float seconds;
            public string observe;
            public string target;
            public string why;
        }

        [System.Serializable]
        public class Sheet
        {
            public Check[] checks;
        }

        /// <summary>표는 씬 옆에 놓인다. 없으면 잰 적이 없는 것이다.</summary>
        static Sheet LoadSheet()
        {
            var path = Path.Combine(Application.dataPath, "Rookery", "Tests", "PlayMode", "criteria.json");
            if (!File.Exists(path)) return null;
            try { return JsonUtility.FromJson<Sheet>(File.ReadAllText(path)); }
            catch { return null; }
        }

        // 시험을 기준마다 쪼개지 **않는다.**
        //
        // 처음에는 `[ValueSource]` 로 한 줄에 시험 하나씩 만들었다. 그랬더니
        // **여섯 개가 발견되고 0개가 돌았다** — PlayMode 는 시험을 도메인 너머로
        // 넘기는데 객체 인자가 그걸 못 견딘다. 그리고 그 실패는 새 시험만이
        // 아니라 **같이 있던 시험 넷까지** 같이 죽였다.
        //
        // 그래서 한 시험이 표를 전부 돈다. 줄마다 결과를 로그에 남기므로
        // (`ROOKERY_CHECK`) 어느 기준이 어떻게 됐는지는 그대로 남는다.
        const string Mark = "ROOKERY_CHECK ";

        static string TargetScenePath()
        {
            var count = SceneManager.sceneCountInBuildSettings;
            if (count == 0) return null;
            var wanted = System.Environment.GetEnvironmentVariable("ROOKERY_SCENE");
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

        static List<GameObject> Matching(string target)
        {
            var t = (target ?? "").Trim().ToLowerInvariant();
            if (t.Length == 0) return new List<GameObject>();
            return Object.FindObjectsByType<GameObject>(FindObjectsSortMode.None)
                .Where(g => g.name.ToLowerInvariant().Contains(t))
                .ToList();
        }

#if ENABLE_INPUT_SYSTEM
        static Key ToKey(string name)
        {
            var n = (name ?? "").Trim().ToLowerInvariant();
            switch (n)
            {
                case "space": return Key.Space;
                case "enter": case "return": return Key.Enter;
                case "escape": case "esc": return Key.Escape;
                case "shift": return Key.LeftShift;
                case "ctrl": case "control": return Key.LeftCtrl;
                case "up": return Key.UpArrow;
                case "down": return Key.DownArrow;
                case "left": return Key.LeftArrow;
                case "right": return Key.RightArrow;
            }
            if (n.Length == 1 && n[0] >= 'a' && n[0] <= 'z')
                return Key.A + (n[0] - 'a');
            if (n.Length == 1 && n[0] >= '0' && n[0] <= '9')
                return Key.Digit0 + (n[0] - '0');
            return Key.None;
        }

        static IEnumerator Tap(Key key, int frames)
        {
            var kb = InputSystem.GetDevice<Keyboard>() ?? InputSystem.AddDevice<Keyboard>();
            InputSystem.QueueStateEvent(kb, new KeyboardState(key));
            InputSystem.Update();
            for (var i = 0; i < frames; i++) yield return null;
            InputSystem.QueueStateEvent(kb, new KeyboardState());
            InputSystem.Update();
            yield return null;
        }
#endif

        /// <summary>씬 안의 빛을 한 줄로 요약한다. 낮↔밤은 여기가 달라진다.</summary>
        static string LightFingerprint()
        {
            var lights = Object.FindObjectsByType<Light>(FindObjectsSortMode.None);
            if (lights.Length == 0) return "none";
            return string.Join("|", lights
                .OrderBy(l => l.name)
                .Select(l => $"{l.name}:{l.transform.eulerAngles}:{l.color}:{l.intensity:F2}"));
        }

        [UnityTest]
        public IEnumerator 약속한_것이_실제로_그렇게_된다()
        {
            var sheet = LoadSheet();
            if (sheet?.checks == null || sheet.checks.Length == 0)
            {
                Assert.Inconclusive(
                    "잴 표가 없습니다. 이 판의 합격 기준을 아무도 안 눌러 봤습니다.");
                yield break;
            }

            var scenePath = TargetScenePath();
            if (string.IsNullOrEmpty(scenePath))
            {
                Assert.Inconclusive("빌드 설정에 씬이 없습니다.");
                yield break;
            }

            var failed = new List<string>();
            var unmeasured = new List<string>();
            var passed = 0;

            foreach (var check in sheet.checks)
            {
                // 아무도 판정을 안 남기고 끝나는 길이 생기면 그건 **못 잼**이다.
                // 빈 값을 통과로 흘리지 않으려고 미리 그렇게 둔다.
                var outcome = $"SKIP [{check.index}] 판정이 나오지 않았습니다.";
                yield return One(check, scenePath, r => outcome = r);

                var verdict = outcome.StartsWith("PASS") ? "PASS"
                            : outcome.StartsWith("FAIL") ? "FAIL" : "SKIP";
                var detail = outcome.Length > 5 ? outcome.Substring(5) : outcome;
                // 한 줄로 눕혀서 남긴다. 심부름꾼이 줄 단위로 읽는다.
                Debug.Log($"{Mark}{check.index}\t{verdict}\t{check.criterion}\t"
                          + detail.Replace("\n", " / "));

                if (verdict == "PASS") passed++;
                else if (verdict == "FAIL") failed.Add(detail);
                else unmeasured.Add(detail);
            }

            var summary = $"약속 {sheet.checks.Length}개 · 지킴 {passed} · 어김 {failed.Count}"
                        + $" · 못 잼 {unmeasured.Count}";
            if (failed.Count > 0)
                Assert.Fail(summary + "\n" + string.Join("\n", failed));
            if (passed == 0)
                // 하나도 못 쟀는데 통과라고 하지 않는다. 못 잴수록 잘 통과하면
                // 그건 판정이 아니다.
                Assert.Inconclusive(summary + "\n" + string.Join("\n", unmeasured));
            if (unmeasured.Count > 0)
                Debug.Log($"{Mark}0\tNOTE\t{summary}");
        }

        /// <summary>표 한 줄. 결과를 `PASS`/`FAIL `/`SKIP ` 으로 돌려준다.</summary>
        IEnumerator One(Check check, string scenePath, System.Action<string> report)
        {
            var label = $"[{check.index}] {check.criterion}";

            SceneManager.LoadScene(scenePath, LoadSceneMode.Single);
            for (var i = 0; i < SettleFrames; i++) yield return null;

            var before = Matching(check.target);
            if (before.Count == 0 && check.observe != "appears" && check.observe != "countUp")
            {
                // 겨눌 것이 처음부터 없으면 떨어뜨리지 않는다 — 게임이 틀린
                // 것인지 표가 틀린 것인지 여기서는 못 가른다.
                report($"SKIP {label}\n  씬에 '{check.target}' 이 없어 겨눌 데가 없습니다.");
                yield break;
            }

            var firstBefore = before.FirstOrDefault();
            var posBefore = firstBefore != null ? firstBefore.transform.position : Vector3.zero;
            var countBefore = before.Count;
            var lightBefore = LightFingerprint();
            var existedBefore = firstBefore != null;

            // ── 시킨다 ────────────────────────────────────────────
            switch ((check.action ?? "none").ToLowerInvariant())
            {
                case "press":
                case "hold":
#if ENABLE_INPUT_SYSTEM
                    var key = ToKey(check.key);
                    if (key == Key.None)
                    {
                        report($"SKIP {label}\n  '{check.key}' 는 흉내 낼 수 없는 키입니다.");
                        yield break;
                    }
                    var frames = check.action.ToLowerInvariant() == "hold"
                        ? Mathf.Max(ObserveFrames, Mathf.RoundToInt(check.seconds * 50))
                        : 12;
                    yield return Tap(key, frames);
#else
                    // 새 입력이 꺼진 프로젝트에서는 키를 흉내 낼 수 없다.
                    // "안 움직인다" 와 "내 입력이 안 갔다" 를 못 가른다.
                    report($"SKIP {label}\n  새 입력 시스템이 꺼져 있어 키를 흉내 낼 수 없습니다.");
                    yield break;
#endif
                    break;
                case "wait":
                    var wait = Mathf.Clamp(check.seconds, 0.1f, 40f);
                    var until = Time.time + wait;
                    while (Time.time < until) yield return null;
                    break;
            }

            for (var i = 0; i < ObserveFrames; i++) yield return null;

            // ── 본다 ──────────────────────────────────────────────
            var after = Matching(check.target);
            var firstAfter = after.FirstOrDefault();

            switch ((check.observe ?? "").ToLowerInvariant())
            {
                case "moves":
                    if (firstAfter == null) { report($"SKIP {label}\n  '{check.target}' 이 사라졌습니다."); yield break; }
                    var moved = Vector3.Distance(posBefore, firstAfter.transform.position);
                    report(moved > 0.01f ? "PASS"
                        : $"FAIL {label}\n  {check.why}\n  '{check.target}' 이 그대로입니다({moved:F4}).");
                    break;

                case "stays":
                    if (firstAfter == null) { report($"FAIL {label}\n  '{check.target}' 이 사라졌습니다."); yield break; }
                    var drift = Vector3.Distance(posBefore, firstAfter.transform.position);
                    report(drift < 0.05f ? "PASS"
                        : $"FAIL {label}\n  {check.why}\n  '{check.target}' 이 움직였습니다({drift:F4}).");
                    break;

                case "appears":
                    report(!existedBefore && firstAfter != null ? "PASS"
                        : $"FAIL {label}\n  {check.why}\n  '{check.target}' 이 생기지 않았습니다.");
                    break;

                case "disappears":
                    report(existedBefore && firstAfter == null ? "PASS"
                        : $"FAIL {label}\n  {check.why}\n  '{check.target}' 이 아직 있습니다.");
                    break;

                case "countup":
                    report(after.Count > countBefore ? "PASS"
                        : $"FAIL {label}\n  {check.why}\n  '{check.target}' 이 {countBefore}개 그대로입니다.");
                    break;

                case "countdown":
                    report(after.Count < countBefore ? "PASS"
                        : $"FAIL {label}\n  {check.why}\n  '{check.target}' 이 {countBefore}개 그대로입니다.");
                    break;

                case "lightchanges":
                    if (lightBefore == "none")
                    {
                        report($"SKIP {label}\n  씬에 빛이 없어 변화를 잴 수 없습니다.");
                        yield break;
                    }
                    report(LightFingerprint() != lightBefore ? "PASS"
                        : $"FAIL {label}\n  {check.why}\n  빛이 그대로입니다.");
                    break;

                default:
                    report($"SKIP {label}\n  '{check.observe}' 는 이 시험기가 모르는 관찰입니다.");
                    break;
            }
        }
    }
}
