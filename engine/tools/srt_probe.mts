/** SRT 읽기·조립 시험(217회차). 모델 0. */
const { parseSrt, buildSrt } = await import("../../src/lib/skills/outsource/index");
const NL = String.fromCharCode(10);
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got).slice(0, 200)); };
const srt = ["1", "00:00:00,000 --> 00:00:03,200", "로키가 무엇인지 알려 드려요.", "", "2", "00:00:03,200 --> 00:00:08,000", "대화창에 말하면", "mp4·문서 파일로 나와요.", ""].join(NL);
const cues = parseSrt(srt);
check("큐 2개", cues.length === 2, cues);
check("두 줄짜리 본문을 한 줄로 합침", cues[1].text === "대화창에 말하면 mp4·문서 파일로 나와요.", cues[1]);
const out = buildSrt(cues, ["Here is what Rookery is.", "Say it in chat and get mp4 and document files."]);
const back = parseSrt(out);
check("다시 조립하면 큐 2개·시각 같음", back.length === 2 && back.every((c, i) => c.time === cues[i].time), back);
check("옮긴 글이 들어감", back[0].text === "Here is what Rookery is.");
check("CRLF 자막도 읽음", parseSrt(srt.split(NL).join(String.fromCharCode(13) + NL)).length === 2, parseSrt(srt.split(NL).join(String.fromCharCode(13) + NL)).length);
console.log(bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`); process.exit(bad ? 1 : 0);
