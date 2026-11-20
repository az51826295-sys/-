// tsc --noEmit 은 engine/tools 의 .mts 도구들을 검사하지 않는다.
// 그래서 문법 오류가 실제로 돌려 보기 전까지 숨어 있다.
// esbuild 로 한 번에 문법만 검사한다: npx tsx engine/tools/mts_syntax.mts
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "..", "..");
const files = readdirSync(dir).filter((f) => f.endsWith(".mts")).sort();

let failed = 0;
for (const f of files) {
  const path = join(dir, f);
  try {
    await transform(readFileSync(path, "utf8"), {
      loader: "ts",
      format: "esm",
      platform: "node",
      sourcefile: path,
      logLevel: "silent",
    });
  } catch (e: any) {
    failed++;
    const err = e?.errors?.[0];
    const rel = relative(root, path).replace(/\\/g, "/");
    const loc = err?.location ? `${err.location.line}:${err.location.column}` : "?:?";
    console.log(`${rel}: ${loc} ${err?.text ?? String(e?.message ?? e).split("\n")[0]}`);
  }
}
console.log(`checked ${files.length} files, ${failed} failed`);
process.exit(failed ? 1 : 0);
