// 만들기 원본을 목으로 넣고 단위 후보 고르기를 돌린다(돈 0). npx tsx create_replay.mts <raw.png> <size>
const [raw, size] = process.argv.slice(2);
process.env.PIXEL_CREATE_MOCK = raw;
const { makeCharacter, unitTarget } = await import("../../../../src/lib/pixel/create");
const r = await makeCharacter("x", Number(size) as 64);
console.log("목표", unitTarget(Number(size)), r.ok ? r.drawn : r.reason, r.facts.filter((f) => /후보|첫 그림|줄임|캔버스/.test(f)).join(" | "));
