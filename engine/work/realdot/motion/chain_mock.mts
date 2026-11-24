// 만든 48px 캐릭터 → 동작 생성 참조로 이어지나(목, 돈 0)
process.env.PIXEL_CREATE_MOCK = "engine/work/realdot/motion/mock-one.png";
process.env.PIXEL_MOTION_MOCK = "C:/Users/az518/Desktop/두근도트-스레드/realdot/first-motion/raw.png";
const { makeCharacter } = await import("../../../../src/lib/pixel/create");
const { makeMotion } = await import("../../../../src/lib/pixel/motion");
const c = await makeCharacter("x", 48); if (!c.ok) throw new Error(c.reason);
for (const ref of [c.png, c.big]) { const m = await makeMotion(ref, "turn"); console.log(ref.length, m.ok, m.ok ? m.check.facts : m.reason); }
