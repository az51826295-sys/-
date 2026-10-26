import { existsSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

/**
 * **서버가 보낸 폴더를 믿지 않는다** (10-26).
 *
 * 듣는 쪽(`engine/tools/laptop_listener.mts`)은 남의 서버가 보낸 주문을 이 기계에서
 * 돌린다. 그러면 "어디서 돌리나" 가 경계가 된다 — 서버가 `C:\Windows` 나 `..\..` 를
 * 보내도 넘어가지 않아야 한다.
 *
 * 그래서 **뿌리는 사장님이 명령줄에 적은 것만**이고, 서버 값은 그 안일 때만 따른다.
 * 자가 잴 수 있게 듣는 쪽에서 빼냈다 — 파일 안에 묻어 두면 안 돌려 보게 된다.
 * 이름은 ASCII 로 둔다(한글 export 는 tsx 가 조용히 흘린다 — 10-25).
 */
export function resolveJobFolder(뿌리: string, 서버가보낸: string | null | undefined): {
  folder: string; ignored: boolean;
} {
  if (!서버가보낸 || !서버가보낸.trim()) return { folder: 뿌리, ignored: false };

  let 길: string;
  try {
    const 합친것 = resolve(뿌리, 서버가보낸);
    /* 실제 경로로 푼다 — 심링크로 뿌리 밖을 가리킬 수 있다. 없는 폴더는 풀 수 없으니
       합친 경로로 판정한다(그때도 뿌리 안이어야 한다). */
    길 = existsSync(합친것) ? realpathSync(합친것) : 합친것;
  } catch {
    return { folder: 뿌리, ignored: true };
  }

  let 안전뿌리 = 뿌리;
  try { if (existsSync(뿌리)) 안전뿌리 = realpathSync(뿌리); } catch { /* 그대로 쓴다 */ }

  /* `뿌리 + sep` 로 견준다 — `C:\게임` 과 `C:\게임2` 가 startsWith 로는 같게 보인다. */
  if (길 === 안전뿌리 || 길.startsWith(안전뿌리 + sep)) return { folder: 길, ignored: false };
  return { folder: 안전뿌리, ignored: true };
}
