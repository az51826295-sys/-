/**
 * **얼굴 단계 자** (11-13) — `npx tsx engine/work/lie/얼굴자.mts`
 * 얼굴이 화면의 말(`압박말`·`분노말`·`당황말`)과 **같은 자리에서** 바뀌나, 차례가 맞나, 그림이 다 있나.
 */
import { existsSync } from "node:fs";
import { faceStage, faceUrl, FACE_STAGES } from "../../../src/lib/lie/face";
let 맞은 = 0, 틀린 = 0;
const 맞 = (b: boolean, s: string) => { b ? 맞은++ : 틀린++; console.log(`${b ? "맞음" : "틀림"}  ${s}`); };
const f = (압박: number, 당황 = 0, 분노 = 0, 무너짐 = false) => faceStage({ 압박, 당황, 분노 }, 무너짐);

맞(f(10) === "calm", "처음 상태(압박 10)는 침착");
맞(f(24) === "calm" && f(25) === "tense", "압박 25 에서 긴장으로 — 화면이 '조금 긴장' 이라고 말하는 자리");
맞(f(49) === "tense" && f(50) === "cornered", "압박 50 에서 몰림으로 — '불편하다' 자리");
맞(f(10, 24) === "calm" && f(10, 25) === "rattled", "당황 25 에서 당황 얼굴 — '흔들린다' 자리");
맞(f(10, 0, 39) === "calm" && f(10, 0, 40) === "angry", "분노 40 에서 화난 얼굴 — '기분이 상했다' 자리");
/* 차례 — 겹칠 때 누가 이기나 */
맞(f(90, 60, 50) === "angry", "분노가 당황·압박을 이긴다(입 닫기 전에 얼굴이 먼저 알린다)");
맞(f(90, 60, 0) === "rattled", "당황이 압박을 이긴다(방금 한 방 맞았다)");
맞(f(0, 0, 0, true) === "broken" && f(90, 90, 90, true) === "broken", "무너졌으면 무엇이 오든 무너진 얼굴");
/* 그림 — 단계가 가리키는 파일이 정말 있나(없으면 깨진 그림이 뜬다) */
for (const k of ["han", "yun", "park"]) {
  const 없는 = FACE_STAGES.filter((s) => !existsSync("public" + faceUrl(`/lie/${k}`, s)));
  맞(없는.length === 0, `${k} 여섯 장이 다 있다${없는.length ? ` — 없는 것: ${없는.join(",")}` : ""}`);
}
console.log(`\n${틀린 ? "**틀린 줄 있음**" : "**전부 맞음**"} (${맞은}/${맞은 + 틀린})`);
if (틀린) process.exit(1);
