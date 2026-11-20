// gpt-5 그림체 심판(16/18 통과한 것과 같은 지시)을 실제 '가는 이탈' 그림 14장에 — 사장님 판정 전에 잠근다.
import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim().replace(/\r$/, ""); }
import { z } from "zod";
const { seatProvider } = await import("../../../src/lib/skills/appBuild/seats");
const { 칸들 } = await import("../director-art/style_dev.mts");
// 시험지에서 16/18 을 낸 지시와 글자까지 같다(style_judge_bench.mts 에서 베낌 — 아래 확인).
const SYS = [
    "너는 게임 캐릭터 그림체 심사관이다. 처음 두 장은 이 게임의 **기준 그림체**(같은 캐릭터의 두 표정)다. 마지막 한 장이 후보다.",
    "후보는 **다른 캐릭터**다 — 누구인지·머리색·옷은 달라도 된다. 오직 **그림체**가 같은지만 본다:",
    "머리와 몸의 비율, 눈·입을 그리는 방식, 선의 굵기와 색, 명암을 넣는 방식, 전체 인상.",
    "셋 다 도트(픽셀)로 뭉개져 있다 — 도트라는 사실만으로 같다고 하지 마라. 그 아래의 그림체를 봐라.",
  ].join(String.fromCharCode(10));
if (!readFileSync("engine/tools/style_judge_bench.mts","utf8").includes(SYS.split(String.fromCharCode(10))[3])) throw new Error("지시가 시험지와 다르다");
const 기준 = ["public/dot-sprites/haru/neutral.png", "public/dot-sprites/haru/happy.png"].map((p) => readFileSync(p).toString("base64"));
const schema = z.object({ sameStyle: z.number(), why: z.string() });
const ai = (await seatProvider("gpt-5"))!;
const key = JSON.parse(readFileSync("engine/work/director-art/verify/blind_key.json", "utf8")) as { row: number; slug: string; seat: string }[];
const 판들 = [
  ...key.map((k) => ({ 이름: `줄${k.row}`, sheet: `engine/work/director-art/verify/${k.seat}-${k.slug}-sheet.png` })),
  ...[["screen", "flare-low", "yuna"], ["screen", "flare-medium", "yuna"], ["screen", "sunburst-medium", "yuna"], ["screen", "img2-medium", "yuna"], ["verify", "flare-low", "soeun"], ["verify", "img2-medium", "soeun"], ["verify", "flare-low", "taeo"], ["verify", "img2-medium", "taeo"]]
    .map(([d, s, c]) => ({ 이름: `${s}-${c}`, sheet: `engine/work/director-art/${d}/${s}-${c}-sheet.png` })),
];
const out: unknown[] = [];
for (const p of 판들) {
  const n = (await 칸들(p.sheet)).find((c) => c.emotion === "neutral")!;
  const r = await ai.generateStructuredOutput({ systemInstructions: SYS, input: "기준 두 장, 그다음 후보 한 장.", images: [...기준, n.png.toString("base64")], schema, schemaName: "style_judge", maxTokens: 16000, tier: "judgment" });
  out.push({ ...p, p: r.output.sameStyle, why: r.output.why });
  console.log(`${p.이름.padEnd(20)} ${r.output.sameStyle.toFixed(2)} ${r.output.sameStyle >= 0.5 ? "같음" : "다름"}`);
}
writeFileSync("engine/work/style-bench/judge_real.json", JSON.stringify(out, null, 1));
