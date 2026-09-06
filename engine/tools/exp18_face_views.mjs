// 18회차 실험: 콘셉트 그림을 크게 + 얼굴 클로즈업을 추가 뷰로 → meshy-7 multi-image-to-3d.
// 사장님(09-06): 생성 AI 허가. 얼굴 화질의 원천(콘셉트 그림의 얼굴 픽셀)을 바꾼다.
// 실행: node engine/tools/exp18_face_views.mjs <out-dir>   (.env.local 의 키를 쓴다)
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MESHY = "https://api.meshy.ai/openapi/v1";
const mh = { Authorization: `Bearer ${env.MESHY_API_KEY}`, "Content-Type": "application/json" };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// 1. 전신 콘셉트 (세로 1024x1536, high). 지난 캐릭터와 같은 사람 묘사.
const person = "photorealistic man in his late 20s, short dark brown hair, clean-shaven with light stubble, plain white cotton t-shirt, blue denim jeans, white sneakers";
const full = await openai.images.generate({
  model: "gpt-image-2", prompt: `${person}, full body head to toe, standing in A-pose (arms slightly away from body), facing the camera, neutral expression, even studio lighting, no shadows on floor, plain background`,
  n: 1, size: "1024x1536", quality: "high", background: "transparent", output_format: "png",
});
const fullB64 = full.data[0].b64_json; fs.writeFileSync(path.join(out, "front.png"), Buffer.from(fullB64, "base64")); log("front.png");

// 2. 같은 사람의 얼굴 클로즈업 — 전신 그림을 참조로 편집(같은 얼굴 유지).
const toFile = async (b64, name) => {
  const { toFile } = await import("openai");
  return toFile(Buffer.from(b64, "base64"), name, { type: "image/png" });
};
const face = await openai.images.edit({
  model: "gpt-image-2", image: await toFile(fullB64, "front.png"),
  prompt: "Close-up portrait of the SAME person shown in this image: identical face, hair, and skin, head and shoulders, facing the camera straight, neutral expression, sharp focus on skin pores and hair strands, even studio lighting, plain background",
  n: 1, size: "1024x1024", quality: "high", output_format: "png",
});
const faceB64 = face.data[0].b64_json; fs.writeFileSync(path.join(out, "face.png"), Buffer.from(faceB64, "base64")); log("face.png");

// 3. 뒷모습 — 각도가 다른 뷰가 하나는 있어야 한다.
const back = await openai.images.edit({
  model: "gpt-image-2", image: await toFile(fullB64, "front.png"),
  prompt: "The SAME person shown in this image seen from directly behind, full body head to toe, same A-pose, same clothes and hair, even studio lighting, plain background",
  n: 1, size: "1024x1536", quality: "high", output_format: "png",
});
const backB64 = back.data[0].b64_json; fs.writeFileSync(path.join(out, "back.png"), Buffer.from(backB64, "base64")); log("back.png");

// 4. meshy-7 multi-image-to-3d: 앞(주), 뒤, 얼굴 클로즈업
const body = {
  image_urls: [`data:image/png;base64,${fullB64}`, `data:image/png;base64,${backB64}`, `data:image/png;base64,${faceB64}`],
  ai_model: "meshy-7", should_remesh: true, topology: "quad", target_polycount: 15000,
  enable_pbr: true, texture_resolution: "4k", pose_mode: "a-pose", auto_size: true, origin_at: "bottom",
  target_formats: ["glb", "fbx"],
};
const created = await fetch(`${MESHY}/multi-image-to-3d`, { method: "POST", headers: mh, body: JSON.stringify(body) }).then((r) => r.json());
log("meshy task", JSON.stringify(created));
const id = created.result;
let task;
for (;;) {
  task = await fetch(`${MESHY}/multi-image-to-3d/${id}`, { headers: mh }).then((r) => r.json());
  log(task.status, task.progress, "credits", task.consumed_credits);
  if (["SUCCEEDED", "FAILED", "CANCELED"].includes(task.status)) break;
  await new Promise((r) => setTimeout(r, 20000));
}
fs.writeFileSync(path.join(out, "task.json"), JSON.stringify(task, null, 2));
if (task.status !== "SUCCEEDED") { log("failed", task.task_error); process.exit(1); }
for (const [k, u] of Object.entries(task.model_urls)) {
  const b = Buffer.from(await fetch(u).then((r) => r.arrayBuffer())); fs.writeFileSync(path.join(out, `model.${k}`), b); log(`model.${k}`, (b.length / 1024 | 0), "KB");
}
const t = task.texture_urls?.[0] ?? {};
if (t.base_color) fs.writeFileSync(path.join(out, "base_color.png"), Buffer.from(await fetch(t.base_color).then((r) => r.arrayBuffer())));
if (task.thumbnail_url) fs.writeFileSync(path.join(out, "thumb.png"), Buffer.from(await fetch(task.thumbnail_url).then((r) => r.arrayBuffer())));
log("done");
