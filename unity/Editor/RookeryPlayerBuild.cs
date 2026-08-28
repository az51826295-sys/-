using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Rookery
{
    /// <summary>
    /// 켤 수 있는 것으로 만든다.
    ///
    /// 컴파일이 통과하고 씬이 지어져도, 사람이 유니티를 열어야만 볼 수 있으면
    /// "손 안 대고"가 아니다. 마지막 한 걸음은 **더블클릭하면 켜지는 파일**이다.
    ///
    /// 배치모드에서 `-executeMethod Rookery.RookeryPlayerBuild.Build` 로 부른다.
    /// 빌드 실패는 조용히 넘어가지 않는다 — 예외로 던져서 배치모드가 0이 아닌
    /// 코드로 끝나게 하고, 그래야 심부름꾼이 실패를 실패로 읽는다.
    /// </summary>
    public static class RookeryPlayerBuild
    {
        public static void Build()
        {
            // 이 세션이 만든 씬만 넣을 수 있게 한다.
            //
            // 빌드 설정에는 프로젝트가 원래 쓰던 씬이 먼저 들어 있을 수 있고,
            // 그러면 켰을 때 로키가 만든 게임이 아니라 그 씬이 뜬다. 만든 것을
            // 보여 주려고 뽑는 것인데 다른 게 뜨면 뽑은 의미가 없다.
            var only = Environment.GetEnvironmentVariable("ROOKERY_SCENE");
            var scenes = string.IsNullOrEmpty(only)
                ? EditorBuildSettings.scenes
                    .Where(s => s.enabled)
                    .Select(s => s.path)
                    .ToArray()
                : only.Split(';')
                    .Select(s => s.Trim().Replace((char)92, '/'))
                    .Where(s => s.Length > 0)
                    .ToArray();

            if (scenes.Length == 0)
            {
                // 씬이 없으면 켜도 검은 화면이다. 빈 것을 빌드해 주고 "됐다"고
                // 하면, 실패를 성공으로 포장하는 셈이다.
                throw new Exception(
                    "RookeryPlayerBuild: 넣을 씬이 없습니다. 씬을 짓는 메서드가 " +
                    "EditorBuildSettings.scenes 에 넣었는지, 또는 ROOKERY_SCENE 이 " +
                    "가리키는 경로가 맞는지 보십시오.");
            }

            var dir = Path.Combine(Directory.GetCurrentDirectory(), "Build");
            Directory.CreateDirectory(dir);

            var options = new BuildPlayerOptions
            {
                scenes = scenes,
                locationPathName = Path.Combine(dir, "Game.exe"),
                target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.None,
            };

            var report = BuildPipeline.BuildPlayer(options);
            var summary = report.summary;

            if (summary.result != BuildResult.Succeeded)
            {
                var reasons = new List<string>();
                foreach (var step in report.steps)
                foreach (var message in step.messages)
                {
                    if (message.type == LogType.Error || message.type == LogType.Exception)
                        reasons.Add(message.content);
                }
                throw new Exception(
                    "RookeryPlayerBuild: 빌드 실패 (" + summary.result + "). " +
                    string.Join(" | ", reasons.Take(5)));
            }

            Debug.Log("RookeryPlayerBuild: " + options.locationPathName +
                      " (" + summary.totalSize / (1024 * 1024) + "MB, 씬 " +
                      scenes.Length + "개)");
        }
    }
}
