import { devKey, devKeyOk, devFromRequest } from "../../src/lib/dot/dev";
import { prepareTurn } from "../../src/lib/dot/turn";

/**
 * **개발자 링크 자** (11-13) — `npx tsx engine/tools/dot_dev_check.mts`
 *
 * 셋을 센다: 열쇠 판정 · 문(`/api/dot/dev`) · **하트 문을 정말 지나치나**.
 * 셋째는 **대조군(개발자 아님)을 같이 돌린다** — 대조군이 없으면 "다 통과" 가 아무 뜻이 없다
 * ([[prompt-credit-needs-a-control]]). 가짜 DB 라 진짜 열쇠도 네트워크도 안 쓴다.
 */
let 맞은수 = 0, 틀린수 = 0;
const 맞 = (b: boolean, s: string) => { b ? 맞은수++ : 틀린수++; console.log(`${b ? "OK " : "NG "} ${s}`); };

console.log("## 열쇠");
process.env.DOT_DEV_KEY = "";
process.env.SUPABASE_SECRET_KEY = "seed-for-the-test-only";
const k = devKey()!;
맞(/^[0-9a-f]{24}$/.test(k), `열쇠 모양 24 hex (${k})`);
맞(devKeyOk(k), "맞는 열쇠는 통과");
맞(!devKeyOk(k.slice(0, 23)), "한 글자 짧으면 거절");
맞(!devKeyOk(k.slice(0, 23) + "0"), "한 글자 다르면 거절");
맞(!devKeyOk(""), "빈 열쇠 거절");
맞(!devKeyOk(null), "없는 열쇠 거절");
맞(devFromRequest(new Request("http://x/", { headers: { cookie: `a=1; dot_dev=${k}; b=2` } })), "쿠키에서 읽는다");
맞(devFromRequest(new Request("http://x/", { headers: { "x-dot-dev": k } })), "헤더에서 읽는다(앱)");
맞(!devFromRequest(new Request("http://x/", { headers: { cookie: "dot_dev=nope" } })), "틀린 쿠키 거절");
맞(!devFromRequest(new Request("http://x/")), "아무것도 없으면 거절");
/* 이빨 — 비밀이 없으면 개발자 모드가 **아예 없어야** 한다. */
process.env.SUPABASE_SECRET_KEY = "";
맞(devKey() === null && !devKeyOk(k), "비밀이 없으면 전부 거절(이빨)");
process.env.SUPABASE_SECRET_KEY = "seed-for-the-test-only";
process.env.DOT_DEV_KEY = "손으로넣은열쇠";
맞(devKey() === "손으로넣은열쇠", "DOT_DEV_KEY 가 이긴다");

console.log("\n## 문 (/api/dot/dev)");
process.env.DOT_DEV_KEY = "testkey-0123456789";
const { GET } = await import("../../src/app/api/dot/dev/route");

const 나쁜 = await GET(new Request("https://d/api/dot/dev?key=wrong"));
맞(나쁜.status === 404, `틀린 열쇠 → ${나쁜.status} (404 여야)`);
맞(!나쁜.headers.get("set-cookie"), "틀린 열쇠엔 쿠키를 안 준다");

const 좋은 = await GET(new Request("https://d/api/dot/dev?key=testkey-0123456789"));
const c = 좋은.headers.get("set-cookie") ?? "";
맞(좋은.status === 302 && 좋은.headers.get("location") === "/dot", `맞는 열쇠 → ${좋은.status} ${좋은.headers.get("location")}`);
맞(/^dot_dev=testkey-0123456789;/.test(c), "쿠키를 심는다");
맞(/HttpOnly/.test(c) && /SameSite=Lax/.test(c) && /Secure/.test(c), "HttpOnly · SameSite=Lax · Secure(https)");
맞(/Max-Age=31536000/.test(c), "1년짜리");

const 로컬 = await GET(new Request("http://localhost:3000/api/dot/dev?key=testkey-0123456789"));
맞(!/Secure/.test(로컬.headers.get("set-cookie") ?? ""), "localhost(http) 에서는 Secure 를 안 붙인다");

const 끄기 = await GET(new Request("https://d/api/dot/dev?off=1"));
맞(끄기.status === 302 && /Max-Age=0/.test(끄기.headers.get("set-cookie") ?? ""), "끄는 길이 쿠키를 지운다");

console.log("\n## 하트 문");

type Row = Record<string, unknown> | null;
let rpc호출: string[] = [];

/** 가짜 장부 — 오늘 줄이 **없고**(출석·광고 0) 하트도 0 인 사람. 제일 빡빡한 자리다. */
function 가짜DB(usage: Row) {
  const 표 = (t: string): Row =>
    t === "dot_characters" ? { id: "c1", slug: "x", name: "미유", persona: "p", speech: "s", sprites: {}, default_emotion: "neutral" }
    : t === "dot_usage" ? usage : null;
  const 만들기 = (t: string) => {
    const p: Record<string, unknown> = {
      select: () => p, eq: () => p, order: () => p, limit: () => p, maybeSingle: () => p,
      single: () => p, upsert: () => p, insert: () => p, update: () => p,
      then: (res: (v: unknown) => unknown) => res({ data: t === "dot_messages" ? [] : 표(t), error: null, count: 0 }),
    };
    return p;
  };
  return {
    from: (t: string) => 만들기(t),
    rpc: async (name: string) => { rpc호출.push(name); return { data: 0, error: null }; },   // 하트 없음
  } as unknown as Parameters<typeof prepareTurn>[0];
}

/* 1) 대조군 — 개발자가 아니면 같은 자리에서 **막혀야** 한다. */
rpc호출 = [];
const 보통 = await prepareTurn(가짜DB(null), "u1", "c1", "안녕");
맞("ok" in 보통 && 보통.reason === "limit", `대조군은 막힌다 (${"ok" in 보통 ? 보통.reason : "통과해 버렸다"})`);
맞(rpc호출.includes("dot_take_turn"), "대조군은 하트를 가져가려 한다");

/* 2) 개발자 링크 — 지나가고, 하트를 **건드리지 않는다**. */
rpc호출 = [];
const 개발 = await prepareTurn(가짜DB(null), "u1", "c1", "안녕", { 무제한: true });
맞(!("ok" in 개발), `개발자 링크는 지나간다 (${"ok" in 개발 ? 개발.reason : "지나감"})`);
맞(!rpc호출.includes("dot_take_turn"), `하트를 안 가져간다 (부른 RPC: ${rpc호출.join(",") || "없음"})`);
맞("ok" in 개발 ? false : 개발.무제한 === true, "끝낼 때 쓸 표시를 달고 나온다");

/* 3) 선물도 — **진짜 선물 키**로(3하트짜리 두쫀쿠). 없는 키를 쓰면 "그런 선물 없음" 에서
      먼저 떨어져 하트 길을 못 잰다 — 처음에 그렇게 써서 자가 조용히 통과했다. */
rpc호출 = [];
const 대조선물 = await prepareTurn(가짜DB(null), "u1", "c1", "선물", { gift: "dzk" });
/* 막는 까닭이 `no_hearts` 가 아니라 `limit` 인 것은 제품 그대로다 — 오늘 줄이 아예 없으면
   선물 자리에 닿기 전에 "새 줄 구멍" 가드가 먼저 막는다. 자를 거기에 맞춘다. */
맞("ok" in 대조선물 && (대조선물.reason === "no_hearts" || 대조선물.reason === "limit"), `대조군은 선물에서 막힌다 (${"ok" in 대조선물 ? 대조선물.reason : "통과해 버렸다"})`);
rpc호출 = [];
const 선물 = await prepareTurn(가짜DB(null), "u1", "c1", "선물", { gift: "dzk", 무제한: true });
맞(!("ok" in 선물), `선물도 지나간다 (${"ok" in 선물 ? 선물.reason : "지나감"})`);
맞(!rpc호출.includes("dot_take_turn"), `선물도 하트를 안 가져간다 (${rpc호출.join(",") || "없음"})`);

console.log(`\n맞음 ${맞은수} · 틀림 ${틀린수}`);
if (틀린수) process.exit(1);
