import type { Supabase } from "@/lib/execution/shared";

/**
 * 자를 의심하는 자 (124회차 09-15).
 *
 * 규칙 고리(`ruleLoop.ts`)는 **직원이 어떻게 일할지**만 제안할 수 있다. 자(검사) 자체가 틀렸을 때는 아무 소용이 없다 —
 * 오히려 틀린 자를 맞히려는 규칙을 배운다. 09-15 에 실제로 그랬다:
 *   · `규격_조각_크기` 떨어진 13건이 **전부 0.01배** → 사람 실수가 아니라 우리 규칙집의 조건문이 기본값처럼 읽힌 것
 *   · `규격_조각_자리` 문턱이 `0.35 이하` 인데 제대로 씌운 투구는 0.42 → **자가 틀린 자리를 요구**하고 있었다
 *   · `기대_head_count` 실측 6.295 가 **통과도 하고 실패도** 했다 → 기대치가 판마다 달랐다(폭 0)
 * 셋 다 내가 손으로 분포를 세어 찾았다. 그걸 여기서 기계가 한다.
 *
 * **고치지 않는다. 표시만 한다.** 자를 스스로 느슨하게 만들면 그건 자가 아니다(절대 문턱은 깎이기 마련이다).
 * 사람이 보고 판단할 수 있게 근거(값의 분포)를 붙여 내놓을 뿐이다.
 */

export type RulerFlag = {
  check: string;
  kind: "한 값에 몰림" | "같은 값이 통과도 실패도" | "한 번도 통과 못 함" | "한 번도 떨어진 적 없음" | "한쪽만 막힌 자";
  why: string;
  n: number;
};

type Seen = { pass: number[]; fail: number[]; passNoNum: number; failNoNum: number; oneSided: number; both: number };

/**
 * 131회차: **한쪽만 막힌 자.** 검사 글의 "기대 3~∞" 처럼 위나 아래 한쪽이 비면 그 방향으로는 절대 안 떨어진다.
 * 130회차에 손으로 찾은 것 — `기대_ground_color_count` 가 `3~∞` 라 바닥 색이 999개여도 통과했다(45번 안 떨어진 진짜 이유).
 * 틀린 자는 아니다(바닥이 필요한 검사도 있다). **반쪽인 것을 알고 쓰자는 것**이고, 위가 있어야 할 자리면 계획이 적게 한다.
 */
const ONE_SIDED = /기대\s*(?:-∞~[\d.]+|[\d.]+~∞)/;

/** "…의 0.01배", "실측 6.295, 기대 …" 처럼 검사 글에 적힌 실측값. 없으면 null. */
function measuredIn(message: string): number | null {
  const m =
    message.match(/실측\s*(-?[\d.]+)/) ??
    message.match(/크기의\s*(-?[\d.]+)배/) ??
    message.match(/([\d.]+)배만큼/) ??
    message.match(/의\s*(-?[\d.]+)배/);
  const v = m ? Number(m[1]) : NaN;
  return Number.isFinite(v) ? v : null;
}

/** 최근 검사 기록을 읽어 자마다 값의 분포를 모은다. */
export async function collectRulerStats(db: Supabase, companyId: string): Promise<Map<string, Seen>> {
  const stats = new Map<string, Seen>();
  const { data: co } = await db.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
  const owner = (co?.owner_id as string | undefined) ?? null;
  if (!owner) return stats;
  const { data: convs } = await db.from("conversations").select("id").eq("owner_id", owner).limit(200);
  const convIds = ((convs ?? []) as { id: string }[]).map((c) => c.id);
  if (!convIds.length) return stats;
  const { data: msgs } = await db
    .from("conversation_messages")
    .select("content")
    .in("conversation_id", convIds)
    .not("attachments->unityChecks", "is", null)
    .order("created_at", { ascending: true })
    .limit(400);

  for (const m of (msgs ?? []) as { content: string }[]) {
    for (const raw of m.content.split("\n")) {
      const t = raw.trim();
      if (!/^- [✅❌]/.test(t)) continue; // 못 잼(◻︎)은 자를 판단할 근거가 아니다
      const passed = t.startsWith("- ✅");
      const rest = t.replace(/^- [✅❌]\s*/, "");
      const name = rest.split("—")[0].trim();
      if (!name) continue;
      const s = stats.get(name) ?? { pass: [], fail: [], passNoNum: 0, failNoNum: 0, oneSided: 0, both: 0 };
      if (/기대\s/.test(rest)) { if (ONE_SIDED.test(rest)) s.oneSided++; else s.both++; }
      const v = measuredIn(rest);
      if (v === null) { if (passed) s.passNoNum++; else s.failNoNum++; }
      else (passed ? s.pass : s.fail).push(v);
      stats.set(name, s);
    }
  }
  return stats;
}

/** 자가 수상한 곳. 근거를 붙여 내놓는다 — 고치지는 않는다. */
export function auditRulers(stats: Map<string, Seen>): RulerFlag[] {
  const flags: RulerFlag[] = [];
  const fmt = (xs: number[]) => [...new Set(xs)].slice(0, 6).join(", ");
  for (const [check, s] of stats) {
    const nPass = s.pass.length + s.passNoNum, nFail = s.fail.length + s.failNoNum;
    const n = nPass + nFail;

    // (1) 떨어진 값이 전부 같은 상수 — 손이 흔들린 게 아니라 규칙·코드가 그렇게 시킨 것이다.
    if (s.fail.length >= 3 && new Set(s.fail).size === 1) {
      flags.push({ check, kind: "한 값에 몰림", n: s.fail.length, why: `떨어진 ${s.fail.length}건이 전부 ${s.fail[0]} — 흩어진 값이 아니라 딱 떨어지는 상수다. 규칙이나 계산이 그 값을 만들고 있는지 본다${s.pass.length ? ` (통과한 값: ${fmt(s.pass)})` : ""}` });
    }
    // (2) 같은 실측값이 통과도 하고 실패도 했다 — 자가 판마다 다른 것을 재고 있다.
    const both = [...new Set(s.fail)].filter((v) => s.pass.includes(v));
    if (both.length) {
      flags.push({ check, kind: "같은 값이 통과도 실패도", n: both.length, why: `실측 ${fmt(both)} 이(가) 어떤 판에서는 통과, 어떤 판에서는 실패했다 — 기대치가 판마다 달랐다는 뜻이다` });
    }
    // (3) 한 번도 통과 못 함 — 넘을 수 없는 문턱일 수 있다.
    if (n >= 5 && nPass === 0) {
      flags.push({ check, kind: "한 번도 통과 못 함", n, why: `${n}번 재서 한 번도 통과가 없다. 통과할 수 있는 값이 존재하는지 본다${s.fail.length ? ` (떨어진 값: ${fmt(s.fail)})` : ""}` });
    }
    // (4) 한 번도 떨어진 적 없음 — 이빨이 없는 자일 수 있다(통과를 파는 자).
    // 130회차: 이 표시는 "지워라" 가 아니라 "고장을 넣어 시험하라" 는 뜻이다. 실제로 다섯을 시험해 보니
    // `규격_사람_키`·`규격_등신` 은 100배·40등신을 제대로 잡았다(넓게 잡은 게 의도였고, 그 고장이 안 났을 뿐).
    // 반대로 `기대_ground_color_count` 는 계획이 `3~∞` 로 적어 **위로는 못 떨어지는** 반쪽 자였다.
    if (n >= 20 && nFail === 0) {
      flags.push({ check, kind: "한 번도 떨어진 적 없음", n, why: `${n}번 재서 한 번도 안 떨어졌다. 지우기 전에 **고장을 일부러 넣어 잡는지** 본다(engine/tools/standing_checks_probe.mts)` });
    }
    // (5) 한쪽만 막힌 기대치 — 그 방향으로는 절대 안 떨어진다. 130회차에 손으로 찾은 것을 기계가 찾게.
    if (s.oneSided >= 5 && s.oneSided > s.both) {
      flags.push({ check, kind: "한쪽만 막힌 자", n: s.oneSided, why: `${s.oneSided}번이 '3~∞' 처럼 한쪽만 막힌 범위였다(양쪽 막은 판 ${s.both}번) — 빈 쪽으로는 아무리 벗어나도 안 떨어진다. 위가 있어야 하는 값이면 계획이 양쪽을 적게 한다` });
    }
  }
  return flags.sort((a, b) => b.n - a.n);
}
