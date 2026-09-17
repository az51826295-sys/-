/**
 * **같이 보기 — 사장님 화면이 로키에 온다** (163회차 2026-09-17, 164회차에 두는 자리를 바꿈).
 *
 * 사장님: *"로키가 같이 보는 거, 같이 화면에 띄우는 거 해줄 수 있어?"*
 *
 * 손(`-Watch`)이 3초마다 화면을 찍어 보낸다. 여기서는 **마지막 한 장만** 둔다(회사·기계마다 하나, 덮어쓴다) —
 * 영상 저장이 아니다. 미리보기가 그 한 장을 3초마다 다시 그리고, 사장님이 로키에 말을 걸면 그 한 장이 모델에 같이 간다.
 * 20초 넘게 새 장이 안 오면 "안 보고 있다" 로 친다 — 옛 화면을 지금 화면인 척하지 않는다.
 *
 * **두는 자리는 이 서버의 메모리다** (164회차). 첫 판은 Supabase 저장소에 3초마다 덮어썼는데, 돌리기 전에 셌다:
 * 한 장 ≈ 150KB × 시간당 1,200장 = **시간당 180MB 를 올리고, 미리보기가 같은 만큼 도로 내려받는다.** 무료 저장소의
 * 한 달 5GB 가 같이 보기 28시간에 끝난다 — 09-11 에 3D 파일 1.9GB 가 회사를 세운 것과 같은 길이다. 게다가 같은
 * 경로를 덮어쓰면 CDN 이 옛 장을 최대 60초 돌려줄 수 있다(20초 규칙이 거짓말이 된다). 마지막 한 장은 어차피
 * 20초짜리 목숨이라 디스크에 둘 이유가 없다. 서버가 다시 뜨면 3초 뒤 다음 장이 온다.
 * 전제: rookery-web 은 한 개로 돈다(보내는 곳·그리는 곳·대화가 같은 프로세스). 늘리면 이 자리를 공유 저장으로 옮겨야 한다.
 */

export const FRESH_MS = 20_000;
/** 한 회사가 둘 수 있는 기계 수. 열쇠가 새도 메모리를 못 채운다. */
const MAX_HOSTS = 4;

type Frame = { host: string; at: number; jpg: Buffer };
const store: Map<string, Map<string, Frame>> =
  ((globalThis as { __rookeryScreens?: Map<string, Map<string, Frame>> }).__rookeryScreens ??= new Map());

const cleanHost = (host: string) => host.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);

export function saveFrame(companyId: string, host: string, jpg: Buffer, now = Date.now()): void {
  const mine = store.get(companyId) ?? new Map<string, Frame>();
  store.set(companyId, mine);
  const h = cleanHost(host);
  mine.set(h, { host: h, at: now, jpg });
  // 넘치면 가장 오래된 기계부터 내린다.
  while (mine.size > MAX_HOSTS) {
    const oldest = [...mine.values()].sort((a, b) => a.at - b.at)[0];
    mine.delete(oldest.host);
  }
}

/** 지금 들고 있는 기계 이름들(자 `watch_probe.mts` 가 상한을 잴 때 쓴다). */
export const hostsOf = (companyId: string): string[] => [...(store.get(companyId)?.keys() ?? [])];

/** 가장 최근 화면. 20초 안의 것만 — 아니면 null(안 보고 있다). 지난 장은 그 자리에서 버린다. */
export function latestFrame(companyId: string, now = Date.now(), freshMs = FRESH_MS): { host: string; at: string; ageMs: number; jpg: Buffer } | null {
  const mine = store.get(companyId);
  if (!mine) return null;
  for (const f of [...mine.values()]) if (now - f.at > freshMs) mine.delete(f.host);
  if (mine.size === 0) { store.delete(companyId); return null; }
  const f = [...mine.values()].sort((a, b) => b.at - a.at)[0];
  return { host: f.host, at: new Date(f.at).toISOString(), ageMs: now - f.at, jpg: f.jpg };
}
