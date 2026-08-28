/**
 * 언제 그만둘 것인가.
 *
 * 고치는 고리에서 진짜 위험은 "못 고치는 것"이 아니라 **못 고치면서 계속 도는
 * 것**이다. 같은 오류에 같은 수정을 반복하면 판마다 돈이 나가고 아무것도
 * 나아지지 않는다. 그래서 이 파일에는 판정이 하나 있다: 나아지고 있는가.
 *
 * 나아짐의 정의를 "오류 수가 줄었나"로만 두지 않는다. 하나 고치는 동안 다른
 * 하나가 새로 나면 수는 그대로지만 그건 도는 중이 아니다. 그래서 **오류의
 * 지문**을 본다 — 같은 지문이 두 판 연속이면, 우리가 낸 수정이 아무것도 바꾸지
 * 못했다는 뜻이고, 한 번 더 낸다고 달라질 이유가 없다.
 */

export type CompileError = {
  file: string;
  line: number;
  message: string;
};

/** 윈도우 경로와 유니티 경로를 같은 것으로 본다. */
const BACKSLASH = String.fromCharCode(92);
function normalize(path: string): string {
  return path.split(BACKSLASH).join("/");
}

/** 한 판의 오류 묶음을 한 줄로. 순서와 줄번호 흔들림에 휘둘리지 않게 만든다. */
export function fingerprint(errors: CompileError[]): string {
  return errors
    .map((e) => {
      // 줄번호는 위에 한 줄만 넣어도 밀린다. 파일과 메시지가 같으면 같은
      // 오류로 본다 — 줄번호까지 넣으면 "안 고쳐졌는데 지문이 달라진다".
      const file = normalize(e.file).split("/").pop() ?? e.file;
      // 식별자 뒤의 위치 정보(괄호 안 숫자 등)는 떼어 낸다.
      const msg = e.message.replace(/\s+/g, " ").trim().toLowerCase();
      return `${file}|${msg}`;
    })
    .sort()
    .join("\n");
}

export type Decision =
  | { go: true }
  | { go: false; status: "compiled" | "stuck" | "stopped"; why: string };

/** 한 판 더 갈 것인가. */
export function decide(args: {
  round: number;
  maxRounds: number;
  errors: CompileError[];
  /** 지난 판에 돌아왔던 오류의 지문. 첫 판이면 null. */
  previous: string | null;
}): Decision {
  if (args.errors.length === 0) {
    return {
      go: false,
      status: "compiled",
      why: "컴파일이 통과했습니다. 합격 기준은 아직 확인되지 않았습니다 — 그건 사람이 봅니다.",
    };
  }

  if (args.previous !== null && fingerprint(args.errors) === args.previous) {
    return {
      go: false,
      status: "stuck",
      why:
        "지난 판과 **똑같은 오류**가 돌아왔습니다. 낸 수정이 아무것도 바꾸지 " +
        "못했다는 뜻이라, 한 판 더 도는 것은 돈만 씁니다. 남은 오류를 그대로 " +
        "보여 드립니다.",
    };
  }

  if (args.round >= args.maxRounds) {
    return {
      go: false,
      status: "stopped",
      why: `${args.maxRounds}판을 채웠습니다. 줄어들고는 있었지만 여기서 멈춥니다 — 더 갈지는 사람이 정합니다.`,
    };
  }

  return { go: true };
}

/**
 * 이 경로에 써도 되는가.
 *
 * 판마다 사람에게 묻지 않는 대신, **울타리**를 친다. 세션이 정한 우리 안에만
 * 쓰고 그 밖은 건드리지 않는다. 자동으로 도는 물건이 남의 프로젝트 아무 데나
 * 쓸 수 있으면, 그건 협업이 아니라 사고다.
 */
export function insideScope(path: string, scope: string): boolean {
  const p = normalize(path);
  if (p.includes("..")) return false;
  if (!p.startsWith("Assets/")) return false;
  return p.startsWith(normalize(scope));
}
