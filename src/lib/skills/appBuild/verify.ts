import ts from "typescript";

/**
 * 낸 코드를 **돌리지 않고** 확인한다.
 *
 * 생성된 코드를 서버 프로세스에서 실행하면 그건 임의 코드 실행이고, 그 문을 한 번
 * 열면 이 회사의 모든 열쇠가 그 코드 안에 있다. 그래서 실행은 하지 않는다 —
 * 격리된 자리가 생기기 전까지는.
 *
 * 실행하지 않고도 확실히 잡을 수 있는 것이 하나 있다: **문법이 깨진 코드.**
 * 그건 가장 흔한 실패이면서, 사람이 붙여 넣기 전까지 아무도 모르는 실패다.
 * 파서는 결정적이라 의견이 안 들어가고, 통과하면 "적어도 코드이긴 하다"가
 * 보증된다.
 *
 * **문법 통과는 작동을 뜻하지 않는다.** 그 구분을 지우지 않으려고 여기서 내는
 * 말은 언제나 "파싱됨"이지 "됨"이 아니다.
 */

export type FileCheck = {
  path: string;
  language: string;
  /** 이 언어를 우리가 검사할 수 있었나. 못 하면 **통과가 아니라 미검사**다. */
  checked: boolean;
  ok: boolean;
  errors: { line: number; message: string }[];
};

/** 파서를 가진 언어. 나머지는 미검사로 남긴다 — 검사한 척하지 않는다. */
const PARSEABLE: Record<string, ts.ScriptKind> = {
  ts: ts.ScriptKind.TS,
  tsx: ts.ScriptKind.TSX,
  typescript: ts.ScriptKind.TS,
  js: ts.ScriptKind.JS,
  jsx: ts.ScriptKind.JSX,
  javascript: ts.ScriptKind.JS,
  json: ts.ScriptKind.JSON,
};

function kindFor(path: string, language: string): ts.ScriptKind | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return PARSEABLE[ext] ?? PARSEABLE[language.toLowerCase()] ?? null;
}

export function checkFiles(
  files: { path: string; language: string; contents: string }[],
): FileCheck[] {
  return files.map((f) => {
    const kind = kindFor(f.path, f.language);
    if (!kind) {
      return {
        path: f.path,
        language: f.language,
        checked: false,
        ok: false,
        errors: [],
      };
    }

    // 파싱만 한다. 타입 검사도 실행도 아니다 — 여기서 알고 싶은 것은
    // "이게 그 언어의 문장이긴 한가" 하나다.
    const source = ts.createSourceFile(
      f.path,
      f.contents,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ false,
      kind,
    );

    // parseDiagnostics 는 공개 타입에 없지만 파서가 채워 두는 곳이다.
    const diags =
      (source as unknown as { parseDiagnostics?: ts.Diagnostic[] })
        .parseDiagnostics ?? [];

    const errors = diags.map((d) => {
      const pos = d.start != null
        ? source.getLineAndCharacterOfPosition(d.start)
        : { line: 0, character: 0 };
      return {
        line: pos.line + 1,
        message: ts.flattenDiagnosticMessageText(d.messageText, " "),
      };
    });

    return {
      path: f.path,
      language: f.language,
      checked: true,
      ok: errors.length === 0,
      errors,
    };
  });
}

export function summarise(checks: FileCheck[]) {
  return {
    files: checks.length,
    parsed: checks.filter((c) => c.checked && c.ok).length,
    broken: checks.filter((c) => c.checked && !c.ok).length,
    /** 파서가 없어 못 본 것. **통과에 섞지 않는다.** */
    unchecked: checks.filter((c) => !c.checked).length,
  };
}

/** 고치라고 돌려보낼 때 쓰는 문구. 어디가 왜 깨졌는지만 말한다. */
export function repairBrief(checks: FileCheck[]): string {
  return checks
    .filter((c) => c.checked && !c.ok)
    .map(
      (c) =>
        `${c.path}\n` +
        c.errors.map((e) => `  ${e.line}행: ${e.message}`).join("\n"),
    )
    .join("\n\n");
}
