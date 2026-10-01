"use client";
/**
 * **취조실 화면** (228회차 10-01, 사장님 "퀄리티 높여").
 *
 * 첫 판은 네모만 늘어놓았다. 게임 이름이 *거짓말의 **온도*** 인데 온도가 구석에 작은 막대로 있었다.
 * **이름이 가리키는 것이 화면의 가운데여야 한다.** 그래서:
 *
 *  · **온도계를 세로로 크게** — 유리관이 차오르고 색이 파랑→노랑→주황→빨강으로 간다.
 *  · **얼굴을 보여 준다** — 압박이 오르면 얼굴이 점점 붉고 거칠어진다.
 *  · **화면 가장자리가 붉어진다** — 숫자를 안 봐도 분위기로 안다.
 *  · **답이 한 글자씩 찍힌다** — 압박이 높을수록 느리게. 취조실에서 사람은 술술 말하지 않는다.
 *
 * 숫자는 여전히 **안 보여 준다.** 보이면 숫자를 보고 게임하게 된다.
 * 상태는 이 화면이 들고 있다가 서버에 그대로 보낸다(v0 — DB 없이 바로 해 볼 수 있게).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import css from "./취조실.module.css";

type 수치 = { 압박: number; 당황: number; 분노: number; 경계: number };
type 상태 = { 수치: 수치; 깨진약점: string[]; 내민증거: string[]; 턴: number; 최근질문: string[]; 무너짐: boolean; 얻은증언?: string[] };
type 줄 = { 누구: "형사" | "용의자"; 말: string; 태도?: string; 까닭?: string[]; 깨짐?: string[]; 헛다리?: string[]; 무너짐?: boolean };
type 용의자 = { id: string; 이름: string; 관계: string; 겉모습: string; 얼굴: string };
type 증거 = { id: string; 이름: string; 설명: string };
type 확인 = { id: string; 주장: string; 물을사람: string; 얻는증거id: string };
type 지목답 = { 판정: "맞음" | "모자람" | "틀림"; 제목: string; 말: string; 모자란증거: string[] };

const 처음상태 = (): 상태 => ({ 수치: { 압박: 10, 당황: 0, 분노: 0, 경계: 15 }, 깨진약점: [], 내민증거: [], 턴: 0, 최근질문: [], 무너짐: false, 얻은증언: [] });

const 압박말 = (n: number) => (n >= 80 ? "몰렸다" : n >= 50 ? "불편하다" : n >= 25 ? "조금 긴장" : "침착하다");
const 분노말 = (n: number) => (n >= 70 ? "입을 닫았다" : n >= 40 ? "기분이 상했다" : "괜찮다");
const 경계말 = (n: number) => (n >= 60 ? "말을 고른다" : n <= 20 ? "풀렸다" : "보통");
const 당황말 = (n: number) => (n >= 50 ? "말문이 막혔다" : n >= 25 ? "흔들린다" : "—");

/** 수은 색 — 차가운 파랑에서 뜨거운 빨강으로. 이것이 "거짓말의 온도" 다. */
function 수은색(n: number): string {
  if (n >= 80) return "linear-gradient(180deg,#ff6b5e,#d8372c)";
  if (n >= 50) return "linear-gradient(180deg,#f0a857,#e07b32)";
  if (n >= 25) return "linear-gradient(180deg,#e8c45a,#c9992f)";
  return "linear-gradient(180deg,#5fa8e0,#3d79b5)";
}

/** 한 글자씩 찍는다. 압박이 높을수록 느리다 — 말이 막히는 느낌. */
function 찍히는말({ 글, 압박 }: { 글: string; 압박: number }) {
  const [보임, set보임] = useState("");
  useEffect(() => {
    set보임("");
    let i = 0;
    const 간격 = 압박 >= 80 ? 42 : 압박 >= 50 ? 30 : 20;
    const t = setInterval(() => {
      i += 1;
      set보임(글.slice(0, i));
      if (i >= 글.length) clearInterval(t);
    }, 간격);
    return () => clearInterval(t);
  }, [글, 압박]);
  return <>{보임}</>;
}

export default function 취조실({ 사건, 용의자들, 증거들, 확인할것 }: {
  사건: { 제목: string; 피해자: string; 발생시각: string; 장소: string };
  용의자들: 용의자[]; 증거들: 증거[]; 확인할것: 확인[];
}) {
  const [누구, set누구] = useState(용의자들[0]?.id ?? "A");
  const [방, set방] = useState<Record<string, { 상태: 상태; 줄들: 줄[] }>>(() =>
    Object.fromEntries(용의자들.map((s) => [s.id, { 상태: 처음상태(), 줄들: [] }])));
  const [말, set말] = useState("");
  const [고른증거, set고른증거] = useState<string[]>([]);
  const [기다림, set기다림] = useState(false);
  /** 취조로 얻어 낸 증언. **사건 전체로 들고 다닌다** — 윤미래에게 들은 말을 한선호에게 가져간다. */
  const [증언들, set증언들] = useState<증거[]>([]);
  const [지목중, set지목중] = useState(false);
  const [지목답, set지목답] = useState<지목답 | null>(null);
  const [잘못, set잘못] = useState("");
  const 끝 = useRef<HTMLDivElement>(null);
  const 이방 = 방[누구] ?? { 상태: 처음상태(), 줄들: [] };
  const 지금 = 용의자들.find((s) => s.id === 누구)!;
  const 수치 = 이방.상태.수치;

  useEffect(() => { 끝.current?.scrollIntoView({ behavior: "smooth" }); }, [이방.줄들.length, 기다림]);

  const 보내기 = useCallback(async () => {
    const 글 = 말.trim();
    if ((!글 && !고른증거.length) || 기다림) return;
    // 고른 증거는 말 뒤에 이름으로 붙는다 — **고르기와 글쓰기가 같은 길로 간다.**
    // **증언도 증거다.** 여기서 `증거들` 만 보다가, 취조로 얻은 증언을 골라도 말에 안 붙었다 —
    // 화면에는 "내밀 증거: 윤미래의 진술" 이라고 떠 있는데 보낸 말에는 없었다(10-01 화면에서 잡음).
    const 증거말 = 고른증거.map((id) => [...증거들, ...증언들].find((e) => e.id === id)?.이름).filter(Boolean).join(", ");
    const 보낼말 = [글, 증거말 ? `[${증거말}을(를) 내민다]` : ""].filter(Boolean).join(" ");
    set말(""); set고른증거([]); set잘못(""); set기다림(true);
    const 앞 = 방[누구];
    set방((p) => ({ ...p, [누구]: { ...앞, 줄들: [...앞.줄들, { 누구: "형사", 말: 보낼말 }] } }));
    try {
      const r = await fetch("/api/lie/turn", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ 용의자: 누구, 말: 보낼말, 상태: 앞.상태, 기록: 앞.줄들.map((l) => ({ 누구: l.누구, 말: l.말 })) }),
      });
      const j = await r.json();
      if (!r.ok) { set잘못(j.잘못 ?? "안 됐어요"); set기다림(false); return; }
      if (j.얻은증언) set증언들((p) => (p.some((e) => e.id === j.얻은증언.id) ? p : [...p, j.얻은증언]));
      set방((p) => {
        const 새증언 = j.상태.얻은증언 ?? [];
        const 다음: typeof p = { ...p };
        // **얻은 증언은 방마다 공유한다.** 윤미래에게 들은 말을 한선호 방으로 들고 가야 들이댈 수 있다.
        for (const id of Object.keys(다음)) 다음[id] = { ...다음[id], 상태: { ...다음[id].상태, 얻은증언: 새증언 } };
        다음[누구] = {
          상태: j.상태,
          줄들: [...p[누구].줄들, { 누구: "용의자", 말: j.말, 태도: j.태도, 까닭: j.까닭, 깨짐: j.깨짐, 헛다리: j.헛다리, 무너짐: j.방금무너짐 }],
        };
        return 다음;
      });
    } catch { set잘못("서버에 못 닿았어요"); }
    set기다림(false);
  }, [말, 고른증거, 기다림, 방, 누구, 증거들, 증언들]);

  const 손에든증거 = [...증거들, ...증언들];

  async function 지목(고른사람: string) {
    set지목중(true);
    try {
      const r = await fetch("/api/lie/verdict", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ 고른사람, 가진증거: Object.values(방).flatMap((b) => b.상태.내민증거) }),
      });
      set지목답(await r.json());
    } catch { set잘못("서버에 못 닿았어요"); }
    set지목중(false);
  }

  const 마지막까닭 = [...이방.줄들].reverse().find((l) => l.까닭?.length)?.까닭 ?? [];

  return (
    <div className={css.방}>
      {/* 압박이 높을수록 가장자리가 붉어진다 */}
      <div className={css.비네트} style={{ opacity: Math.max(0, (수치.압박 - 35) / 100) }} />

      {지목답 && (
        <div className={css.결과덮개} onClick={() => (지목답.판정 === "모자람" ? set지목답(null) : undefined)}>
          <div className={`${css.결과칸} ${지목답.판정 === "맞음" ? css.맞음 : 지목답.판정 === "틀림" ? css.틀림 : css.모자람}`}>
            <h2 className={css.결과제목}>{지목답.제목}</h2>
            <p className={css.결과말}>{지목답.말}</p>
            {지목답.판정 === "모자람" && <button className={css.보내기} onClick={() => set지목답(null)}>다시 취조실로</button>}
          </div>
        </div>
      )}

      <div className={css.속}>
        <header className={css.머리}>
          <h1 className={css.제목}>거짓말의 온도</h1>
          <p className={css.사건줄}>{사건.피해자} · {사건.발생시각} · {사건.장소}</p>
        </header>

        <div className={css.사람들}>
          {용의자들.map((s) => (
            <button key={s.id} onClick={() => set누구(s.id)} className={`${css.사람} ${누구 === s.id ? css.고름 : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.얼굴} alt="" />
              <span><b>{s.이름}</b><span>{s.관계}</span></span>
              {방[s.id]?.상태.무너짐 ? <span className={css.깨진표}>●</span> : null}
            </button>
          ))}
        </div>

        <div className={css.판}>
          {/* ── 왼쪽: 얼굴 + 온도계 ── */}
          <aside className={css.얼굴칸}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={css.얼굴} src={지금.얼굴} alt={지금.이름}
              style={{
                // 몰릴수록 얼굴이 붉고 거칠어진다
                filter: `saturate(${1 + 수치.압박 / 160}) contrast(${1 + 수치.압박 / 300}) brightness(${1 - 수치.압박 / 700}) sepia(${수치.압박 / 420})`,
              }} />
            <div className={css.얼굴글}>
              <p className={css.얼굴이름}>{지금.이름}</p>
              <p className={css.얼굴관계}>{지금.관계}</p>
              <p className={css.겉모습}>{지금.겉모습}</p>
            </div>

            <div className={css.온도칸}>
              <div className={css.온도머리}>
                <span className={css.온도이름}>압박</span>
                <span className={css.온도말}>{압박말(수치.압박)}</span>
              </div>
              <div className={css.온도계}>
                <div className={css.유리관}>
                  {[25, 50, 80].map((t) => <div key={t} className={css.눈금} style={{ bottom: `${t}%` }} />)}
                  <div className={css.수은} style={{ height: `${수치.압박}%`, background: 수은색(수치.압박) }} />
                </div>
                <div className={css.작은것들}>
                  {([
                    ["당황", 수치.당황, "#e8b14a", 당황말(수치.당황)],
                    ["분노", 수치.분노, "#b068d8", 분노말(수치.분노)],
                    ["경계", 수치.경계, "#4a9bd8", 경계말(수치.경계)],
                  ] as const).map(([이름, 값, 색, 풀이]) => (
                    <div key={이름} className={css.작은줄}>
                      <div className={css.작은머리}><span>{이름}</span><span>{풀이}</span></div>
                      <div className={css.작은관}><div className={css.작은막대} style={{ width: `${값}%`, background: 색 }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* ── 가운데: 대화 ── */}
          <section>
            <div className={css.대화칸}>
              {이방.줄들.length === 0 && (
                <p className={css.안내}>
                  먼저 가볍게 말을 걸어 보세요.<br />
                  다짜고짜 몰아붙이면 <b>경계</b>가 올라 증거가 덜 먹힙니다.
                </p>
              )}
              {이방.줄들.map((l, i) => {
                const 마지막인가 = i === 이방.줄들.length - 1;
                return (
                  <div key={i} className={`${css.줄} ${l.누구 === "형사" ? css.형사줄 : css.용의자줄}`}>
                    <div className={css.말풍선}>
                      <div className={css.누구}>{l.누구 === "형사" ? "나" : 지금.이름}</div>
                      {l.누구 === "용의자" && 마지막인가
                        ? <찍히는말 글={l.말} 압박={수치.압박} />
                        : l.말}
                      {l.태도 ? <div className={css.태도}>{l.태도}</div> : null}
                    </div>
                    {l.깨짐?.length ? <div className={css.깨짐}>✦ 진술이 깨졌다 — {l.깨짐.join(" / ")}</div> : null}
                    {l.헛다리?.length ? <div className={css.헛다리}>· 이 증거는 이 사람과 상관없다. 경계만 올랐다.</div> : null}
                    {l.무너짐 ? <div className={css.무너짐}>▲ 무너졌다</div> : null}
                  </div>
                );
              })}
              {기다림 && <div className={css.안내}>…</div>}
              <div ref={끝} />
            </div>

            {고른증거.length > 0 && (
              <div className={css.고른증거줄}>
                내밀 증거: {고른증거.map((id) => 손에든증거.find((e) => e.id === id)?.이름).join(", ")}
                <button className={css.치우기} onClick={() => set고른증거([])}>치우기</button>
              </div>
            )}
            {잘못 && <div className={css.잘못}>{잘못}</div>}

            <div className={css.입력줄}>
              <input className={css.입력} value={말} onChange={(e) => set말(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void 보내기(); }}
                placeholder={`${지금.이름}에게 묻는다…`} />
              <button className={css.보내기} onClick={() => void 보내기()} disabled={기다림}>
                {기다림 ? "…" : "묻기"}
              </button>
            </div>
          </section>

          {/* ── 오른쪽: 증거 + 까닭 ── */}
          <aside>
            <div className={css.옆칸}>
              <h2 className={css.옆제목}>증거</h2>
              <p className={css.옆설명}>눌러서 고른 뒤 함께 묻는다.</p>
              {손에든증거.map((e) => {
                const 고름 = 고른증거.includes(e.id);
                const 썼음 = 이방.상태.내민증거.includes(e.id);
                return (
                  <button key={e.id}
                    className={`${css.서류} ${고름 ? css.고름 : ""} ${썼음 && !고름 ? css.썼음 : ""}`}
                    onClick={() => set고른증거((p) => (p.includes(e.id) ? p.filter((x) => x !== e.id) : [...p, e.id]))}>
                    {e.이름}{썼음 && <span className={css.썼음표}> · 내민 적 있음</span>}
                    <small>{e.설명}</small>
                  </button>
                );
              })}
            </div>

            {/**
              * **확인할 것** — 용의자가 한 주장 중 다른 사람에게 물어야 하는 것.
              * 답은 안 알려 준다. **누구에게 물어야 하는지**까지만 — 묻는 것은 플레이어 몫이다.
              */}
            <div className={css.옆칸}>
              <h2 className={css.옆제목}>확인할 것</h2>
              <p className={css.옆설명}>다른 사람에게 물어서 증언을 얻는다.</p>
              {확인할것.map((x) => {
                const 얻었나 = 증언들.some((e) => e.id === x.얻는증거id);
                return (
                  <div key={x.id} className={`${css.확인줄} ${얻었나 ? css.확인됨 : ""}`}>
                    <span className={css.확인표}>{얻었나 ? "✔" : "○"}</span>
                    <span>
                      {x.주장}
                      <small>→ {x.물을사람} 에게 물어볼 것</small>
                    </span>
                  </div>
                );
              })}
            </div>

            {/** **최종 지목** — 끝맺음. 찍기를 막으려고 증거를 갖췄는지도 함께 본다. */}
            <div className={css.옆칸}>
              <h2 className={css.옆제목}>지목</h2>
              <p className={css.옆설명}>범인을 댄다. 되돌릴 수 없다.</p>
              {용의자들.map((s2) => (
                <button key={s2.id} className={css.지목단추} disabled={지목중 || !!지목답}
                  onClick={() => void 지목(s2.id)}>
                  {s2.이름} 를 지목한다
                </button>
              ))}
            </div>

            {마지막까닭.length > 0 && (
              <div className={css.옆칸}>
                <h2 className={css.옆제목}>방금 무슨 일이 있었나</h2>
                {마지막까닭.map((c, i) => <div key={i} className={css.까닭줄}>· {c.replace(/\*\*/g, "")}</div>)}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
