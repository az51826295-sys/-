// 두근도트를 **자기 Supabase 프로젝트**로 옮긴다 (09-11).
//
// 왜: 게임 실험(로키)이 같은 프로젝트에 3D 파일 1.9GB 를 쌓아 무료 한도(1GB·전송 5GB)를 넘겼고,
// Supabase 가 프로젝트 전체를 막았다 — 두근도트는 0MB 를 쓰는데 같이 죽었다.
// 소비자 앱은 실험실과 지갑을 같이 쓰면 안 된다.
//
//   SUPABASE_PAT=sbp_... node scripts/dot-migrate.mjs <새 프로젝트 ref> <새 프로젝트 service_role 키>
//
// 하는 일: 표·함수·정책(schema_dot_chat + schema_dot_push) → 스프라이트 버킷 → 캐릭터 4명 + 스프라이트 18장.
// 사용자 계정·대화·친밀도는 옮기지 않는다 — 아직 사장님 한 명뿐이고, 새로 가입하면 된다.
import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const [, , ref, serviceKey] = process.argv;
const pat = process.env.SUPABASE_PAT;
if (!ref || !serviceKey || !pat) { console.error("SUPABASE_PAT=... node scripts/dot-migrate.mjs <ref> <service_role key>"); process.exit(1); }

async function sql(text) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: text }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${body.slice(0, 300)}`);
  return body;
}

console.log("1) 표·함수·정책");
await sql(readFileSync("supabase/schema_dot_chat.sql", "utf8"));
await sql(readFileSync("supabase/schema_dot_push.sql", "utf8"));
await sql(`insert into storage.buckets (id, name, public) values ('dot-sprites','dot-sprites',true) on conflict (id) do update set public=true;
drop policy if exists dot_sprites_read on storage.objects;
create policy dot_sprites_read on storage.objects for select using (bucket_id = 'dot-sprites');`);

console.log("2) 캐릭터");
const db = createClient(`https://${ref}.supabase.co`, serviceKey, { auth: { persistSession: false } });
const chars = [
  { slug: "yuna", name: "유나", tagline: "오늘 하루 어땠어요?", look: "a young woman with long wavy brown hair, soft gentle eyes, wearing a cream beige knit sweater",
    persona: "다정한 연상. 늘 잘 들어주고 챙기는 걸 좋아한다. 상대의 하루를 궁금해한다. 서두르지 않고 천천히 말한다.",
    speech: "\"밥은 먹었어요?\" 가 입버릇이다. 부드럽게 말하고, 상대를 재촉하지 않는다.", greeting: "왔네요. 오늘 하루 어땠어요?", is_public: true },
  { slug: "seoha", name: "서하", tagline: "...딱히 너 때문은 아니야.", look: "a teenage girl with short silver bob hair, red eyes, black school uniform with a red ribbon",
    persona: "츤데레 동급생. 퉁명스럽지만 은근히 챙긴다. 칭찬을 받으면 당황해서 말이 꼬인다. 걱정되는 걸 티 내기 싫어한다.",
    speech: "\"...딱히 너 때문은 아니야.\" 가 입버릇이다. 문장 끝을 흐리고, 당황하면 말이 빨라진다.", greeting: "뭐야, 왜 왔어.", is_public: true },
  { slug: "rin", name: "린", tagline: "어, 왔네.", look: "a young woman with a black ponytail, sleepy half-closed eyes, wearing a grey hoodie",
    persona: "무심한 소꿉친구. 말수가 적고 담백하다. 놀리는 걸 좋아하고, 진지한 말은 짧게 한다.",
    speech: "\"어, 왔네.\" 가 입버릇이다. 짧게 끊어 말하고 감탄사를 잘 안 쓴다.", greeting: "어, 왔네.", is_public: true },
  { slug: "test-plumbing", name: "시험", tagline: "배관 시험용 — 그림 없음", look: "", persona: "배관을 시험하기 위한 임시 인물이다. 조용하고 담백하다.", speech: "짧게 말한다.", greeting: "왔어?", is_public: false },
];
const SHEET = "C:/Users/az518/AppData/Local/Temp/claude/C--Users-az518-Desktop/d7b8eaa0-592d-4d32-a057-634ae1e64f74/scratchpad/sheet";
const EMO = ["neutral", "happy", "shy", "sad", "angry", "surprised"];
for (const c of chars) {
  const sprites = {};
  if (c.is_public) {
    for (const e of EMO) {
      const path = `${c.slug}/${e}.png`;
      const { error } = await db.storage.from("dot-sprites").upload(path, readFileSync(`${SHEET}/${c.slug}-${e}.png`), { contentType: "image/png", upsert: true });
      if (error) throw new Error(`${path}: ${error.message}`);
      sprites[e] = db.storage.from("dot-sprites").getPublicUrl(path).data.publicUrl;
    }
  }
  const { error } = await db.from("dot_characters").upsert({ ...c, sprites }, { onConflict: "slug" });
  if (error) throw new Error(`${c.slug}: ${error.message}`);
  console.log(`   ${c.name} ${c.is_public ? "· 스프라이트 6장" : ""}`);
}
console.log("끝. 이제 .env.local 과 Railway 의 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SUPABASE_SECRET_KEY 를 새 프로젝트 것으로 바꾼다.");
console.log(`   ${readdirSync(SHEET).filter((f) => f.endsWith(".png")).length}개 파일 확인됨 (스크래치 폴더)`);
