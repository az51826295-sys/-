import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { characterBySlug, spriteDataUrls } from "@/lib/dot/load";
import DotChat from "./DotChat";
import { FREE_TURNS_PER_DAY, todayKST, toMode, toNextStage } from "@/lib/dot/bond";
import { balanceFor, type Balance } from "@/lib/dot/money";

/**
 * 한 사람과의 대화방. 카톡처럼 목록(`/dot`)에서 눌러 들어온다.
 *
 * 지난 대화·사이·남은 횟수를 **서버에서 미리 실어 보낸다.** 화면이 켜진 뒤에
 * 불러오면 빈 방이 먼저 보이고, 그 한 박자가 "덜 만든 것" 처럼 느껴진다.
 */
export const viewport = {
  width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#a5bccd",
  // 09-12 사장님 화면: 키보드가 뜨면 입력줄 아래 검은 빈칸. 크롬 108+ 는 키보드가 떠도 레이아웃(100dvh)을 안 줄이고
  // visualViewport 만 줄인다 → 우리가 phone 을 vv 높이로 줄이면 root(100dvh) 가운데 정렬 때문에 위아래에 빈칸. 레이아웃째 줄이게 한다.
  interactiveWidget: "resizes-content" as const,
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // 캐시된 목록에서 꺼낸다 — 제목 하나 때문에 DB 를 또 왕복하지 않는다.
  return { title: (await characterBySlug(slug))?.name ?? "두근도트" };
}

export default async function DotRoom({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ post?: string }> }) {
  const { slug } = await params;
  const { post: postParam } = await searchParams;

  // 누구인지와 이 캐릭터가 누구인지는 **서로 필요 없다** — 나란히 묻는다.
  const supabase = await createClient();
  const [{ data: { user } }, found, inline] = await Promise.all([
    supabase.auth.getUser(),
    characterBySlug(slug),
    spriteDataUrls(slug),
  ]);
  if (!found) notFound();
  // 그림을 HTML 에 같이 실어 보낸다 — 방 하나에 최대 여섯 번 하던 싱가포르 왕복이 0 이 된다.
  // `face:<표정>` 키는 얼굴 크롭. 동봉된 것이 있으면 그걸, 없으면 저장소 주소.
  const faces: Record<string, string> = { ...found.faces };
  for (const [k, v] of Object.entries(inline)) if (k.startsWith("face:")) faces[k.slice(5)] = v;
  const bust: Record<string, string> = {};
  for (const [k, v] of Object.entries(inline)) if (!k.startsWith("face:")) bust[k] = v;
  const who = { ...found, sprites: Object.keys(bust).length ? bust : found.sprites, faces };
  const db = createServiceClient();

  let bond = { points: 0, stage: 1, streakDays: 0, toNext: toNextStage(0), mode: "normal" as "normal" | "menhera" };
  let remaining = FREE_TURNS_PER_DAY;
  let balance: Balance = { remaining, freeLeft: remaining, credits: 0, adLeft: 2, menheraUntil: null };
  let history: { role: string; content: string; emotion: string | null; sticker?: string | null; at?: string }[] = [];

  if (user) {
    const day = todayKST();
    const [{ data: b }, bal, { data: m }] = await Promise.all([
      db.from("dot_bonds").select("points, stage, streak_days, mode").eq("user_id", user.id).eq("character_id", who.id).maybeSingle(),
      balanceFor(db, user.id, day),
      db.from("dot_messages").select("role, content, emotion, sticker, created_at").eq("user_id", user.id).eq("character_id", who.id).order("id", { ascending: false }).limit(60),
      // 방을 열었다 = 읽었다(86회차 안 읽은 수). 09-13: 기다리지 않고 던지니 바로 뒤로 나가면 아직 안 찍혀 배지가 남았다(자 2/4 떨어짐) — 다른 조회와 나란히 기다린다.
      db.from("dot_bonds").upsert({ user_id: user.id, character_id: who.id, last_seen_at: new Date().toISOString() }, { onConflict: "user_id,character_id" }).then(() => {}, () => {}),
    ]);
    const points = (b?.points as number) ?? 0;
    bond = { points, stage: (b?.stage as number) ?? 1, streakDays: (b?.streak_days as number) ?? 0, toNext: toNextStage(points), mode: toMode(b?.mode) };
    balance = bal; remaining = bal.remaining;
    // 시각은 **ISO 문자열 그대로** 넘긴다. 서버에서 "오후 9:17" 로 만들어 보내면
    // 서버 시간대로 찍히고, 브라우저가 다시 그릴 때 어긋나 화면이 죽는다(React #418).
    history = ((m ?? []) as { role: string; content: string; emotion: string | null; sticker: string | null; created_at: string }[])
      .reverse()
      .map((x) => ({ role: x.role, content: x.content, emotion: x.emotion, sticker: x.sticker, at: x.created_at }));
  }

  // 피드의 "답장" — 그 게시물을 방에 들고 온다(78회차). 첫 말에 붙여 보내면 모델이 그 사진 얘기로 받는다.
  let replyTo: { id: number; caption: string; image: string } | null = null;
  if (postParam && /^\d+$/.test(postParam)) {
    const { data: p } = await db.from("dot_posts").select("id, caption, image_url").eq("id", Number(postParam)).eq("character_id", who.id).maybeSingle();
    if (p) replyTo = { id: p.id as number, caption: p.caption as string, image: p.image_url as string };
  }

  return (
    <DotChat
      replyTo={replyTo}
      signedIn={!!user}
      account={{ linked: !!user && !user.is_anonymous, email: user?.email ?? null }}
      who={who}
      bond={bond}
      remaining={remaining}
      balance={balance}
      history={history}
      limit={FREE_TURNS_PER_DAY}
    />
  );
}
