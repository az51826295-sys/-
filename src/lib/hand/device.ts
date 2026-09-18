import { z } from "zod";
import type { Supabase } from "@/lib/execution/shared";

/**
 * **지금 말하는 기기** (173회차 2026-09-18).
 *
 * 사장님(09-18 아침, 아이패드에서 로키에게): *"내가 무슨 기종인지 알 수 있어? 폰 성능"* → 로키: *"못 봐. 손을 -Watch 로 돌려야…"* → **"첫번째 실패"**.
 * *"폰이 무슨 기종인지 알아야 게임을 어느 방식으로 만들지 알 수 있지."*
 *
 * 로키 답은 정직했지만 틀렸다 — 손이 없어도 **브라우저가 접속할 때 스스로 알려 주는 것**이 있다: 화면 크기·배율, 터치 여부,
 * 운영체제, GPU 이름(WebGL), 코어 수, 메모리(일부), 포인터 락 되는지. 게임을 어느 방식으로 만들지에 필요한 건 모델명이 아니라
 * 바로 이것들이다(터치면 방향키·마우스 조작을 쓰면 안 되고, 포인터 락이 없으면 FPS 마우스 시점은 안 돈다 — 09-17 의 FPS 가 그랬다).
 *
 * 손이 잰 것(`spec.ts`, 노트북 안쪽)과 다르다: 이건 **브라우저가 말해 주는 것**이라 값을 지어낼 수 없고, 대신 모델명은 못 준다
 * (사파리는 아이패드를 "Macintosh" 라고 말한다 — 터치 점 수로 안다). 지어내지 않는다: 없는 값은 없다고 적는다.
 */

export const deviceFactsSchema = z.object({
  ua: z.string().max(400),
  platform: z.string().max(80).nullable(),
  touchPoints: z.number().int().min(0).max(40),
  screen: z.object({ w: z.number().int().min(0).max(20000), h: z.number().int().min(0).max(20000), dpr: z.number().min(0).max(10) }),
  viewport: z.object({ w: z.number().int().min(0).max(20000), h: z.number().int().min(0).max(20000) }),
  cores: z.number().int().min(0).max(512).nullable(),
  memoryGB: z.number().min(0).max(1024).nullable(),
  gpu: z.string().max(200).nullable(),
  pointerLock: z.boolean(),
  standalone: z.boolean(),
  lang: z.string().max(20).nullable(),
});
export type DeviceFacts = z.infer<typeof deviceFactsSchema>;
export type SavedDevice = DeviceFacts & { at: string; key: string };

/** 사람과 모델이 읽는 한 줄 — 의견 없이 잰 값만. */
export function deviceLine(d: DeviceFacts): string {
  const ua = d.ua;
  const os = /iPhone/.test(ua) ? "iPhone(iOS)" : /iPad/.test(ua) || (/Macintosh/.test(ua) && d.touchPoints > 1) ? "iPad(iPadOS)" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "알 수 없는 OS";
  const browser = /CriOS|Chrome\//.test(ua) && !/Edg/.test(ua) ? "Chrome" : /Edg/.test(ua) ? "Edge" : /Safari\//.test(ua) && !/Chrome/.test(ua) ? "Safari" : /Firefox/.test(ua) ? "Firefox" : "브라우저 미상";
  const kind = d.touchPoints > 1 ? (Math.min(d.screen.w, d.screen.h) >= 700 ? "태블릿" : "폰") : "컴퓨터";
  const bits = [
    `${kind} · ${os} · ${browser}`,
    `화면 ${d.screen.w}×${d.screen.h}@${d.screen.dpr}x (보이는 영역 ${d.viewport.w}×${d.viewport.h})`,
    d.touchPoints > 1 ? `터치 ${d.touchPoints}점` : "터치 없음(마우스·키보드)",
    d.pointerLock ? "포인터 락 됨" : "포인터 락 안 됨(마우스 시점 FPS 불가)",
    d.gpu ? `GPU ${d.gpu}` : "GPU 이름 안 알려 줌",
    d.cores ? `코어 ${d.cores}` : null,
    d.memoryGB ? `메모리 ≥${d.memoryGB}GB` : "메모리 안 알려 줌",
    d.standalone ? "앱으로 설치됨" : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

export const deviceKey = (d: DeviceFacts) => `${d.ua}|${d.screen.w}x${d.screen.h}@${d.screen.dpr}|${d.touchPoints}`.replace(/[^A-Za-z0-9]/g, "").slice(0, 40) + String(Math.abs([...`${d.ua}|${d.screen.w}x${d.screen.h}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)));

const BUCKET = "deliverable-files";
const dir = (companyId: string) => `devices/${companyId}`;
const seen = new Map<string, number>(); // 같은 기기를 한 프로세스에서 한 시간에 한 번만 다시 쓴다

/** 이 회사에서 말하는 기기를 적어 둔다(회사·기기마다 하나). 같은 기기는 한 시간에 한 번만. */
export async function saveDevice(db: Supabase, companyId: string, d: DeviceFacts): Promise<void> {
  const key = deviceKey(d);
  const mark = `${companyId}/${key}`;
  const last = seen.get(mark) ?? 0;
  if (Date.now() - last < 3600_000) return;
  seen.set(mark, Date.now());
  const body: SavedDevice = { ...d, at: new Date().toISOString(), key };
  const { error } = await db.storage.from(BUCKET).upload(`${dir(companyId)}/${key}.json`, Buffer.from(JSON.stringify(body), "utf8"), { contentType: "application/json", upsert: true });
  if (error) { seen.delete(mark); console.warn("[기기] 못 적었다:", error.message); }
}

/** 이 회사가 쓴 기기들, 최근 것부터. */
export async function loadDevices(db: Supabase, companyId: string): Promise<SavedDevice[]> {
  const { data: list } = await db.storage.from(BUCKET).list(dir(companyId));
  const out: SavedDevice[] = [];
  for (const f of list ?? []) {
    if (!f.name.endsWith(".json")) continue;
    const { data } = await db.storage.from(BUCKET).download(`${dir(companyId)}/${f.name}`);
    if (data) { try { out.push(deviceFactsSchema.extend({ at: z.string(), key: z.string() }).parse(JSON.parse(await data.text()))); } catch { /* 깨진 파일은 건너뛴다 */ } }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}
