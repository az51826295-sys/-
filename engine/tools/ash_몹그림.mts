/**
 * **몬스터를 지피티로 뽑는다** (10-10 사장님 승인). 모델 0 · 값: 그림 토큰만.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ash_몹그림.mts [이름…] [--진짜] [--장수=2]
 *
 * 제미나이 크레딧이 떨어져 `dot_캐릭터.mts` 를 못 쓴다. 탑 그림(`ash_탑그림.mts`)처럼
 * OpenAI `gpt-image-2` 로 뽑는다. 이 모델은 **투명 배경을 안 준다**(10-10 확인) —
 * 그래서 **선명한 마젠타 한 색**으로 뽑고 기계가 지운다. 지워진 정도는 숫자로 재서 같이 찍는다
 * (10-09 교훈: 배경 자가 없어서 안 지워진 판에 1등을 줬다).
 *
 * 결은 **10-07 사장님 기준**을 그대로 따른다 — 안 화려하게, 철 갑옷, 바랜 색,
 * 얼굴을 다 그리면 어색하니 가리거나 어둠에 둔다, 귀여움은 접는다.
 * 크기 지시는 모델이 두 번 다 안 지켰으므로(10-09) **기계가 줄인다** — ash_적넣기.mts 의 목표몸.
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";

const 뿌리 = "C:/Users/az518/Desktop/로키-도트/캐릭터";
const 진짜 = process.argv.includes("--진짜");
const 장수 = Number(process.argv.find((a) => a.startsWith("--장수="))?.split("=")[1] ?? 2);

/** 10~19층 [버려진 광산] — 사장님 10-10 명세. 결은 기사(10-07)에 맞춘다. */
const 몹 = {
  "코볼트 주술사": [
    "A kobold shaman monster: a small hunched lizard-dog creature with dull grey-green scaly skin,",
    "wearing a ragged brown hide cloak and a crude bone necklace, one ear torn.",
    "It grips a short gnarled wooden staff topped with a dim dull-amber stone. Small pale eyes, no visible teeth bared.",
    "A small monster: about 60% of a human's height.",
  ].join(" "),
  "광산 해골 인부": [
    "A skeleton miner monster: a bare yellowed-bone skeleton still wearing a torn leather work apron and a dented iron miner's helmet,",
    "a snapped lantern hook at its belt. It holds a worn iron pickaxe with a chipped head.",
    "Empty eye sockets with a faint dim glow. Coal dust and grime on the bones.",
    "About 95% of a human's height, thin and stooped.",
  ].join(" "),
  /* ── 20~29층 [통곡의 고탑 회랑] + 관문 보스 둘 (10-10 사장님 명세) ── */
  "침묵의 기사": [
    "A silent knight monster: a tall suit of dull grey plate armor standing on its own, visor shut, NOTHING inside —",
    "the gaps between the plates are pure black. A torn colorless surcoat hangs from it. It holds a heavy longsword point-down.",
    "Pitted, scratched, old metal. No glow anywhere, no eyes.",
    "About 110% of a human's height, broad and still.",
  ].join(" "),
  "가고일 파수꾼": [
    "A gargoyle sentinel monster: a squat stone creature of grey weathered granite, wings folded tight against its back,",
    "a blunt horned head and heavy clawed hands. Moss and dust in the carved grooves, one wing tip broken off.",
    "It looks half statue, half awake. Dull stone only — no glow, no color.",
    "About 85% of a human's height, wide and heavy.",
  ].join(" "),
  "원혼의 영체": [
    "A wraith monster: a tattered hooded shroud in washed-out grey, with NO body inside — the lower half frays away into smoke",
    "instead of legs. Two faint cold-white pinpricks where eyes would be. Thin skeletal hands reach out from the sleeves.",
    "Desaturated and dim; it does not light anything around it.",
    "About 100% of a human's height, narrow and drifting.",
  ].join(" "),
  "지옥사냥개": [
    "A hellhound BOSS monster: a huge gaunt black hound with matted scorched fur, ribs showing through burnt hide,",
    "a heavy iron collar with a snapped chain, cracked skin along its back showing dull ember-red underneath.",
    "Lips drawn back over long teeth. The embers are **dim and smoldering**, not bright fire — more ash than flame.",
    "A BOSS: about 130% of a human's height, long and low to the ground.",
  ].join(" "),
  "망령의 거인": [
    "A wraith giant BOSS monster: a towering gaunt humanoid of grey ash-flesh and exposed bone, draped in enormous tattered",
    "burial wrappings that trail behind it. Its ribcage is hollow and dark inside. A cracked crown of dull iron on its brow,",
    "head bowed, long heavy arms. Two faint cold-white pinpricks for eyes.",
    "A BOSS: about 180% of a human's height, very tall and broad.",
  ].join(" "),
  /* 10-11 뽑기 첫 동료 — 전투 사제 로제 (버퍼). 기사·회복술사와 **안 겹치게** 금과 흰빛. */
  "전투 사제": [
    "A battle priestess: a young woman in a long white-and-gold robe over light chainmail, a hooded mantle pushed back",
    "so her face and short pale hair show. She holds a tall iron censer on a chain in one hand, raised,",
    "and a closed prayer book at her hip. A thin gold circlet.",
    "Warmer and cleaner than the others — pale cream, soft gold, muted blue — but still worn cloth, not shiny.",
    "About the same height as a human, standing straight.",
  ].join(" "),
  /* ── 31~45층 [침묵의 성소] — 4구간 (10-11 사장님·제미나이 명세).
     결: 신성하되 **타락했다.** 금은 바래고, 석상은 금이 갔고, 아무도 말을 안 한다. ── */
  "타락한 사제": [
    "A fallen priest monster: a gaunt hooded figure in a once-white robe now grey and stained, frayed at the hem,",
    "a heavy tarnished brass censer swinging from one hand and a cracked stone tablet clutched to the chest.",
    "The hood hides the upper face entirely; only a slack jaw and a stitched-shut mouth show beneath.",
    "Washed-out cream and dull brass, nothing gold or bright.",
    "About 100% of a human's height, stooped and shuffling.",
  ].join(" "),
  "수호 돌조각": [
    "A guardian stone fragment monster: a floating chunk of carved grey temple stone, roughly the shape of a broken",
    "angel's torso and one outstretched arm, the face sheared clean off. Chipped carved robes and a cracked halo ring",
    "hovering askew above it. Dust and old mortar in the grooves. Dull granite only, no glow.",
    "About 90% of a human's height, hanging just above the ground.",
  ].join(" "),
  "침묵의 심판관": [
    "A silent judge BOSS monster: a tall figure in heavy grey ceremonial plate over a long tattered vestment,",
    "head replaced by a blank featureless stone mask with NO eyes and NO mouth — perfectly smooth.",
    "It holds an enormous set of rusted iron scales in one hand and a judge's heavy iron rod in the other.",
    "Faded ceremonial ribbons hang from the armor, all writing on them worn away.",
    "A BOSS: about 125% of a human's height, broad-shouldered and utterly still.",
  ].join(" "),
  "이단 가고일": [
    "A heretic gargoyle monster: a crouching stone beast of dark soot-stained granite, bat wings half-spread and torn,",
    "a snarling horned head with the eyes CHISELED OUT — two blank gouges. Broken iron chains hang from its wrists",
    "and a defaced stone plaque is bolted to its chest, the carving scratched away.",
    "Darker and rougher than temple stone. No glow, no color.",
    "About 95% of a human's height, hunched low on all fours.",
  ].join(" "),
  /* ── 46~60층 [맹독의 지하 늪] — 5구간 (10-11 사장님·제미나이 명세).
     결: 썩은 물과 산성. 1·3구간의 슬라임·쥐·가고일과 **한눈에 달라야** 한다 —
     그쪽은 마르고 먼지투성이, 여기는 **젖고 부풀고 녹아내린다.** ── */
  "늪지 슬라임": [
    "A bog slime monster: a large sagging blob of murky olive-brown sludge, half-melted and dripping, with bits of",
    "bone, rusted metal and rotten reeds suspended inside it. Its surface is wet and pitted, sloughing off in strings.",
    "Two dull sunken dark spots serve as eyes. Sickly desaturated green-brown, wet-looking but not glowing.",
    "About 80% of a human's height, wide and low, slumping.",
  ].join(" "),
  "독니 쥐": [
    "A venomfang rat monster: a bloated, mangy swamp rat the size of a dog, fur matted and slick with filth,",
    "bare patches showing swollen blotched skin. Two overlong curved fangs drip a thick dull liquid.",
    "Its tail is thick and ringed, trailing in muck. Sickly brown and grey-green, wet and heavy — not quick-looking.",
    "About 70% of a human's height at the shoulder, long and low.",
  ].join(" "),
  "부식 가고일": [
    "A corroded gargoyle monster: a stone beast whose surface is eaten away by acid — pitted, honeycombed,",
    "half its face dissolved and one wing reduced to a bare ribbed frame. Streaks of dull rust-orange and sick green",
    "run down the stone where the acid has pooled. It crouches lopsided on a crumbling limb.",
    "No glow; the colors are stains, not light.",
    "About 90% of a human's height, hunched and uneven.",
  ].join(" "),
  "맹독 히드라": [
    "A venom hydra BOSS monster: a massive swamp serpent with THREE thick necks rising from a bloated scaled body",
    "half-sunk in muck. Each head is blunt and eyeless with a gaping fanged maw, hide slick olive-black and crusted",
    "with barnacles and rot. Thick dull liquid strings from the jaws. Torn membranes between the necks.",
    "A BOSS: wide and heavy, about 140% of a human's height.",
  ].join(" "),
  /* ── 61~75층 [용암의 대장간] — 6구간 (10-11 사장님·제미나이 명세).
     결: 불은 **꺼져 가는 불**이다. 네온처럼 밝으면 결이 깨진다 — 식은 쇳물, 그을음, 잿빛 연기. ── */
  "화염 정령": [
    "A fire elemental monster: a hovering coil of smoldering ash and dim ember, roughly humanoid but with no face —",
    "a hollow smoky torso and two thin arms trailing cinders. Cracks of dull orange glow deep inside, mostly covered",
    "by grey-black soot. More smoke than flame; nothing bright, nothing neon.",
    "About 85% of a human's height, drifting just off the ground.",
  ].join(" "),
  "용암 헬하운드": [
    "A lava hound monster: a heavy four-legged beast of blackened cracked rock instead of flesh, dull orange seams",
    "glowing faintly between the plates. Its head is a blunt wedge of stone with a jagged mouth and no eyes.",
    "Soot and cooled slag crust its back; thin smoke rises from the seams. Dim and smoldering, not bright.",
    "About 80% of a human's height at the shoulder, long and low.",
  ].join(" "),
  "대장장이 고블린": [
    "A smith goblin monster: a short, thickset goblin in a scorched leather apron over patchwork iron plates,",
    "a riveted helmet pulled low over its eyes and a soot-blackened face. It grips a heavy blacksmith's hammer",
    "in both hands. Burn scars, cinder holes in the apron, dull hammered metal — nothing polished.",
    "About 65% of a human's height, broad and squat.",
  ].join(" "),
  "고대 용암 골렘": [
    "An ancient lava golem BOSS monster: a massive hulking figure built of fractured black basalt slabs with",
    "dull cooling orange seams running between them. One arm ends in a huge blunt fist, the other in a jagged spur.",
    "Its head is a low featureless block sunk between enormous shoulders. Slag and ash crust the whole body;",
    "the glow is deep and faint, like a dying forge.",
    "A BOSS: about 135% of a human's height, very broad.",
  ].join(" "),
  /* 10-11 뽑기 SR 동료 둘 (사장님·제미나이 명세). 기존 다섯과 **안 겹치게**:
     로건은 붉은 바이저로 얼굴을 완전히 가린 중장갑(기사 세리안은 푸른 강철·얼굴 어둠),
     이브는 검은 가죽에 철제 스파이크(검사는 붉은 두건·정직한 직타). */
  "성기사": [
    "A paladin: a heavy armored knight in thick, blocky, battered iron plate, a large tower shield held at the ready",
    "and a broad sword at the hip. The helmet is a closed visor with a dull DARK RED slit — the face is COMPLETELY hidden.",
    "Faded crimson cloth straps and a short torn tabard over the plate. Scratched, dented, dusty metal; no gold, no shine.",
    "Broad and heavy, about 105% of a human's height, standing planted.",
  ].join(" "),
  "암살자": [
    "An assassin: a lean figure in black worn leather with riveted iron spiked shoulder plates and bracers,",
    "a deep hood pulled low so the face is LOST IN SHADOW — no features visible at all. A worn dark cloak, straps and pouches.",
    "A chipped iron dagger held in each hand, reverse grip. Blacks and cold greys only, dull and dusty, nothing shiny.",
    "Slim, about 95% of a human's height, crouched slightly forward.",
  ].join(" "),
  "동굴 암살자": [
    "A cave assassin monster: a lean human-shaped figure wrapped head to toe in dark grey-brown rags and worn leather straps,",
    "the face completely hidden by a wound cloth with only a thin dark slit. Dull iron dagger in a reverse grip.",
    "Everything is desaturated and dusty — no bright colors, no exposed skin.",
    "About 90% of a human's height, crouched low and quick.",
  ].join(" "),
};

const 결 = [
  "Style: 16-bit SNES JRPG pixel art sprite, thick dark outlines, flat shading, limited desaturated palette.",
  "Every pixel a clear square block. Grim, worn, dusty — faded colors, dirty textures, nothing shiny or cute.",
  "A single character, full body, standing, facing right, centered.",
  "The background is a FLAT SOLID pure magenta (#FF00FF) field, edge to edge, with absolutely nothing else on it: no ground, no shadow, no scenery, no gradient, no texture, no text, no UI, no frame, no border.",
  "The character itself must contain NO magenta or pink at all.",
  "Nothing glows green, no neon, no modern objects.",
].join(" ");

const 고를 = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const 할것 = 고를.length ? 고를 : Object.keys(몹);
for (const n of 할것) if (!(n in 몹)) { console.error(`모르는 몹: ${n} (있는 것: ${Object.keys(몹).join(" · ")})`); process.exit(1); }

console.log(`몹 ${할것.length}종 × ${장수}장 — gpt-image-2 · 1024×1024 · 투명`);
if (!진짜) { console.log("--진짜 를 붙이면 뽑는다"); process.exit(0); }

const OpenAI = (await import("openai")).default;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, maxRetries: 2 });

for (const 이름 of 할것) {
  const 칸 = `${뿌리}/${이름}`;
  mkdirSync(칸, { recursive: true });
  console.log(`\n${이름}…`);
  for (let i = 1; i <= 장수; i++) {
    const r = await openai.images.generate({
      model: "gpt-image-2", prompt: `${몹[이름 as keyof typeof 몹]} ${결}`,
      n: 1, size: "1024x1024", quality: "low",
    });
    const b64 = (r as any).data?.[0]?.b64_json;
    if (!b64) { console.error(`  ${i}장째가 안 왔다`); continue; }
    const 원본 = `${칸}/_원본-${i}.png`;
    writeFileSync(원본, Buffer.from(b64, "base64"));
    // 캐릭터와 같은 비율로 줄인다 — 도트 한 칸 크기가 같아야 한 그림으로 보인다
    const 작게 = await sharp(원본).resize(256, 256, { kernel: "nearest", fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { data, info } = 작게;
    let 지움 = 0, 고침 = 0;
    const 묶 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
    for (let k = 0; k < data.length; k += info.channels) {
      const [r2, g2, b2] = [data[k], data[k + 1], data[k + 2]];
      // 마젠타 = 빨강·파랑이 높고 초록이 낮다. 가장자리의 섞인 색까지 넉넉히 집는다.
      if (r2 > 90 && b2 > 90 && g2 < Math.min(r2, b2) * 0.8) { data[k + 3] = 0; 지움++; continue; }
      /* 반투명한 곳(연기·망토·너덜거리는 천)에는 마젠타가 **배어든다.** 거기를 지우면
         그림이 뜯기므로 **색만** 끌어내려 회색 쪽으로 돌린다.
         `묶`(클램프)이 없으면 값이 음수로 내려가 0~255 를 돌아 **빨강·파랑 점**이 박힌다
         — 10-10 에 실제로 그렇게 됐고, 눈으로는 "별이 박힌 것" 처럼 보였다. */
      const 과 = (r2 + b2) / 2 - g2;
      if (r2 > g2 && b2 > g2 && 과 > 14) { data[k] = 묶(r2 - 과 * .92); data[k + 2] = 묶(b2 - 과 * .92); 고침++; }
    }
    const 칸수 = data.length / info.channels;
    await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .png().toFile(`${칸}/후보-${i}.png`);
    // 지운 뒤 **남은 것을 다시 센다** — 안 세면 보라가 박힌 판에 1등을 준다(10-09 교훈)
    const { data: d2 } = await sharp(`${칸}/후보-${i}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let 남 = 0, 튄 = 0;
    for (let k = 0; k < d2.length; k += 4) {
      if (d2[k + 3] < 8) continue;
      const [r3, g3, b3] = [d2[k], d2[k + 1], d2[k + 2]];
      if (r3 > 90 && b3 > 90 && g3 < Math.min(r3, b3) * .8) 남++;
      if ((r3 > 180 && g3 < 60 && b3 < 60) || (b3 > 180 && r3 < 60 && g3 < 60)) 튄++;
    }
    console.log(`  후보-${i}.png · 배경 지움 ${(지움 / 칸수 * 100).toFixed(0)}% · 색 고침 ${고침}`
      + `${남 || 튄 ? ` · ⚠ 남은 마젠타 ${남} · 튄 점 ${튄}` : " · 깨끗"}`);
  }
}
console.log(`\n끝. ${뿌리}/<이름>/후보-*.png — 사장님이 고른 뒤 ash_적넣기.mts 로 넣는다.`);
