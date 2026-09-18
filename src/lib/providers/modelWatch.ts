/**
 * **새 AI를 파악한다** (171회차 2026-09-18, 2단계의 첫 조각).
 *
 * 사장님: *"현재 AI 파악하고 변경하는 기능도 꼭 있어야 돼. 난 발전에 뒤처지고 싶지 않아."*
 *
 * 로키가 부르는 모델 이름은 전부 **내가 손으로 적은 글자**다(`place.ts` 의 자리 넷, 라우터, 직원별 기본값). 새 모델이 나와도,
 * 쓰던 모델이 없어져도 로키는 모른다 — 누가 코드를 고칠 때까지. 감독 AI 의 첫 눈은 "지금 어떤 AI 들이 있는가" 다.
 *
 * 여기서 하는 것은 **파악**뿐이다(모델 0, 돈 0): 공급자의 모델 목록 문을 읽어 지난번 장부와 견준다.
 *   새로 생긴 것 · 없어진 것 · **우리가 부르는데 목록에 없는 것**(곧 죽을 호출) · 같은 집안의 더 새 것이 나온 것
 * 갈아타는 것은 여기서 안 한다 — 새 모델은 얼려 둔 시험판에 대 보고(돈), 섞어 보내 이긴 쪽으로 옮긴다(다음 조각).
 * 소문이 아니라 우리 일에서 나은지를 재야 하기 때문이다.
 */

export type Vendor = "openai" | "anthropic" | "deepseek";
export type ModelEntry = { id: string; vendor: Vendor; created?: number | null };
export type WatchSnapshot = { takenAt: string; models: ModelEntry[] };

const ENDPOINTS: Record<Vendor, { url: string; headers: (key: string) => Record<string, string>; keyEnv: string }> = {
  openai: { url: "https://api.openai.com/v1/models", headers: (k) => ({ authorization: `Bearer ${k}` }), keyEnv: "OPENAI_API_KEY" },
  anthropic: { url: "https://api.anthropic.com/v1/models?limit=1000", headers: (k) => ({ "x-api-key": k, "anthropic-version": "2023-06-01" }), keyEnv: "ANTHROPIC_API_KEY" },
  deepseek: { url: "https://api.deepseek.com/models", headers: (k) => ({ authorization: `Bearer ${k}` }), keyEnv: "DEEPSEEK_API_KEY" },
};

/** 공급자 하나의 목록. 열쇠가 없거나 문이 안 열리면 이유를 돌려준다 — 빈 목록을 "없어졌다"로 읽으면 안 된다. */
export async function listVendor(vendor: Vendor, env: Record<string, string | undefined> = process.env): Promise<{ ok: true; models: ModelEntry[] } | { ok: false; why: string }> {
  const e = ENDPOINTS[vendor];
  const key = env[e.keyEnv];
  if (!key) return { ok: false, why: `${e.keyEnv} 없음` };
  try {
    const r = await fetch(e.url, { headers: e.headers(key) });
    if (!r.ok) return { ok: false, why: `HTTP ${r.status}` };
    const j = (await r.json()) as { data?: { id: string; created?: number; created_at?: string }[] };
    const models = (j.data ?? []).map((m) => ({ id: m.id, vendor, created: typeof m.created === "number" ? m.created : m.created_at ? Math.floor(new Date(m.created_at).getTime() / 1000) : null }));
    return models.length ? { ok: true, models } : { ok: false, why: "목록이 비어 왔다" };
  } catch (err) { return { ok: false, why: err instanceof Error ? err.message : String(err) }; }
}

/** 일에 쓸 수 있는 모델만(임베딩·음성 인식·검열·옛 미세조정 같은 건 새로 나와도 우리 일이 아니다). */
export const isWorkModel = (id: string) => !/embedding|whisper|moderation|tts|transcribe|realtime|audio|^ft:|davinci|babbage|search|instruct|dall-e/i.test(id);

/** 집안: 날짜·판 꼬리를 뗀 이름. gpt-5-2026-03-01 → gpt-5 · claude-sonnet-5-20260601 → claude-sonnet-5 */
export const family = (id: string) => id.replace(/-\d{4}-\d{2}-\d{2}$/, "").replace(/-\d{8}$/, "").replace(/-(latest|preview)$/, "");

export type WatchReport = {
  vendors: Record<Vendor, { ok: boolean; count: number; why?: string }>;
  fresh: ModelEntry[];                 // 지난 장부에 없던 것(일에 쓸 수 있는 것만)
  gone: ModelEntry[];                  // 지난 장부엔 있었는데 없어진 것
  missingInUse: string[];              // **우리가 부르는데 목록에 없다** — 곧 죽을 호출
  firstRun: boolean;
};

/** 순수 계산. 목록을 못 읽은 공급자는 견주지 않는다(못 읽은 것과 없어진 것은 다르다). */
export function compareWatch(prev: WatchSnapshot | null, now: ModelEntry[], okVendors: Set<Vendor>, inUse: { id: string; vendor: Vendor }[]): Omit<WatchReport, "vendors"> {
  const nowIds = new Set(now.map((m) => m.id));
  const prevModels = (prev?.models ?? []).filter((m) => okVendors.has(m.vendor));
  const prevIds = new Set(prevModels.map((m) => m.id));
  const fresh = prev ? now.filter((m) => !prevIds.has(m.id) && isWorkModel(m.id)) : [];
  const gone = prevModels.filter((m) => !nowIds.has(m.id) && isWorkModel(m.id));
  // 날짜 꼬리가 붙은 판만 목록에 있을 수 있어 집안 이름으로도 찾는다.
  const nowFamilies = new Set(now.map((m) => family(m.id)));
  const missingInUse = inUse.filter((u) => okVendors.has(u.vendor) && !nowIds.has(u.id) && !nowFamilies.has(family(u.id))).map((u) => u.id);
  return { fresh, gone, missingInUse, firstRun: !prev };
}

/** 로키가 실제로 부르는 이름들(코드에 적힌 글자). 바뀌면 여기도 바꾼다 — 자(`model_watch.mts`)가 코드를 훑어 빠진 게 없는지 본다. */
export const IN_USE: { id: string; vendor: Vendor; where: string }[] = [
  { id: "gpt-5", vendor: "openai", where: "만들기·판단·심판" },
  { id: "gpt-5-mini", vendor: "openai", where: "싼 자리" },
  { id: "gpt-6-astra", vendor: "openai", where: "제일 비싼 자리" },
  { id: "gpt-image-2", vendor: "openai", where: "그림" },
  { id: "sora-2", vendor: "openai", where: "영상(9/24 폐기 — Veo 로 갈아탐)" },
  { id: "sora-2-pro", vendor: "openai", where: "영상(고급)" },
  { id: "gpt-4o-mini-tts", vendor: "openai", where: "목소리" },
  { id: "deepseek-v4-flash", vendor: "deepseek", where: "대화·읽기" },
  { id: "deepseek-v4-pro", vendor: "deepseek", where: "판단 기본 자리" },
  { id: "deepseek-chat", vendor: "deepseek", where: "옛 이름" },
  { id: "claude-haiku-4-5", vendor: "anthropic", where: "옆자리" },
  { id: "claude-sonnet-5", vendor: "anthropic", where: "옆자리" },
  { id: "claude-opus-5", vendor: "anthropic", where: "옆자리" },
  { id: "claude-sonnet-4-6", vendor: "anthropic", where: "옛 옆자리" },
];

export async function watchModels(prev: WatchSnapshot | null, env: Record<string, string | undefined> = process.env): Promise<{ report: WatchReport; snapshot: WatchSnapshot }> {
  const vendors = {} as WatchReport["vendors"];
  const now: ModelEntry[] = [];
  const ok = new Set<Vendor>();
  for (const v of Object.keys(ENDPOINTS) as Vendor[]) {
    const r = await listVendor(v, env);
    if (r.ok) { ok.add(v); now.push(...r.models); vendors[v] = { ok: true, count: r.models.length }; }
    else vendors[v] = { ok: false, count: 0, why: r.why };
  }
  const cmp = compareWatch(prev, now, ok, IN_USE);
  // 못 읽은 공급자의 지난 장부는 그대로 들고 간다 — 한 번 못 읽었다고 다음 주에 전부 "새로 생김"이 되면 안 된다.
  const carried = (prev?.models ?? []).filter((m) => !ok.has(m.vendor));
  return { report: { vendors, ...cmp }, snapshot: { takenAt: new Date().toISOString(), models: [...now, ...carried].sort((a, b) => (a.vendor + a.id < b.vendor + b.id ? -1 : 1)) } };
}
