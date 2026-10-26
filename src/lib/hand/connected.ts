/**
 * **무엇이 붙어 있나** — 화면에 띄울 사실만 들고 있는다 (10-26).
 *
 * 사장님: "연결된거 유아이로 표시해야해."
 *
 * ## 조심한 것: **열린 것과 붙은 것은 다르다**
 *
 * "MCP 열려 있음"(열쇠가 있고 판정 서비스가 산다) 과 "MCP 붙어 있음"(실제로 누가
 * 불렀다) 은 다른 사실이다. 섞어서 "연결됨" 하나로 그리면 사장님이 붙은 줄 알고
 * 기다린다. 09-30 에 "열린 채 고장" 으로 세 바퀴를 헛돈 것과 같은 모양이다.
 *
 * ## 조심한 것 둘: **기억은 흔들린다**
 *
 * 마지막으로 붙은 때는 **그 서버 한 대의 기억**이다. 배포하면 지워지고, 서버가 여러
 * 대면 다른 대가 받은 것은 안 보인다. 그래서 **있으면 참이고, 없으면 "모름" 이지
 * "안 붙음" 이 아니다.** 0 을 "안 됨" 으로 읽는 실수를 또 하지 않는다
 * ([[zero-can-mean-i-cannot-see]]).
 *
 * 로키 DB 를 안 쓴다 — DB 가 살아나면 여기에 진짜 기록을 붙인다.
 */

export type 길이름 = "mcp" | "laptop";

/** 마지막으로 붙은 때. 서버 한 대의 기억이라 비어 있는 것이 "안 붙음" 을 뜻하지 않는다. */
const 마지막 = new Map<길이름, { at: number; what: string }>();

/** 누가 붙어서 무엇을 했다 — 문에서 부른다. */
export function noteConnected(길: 길이름, what: string): void {
  마지막.set(길, { at: Date.now(), what });
}

export type 연결상태 = {
  id: 길이름 | "folder";
  이름: string;
  /** 열려 있나 — 참·거짓·모름. */
  열림: boolean | null;
  /** 마지막으로 붙은 때(ISO). 없으면 모름. */
  마지막붙은때: string | null;
  마지막한것: string | null;
  /** 사람에게 보여 줄 한 줄. */
  말: string;
};

/** 판정 서비스가 사나 — MCP 의 두 도구가 전부 거기에 걸려 있다. */
async function 판정서비스사나(): Promise<boolean | null> {
  const base = process.env.JUDGE_URL;
  if (!base) return false;   /* 주소가 없으면 127.0.0.1 을 찾다가 전부 못 잼이 된다 */
  try {
    const r = await fetch(base + "/api/judge/thresholds", { signal: AbortSignal.timeout(6_000) });
    return r.ok;
  } catch {
    return null;             /* 못 물어봤다 — 죽었다고 적지 않는다 */
  }
}

/** 서버가 아는 연결 둘. 폴더는 브라우저만 아니까 화면에서 따로 붙인다. */
export async function connections(): Promise<연결상태[]> {
  const 자 = await 판정서비스사나();
  const 열쇠있나 = !!process.env.MCP_TOKEN;
  const mcp = 마지막.get("mcp");
  const laptop = 마지막.get("laptop");

  const 줄 = (
    id: 길이름, 이름: string, 열림: boolean | null, rec: { at: number; what: string } | undefined, 말: string,
  ): 연결상태 => ({
    id, 이름, 열림,
    마지막붙은때: rec ? new Date(rec.at).toISOString() : null,
    마지막한것: rec?.what ?? null,
    말,
  });

  return [
    줄("mcp", "클로드 코드·커서 (MCP)",
      열쇠있나 && 자 === true ? true : 자 === null ? null : false,
      mcp,
      !열쇠있나 ? "열쇠가 없어서 닫혀 있어요"
        : 자 === null ? "확인을 못 했어요"
        : 자 === false ? "판정 서비스에 못 닿아요"
        : mcp ? "붙어서 쓰고 있어요"
        : "열려 있어요 — 아직 붙은 적은 못 봤어요"),
    줄("laptop", "내 컴퓨터 클로드 코드",
      null, laptop,
      laptop ? "붙어서 듣고 있어요" : "아직 확인 못 했어요 — 일거리 칸을 먼저 만들어야 해요"),
  ];
}
