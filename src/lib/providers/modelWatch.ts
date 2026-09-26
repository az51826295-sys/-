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

export type Vendor = "openai" | "anthropic" | "deepseek" | "gemini";
export type ModelEntry = { id: string; vendor: Vendor; created?: number | null };
export type WatchSnapshot = { takenAt: string; models: ModelEntry[] };

const ENDPOINTS: Record<Vendor, { url: string; headers: (key: string) => Record<string, string>; keyEnv: string }> = {
  openai: { url: "https://api.openai.com/v1/models", headers: (k) => ({ authorization: `Bearer ${k}` }), keyEnv: "OPENAI_API_KEY" },
  anthropic: { url: "https://api.anthropic.com/v1/models?limit=1000", headers: (k) => ({ "x-api-key": k, "anthropic-version": "2023-06-01" }), keyEnv: "ANTHROPIC_API_KEY" },
  deepseek: { url: "https://api.deepseek.com/models", headers: (k) => ({ authorization: `Bearer ${k}` }), keyEnv: "DEEPSEEK_API_KEY" },
  // 226회차 09-26: 구글은 열쇠를 주소에 실어 보내고 응답도 `data` 가 아니라 `models` 다. 그래서 아래 파서가 갈린다.
  // 이 문을 안 보고 있었다는 것이 오늘의 발견이다 — **한 열쇠로 61개가 열려 있었고 우리는 영상 셋만 쓰고 있었다.**
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", headers: () => ({}), keyEnv: "GEMINI_API_KEY" },
};

/** 공급자 하나의 목록. 열쇠가 없거나 문이 안 열리면 이유를 돌려준다 — 빈 목록을 "없어졌다"로 읽으면 안 된다. */
export async function listVendor(vendor: Vendor, env: Record<string, string | undefined> = process.env): Promise<{ ok: true; models: ModelEntry[] } | { ok: false; why: string }> {
  const e = ENDPOINTS[vendor];
  const key = env[e.keyEnv];
  if (!key) return { ok: false, why: `${e.keyEnv} 없음` };
  try {
    const url = vendor === "gemini" ? `${e.url}&key=${encodeURIComponent(key)}` : e.url;
    const r = await fetch(url, { headers: e.headers(key) });
    if (!r.ok) return { ok: false, why: `HTTP ${r.status}` };
    const j = (await r.json()) as { data?: { id: string; created?: number; created_at?: string }[]; models?: { name: string }[] };
    const models = vendor === "gemini"
      ? (j.models ?? []).map((m) => ({ id: m.name.replace(/^models\//, ""), vendor, created: null }))
      : (j.data ?? []).map((m) => ({ id: m.id, vendor, created: typeof m.created === "number" ? m.created : m.created_at ? Math.floor(new Date(m.created_at).getTime() / 1000) : null }));
    return models.length ? { ok: true, models } : { ok: false, why: "목록이 비어 왔다" };
  } catch (err) { return { ok: false, why: err instanceof Error ? err.message : String(err) }; }
}

/** 일에 쓸 수 있는 모델만(임베딩·음성 인식·검열·옛 미세조정 같은 건 새로 나와도 우리 일이 아니다). */
export const isWorkModel = (id: string) => !/embedding|whisper|moderation|tts|transcribe|realtime|audio|^ft:|davinci|babbage|search|instruct|dall-e/i.test(id);

/** 집안: 날짜·판 꼬리를 뗀 이름. gpt-5-2026-03-01 → gpt-5 · claude-sonnet-5-20260601 → claude-sonnet-5 */
// 190회차: DeepSeek 은 목록에 `deepseek-flash` 로 적고 우리는 `deepseek-v4-flash` 로 부른다(별칭이 먹는다) — 판 번호를 빼고 같은 것으로 본다. 첫 주간 보고가 "없어진 것: deepseek-v4-flash" 라고 헛경보를 냈다.
export const family = (id: string) => id.replace(/-\d{4}-\d{2}-\d{2}$/, "").replace(/-\d{8}$/, "").replace(/-(latest|preview)$/, "").replace(/^deepseek-v\d+(\.\d+)?-/, "deepseek-");

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
  const nowFam = new Set(now.map((m) => family(m.id)));
  const gone = prevModels.filter((m) => !nowIds.has(m.id) && !nowFam.has(family(m.id)) && isWorkModel(m.id));
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
  { id: "claude-haiku-4-5", vendor: "anthropic", where: "옆자리" },
  { id: "claude-sonnet-5", vendor: "anthropic", where: "옆자리" },
  { id: "claude-opus-5", vendor: "anthropic", where: "옆자리" },
  { id: "claude-sonnet-4-6", vendor: "anthropic", where: "옛 옆자리" },
  // 226회차 09-26: Veo 가 여기 빠져 있었다. 09-24 에 영상을 Veo 로 갈아타면서 sora 줄에 "폐기" 라고만 적고
  // 새로 부르는 이름은 안 넣었다 — 자가 자기 목록을 안 고치면 "우리가 부르는데 없는 것" 검사가 헛돈다.
  { id: "veo-3.1-generate-preview", vendor: "gemini", where: "영상" },
  { id: "veo-3.1-fast-generate-preview", vendor: "gemini", where: "영상(빠른)" },
  { id: "veo-3.1-lite-generate-preview", vendor: "gemini", where: "영상(싼)" },
  // 226회차 09-26 에 붙인 것들.
  { id: "gpt-image-2.5-flare", vendor: "openai", where: "그림(기본 — gpt-image-2 에서 옮김)" },
  { id: "lyria-3.5", vendor: "gemini", where: "음악" },
  { id: "lyria-3-pro-preview", vendor: "gemini", where: "음악(후보)" },
  { id: "lyria-3-clip-preview", vendor: "gemini", where: "음악(30초 고정·반값)" },
  // 자리 겨루기가 실제로 부르는 이름들(seats). 여기 없으면 "곧 죽을 호출" 검사가 이들을 안 본다.
  { id: "gpt-5.6-luna", vendor: "openai", where: "판단·고치는 자리" },
  { id: "gpt-5.6-terra", vendor: "openai", where: "자리 겨루기" },
  { id: "gpt-5.3-codex", vendor: "openai", where: "코드 자리" },
  // 안 부른다 — head.ts 가 **이름을 가리려고** 들고 있는 것이라 코드에 글자가 남아 있다. 자가 정직하게 잡으니 정직하게 적는다.
  { id: "deepseek-chat", vendor: "deepseek", where: "안 부름(이름 가리기 목록에만)" },
];

/**
 * **무엇을 할 수 있는 모델인가** (226회차 09-26). 이름으로 가른다 — 공급자들이 능력을 따로 안 적어 준다.
 * 틀릴 수 있는 자라서 `text` 는 "그 밖의 전부" 다(모르는 것을 글로 치는 쪽이, 새 능력을 글에 묻는 것보다 낫다).
 */
export type Power = "video" | "music" | "image" | "voice" | "text";
export function powerOf(id: string): Power {
  if (/veo|sora|video/i.test(id)) return "video";
  if (/lyria|music/i.test(id)) return "music";
  if (/image|imagen|dall-e|banana/i.test(id)) return "image";
  if (/tts|speech|voice/i.test(id)) return "voice";
  return "text";
}

/**
 * **가지고 있는데 안 쓰는 힘.** 열쇠는 이미 있고 문도 열리는데 우리가 한 번도 안 부른 것들이다.
 *
 * 09-16 에 광고가 계속 쓰레기였던 이유가 이것이었다 — `sora-2` 가 **같은 열쇠로 열려 있었는데** 안 붙어 있었고,
 * 로키는 자기가 영상 모델이 없다는 것조차 몰랐다. 사람이 눈으로 찾아야 알던 것을 자로 만든다.
 *
 * - `unusedPowers`: 그 능력에서 **부르는 것이 하나도 없다**(음악처럼 통째로 빈 칸)
 * - `untried`: 능력은 쓰는데 **안 대 본 후보**가 있다(그림을 gpt-image-2 로만 하는 것처럼)
 */
export function idlePower(all: ModelEntry[], inUse: { id: string }[]): { unusedPowers: Record<string, string[]>; untried: Record<string, string[]> } {
  const usedFams = new Set(inUse.map((u) => family(u.id)));
  const usedPowers = new Set(inUse.map((u) => powerOf(u.id)));
  const unusedPowers: Record<string, string[]> = {};
  const untried: Record<string, string[]> = {};
  for (const m of all) {
    if (!isWorkModel(m.id) && powerOf(m.id) === "text") continue;   // 임베딩·검열 따위는 글 자리에서만 거른다
    if (usedFams.has(family(m.id))) continue;
    const p = powerOf(m.id);
    (usedPowers.has(p) ? untried : unusedPowers)[p] ??= [];
    (usedPowers.has(p) ? untried : unusedPowers)[p].push(m.id);
  }
  return { unusedPowers, untried };
}

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
