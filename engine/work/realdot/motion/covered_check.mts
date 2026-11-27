// 11-27 "덮인 다리" 판정이 팩 10종 중 누구에게 걸리나(돈 0) — 기본 그림을 AI 프레임 자리에 넣어 사실만 읽는다
import sharp from "sharp";
const { hybridWalk } = await import("../../../../src/lib/pixel/rigwalk");
const D = "C:/Users/az518/Desktop/두근도트-스레드";
for (const n of process.argv.slice(2)) {
  const p = n.includes("/") ? n : `${D}/itch-pack4/${n}/front.png`;
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = hybridWalk({ data, w: info.width, h: info.height }, [Buffer.from(data)], info.width, info.height);
  console.log(n.split("/").slice(-2).join("/"), r ? r.facts.join(" · ") : "다리 틈 없음(코드 걷기)");
}
