/**
 * `/ads.txt` 가 **배포된 곳에서 기계가 읽을 수 있게** 나오나.
 *
 * 11-10: 코드로는 5/5 였는데 올려 놓고 보니 **307 로 /dot 으로 튕겼다** — 프록시가
 * 모르는 길을 전부 앱 첫 화면으로 보낸다. 사람에게는 친절이지만 **기계에게는 "파일 없음"** 이다.
 * 그 상태로 AdSense 승인을 기다렸으면 왜 안 되는지 영영 몰랐을 것이다.
 * 그래서 로컬 시험과 별개로 **배포된 주소를 두드리는 자**를 둔다.
 */
const 집 = process.argv[2] ?? "https://dot-web-production-7e03.up.railway.app";
const 결과: boolean[] = [];
const 재기 = (맞음: boolean, 말: string) => { 결과.push(맞음); console.log(`${맞음 ? "맞음" : "틀림"}  ${말}`); };

const r = await fetch(`${집}/ads.txt`, { redirect: "manual", cache: "no-store" as any });
재기(r.status !== 307 && r.status !== 308, `리다이렉트가 아니다 (${r.status}${r.headers.get("location") ? ` → ${r.headers.get("location")}` : ""})`);

const 번호있음 = r.status === 200;
if (번호있음) {
  const 글 = (await r.text()).trim();
  재기(/^google\.com, pub-\d{10,22}, DIRECT, f08c47fec0942fa0$/.test(글), `모양이 맞다 — ${글}`);
  재기((r.headers.get("content-type") ?? "").includes("text/plain"), `text/plain 으로 나온다 (${r.headers.get("content-type")})`);
} else {
  재기(r.status === 404, `아직 광고주 번호가 없다 → 404 (${r.status}). 번호를 넣으면 200 이 된다`);
}

const 틀린 = 결과.filter((x) => !x).length;
console.log(`\n${결과.length - 틀린}/${결과.length} 맞음`);
process.exit(틀린 ? 1 : 0);
