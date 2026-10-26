import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * **내 연결 열쇠** (10-26). 사장님: "다른 사용자가 AI 연결하는 과정이 구현 되어 있어?"
 *
 * 안 돼 있었다. 열쇠는 `companies.unity_key` 로 회사별로 있었는데 **화면 어디에도
 * 안 떴다** — 남이 자기 열쇠를 받을 길이 없었다. 여기가 그 길이다.
 *
 * - `GET`  내 열쇠를 준다. 없으면 만들어서 준다.
 * - `POST` 새로 만든다 — **지금 붙어 있는 것은 다 끊긴다.**
 *
 * 열쇠는 `companies.owner_id = 나` 인 회사 것만 준다. 남의 열쇠는 어떤 길로도 안 나간다.
 * 새 열쇠 체계를 만들지 않는다 — 손 v0~v2 와 **같은 열쇠**다. 둘로 만들면 사람이
 * 어느 것을 넣어야 하는지 모른다.
 */

/** `rk_` + 32바이트. 손 v0 이 쓰던 `rk_<uuid>` 꼴을 따른다. */
const 새열쇠 = () => "rk_" + randomBytes(24).toString("base64url");

async function 내회사() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, 탈: { error: "로그인이 필요해요.", status: 401 } } as const;

  const db = createServiceClient();
  const { data, error } = await db
    .from("companies").select("id, name, unity_key")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  /* 오류를 읽는다 — 안 읽으면 DB 가 죽은 것이 "회사가 없다" 로 나온다(오늘 세 번째다) */
  if (error) return { ok: false as const, 탈: { error: "로키 DB 에 못 닿았어요: " + error.message.slice(0, 160), status: 503 } } as const;
  if (!data) return { ok: false as const, 탈: { error: "아직 회사가 없어요. 로키에 한 번 일을 시키면 생겨요.", status: 404 } } as const;
  return { ok: true as const, db, 회사: data as { id: string; name: string | null; unity_key: string | null } } as const;
}

export async function GET() {
  const r = await 내회사();
  if (!r.ok) return Response.json({ error: r.탈.error }, { status: r.탈.status });

  let key = r.회사.unity_key;
  if (!key) {
    /* 비어 있는 회사가 있다 — `unity_key` 는 나중에 붙인 칸이라 null 이 남아 있다. */
    key = 새열쇠();
    const { error } = await r.db.from("companies").update({ unity_key: key }).eq("id", r.회사.id);
    if (error) return Response.json({ error: "열쇠를 못 만들었어요: " + error.message.slice(0, 160) }, { status: 503 });
  }
  return Response.json({ ok: true, key, 회사: r.회사.name ?? null, 만든것: !r.회사.unity_key });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { confirm?: unknown };
  /* 되돌릴 수 없다 — 바꾸면 지금 붙어 있는 클로드 코드·노트북이 다 끊긴다. */
  if (body.confirm !== "새로") {
    return Response.json({ error: "확인 문구가 필요해요(새로). 바꾸면 지금 붙어 있는 것이 다 끊겨요." }, { status: 400 });
  }
  const r = await 내회사();
  if (!r.ok) return Response.json({ error: r.탈.error }, { status: r.탈.status });

  const key = 새열쇠();
  const { error } = await r.db.from("companies").update({ unity_key: key }).eq("id", r.회사.id);
  if (error) return Response.json({ error: "못 바꿨어요: " + error.message.slice(0, 160) }, { status: 503 });
  return Response.json({ ok: true, key });
}
