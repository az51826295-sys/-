/**
 * **두근도트 캐릭터 그림 자** (10-28).
 *   npx tsx engine/tools/dot_art_check.mts
 *   npx tsx engine/tools/dot_art_check.mts --사보타주   ← 자가 눈이 있나 본다
 *
 * `dot_characters` 가 들고 있는 **모든 그림 주소를 실제로 두드린다.** 표에 값이 있는 것과
 * 그 주소가 열리는 것은 다른 일이다 — 10-28 에 린·서하·유나의 **멘헤라 그림 12장씩이
 * 전부 404** 였는데 표에는 멀쩡히 적혀 있었다. 파는 기능의 그림이 없었다.
 *
 * ## 왜 표만 보면 안 되나
 *
 * 그림은 세 군데에 흩어져 있었다: 앱 `public/`, 옛 Supabase, 그리고 **아무 데도 없음**.
 * 셋 다 표에서는 똑같이 "주소가 적혀 있음" 으로 보인다. 자는 HTTP 로 물어봐야 한다.
 *
 * ## 세는 법
 *
 * 캐릭터마다 sprites · faces · photos 를 전부 센다. **공개된 캐릭터의 깨진 그림은 고장**이고,
 * 비공개 캐릭터는 아직 안 낸 것이라 따로 센다(0 으로 묻지 않는다 — 출시 전에 읽어야 한다).
 */
const 사보타주 = process.argv.includes("--사보타주");

const vars = JSON.parse(
  await (await import("node:fs/promises")).readFile(process.env.SCRATCH + "/dotvars.json", "utf8"),
) as Record<string, string>;
const URL_ = vars.NEXT_PUBLIC_SUPABASE_URL;
const KEY = vars.SUPABASE_SECRET_KEY;

type 캐릭 = {
  slug: string; is_public: boolean;
  sprites: Record<string, string> | null;
  faces: Record<string, string> | null;
  photos: { url: string }[] | null;
};

const r = await fetch(`${URL_}/rest/v1/dot_characters?select=slug,is_public,sprites,faces,photos`, {
  headers: { apikey: KEY, authorization: "Bearer " + KEY },
});
if (!r.ok) {
  /* **못 읽은 것을 0 으로 적지 않는다.** 표를 못 읽으면 깨짐 0 이 아니라 못 잼이다. */
  console.error(`표를 못 읽었다: ${r.status} ${(await r.text()).slice(0, 120)}`);
  process.exit(2);
}
const rows = (await r.json()) as 캐릭[];

/** 한 주소가 열리나. 사보타주면 **무조건 열렸다고 한다**(자가 눈을 잃는다). */
async function 열리나(u: string): Promise<number> {
  if (사보타주) return 200;
  try {
    const x = await fetch(u, { method: "HEAD" });
    return x.status;
  } catch {
    return 0;
  }
}

let 공개깨짐 = 0, 비공개깨짐 = 0, 전체 = 0;
const 줄: string[] = [];

for (const c of rows) {
  if (c.slug === "test-plumbing") continue;          // 배관 시험용 — 그림이 없는 게 맞다
  const 것들: [string, string][] = [];
  for (const k in c.sprites ?? {}) 것들.push([`몸:${k}`, c.sprites![k]]);
  for (const k in c.faces ?? {}) 것들.push([`얼굴:${k}`, c.faces![k]]);
  (c.photos ?? []).forEach((p, i) => 것들.push([`사진:${i + 1}`, p.url]));

  const 깨짐: string[] = [];
  const 바깥: string[] = [];
  await Promise.all(것들.map(async ([n, u]) => {
    전체++;
    const s = await 열리나(u);
    if (s !== 200) 깨짐.push(`${n}(${s || "못닿음"})`);
    /* 앱 바깥(옛 Supabase)에서 나오는 그림도 적는다. 지금은 열리지만 그 프로젝트가 사라지면
       같이 사라진다 — 10-26 에 로키 운영 DB 가 그렇게 없어졌다. */
    else if (!u.includes("/dot-sprites/") || u.includes("supabase.co")) 바깥.push(n);
  }));

  if (c.is_public) 공개깨짐 += 깨짐.length; else 비공개깨짐 += 깨짐.length;
  줄.push(
    `${c.slug.padEnd(8)} ${(c.is_public ? "공개" : "비공개").padEnd(6)} ` +
    `${String(것들.length).padStart(3)}장  깨짐 ${String(깨짐.length).padStart(2)}  앱밖 ${String(바깥.length).padStart(2)}` +
    (깨짐.length ? `\n         ${깨짐.slice(0, 8).join(", ")}${깨짐.length > 8 ? " …" : ""}` : ""),
  );
}

console.log(줄.join("\n"));
console.log(`\n그림 ${전체}장 · **공개 캐릭터 깨짐 ${공개깨짐}장** · 비공개 깨짐 ${비공개깨짐}장`);
if (사보타주) {
  console.log("사보타주: 눈을 감겼다. 위 깨짐이 0 이면 **자가 아무것도 안 보고 있다**.");
}
process.exit(공개깨짐 === 0 ? 0 : 1);
