const { renderDeck } = await import("../../src/lib/skills/slidesMake/index");
const { runWeb } = await import("../../src/lib/skills/appBuild/run");
const html = renderDeck({ title: "로키 소개", subtitle: "말하면 파일이 돼요", audience: "x", slides: [{ heading: "로키 소개", bullets: [], note: "" }, { heading: "둘", bullets: ["a"], note: "" }] });
const f = await runWeb([{ path: "deck.html", language: "html", contents: html }], { mobile: false, actions: [{ do: "wait", ms: 500 }] });
console.log("ran", f.ran, "· 오류", f.consoleErrors, "· text:", JSON.stringify(f.text).slice(0, 300), "· 키:", Object.keys(f).join(","));
