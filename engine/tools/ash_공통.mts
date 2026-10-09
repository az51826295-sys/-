/**
 * **자들이 같이 밟는 지뢰 하나** (10-09).
 *
 * tsx(esbuild)는 `--keep-names` 로 함수에 이름을 붙이려고 `__name(f, "f")` 호출을 끼워 넣는다.
 * 그 헬퍼는 **노드 쪽에만** 있고 `page.evaluate` 안은 브라우저다. 그래서 evaluate 안에
 * **이름 붙은 함수를 하나라도** 두면(`const 봄 = (x) => …` 같은 것) `__name is not defined` 로 터진다.
 *
 * 터진 자는 "통과도 실패도 아닌" 상태가 된다 — ash_난이도.mts 가 이것 때문에 며칠 못 돌았다.
 * 브라우저 쪽에 아무것도 안 하는 `__name` 을 미리 깔아 막는다.
 *
 * **문자열로 넘기는 것이 핵심이다.** 함수로 넘기면 그 함수 자체가 또 esbuild 를 지나며
 * 같은 `__name` 호출을 달고 가서 똑같이 터진다.
 */
export async function 이름헬퍼(page: { evaluateOnNewDocument: (s: string) => Promise<unknown> }) {
  await page.evaluateOnNewDocument(
    "globalThis.__name = globalThis.__name || function (f) { return f; };",
  );
}
