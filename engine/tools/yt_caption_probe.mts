/**
 * **자막이 실제로 뽑히나** — 값 0으로 확인한다 (226회차 09-28).
 *
 *   npx tsx engine/tools/yt_caption_probe.mts <영상id...>
 *
 * 09-28: 링크 5개를 "다 읽힌다" 고 말했는데 실제로 읽힌 것은 1개였다. 내 확인이 대리 지표였다 —
 * 페이지에 `captionTracks` 가 있는 것과 **자막이 뽑히는 것**은 다르다.
 * 그래서 분석이 쓰는 길(innertube ANDROID→IOS)을 **그대로** 밟아 본다. 주문을 넣기 전에 이걸 돌린다.
 */
import { Innertube, ClientType, Log as YtLog } from "youtubei.js";
YtLog.setLevel(YtLog.Level.NONE);

const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!ids.length) { console.log("사용: yt_caption_probe.mts <id> [id...]"); process.exit(0); }

for (const id of ids) {
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
