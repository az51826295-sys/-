/**
 * 도구가 어느 회사(계정)에서 도나 (222회차 09-25, 사장님 "개발자 계정 따로 만들어 줘").
 * 배치·자가 고침·시험은 **개발 계정**(dev@rookery.local, 자기 한도)에서 돌고, 사장님 회사의 3만원은 사장님이 시킨 일에만 쓴다.
 *   ROOKERY_ACCOUNT=owner 로 돌리면 사장님 회사(지출 보기·한도 바꾸기 같은 도구가 쓴다).
 * 개발 계정은 `dev_account.mts` 가 만들고 engine/work/dev-company.json 에 id 를 남긴다.
 */
import { existsSync, readFileSync } from "node:fs";
export const OWNER = { companyId: "5925c03a-557f-46d7-8589-7388b769df40", ownerEmail: "az51826295@gmail.com", label: "사장님 회사" } as const;
export const DEV_EMAIL = "dev@rookery.local";
export function account(): { companyId: string; ownerEmail: string; label: string } {
  if (process.env.ROOKERY_ACCOUNT === "owner") return OWNER;
  const p = "engine/work/dev-company.json";
  if (!existsSync(p)) throw new Error("개발 계정이 아직 없다 — npx tsx engine/tools/rookery_env.mts engine/tools/dev_account.mts 를 먼저. 사장님 회사로 돌리려면 ROOKERY_ACCOUNT=owner.");
  const j = JSON.parse(readFileSync(p, "utf8")) as { companyId: string };
  return { companyId: j.companyId, ownerEmail: DEV_EMAIL, label: "개발 계정" };
}
