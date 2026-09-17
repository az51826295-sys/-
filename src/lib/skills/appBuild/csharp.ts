/**
 * C# 을 **파서 없이** 훑어보는 자.
 *
 * 59회차 09-08: Dev 가 낸 씬 빌더가 `"\"createdAt\":\"([^\\"]+" )` 로 문자열이 일찍 닫혀
 * 유니티가 컴파일을 못 했다. 그런데 우리 문법 그물(`verify.ts`)은 ts·js·json 만 본다 —
 * **우리가 실제로 내는 언어(C#)는 한 번도 검사된 적이 없었다.** 고칠 기회가 있었는데 그물에 구멍이 있었다.
 *
 * 여기서 하는 것은 파싱이 아니라 **셈**이다. 진짜 C# 파서를 들이는 것은 무겁고,
 * 우리가 실제로 겪는 고장은 거의 다 이 둘이다:
 *   1. 문자열·문자 리터럴이 줄 안에서 안 닫힘(이스케이프를 잘못 써서)
 *   2. 괄호 짝이 안 맞음
 * 둘 다 문자열·주석을 제대로 건너뛰며 세면 확실히 잡힌다. 못 잡는 것(타입·이름)은
 * 여기서 안 본다 — 이 자는 "이게 C# 문장이긴 한가" 만 답한다.
 */

export type Err = { line: number; message: string };

const OPEN: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

export function checkCSharpSyntax(source: string): Err[] {
  const errors: Err[] = [];
  const stack: { ch: string; line: number }[] = [];
  let line = 1;
  let i = 0;
  const n = source.length;

  const at = (k: number) => (k < n ? source[k] : "");

  while (i < n) {
    const c = source[i];

    if (c === "\n") {
      line++;
      i++;
      continue;
    }

    // 주석
    if (c === "/" && at(i + 1) === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && at(i + 1) === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && at(i + 1) === "/")) {
        if (source[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }

    // 축자 문자열 @"..." — 줄바꿈이 허용되고 "" 가 따옴표 하나다.
    if (c === "@" && at(i + 1) === '"') {
      const start = line;
      i += 2;
      let closed = false;
      while (i < n) {
        if (source[i] === "\n") line++;
        if (source[i] === '"') {
          if (at(i + 1) === '"') {
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) errors.push({ line: start, message: "축자 문자열 @\" 이 닫히지 않았습니다" });
      continue;
    }

    // 보통 문자열 "..." (보간 $"..." 도 같게 본다 — 안쪽 중괄호는 짝이 맞으므로 세지 않아도 된다)
    if (c === '"') {
      const start = line;
      i++;
      let closed = false;
      while (i < n) {
        const d = source[i];
        if (d === "\\") {
          // 이스케이프는 **다음 한 글자를 통째로 넘긴다.** 여기가 이번 고장의 자리다:
          // `\\"` 는 역슬래시 + 따옴표라 문자열이 거기서 닫힌다.
          i += 2;
          continue;
        }
        if (d === "\n") break; // 보통 문자열은 줄을 못 넘는다
        if (d === '"') {
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) errors.push({ line: start, message: '문자열 " 이 그 줄에서 닫히지 않았습니다 (이스케이프를 확인하세요 — `\\\\"` 는 문자열을 닫습니다)' });
      continue;
    }

    // 문자 리터럴 '...'
    if (c === "'") {
      const start = line;
      i++;
      let closed = false;
      while (i < n) {
        const d = source[i];
        if (d === "\\") {
          i += 2;
          continue;
        }
        if (d === "\n") break;
        if (d === "'") {
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) errors.push({ line: start, message: "문자 리터럴 ' 이 그 줄에서 닫히지 않았습니다" });
      continue;
    }

    if (OPEN[c]) {
      stack.push({ ch: c, line });
      i++;
      continue;
    }
    if (CLOSE[c]) {
      const want = CLOSE[c];
      const top = stack.pop();
      if (!top) {
        errors.push({ line, message: `닫는 ${c} 가 짝 없이 있습니다` });
      } else if (top.ch !== want) {
        errors.push({ line, message: `${top.line}줄의 ${top.ch} 가 ${c} 로 닫혔습니다` });
      }
      i++;
      continue;
    }

    i++;
  }

  for (const left of stack) {
    errors.push({ line: left.line, message: `${left.ch} 가 닫히지 않았습니다` });
  }

  // 한 파일에서 쏟아지는 것은 대개 앞의 하나가 원인이다. 앞의 몇 줄만 말한다.
  return errors.slice(0, 8);
}
