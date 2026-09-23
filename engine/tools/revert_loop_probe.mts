/** 고리가 쓰는 꼴(revertBroken)로 — 실제 세 판. */
const { revertBroken } = await import("../../src/lib/skills/appBuild/revertCheck");
const { readFileSync } = await import("node:fs");
const f = (p: string) => [{ path: "index.html", contents: readFileSync(p, "utf8") }];
const A = f("engine/work/cleared/index.html"), B = f("engine/work/hist-0bff69f3-9c3c-49b0-a450-d5e2169153ab/index.html"), C = f("engine/work/hist-cfbc57c5-9b0e-4f83-a11b-72359e508923/index.html");
const hit = revertBroken(A, B, C);
console.log(hit.length && /되돌림/.test(hit[0]) ? "맞음  고리 꼴로도 잡힌다: " + hit[0] : "어긋남 " + JSON.stringify(hit));
console.log(revertBroken(A, B, B).length === 0 ? "맞음  살아 있으면 0" : "어긋남 살아 있는데 잡힘");
console.log(revertBroken(null, B, C).length === 0 ? "맞음  앞앞 판 없으면 조용히 0(못 잼)" : "어긋남");
