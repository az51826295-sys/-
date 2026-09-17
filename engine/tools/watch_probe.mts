/**
 * **같이 보기가 옛 화면을 지금인 척하지 않는가** (164회차 09-17). 돈 0, 모델 0, DB 0.
 *   npx tsx engine/tools/watch_probe.mts            — 멀쩡한 코드: 전부 통과해야 한다
 *   npx tsx engine/tools/watch_probe.mts --sabotage — 20초 규칙을 끈 고장: **이 자가 잡아야** 한다(못 잡으면 자가 고장)
 *
 * 재는 것: 방금 온 장이 그대로 나오나 · 20초 지난 장은 안 나오나 · 기계 둘이면 새 쪽 · 남의 회사 것은 안 보이나 ·
 * 기계 이름이 경로/머리글에 실려도 안전한 글자뿐인가 · 기계 수 상한.
 */
const { saveFrame, latestFrame, hostsOf, FRESH_MS } = await import("../../src/lib/hand/screen");

const sabotage = process.argv.includes("--sabotage");
// 고장 재현: 신선도 규칙이 없는 구현(어떤 옛 장이든 지금 화면으로 준다).
const fresh = sabotage ? Number.POSITIVE_INFINITY : FRESH_MS;

let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };

const jpg = (tag: number) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, tag]);
const T0 = 1_800_000_000_000;

saveFrame("co-A", "LAPTOP-1", jpg(1), T0);
const a = latestFrame("co-A", T0 + 2_000, fresh);
check("방금 온 장이 그대로 나온다", !!a && a.jpg[4] === 1 && a.ageMs === 2_000 && a.host === "LAPTOP-1", a && { host: a.host, ageMs: a.ageMs });

check("남의 회사에는 안 보인다", latestFrame("co-B", T0 + 2_000, fresh) === null);

saveFrame("co-A", "DESKTOP-2", jpg(2), T0 + 5_000);
const b = latestFrame("co-A", T0 + 6_000, fresh);
check("기계 둘이면 새로 온 쪽", b?.host === "DESKTOP-2" && b.jpg[4] === 2, b?.host);

const stale = latestFrame("co-A", T0 + 5_000 + FRESH_MS + 1, fresh);
check(`${FRESH_MS / 1000}초 지난 장은 안 준다(옛 화면을 지금인 척하지 않는다)`, stale === null, stale && { host: stale.host, ageMs: stale.ageMs });

saveFrame("co-C", "../../etc/pa ss\r\nx-evil: 1", jpg(3), T0);
const c = latestFrame("co-C", T0, fresh);
check("기계 이름은 안전한 글자뿐", !!c && /^[A-Za-z0-9_-]{1,64}$/.test(c.host), c?.host);

for (let i = 0; i < 10; i++) saveFrame("co-D", `PC-${i}`, jpg(i), T0 + i);
const kept = hostsOf("co-D");
check("기계 수 상한 — 열쇠가 새도 메모리를 못 채운다(새 넷만 남는다)", kept.length === 4 && kept.includes("PC-9") && !kept.includes("PC-0"), kept);

console.log(`\n본 줄 ${seen} · 어긋남 ${bad}` + (sabotage ? " · (고장을 넣은 판 — 어긋남이 1 이상이어야 자가 산 것)" : ""));
if (sabotage) process.exit(bad >= 1 ? 0 : 1);
process.exit(bad === 0 ? 0 : 1);
