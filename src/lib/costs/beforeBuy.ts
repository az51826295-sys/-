/**
 * **사기 전에 지갑을 본다** (10-12).
 *
 * 10-12 오후에 글(텍스트) 호출은 한도가 막게 만들었는데, 정작 **비싼 것들이 다른 길로 샜다.**
 * 그날 아침에 잰 사장님 지갑 $28.71 중
 *   영상(Veo/Sora) $10.20 · 3D(Meshy) $3.60 = **48%**
 * 가 영상·3D·그림 길이었고, 그 길들은 **쓰고 나서 `recordUsage` 로 적기만** 했다.
 * 적히기는 하니 나중에 보이지만, **그때는 이미 나간 뒤다.**
 *
 * 글 호출은 건당 $0.01~0.03 이라 한도를 채우지도 못한다 — 막아야 할 것은 이쪽이었다.
 *
 * 쓰는 법: 비싼 것을 사기 **직전에** 한 번 부른다. 장면마다 부르지 않는다
 * (한도는 한 판 동안 거의 안 바뀌고, 판마다 DB 를 두드릴 일이 아니다).
 */
import { checkAllowance } from "./allowance";

type Db = Parameters<typeof checkAllowance>[0];

export type 살수있나결과 = { ok: true } | { ok: false; why: string };

export async function 살수있나(db: Db, companyId: string): Promise<살수있나결과> {
  try {
    const a = await checkAllowance(db, companyId);
    if (!a.exhausted) return { ok: true };
    return {
      ok: false,
      why: `한도에 닿았다: 최근 ${a.windowDays}일 $${a.spentUsd.toFixed(2)} / $${a.limitUsd}`,
    };
  } catch (e) {
    /* **못 물어봤으면 사지 않는다.** 여기서 "모르니까 사자" 로 두면, 장부가 잠깐 안 읽히는 동안
       가장 비싼 것들이 통째로 나간다. 비싼 쪽에서는 모름을 **막는 쪽**으로 기운다. */
    return { ok: false, why: `한도를 못 읽었다(${e instanceof Error ? e.message.slice(0, 60) : e}) — 비싼 것은 사지 않는다` };
  }
}
