import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 지금 유니티에서 무슨 일이 도는가 — **화면이 물어보는 쪽.**
 *
 * 심부름꾼이 쓰는 경로들과 문이 다르다. 저쪽은 유니티 열쇠로 들어오는 기계고,
 * 여기는 로그인한 사람이다. 그래서 회사 소유는 사용자 세션으로 확인하고,
 * 실제로 읽는 것은 서비스 롤로 읽는다 — `unity_*` 표들은 RLS 를 켜고 정책을
 * 열지 않았기 때문에 사용자 권한으로는 조용히 빈 답이 나온다.
 *
 * 세션이 끝나도 잠깐은 돌려준다. 끝나자마자 화면에서 사라지면, 열 몇 분을
 * 기다린 사람이 **결과를 못 보고 놓친다.**
 */

export const dynamic = "force-dynamic";

/** 끝난 세션을 화면에 얼마나 더 붙잡아 둘지. */
const KEEP_AFTER_END_MS = 6 * 60 * 60 * 1000;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ session: null }, { status: 401 });

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!company) return NextResponse.json({ session: null });

  const db = createServiceClient();

  // 심부름꾼이 마지막으로 다녀간 시각. 칸이 아직 없는 데이터베이스에서도
  // 화면이 깨지지 않게 따로 묻는다 — 못 재는 것과 없는 것은 다르고, 화면도
  // 그렇게 말한다.
  let runnerSeenAt: string | null = null;
  let runnerMeasurable = true;
  const seen = await db
    .from("companies")
    .select("unity_runner_seen_at")
    .eq("id", company.id)
    .maybeSingle();
  if (seen.error) runnerMeasurable = false;
  else runnerSeenAt = (seen.data?.unity_runner_seen_at as string | null) ?? null;

  const { data: rows } = await db
    .from("unity_sessions")
    .select(
      "id, want, scope, status, round, ended_why, scene_method, criteria, plan, created_at, updated_at",
    )
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const s = (rows ?? [])[0] as
    | {
        id: string;
        want: string;
        scope: string;
        status: string;
        round: number;
        ended_why: string | null;
        scene_method: string | null;
        criteria: { when: string; then: string }[];
        plan: { path: string; purpose: string; written: boolean }[];
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!s) {
    return NextResponse.json({ session: null, runnerSeenAt, runnerMeasurable });
  }

  const ended = s.status !== "running";
  if (ended && Date.now() - new Date(s.updated_at).getTime() > KEEP_AFTER_END_MS) {
    return NextResponse.json({ session: null, runnerSeenAt, runnerMeasurable });
  }

  const { data: roundRows } = await db
    .from("unity_rounds")
    .select("round, files, errors, note, created_at")
    .eq("session_id", s.id)
    .order("round", { ascending: false })
    .limit(4);

  const rounds = ((roundRows ?? []) as {
    round: number;
    files: { path: string }[] | null;
    errors: { file: string; line: number; message: string }[] | null;
    note: string | null;
    created_at: string;
  }[]).map((r) => ({
    round: r.round,
    files: (r.files ?? []).length,
    errors: r.errors ?? [],
    note: r.note,
    at: r.created_at,
  }));

  const plan = s.plan ?? [];
  const written = plan.filter((f) => f.written).length;

  return NextResponse.json({
    runnerSeenAt,
    runnerMeasurable,
    session: {
      id: s.id,
      want: s.want,
      scope: s.scope,
      status: s.status,
      round: s.round,
      endedWhy: s.ended_why,
      sceneMethod: s.scene_method,
      // 합격 기준은 세어서만 보낸다. 이 띠에서 판정할 것이 아니라,
      // **사람이 켜서 볼 것**이 몇 개인지만 알면 된다.
      criteriaCount: (s.criteria ?? []).length,
      planned: plan.length,
      written,
      startedAt: s.created_at,
      updatedAt: s.updated_at,
      rounds,
    },
  });
}
