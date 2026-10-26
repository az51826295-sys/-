import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { noteConnected } from "@/lib/hand/connected";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * **앱 → 노트북 클로드 코드** 로 일거리가 건너가는 문 (10-26).
 *
 * 사장님: "앱이랑 내 노트북에 있는 클로드 코드랑 연결 됨?" — 이쪽이 그 방향이다.
 * MCP(`/api/mcp`)는 반대 방향이다(클로드 코드가 로키를 부른다). 둘을 섞지 않는다.
 *
 * - `POST`   앱이 주문을 넣는다
 * - `GET`    노트북이 하나 집어 간다 (집는 순간 taken 으로 바꾼다)
 * - `PATCH`  노트북이 결과를 적는다
 *
 * 열쇠는 손 v0~v2 와 같은 것(`companies.unity_key`)을 쓴다 — **회사별**이라
 * 남의 노트북이 내 일거리를 집어 갈 수 없다. MCP 의 전역 열쇠를 쓰면 그게 깨진다.
 *
 * 칸 이름은 ASCII 다(`prompt`·`folder`…) — 한글 칸은 Supabase select 파서가 거부한다.
 */

async function 회사(request: Request): Promise<{ id: string } | null> {
  const key = request.headers.get("x-rookery-key");
  if (!key) return null;
  const { data } = await createServiceClient()
    .from("companies").select("id").eq("unity_key", key).maybeSingle();
  return (data as { id: string } | null) ?? null;
}

const 막음 = () => NextResponse.json({ error: "열쇠가 맞지 않습니다." }, { status: 403 });

/** 앱이 주문을 넣는다. */
export async function POST(request: Request) {
  const c = await 회사(request);
  if (!c) return 막음();

  const body = (await request.json().catch(() => ({}))) as { 주문?: string; prompt?: string; 폴더?: string; folder?: string };
  const 주문 = (body.주문 ?? body.prompt ?? "").trim();
  if (!주문) return NextResponse.json({ error: "주문이 비었습니다." }, { status: 400 });
  /* 주문을 자르지 않는다 — 09-25 에 여러 줄이 첫 줄만 저장돼 판이 지시문 없이 돌았다.
     대신 터무니없이 긴 것만 막는다. */
  if (주문.length > 20_000) return NextResponse.json({ error: "주문이 너무 깁니다 (20000자까지)" }, { status: 413 });

  const { data, error } = await createServiceClient()
    .from("laptop_jobs")
    .insert({ company_id: c.id, prompt: 주문, folder: body.폴더 ?? body.folder ?? null })
    .select("id, created_at").single();
  /* DB 거부를 읽는다 — 09-18 에 오류를 안 읽고 넘어가서 좀비가 생겼다. */
  if (error) return NextResponse.json({ error: "못 넣었습니다: " + error.message }, { status: 500 });

  return NextResponse.json({ ok: true, job: data });
}

/** 노트북이 하나 집어 간다. */
export async function GET(request: Request) {
  const c = await 회사(request);
  if (!c) return 막음();
  /* 물어보러 온 것 자체가 "듣고 있다" 는 사실이다 — 일거리가 없어도 붙어 있다. */
  noteConnected("laptop", "일거리를 물어보러 왔어요");
  const db = createServiceClient();

  const { data: 후보, error: 볼때탈 } = await db
    .from("laptop_jobs").select("id")
    .eq("company_id", c.id).eq("status", "queued")
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (볼때탈) return NextResponse.json({ error: "못 봤습니다: " + 볼때탈.message }, { status: 500 });
  if (!후보) return NextResponse.json({ ok: true, job: null });

  /* **집기는 비교-교환이다.** `status` 가 아직 queued 인 줄만 바꾸므로, 듣는 쪽이
     둘이어도 한쪽만 받아 간다 — 읽고-쓰기로는 이 경주를 못 막는다(09-27). */
  const { data: 집은것, error } = await db
    .from("laptop_jobs")
    .update({ status: "taken", taken_at: new Date().toISOString() })
    .eq("id", 후보.id).eq("status", "queued")
    .select("id, prompt, folder, taken_count").maybeSingle();
  if (error) return NextResponse.json({ error: "못 집었습니다: " + error.message }, { status: 500 });
  /* 남이 먼저 집었다 — 실패가 아니라 "지금은 없다". */
  if (!집은것) return NextResponse.json({ ok: true, job: null });

  await db.from("laptop_jobs")
    .update({ taken_count: (집은것.taken_count ?? 0) + 1 })
    .eq("id", 집은것.id);

  return NextResponse.json({ ok: true, job: 집은것 });
}

/** 노트북이 결과를 적는다. */
export async function PATCH(request: Request) {
  const c = await 회사(request);
  if (!c) return 막음();

  const body = (await request.json().catch(() => ({}))) as
    { id?: string; 결과?: string; 탈?: string | null; 걸린초?: number };
  if (!body.id) return NextResponse.json({ error: "id 가 필요합니다." }, { status: 400 });

  const 실패 = !!body.탈;
  const { data, error } = await createServiceClient()
    .from("laptop_jobs")
    .update({
      status: 실패 ? "failed" : "done",
      result: body.결과?.slice(0, 200_000) ?? null,
      error_text: body.탈?.slice(0, 2_000) ?? null,
      took_seconds: typeof body.걸린초 === "number" ? Math.round(body.걸린초) : null,
      done_at: new Date().toISOString(),
    })
    /* 내 회사 줄만 — id 를 알아도 남의 일거리는 못 건드린다 */
    .eq("id", body.id).eq("company_id", c.id)
    .select("id, status").maybeSingle();
  if (error) return NextResponse.json({ error: "못 적었습니다: " + error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "그런 일거리가 없습니다." }, { status: 404 });

  return NextResponse.json({ ok: true, job: data });
}
