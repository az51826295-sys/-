"use client";
/**
 * **취조실 화면** (228회차 10-01).
 *
 * 상태는 이 화면이 들고 있다가 서버에 그대로 보낸다(v0 — DB 없이 바로 해 볼 수 있게).
 * 숫자는 **안 보여 준다.** 막대 길이와 한 줄 말로만 — 숫자가 보이면 숫자를 보고 게임하게 된다.
 */
import { useEffect, useRef, useState } from "react";

type 상태 = {
  수치: { 압박: number; 당황: number; 분노: number; 경계: number };
  깨진약점: string[]; 내민증거: string[]; 턴: number; 최근질문: string[]; 무너짐: boolean;
};
type 줄 = { 누구: "형사" | "용의자"; 말: string; 태도?: string; 까닭?: string[]; 깨짐?: string[]; 헛다리?: string[]; 무너짐?: boolean };
type 용의자 = { id: string; 이름: string; 관계: string; 겉모습: string };
type 증거 = { id: string; 이름: string; 설명: string };

const 처음상태 = (): 상태 => ({ 수치: { 압박: 10, 당황: 0, 분노: 0, 경계: 15 }, 깨진약점: [], 내민증거: [], 턴: 0, 최근질문: [], 무너짐: false });

/** 숫자 대신 **막대와 말**. 압박만 빨강이고 나머지는 차분한 색이다 — 눈이 압박으로 먼저 간다. */
function 온도({ 이름, 값, 색, 풀이 }: { 이름: string; 값: number; 색: string; 풀이: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9fb0c4", marginBottom: 4 }}>
        <span>{이름}</span><span style={{ color: "#7c8ea4" }}>{풀이}</span>
      </div>
      <div style={{ height: 8, background: "#1b2636", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${값}%`, height: "100%", background: 색, transition: "width .5s" }} />
      </div>
    </div>
  );
}
const 압박말 = (n: number) => (n >= 80 ? "몰렸다" : n >= 50 ? "불편하다" : n >= 25 ? "조금 긴장" : "침착하다");
const 분노말 = (n: number) => (n >= 70 ? "입을 닫았다" : n >= 40 ? "기분이 상했다" : "괜찮다");
const 경계말 = (n: number) => (n >= 60 ? "말을 고른다" : n <= 20 ? "풀렸다" : "보통");
const 당황말 = (n: number) => (n >= 50 ? "말문이 막혔다" : n >= 25 ? "흔들린다" : "—");

export default function 취조실({ 사건, 용의자들, 증거들 }: {
  사건: { 제목: string; 피해자: string; 발생시각: string; 장소: string };
  용의자들: 용의자[]; 증거들: 증거[];
}) {
  const [누구, set누구] = useState(용의자들[0]?.id ?? "A");
  const [방, set방] = useState<Record<string, { 상태: 상태; 줄들: 줄[] }>>(() =>
    Object.fromEntries(용의자들.map((s) => [s.id, { 상태: 처음상태(), 줄들: [] }])));
  const [말, set말] = useState("");
  const [고른증거, set고른증거] = useState<string[]>([]);
  const [기다림, set기다림] = useState(false);
  const [잘못, set잘못] = useState("");
  const 끝 = useRef<HTMLDivElement>(null);
  const 이방 = 방[누구] ?? { 상태: 처음상태(), 줄들: [] };
  const 지금용의자 = 용의자들.find((s) => s.id === 누구)!;

  useEffect(() => { 끝.current?.scrollIntoView({ behavior: "smooth" }); }, [이방.줄들.length, 기다림]);

  async function 보내기() {
    const 글 = 말.trim();
    if ((!글 && !고른증거.length) || 기다림) return;
    // **고른 증거는 말 뒤에 이름으로 붙인다.** 서버는 낱말로 증거를 알아보니, 고르기와 글쓰기가 같은 길로 간다.
    const 증거말 = 고른증거.map((id) => 증거들.find((e) => e.id === id)?.이름).filter(Boolean).join(", ");
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
      set방((p) => ({
        ...p,
        [누구]: {
          상태: j.상태,
          줄들: [...p[누구].줄들, { 누구: "용의자", 말: j.말, 태도: j.태도, 까닭: j.까닭, 깨짐: j.깨짐, 헛다리: j.헛다리, 무너짐: j.방금무너짐 }],
        },
      }));
    } catch { set잘못("서버에 못 닿았어요"); }
    set기다림(false);
  }

  const 수치 = 이방.상태.수치;
  // 좁은 화면(폰)에서는 한 줄로 떨어뜨린다. 가로 300px 칸을 그대로 두면 증거가 짓눌려 못 읽는다.
  const [좁은가, set좁은가] = useState(false);
  useEffect(() => {
    const 재기 = () => set좁은가(window.innerWidth < 880);
    재기(); window.addEventListener("resize", 재기);
    return () => window.removeEventListener("resize", 재기);
  }, []);
  return (
    <div style={{ minHeight: "100vh", background: "#0d1420", color: "#e8eef6", fontFamily: "'Pretendard','Malgun Gothic',sans-serif" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 16px 40px" }}>
        <header style={{ borderBottom: "1px solid #223047", paddingBottom: 14, marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 24, letterSpacing: -0.4 }}>거짓말의 온도</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#8ea2b8" }}>
            {사건.피해자} · {사건.발생시각} · {사건.장소}
          </p>
        </header>

        {/* 용의자 고르기 — 방마다 대화와 온도가 따로 간다 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {용의자들.map((s) => {
            const 깨짐 = 방[s.id]?.상태.무너짐;
            return (
              <button key={s.id} onClick={() => set누구(s.id)} style={{
                padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontSize: 14,
                border: `1px solid ${누구 === s.id ? "#4a86c8" : "#26354a"}`,
                background: 누구 === s.id ? "#17283f" : "#121c2b",
                color: 누구 === s.id ? "#dbe9fa" : "#9fb0c4",
              }}>
                {s.이름} <span style={{ fontSize: 12, color: "#7c8ea4" }}>{s.관계}</span>
                {깨짐 ? <span style={{ marginLeft: 6, color: "#ffb86b" }}>●</span> : null}
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: 좁은가 ? "minmax(0,1fr)" : "minmax(0,1fr) 300px", gap: 16, alignItems: "start" }}>
          {/* ── 왼쪽: 대화 ── */}
          <section>
            <div style={{ background: "#111c2a", border: "1px solid #223047", borderRadius: 14, padding: 14, minHeight: 420, maxHeight: "56vh", overflowY: "auto" }}>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: "#7c8ea4", lineHeight: 1.6 }}>
                {지금용의자.겉모습}
              </p>
              {이방.줄들.length === 0 && (
                <p style={{ color: "#6f8299", fontSize: 13, margin: "0 0 10px" }}>
                  먼저 가볍게 말을 걸어 보세요. 다짜고짜 몰아붙이면 경계가 올라 증거가 덜 먹힙니다.
                </p>
              )}
              {이방.줄들.map((l, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{
                    display: "inline-block", maxWidth: "88%", padding: "10px 13px", borderRadius: 12, fontSize: 14, lineHeight: 1.6,
                    background: l.누구 === "형사" ? "#1d3550" : "#19202c",
                    border: `1px solid ${l.누구 === "형사" ? "#2d4e73" : "#27313f"}`,
                    marginLeft: l.누구 === "형사" ? "auto" : 0,
                  }}>
                    <div style={{ fontSize: 11, color: "#7c8ea4", marginBottom: 4 }}>{l.누구 === "형사" ? "나" : 지금용의자.이름}</div>
                    {l.말}
                    {l.태도 ? <div style={{ fontSize: 12, color: "#8aa0b8", marginTop: 6, fontStyle: "italic" }}>{l.태도}</div> : null}
                  </div>
                  {l.깨짐?.length ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#ffb86b" }}>✦ 진술이 깨졌다 — {l.깨짐.join(" / ")}</div>
                  ) : null}
                  {l.헛다리?.length ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#6f8299" }}>· 이 증거는 이 사람과 상관없다. 경계만 올랐다.</div>
                  ) : null}
                  {l.무너짐 ? (
                    <div style={{ marginTop: 6, fontSize: 13, color: "#ff8e8e", fontWeight: 700 }}>▲ 무너졌다</div>
                  ) : null}
                </div>
              ))}
              {기다림 && <div style={{ color: "#7c8ea4", fontSize: 13 }}>…</div>}
              <div ref={끝} />
            </div>

            {/* 고른 증거 */}
            {고른증거.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 13, color: "#ffd9a0" }}>
                내밀 증거: {고른증거.map((id) => 증거들.find((e) => e.id === id)?.이름).join(", ")}
                <button onClick={() => set고른증거([])} style={{ marginLeft: 8, background: "none", border: "none", color: "#7c8ea4", cursor: "pointer" }}>치우기</button>
              </div>
            )}
            {잘못 && <div style={{ marginTop: 10, color: "#ff8e8e", fontSize: 13 }}>{잘못}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                value={말} onChange={(e) => set말(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void 보내기(); }}
                placeholder={`${지금용의자.이름}에게 묻는다…`}
                style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: "1px solid #26354a", background: "#0f1826", color: "#e8eef6", fontSize: 15 }}
              />
              <button onClick={() => void 보내기()} disabled={기다림}
                style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: 기다림 ? "#2a3a4d" : "#3d7ebf", color: "#fff", fontSize: 15, cursor: 기다림 ? "default" : "pointer" }}>
                {기다림 ? "…" : "묻기"}
              </button>
            </div>
          </section>

          {/* ── 오른쪽: 온도 + 증거 ── */}
          <aside>
            <div style={{ background: "#111c2a", border: "1px solid #223047", borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 14, color: "#cfe0f2" }}>온도</h2>
              <온도 이름="압박" 값={수치.압박} 색="#e4584f" 풀이={압박말(수치.압박)} />
              <온도 이름="당황" 값={수치.당황} 색="#e8b14a" 풀이={당황말(수치.당황)} />
              <온도 이름="분노" 값={수치.분노} 색="#b068d8" 풀이={분노말(수치.분노)} />
              <온도 이름="경계" 값={수치.경계} 색="#4a9bd8" 풀이={경계말(수치.경계)} />
              {이방.상태.무너짐 && <p style={{ margin: "10px 0 0", fontSize: 13, color: "#ff8e8e" }}>무너졌다. 지금 묻는 말에 답한다.</p>}
            </div>

            <div style={{ background: "#111c2a", border: "1px solid #223047", borderRadius: 14, padding: 14 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 14, color: "#cfe0f2" }}>증거</h2>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#7c8ea4" }}>눌러서 고른 뒤 함께 묻는다.</p>
              {증거들.map((e) => {
                const 고름 = 고른증거.includes(e.id);
                const 썼음 = 이방.상태.내민증거.includes(e.id);
                return (
                  <button key={e.id}
                    onClick={() => set고른증거((p) => (p.includes(e.id) ? p.filter((x) => x !== e.id) : [...p, e.id]))}
                    style={{
                      display: "block", width: "100%", textAlign: "left", marginBottom: 8, padding: "9px 11px", borderRadius: 9, cursor: "pointer",
                      border: `1px solid ${고름 ? "#c8923d" : "#26354a"}`, background: 고름 ? "#2a2113" : "#0f1826",
                      color: 썼음 && !고름 ? "#6f8299" : "#dbe6f2", fontSize: 13, lineHeight: 1.5,
                    }}>
                    {e.이름}{썼음 && <span style={{ fontSize: 11, color: "#6f8299" }}> · 내민 적 있음</span>}
                    <div style={{ fontSize: 11, color: "#7c8ea4", marginTop: 3 }}>{e.설명}</div>
                  </button>
                );
              })}
            </div>

            {/* 왜 움직였나 — 마지막 턴의 까닭 */}
            {(() => {
              const 마지막 = [...이방.줄들].reverse().find((l) => l.까닭?.length);
              if (!마지막?.까닭?.length) return null;
              return (
                <div style={{ background: "#0f1826", border: "1px solid #223047", borderRadius: 14, padding: 12, marginTop: 14 }}>
                  <h2 style={{ margin: "0 0 8px", fontSize: 13, color: "#9fb0c4" }}>방금 무슨 일이 있었나</h2>
                  {마지막.까닭.map((c, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#8ea2b8", marginBottom: 4, lineHeight: 1.5 }}>· {c.replace(/\*\*/g, "")}</div>
                  ))}
                </div>
              );
            })()}
          </aside>
        </div>
      </div>
    </div>
  );
}
