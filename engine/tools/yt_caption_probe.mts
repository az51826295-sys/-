/**
 * **자막이 실제로 뽑히나** — 값 0으로 확인한다 (226회차 09-28).
 *
 *   npx tsx engine/tools/yt_caption_probe.mts <영상id...>
 *
 * 09-28: 링크 5개를 "다 읽힌다" 고 말했는데 실제로 읽힌 것은 1개였다. 내 확인이 대리 지표였다 —
 * 페이지에 `captionTracks` 가 있는 것과 **자막이 뽑히는 것**은 다르다.
 * 그래서 분석이 쓰는 길(innertube IOS→ANDROID)을 **그대로** 밟아 본다.
 *
 * **경고 — 이 자가 재는 대상을 바꾼다.** 유튜브 자막은 **429 로 속도 제한**된다. 다섯 영상을
 * 연달아 확인하면 그 자체로 막혀서, 바로 뒤에 넣은 진짜 판이 0자로 들어온다(09-28 에 그랬다).
 * 그래서 이 자는 **한두 개만** 확인하고, 돌린 뒤 **몇 분 기다린 다음** 주문을 넣는다.
 * 여러 개를 다 확인하고 싶으면 사이를 띄운다(`--쉼 20`).
 */
import { Innertube, ClientType, Log as YtLog } from "youtubei.js";
YtLog.setLevel(YtLog.Level.NONE);

const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!ids.length) { console.log("사용: yt_caption_probe.mts <id> [id...]"); process.exit(0); }

const 쉼초 = Number(process.argv[process.argv.indexOf("--쉼") + 1]) || 0;
for (const [i, id] of ids.entries()) {
  if (i > 0 && 쉼초) { console.log(`  (${쉼초}초 쉬는 중 — 429 를 피한다)`); await new Promise((r) => setTimeout(r, 쉼초 * 1000)); }
  let 됐다 = false;
  for (const client of [ClientType.ANDROID, ClientType.IOS]) {
    try {
      const yt = await Innertube.create({ client_type: client });
      const info = await yt.getBasicInfo(id, { client: client === ClientType.ANDROID ? "ANDROID" : "IOS" });
      const tracks = (info.captions?.caption_tracks ?? []) as { language_code: string; base_url: string }[];
      if (!tracks.length) { console.log(`  ${id} ${String(client)}: 자막 트랙 0개`); continue; }
      const pick = tracks.find((t) => t.language_code === "en") ?? tracks.find((t) => t.language_code === "ko") ?? tracks[0];
      const r = await fetch(pick.base_url + "&fmt=json3");
      if (!r.ok) { console.log(`  ${id} ${String(client)}: 트랙 ${tracks.length}개인데 받기 실패 HTTP ${r.status}`); continue; }
      const j = (await r.json()) as { events?: { segs?: { utf8: string }[] }[] };
      const 글자 = (j.events ?? []).flatMap((e) => e.segs ?? []).map((x) => x.utf8).join("").length;
      console.log(`  **${id} 읽힌다** (${String(client)}) · 트랙 ${tracks.length}개 · ${pick.language_code} · ${글자.toLocaleString()}자`);
      됐다 = true;
      break;
    } catch (e) {
      console.log(`  ${id} ${String(client)}: ${e instanceof Error ? e.message.slice(0, 90) : e}`);
    }
  }
  if (!됐다) console.log(`  **${id} 못 읽는다** — 이 링크로 분석하면 그 줄은 0자로 들어간다`);
}
