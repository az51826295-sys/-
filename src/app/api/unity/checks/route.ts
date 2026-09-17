import { standingChecks, expectationChecks } from "@/lib/skills/appBuild/standing";
import type { Expectation } from "@/lib/skills/appBuild/measures";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { scheduleAutoRetry } from "@/lib/execution/autoRetry";
import { storeDeliverableFile } from "@/lib/deliverables/files";

/** 이 회사 주인의 대화들. 유니티 열쇠는 회사 것이므로 그 회사의 대화에만 글을 붙인다(42회차). */
async function conversationIdsOf(db: ReturnType<typeof createServiceClient>, companyId: string): Promise<string[]> {
  const { data: c } = await db.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
  const owner = (c as { owner_id?: string } | null)?.owner_id;
  if (!owner) return [];
  const { data } = await db.from("conversations").select("id").eq("owner_id", owner);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

export const dynamic = "force-dynamic";

/**
 * 유니티 창이 **재 본 결과**를 로키로 돌려준다.
 *
 * 로키 서버는 유니티를 못 돌린다. 그래서 자(합격 시험지)는 사장님 유니티 안에서
 * 돌고, 그 결과가 이 문으로 와서 **그 산출물이 돌아온 대화에 한 턴으로** 붙는다.
 * 09-05 저녁까지는 내가 배치 명령으로 손으로 돌렸다 — 이제 창 버튼 하나다.
 *
 * 결과는 판정이지 통과가 아니다: 떨어진 줄과 못 잰 줄을 그대로 적는다.
 */
type Case = { name: string; result: "Passed" | "Failed" | "Inconclusive" | "Skipped" | string; message?: string | null };
type Body = {
  deliverableId?: string;
  scene?: string;
  passed: number;
  failed: number;
  inconclusive: number;
  cases: Case[];
  /** 시험지가 찍은 화면(PNG, base64). 사장님은 게임을 유니티에서만 볼 수 있어서,
   *  대화에는 이 한 장이 게임의 얼굴이다(09-05 저녁, Rosebud 의 게임 창을 보고). */
  screenshot?: string;
  /** 정면 얼굴 사진(PNG, base64). 휴머노이드가 씬에 있을 때만 온다. */
  portrait?: string;
  /** 걷는 모습 넉 장을 가로로 붙인 것(옆에서). 휴머노이드가 움직였을 때만 온다. */
  walk?: string;
  /** 점프 넉 장(30회차). */
  jump?: string;
  /** 위에서 내려다본 지도(34회차). */
  map?: string;
  /** 자가 잰 숫자(32회차): player_viewport_x, jump_height_m, hud_score_visible, coin_count … */
  measures?: Record<string, number | boolean | string>;
};

export async function POST(request: Request) {
  const key = request.headers.get("x-rookery-key");
  if (!key) return NextResponse.json({ error: "x-rookery-key 헤더가 필요합니다." }, { status: 401 });
  const db = createServiceClient();
  const { data: company } = await db.from("companies").select("id, name").eq("unity_key", key).maybeSingle();
  if (!company) return NextResponse.json({ error: "열쇠가 맞지 않습니다." }, { status: 403 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON 이 아닙니다." }, { status: 400 });
  }

  // ── 122회차 09-15: **예외 하나가 검사 여러 줄을 동시에 떨어뜨린다.** 유니티 시험 러너는 실행 중 처리 안 된
  // 예외가 나면 **그 판의 검사 전부**에 같은 글을 달아 실패로 적는다. 09-15 감사: `InvalidOperationException:
  // Avatar is null.` 하나가 서로 다른 검사 4줄(그림·조명·씬 열림·카메라)을 떨어뜨렸고, 그런 줄이 13건이었다.
  //
  // 그대로 두면 셋이 망가진다: (1) 통과율이 실제보다 낮게 나오고 (2) '스스로 다시' 가 Dev 에게 떨어진 줄 4개를
  // 보내 네 군데를 고치라 하고 (3) 규칙 고리가 사례를 부풀려 센다(103회차에 대화에서 겪은 것과 같은 모양).
  //
  // 접는다: 같은 예외 글을 단 실패가 둘 이상이면 **첫 줄만 진짜 실패**로 두고 나머지는 '못 잼' 으로 적는다 —
  // 그 검사들은 떨어진 게 아니라 **재지 못한** 것이다(예외가 먼저 났으니까). 자를 느슨하게 하는 게 아니라 원인을 하나로 적는 것이다.
  {
    const rootOf = (c: Case): string | null => {
      const t = (c.message ?? "").trim();
      if (c.result !== "Failed") return null;
      const m = t.match(/Unhandled log message:\s*'?\[(?:Exception|Error)\]\s*([^']{10,160}?)\s*(?:\.|')/);
      return m ? m[1].trim() : null;
    };
    const seen = new Map<string, number>();
    for (const c of body.cases ?? []) { const r = rootOf(c); if (r) seen.set(r, (seen.get(r) ?? 0) + 1); }
    const shared = new Set([...seen.entries()].filter(([, n]) => n > 1).map(([r]) => r));
    if (shared.size) {
      const kept = new Set<string>();
      for (const c of body.cases) {
        const r = rootOf(c);
        if (!r || !shared.has(r)) continue;
        if (!kept.has(r)) { kept.add(r); continue; } // 첫 줄은 진짜 실패로 남긴다
        c.result = "Inconclusive";
        c.message = `앞의 예외(${r.slice(0, 80)}) 때문에 재지 못했다 — 그 예외를 고치면 이 줄은 다시 잰다`;
        body.failed = Math.max(0, body.failed - 1);
        body.inconclusive += 1;
      }
      console.log(`[유니티 검사] 예외 ${shared.size}개가 검사 여러 줄을 덮었다 — 원인 하나당 실패 1줄로 접었다`);
    }
  }

  // ── 50회차: **회사가 늘 재는 줄.** 계획이 스스로 쓴 기대치만으로는 못 잡는 것이 있다 —
  // 49회차에 투구가 머리의 1.3% 로 쪼그라들었는데 검사는 10개 다 통과했다(계획이 "붙어 있다" 만 적었으니까).
  // 130회차: 문턱과 글은 그대로 두고 `skills/appBuild/standing.ts` 로 꺼냈다 — 순수 함수여야 **고장을 넣어 시험**할 수 있다
  // (124회차 자 감사가 "22번 재서 한 번도 안 떨어진 자" 를 찾았는데, 이빨이 없는 건지 고장이 안 난 건지 가르려면 그게 필요했다).
  if (body.measures) {
    for (const c of standingChecks(body.measures)) {
      body.cases.push(c);
      if (c.result === "Passed") body.passed += 1; else if (c.result === "Failed") body.failed += 1; else body.inconclusive += 1;
    }
  }
  // ── 32회차 2판: 퇴보 지킴이. 지난 판에서 재어진 값이 이번 판에서 0(또는 false)이면 실패 줄 — 이번 주문과 상관없이.
  // (9fdf487e: 카메라만 고쳤는데 점프가 0 — 기대치는 이번 주문만 적으니 아무도 안 잡았다.)
  if (body.deliverableId && body.measures) {
    const { data: cur } = await db.from("deliverables").select("assignment_id").eq("id", body.deliverableId).eq("company_id", company.id).maybeSingle();
    const { data: asg } = cur?.assignment_id
      ? await db.from("assignments").select("prev:role_input_json->>previousDeliverableId").eq("id", cur.assignment_id).maybeSingle()
      : { data: null };
    const prevId = (asg as { prev?: string | null } | null)?.prev ?? null;
    const { data: prevRow } = prevId
      ? await db.from("deliverables").select("m:content_json->unityChecks->measures").eq("id", prevId).maybeSingle()
      : { data: null };
    const prevMeasures = ((prevRow as { m?: Record<string, unknown> | null } | null)?.m ?? {}) as Record<string, unknown>;
    for (const [k, was] of Object.entries(prevMeasures)) {
      const now = body.measures[k];
      if (now === undefined) continue;
      const regressed = (typeof was === "number" && was > 0 && Number(now) === 0) || (was === true && now === false);
      if (!regressed) continue;
      body.cases.push({ name: `퇴보_${k}`, result: "Failed", message: `지난 판엔 ${String(was)} 였는데 이번 판엔 ${String(now)} — 되던 것이 안 된다(${k})` });
      body.failed += 1;
    }
  }

  // ── 32회차: 계획의 기대치(expectations)와 측정값을 맞춰 본다. 어긋나면 실패 줄이 되고, 그 줄이 Dev 에게 간다(스스로 다시).
  // 130회차: 재는 셈은 `skills/appBuild/standing.ts` 로 꺼냈다(고장을 넣어 시험할 수 있게). 못 재는 기대치를
  // '실패' 가 아니라 '못 잼' 으로 적는 세 자리(42·57·119회차)도 그 안에 그대로 있다.
  if (body.deliverableId && body.measures) {
    const { data: d0 } = await db.from("deliverables").select("exp:content_json->expectations").eq("id", body.deliverableId).eq("company_id", company.id).maybeSingle();
    const expectations = ((d0 as { exp?: unknown } | null)?.exp ?? []) as Expectation[];
    for (const c of expectationChecks(expectations, body.measures)) {
      body.cases.push(c);
      if (c.result === "Passed") body.passed += 1; else if (c.result === "Failed") body.failed += 1; else body.inconclusive += 1;
    }
  }


  const mark = (r: string) => (r === "Passed" ? "✅" : r === "Failed" ? "❌" : "◻︎");
  const lines = (body.cases ?? [])
    .map((c) => `- ${mark(c.result)} ${c.name}` + (c.message ? ` — ${c.message.slice(0, 200)}` : ""))
    .join("\n");
  const text =
    `**유니티 검사 결과** — 통과 ${body.passed} · 실패 ${body.failed} · 해당 없음 ${body.inconclusive}` +
    (body.scene ? ` (씬 ${body.scene})` : "") +
    `\n\n${lines}\n\n` +
    (body.failed > 0
      ? "실패한 줄은 Dev 가 스스로 고쳐요(세 번까지). 그래도 안 되면 말씀이 필요해요."
      : "기계가 잴 수 있는 건 다 통과했어요. 재미와 손맛은 사람이 봐요.");

  // 어느 대화에 붙일까: 그 산출물이 돌아온 턴이 있는 대화. 없으면 기록만 남긴다.
  let conversationId: string | null = null;
  let files: { path: string; href: string }[] | null = null;
  if (body.deliverableId) {
    const { data: msg } = await db
      .from("conversation_messages")
      .select("conversation_id")
      .contains("attachments", { returned: { deliverableId: body.deliverableId } })
      // 42회차: 열쇠의 회사가 가진 산출물일 때만. 없으면 남의 대화에 글을 붙이고 남의 회사에 재시도를 태울 수 있다.
      .in("conversation_id", await conversationIdsOf(db, company.id as string))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    conversationId = (msg?.conversation_id as string | undefined) ?? null;

    const { data: d } = await db.from("deliverables").select("content_json").eq("id", body.deliverableId).eq("company_id", company.id).maybeSingle();
    if (d) {
      const { screenshot: _omit, portrait: _omit2, walk: _omit3, jump: _omit4, map: _omit5, ...rest } = body;
      void _omit; void _omit2; void _omit3; void _omit4; void _omit5;
      await db
        .from("deliverables")
        .update({ content_json: { ...(d.content_json as object), unityChecks: { ...rest, at: new Date().toISOString() } } })
        .eq("id", body.deliverableId);
    }
    const shots: [string | undefined, string, string, string][] = [
      [body.screenshot, "unity-screenshot.png", "유니티 화면", "합격 시험이 도는 동안 찍은 게임 화면"],
      [body.portrait, "unity-portrait.png", "유니티 얼굴", "같은 카메라를 얼굴 앞으로 옮겨 찍은 정면 사진 — 씬의 캐릭터 전부, 플레이어부터 나란히"],
      [body.walk, "unity-walk.png", "유니티 걷기", "키를 누르는 동안 옆에서 넉 장 — 스키닝·발·팔을 사람이 본다"],
      [body.jump, "unity-jump.png", "유니티 점프", "Space 한 번 뒤 옆에서 넉 장 — 뜨는가, 착지가 발로 오는가, idle 로 돌아오는가"],
      [body.map, "unity-map.png", "유니티 지도", "위에서 내려다본 레벨 전체 — 구역·동선·랜드마크·동전 자리"],
    ];
    for (const [b64, filename, title, description] of shots) {
      if (!d || !b64) continue;
      try {
        const r = await storeDeliverableFile(db, {
          companyId: company.id as string,
          deliverableId: body.deliverableId,
          filename,
          body: new Uint8Array(Buffer.from(b64, "base64")),
          kind: "image",
          mimeType: "image/png",
          title,
          description,
          producedByBackend: "unity",
        });
        if (r.ok) (files ??= []).push({ path: `${title}.png`, href: `/api/files/${r.file.id}` });
        else console.warn("[unity/checks] 사진 저장 실패:", filename, r.error);
      } catch (e) {
        console.warn("[unity/checks] 사진 처리 실패:", filename, e);
      }
    }
  }
  if (conversationId) {
    await db.from("conversation_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: text,
      attachments: { unityChecks: { deliverableId: body.deliverableId }, files },
    });
  }
  // 계획 3 "스스로 다시": 떨어진 줄이 있으면 사람이 말하기 전에 같은 직원이 고친다(최대 3번).
  let retry: unknown = null;
  if (conversationId && body.deliverableId && body.failed > 0) {
    const failedLines = (body.cases ?? [])
      .filter((c) => c.result === "Failed")
      .map((c) => `${c.name}${c.message ? ` — ${c.message.slice(0, 300)}` : ""}`);
    retry = await scheduleAutoRetry(db, body.deliverableId, failedLines, conversationId);
    console.log("[unity/checks] 스스로 다시:", JSON.stringify(retry));
  }
  return NextResponse.json({ ok: true, postedTo: conversationId, retry });
}
