/**
 * **판단 엔진 값 받는 문** (11-21, 사장님 "니가 해줘" — 이름·가격을 위임받아 정함).
 *
 * 엔진은 손님 컴퓨터에서 돈다(BYOK) — 우리 서버가 없다. 그래서 값은 **라이선스 키**로 받는다:
 * 결제사(판매 대행)가 키를 만들어 메일로 주고, 엔진은 결제사의 **공개 확인 주소**(열쇠 불필요)에 키를 묻는다.
 *
 * 숫자는 여기 한 곳(PLAN). 파는 주소(buyUrl)가 없으면 문은 **열려 있다** — 살 길이 없는데 막으면 안 된다.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const PLAN = {
  /** 한 달(UTC 달)에 키 없이 정할 수 있는 판. 엔진이 스스로 연 "올림" 판은 안 센다. */
  freePerMonth: 100,
  /** Pro 월 값(달러). 문구에만 쓴다 — 실제 값은 결제사 상품이 정한다. */
  proUsdPerMonth: 9,
  /** 확인 결과를 믿는 시간. 그 안엔 결제사에 다시 안 묻는다. */
  cacheHours: 24,
  /** 결제사가 안 닿을 때, 마지막으로 유효했던 때부터 봐주는 날. */
  offlineGraceDays: 7,
};

export type LicenseConfig = {
  /** 결제사의 공개 확인 주소. 예: https://live.dodopayments.com/licenses/validate */
  validateUrl?: string;
  /** 키를 사는 주소. 없으면 문을 안 닫는다(얼리 액세스). */
  buyUrl?: string;
};

/** 판매 주소 — 결제사가 정해지면 여기 한 곳에 채운다(11-21: 아직 없음 → 얼리 액세스, 판 수 제한 없음). */
export const SALE: LicenseConfig = {};

type Cache = { keyHash: string; valid: boolean; checkedAt: string; lastValidAt?: string };

export type GateResult = { ok: true; why: string } | { ok: false; message: string };

const 해시 = (k: string) => createHash("sha256").update(k).digest("hex").slice(0, 16);

/** 이번 UTC 달에 손님이 연 판 수(엔진이 스스로 연 올림 판 제외). */
export function usedThisMonth(rows: { at: string; via?: string }[], now = new Date()): number {
  const 달 = now.toISOString().slice(0, 7);
  return rows.filter((r) => r.via !== "올림" && String(r.at).slice(0, 7) === 달).length;
}

export async function gate(
  home: string, used: number, key: string | undefined, cfg: LicenseConfig,
  opts: { fetch?: typeof fetch; now?: Date } = {},
): Promise<GateResult> {
  cfg = { validateUrl: cfg.validateUrl || SALE.validateUrl, buyUrl: cfg.buyUrl || SALE.buyUrl };
  if (!cfg.buyUrl || !cfg.validateUrl) return { ok: true, why: "얼리 액세스 — 판 수 제한 없음" };
  if (used < PLAN.freePerMonth) return { ok: true, why: `무료 ${used}/${PLAN.freePerMonth}` };
  const 막음 = (왜: string): GateResult => ({ ok: false, message:
    `${왜} 이번 달 무료 ${PLAN.freePerMonth}판을 다 썼습니다. Pro(월 $${PLAN.proUsdPerMonth}): ${cfg.buyUrl} — ` +
    `받은 키를 환경변수 ROOKERY_LICENSE 에 넣으면 바로 이어집니다. 적기(record)·성적표는 키 없이도 됩니다.` });
  if (!key) return 막음("라이선스 키가 없습니다.");

  const now = opts.now ?? new Date(), f = opts.fetch ?? fetch;
  const 파일 = join(home, "license.json");
  let c: Cache | undefined;
  try { c = existsSync(파일) ? (JSON.parse(readFileSync(파일, "utf8")) as Cache) : undefined; } catch { c = undefined; }
  if (c && c.keyHash !== 해시(key)) c = undefined;
  if (c && now.getTime() - Date.parse(c.checkedAt) < PLAN.cacheHours * 3600_000)
    return c.valid ? { ok: true, why: "Pro(확인해 둔 키)" } : 막음("이 키는 유효하지 않습니다(해지·만료·오타).");

  let valid: boolean;
  try {
    const r = await f(cfg.validateUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ license_key: key }) });
    if (r.status >= 500) throw new Error(`결제사 ${r.status}`);
    const j = (await r.json().catch(() => ({}))) as { valid?: unknown };
    valid = r.ok && j.valid === true;
  } catch {
    // 결제사가 안 닿는다 — 마지막 유효 확인에서 며칠 안이면 봐준다. 처음부터 확인 못 한 키는 못 연다.
    const 마지막 = c?.lastValidAt ? Date.parse(c.lastValidAt) : NaN;
    if (now.getTime() - 마지막 < PLAN.offlineGraceDays * 86400_000) return { ok: true, why: "Pro(결제사 안 닿음 — 유예 중)" };
    return 막음("키를 확인할 결제사에 닿지 않습니다.");
  }
  const 새: Cache = { keyHash: 해시(key), valid, checkedAt: now.toISOString(), lastValidAt: valid ? now.toISOString() : c?.lastValidAt };
  const t = `${파일}.tmp`; writeFileSync(t, JSON.stringify(새)); renameSync(t, 파일);
  return valid ? { ok: true, why: "Pro" } : 막음("이 키는 유효하지 않습니다(해지·만료·오타).");
}
