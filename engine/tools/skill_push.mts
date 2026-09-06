// 기술 파일을 저장소 버킷에 올린다 — 배포 없이 배운다(계획 4).
// 실행: npx tsx engine/tools/skill_push.mts <이름>   (예: unity-rules, lessons-unity_code)
//       npx tsx engine/tools/skill_push.mts --clear <이름>  → 저장소 판을 지워 씨앗(저장소 파일)으로 돌아간다
import fs from "node:fs";
const NL = String.fromCharCode(10), CR = String.fromCharCode(13);
for (const raw of fs.readFileSync(".env.local", "utf8").split(NL)) { const l = raw.replace(CR, ""); const i = l.indexOf("="); if (i < 0 || l.startsWith("#")) continue; const k = l.slice(0, i).trim(); if (!(k in process.env)) process.env[k] = l.slice(i + 1).trim(); }
const [{ createServiceClient }, { BUCKET }] = await Promise.all([import("@/lib/supabase/service"), import("@/lib/deliverables/files")]);
const args = process.argv.slice(2); const clear = args[0] === "--clear"; const name = clear ? args[1] : args[0];
if (!name) throw new Error("이름이 필요하다");
const db = createServiceClient();
if (clear) { const { error } = await db.storage.from(BUCKET).remove([`_skills/${name}.md`]); console.log(error ? "실패: " + error.message : `저장소 판 지움: ${name} (씨앗으로 돌아감)`); }
else {
  const text = fs.readFileSync(`src/skills/${name}.md`, "utf8");
  const { error } = await db.storage.from(BUCKET).upload(`_skills/${name}.md`, Buffer.from(text, "utf8"), { contentType: "text/markdown", upsert: true });
  console.log(error ? "실패: " + error.message : `올림: _skills/${name}.md (${text.length}자) — 웹·워커가 60초 안에 읽는다`);
}
