// 21회차 실험: 같은 캐릭터를 2D 두 스타일(도트·손그림)로 — 정면·옆·뒤 + 옆모습 걷기 4프레임.
// 실행: node engine/tools/exp21_2d_styles.mjs <out-dir>
import fs from "node:fs";
import path from "node:path";
import OpenAI, { toFile } from "openai";

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const person = "a Korean man in his late 20s, short black hair, plain white cotton t-shirt, blue jeans, white sneakers";

const STYLES = {
  pixel: {
    form: "16-bit pixel art game sprite, chunky visible square pixels, hard edges, limited palette (max 24 colors), no anti-aliasing, no gradients, no blur",
    size: "1024x1024",
  },
  hand: {
    form: "clean 2D hand-drawn game character art, flat colors with soft cel shading, crisp black outline, anime-adjacent proportions (6 heads tall), no photo realism",
    size: "1024x1536",
  },
};

for (const [name, st] of Object.entries(STYLES)) {
  const dir = path.join(out, name); fs.mkdirSync(dir, { recursive: true });
  const front = await openai.images.generate({ model: "gpt-image-2", n: 1, size: st.size, quality: "high", background: "transparent", output_format: "png",
    prompt: `${st.form}. ONE character: ${person}, full body, standing idle pose, facing the viewer, centered, completely empty transparent background, no ground, no shadow, no text, no frame.` });
  const frontB64 = front.data[0].b64_json; fs.writeFileSync(path.join(dir, "front.png"), Buffer.from(frontB64, "base64")); log(name, "front");
  const ref = async () => toFile(Buffer.from(frontB64, "base64"), "front.png", { type: "image/png" });

  const side = await openai.images.edit({ model: "gpt-image-2", image: await ref(), n: 1, size: st.size, quality: "high", output_format: "png", background: "transparent",
    prompt: `${st.form}. The SAME character as in this image (identical face, hair, clothes, colors, proportions, pixel size), now seen from the LEFT side (profile), standing idle, same scale, centered, empty transparent background, no text.` });
  fs.writeFileSync(path.join(dir, "side.png"), Buffer.from(side.data[0].b64_json, "base64")); log(name, "side");

  const walk = await openai.images.edit({ model: "gpt-image-2", image: await ref(), n: 1, size: "1536x1024", quality: "high", output_format: "png", background: "transparent",
    prompt: `${st.form}. Sprite sheet: exactly 4 frames of a side-view WALK CYCLE of the SAME character as in this image (identical face, hair, clothes, colors, proportions), facing LEFT, arranged in ONE horizontal row, evenly spaced, same scale and same feet baseline in every frame (contact, down, passing, up), empty transparent background, no labels, no grid lines, no text.` });
  fs.writeFileSync(path.join(dir, "walk_sheet.png"), Buffer.from(walk.data[0].b64_json, "base64")); log(name, "walk sheet");
}
log("done");
