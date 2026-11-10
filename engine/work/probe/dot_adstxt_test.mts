/** `/ads.txt` 가 번호가 있을 때만, 바른 모양으로 나오나. 올리기 전에 돌려 본다. */
const { GET } = await import("../../../src/app/ads.txt/route");
const 결과: boolean[] = [];
const 재기 = (맞음: boolean, 말: string) => { 결과.push(맞음); console.log(`${맞음 ? "맞음" : "틀림"}  ${말}`); };

delete process.env.ADSENSE_CLIENT;
let r = GET();
재기(r.status === 404, `번호가 없으면 404 (${r.status}) — 빈 파일은 "아무도 권한 없음" 이라 더 나쁘다`);

process.env.ADSENSE_CLIENT = "ca-pub-1234567890123456";
r = GET();
const 글 = await r.text();
재기(r.status === 200, `번호가 있으면 200 (${r.status})`);
재기(글.trim() === "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0", `모양이 맞다 — ${글.trim()}`);
재기(!글.includes("ca-pub"), "ads.txt 는 ca- 를 떼고 적는다");

process.env.ADSENSE_CLIENT = "pub-123";   // 모양이 틀린 번호
재기(GET().status === 404, "모양이 틀린 번호는 404");

const 틀린 = 결과.filter((x) => !x).length;
console.log(`\n${결과.length - 틀린}/${결과.length} 맞음`);
process.exit(틀린 ? 1 : 0);
