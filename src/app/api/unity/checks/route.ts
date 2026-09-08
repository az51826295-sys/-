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

  // ── 50회차: **회사가 늘 재는 줄.** 계획이 스스로 쓴 기대치만으로는 못 잡는 것이 있다 —
  // 49회차에 투구가 머리의 1.3% 로 쪼그라들었는데 검사는 10개 다 통과했다(계획이 "붙어 있다" 만 적었으니까).
  // 종류를 막론하고 이 회사가 늘 참이라고 보는 것은 여기서 잰다. 계획이 뭘 적든 이 줄은 붙는다.
  if (body.measures) {
    const m = body.measures;
    const num = (k: string) => (typeof m[k] === "number" ? (m[k] as number) : null);
    const parts = num("parts_attached") ?? 0;
    if (parts > 0) {
      const ratio = num("part_size_ratio");
      if (ratio != null) {
        const ok = ratio >= 0.3 && ratio <= 3;
        body.cases.push({
          name: "규격_조각_크기",
          result: ok ? "Passed" : "Failed",
          message: `조각이 붙은 자리 크기의 ${ratio.toFixed(2)}배 (0.3~3.0 이어야 한다 — 너무 작으면 안 보이고 너무 크면 삼킨다)`,
        });
        if (ok) body.passed += 1; else body.failed += 1;
      }
      if (m.part_covers_bone === false) {
        body.cases.push({ name: "규격_조각_감싸기", result: "Failed", message: "조각이 붙은 뼈를 감싸지 않는다 — 옆에 떠 있다" });
        body.failed += 1;
      }
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

  // ── 32회차: 계획의 기대치(expectations)와 측정값을 맞춰 본다. 어긋나면 실패 줄이 되고, 그 줄이 Dev 에게 간다(스스로 다시). ──
  if (body.deliverableId && body.measures) {
    const { data: d0 } = await db.from("deliverables").select("exp:content_json->expectations").eq("id", body.deliverableId).eq("company_id", company.id).maybeSingle();
    const expectations = ((d0 as { exp?: unknown } | null)?.exp ?? []) as { measure: string; min?: number | null; max?: number | null; equals?: boolean | null; why?: string }[];
    for (const e of expectations) {
      const v = body.measures[e.measure];
      const label = e.why ? `${e.why} (${e.measure})` : e.measure;
      if (v === undefined) { body.cases.push({ name: `기대_${e.measure}`, result: "Inconclusive", message: `${label}: 자가 안 쟀다` }); body.inconclusive += 1; continue; }
      let ok: boolean;
      if (typeof e.equals === "boolean") ok = v === e.equals;
      else if (e.min == null && e.max == null) {
        // 42회차: 위도 아래도 없는 기대치는 아무 값이나 통과한다 — 잰 것이 아니라 적어 둔 것이다.
        body.cases.push({ name: `기대_${e.measure}`, result: "Inconclusive", message: `${label}: 실측 ${String(v)} — 기대 범위가 비어 있어 재지 못했다` });
        body.inconclusive += 1; continue;
      }
      else { const n = Number(v); ok = Number.isFinite(n) && (e.min == null || n >= e.min) && (e.max == null || n <= e.max); }
      const range = typeof e.equals === "boolean" ? String(e.equals) : `${e.min ?? "-∞"}~${e.max ?? "∞"}`;
      body.cases.push({ name: `기대_${e.measure}`, result: ok ? "Passed" : "Failed", message: `${label}: 실측 ${String(v)}, 기대 ${range}` });
      if (ok) body.passed += 1; else body.failed += 1;
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
