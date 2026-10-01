"use client";
/**
 * **현장 조사 화면** (228회차 10-01, 사장님 기획 1단계).
 *
 * 취조실에 들어가기 전에 **증거를 찾는 곳**이다. 10-01 까지는 증거 6개가 처음부터 다 있었다 —
 * 그러면 취조가 "다 들이대 보기" 가 되고, 플레이어가 **자기가 무엇을 모르는지**를 모른다.
 *
 * 화면이 아는 것은 **지점 이름과 잠겼는지**뿐이다. 무엇이 나오는지는 **누른 뒤에** 서버가 알려 준다.
 */
import { useState } from "react";
import css from "./취조실.module.css";

export type 장소 = { id: string; 이름: string; 설명: string };
export type 보일지점 = { id: string; 곳: string; 이름: string; 봤나: boolean; 잠김: boolean };
export type 현장상태 = { 본지점: string[]; 가진증거: string[] };
type 찾은증거 = { id: string; 이름: string; 설명: string };

export default function 현장({ 사건, 곳들, 첫지점, 첫상태, 들어가기 }: {
  사건: { 피해자: string; 발생시각: string; 장소: string };
  곳들: 장소[];
  첫지점: 보일지점[];
  첫상태: 현장상태;
  /** 조사를 마치고 취조실로 — 찾은 증거를 들고 간다. */
  들어가기: (상태: 현장상태, 찾은: 찾은증거[]) => void;
}) {
  const [상태, set상태] = useState<현장상태>(첫상태);
  const [지점들, set지점들] = useState<보일지점[]>(첫지점);
  const [찾은, set찾은] = useState<찾은증거[]>([]);
  const [기록, set기록] = useState<{ 이름: string; 글: string; 얻음: 찾은증거 | null }[]>([]);
  const [곳, set곳] = useState(곳들[0]?.id ?? "");
  const [기다림, set기다림] = useState(false);
  const [잘못, set잘못] = useState("");
  const [열림, set열림] = useState(false);

  async function 조사(지점id: string) {
    if (기다림) return;
    set기다림(true); set잘못("");
    try {
      const r = await fetch("/api/lie/scene", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ 지점: 지점id, 상태 }),
      });
      const j = await r.json();
      if (!r.ok) { set잘못(j.잘못 ?? "여기는 볼 수 없다"); set기다림(false); return; }
      set상태(j.상태); set지점들(j.지점들); set열림(j.들어갈수있나);
      if (j.얻은증거) set찾은((p) => (p.some((e) => e.id === j.얻은증거.id) ? p : [...p, j.얻은증거]));
      set기록((p) => [...p, { 이름: 지점들.find((x) => x.id === 지점id)?.이름 ?? "", 글: j.글, 얻음: j.얻은증거 }]);
    } catch { set잘못("서버에 못 닿았어요"); }
    set기다림(false);
  }

  return (
    <div className={css.방}>
      <div className={css.속}>
        <header className={css.머리}>
          <h1 className={css.제목}>거짓말의 온도</h1>
          <p className={css.사건줄}>{사건.피해자} · {사건.발생시각} · {사건.장소}</p>
        </header>

        <div className={css.사람들}>
          {곳들.map((c) => (
            <button key={c.id} onClick={() => set곳(c.id)} className={`${css.사람} ${곳 === c.id ? css.고름 : ""}`}>
              <span><b>{c.이름}</b></span>
            </button>
          ))}
        </div>

        <div className={css.판2}>
          <section>
            <div className={css.대화칸}>
              {기록.length === 0 && (
                <p className={css.안내}>
                  현장을 살핀다. <b>전부 무언가를 주지는 않는다.</b><br />
                  무엇을 본 뒤에야 열리는 곳도 있다.
                </p>
              )}
              {기록.map((l, i) => (
                <div key={i} className={css.줄}>
                  <div className={css.말풍선}>
                    <div className={css.누구}>{l.이름}</div>
                    {l.글}
                  </div>
                  {l.얻음 && <div className={css.깨짐}>✦ 증거를 얻었다 — {l.얻음.이름}</div>}
                </div>
              ))}
              {기다림 && <div className={css.안내}>…</div>}
            </div>
            {잘못 && <div className={css.잘못}>{잘못}</div>}

            <div className={css.입력줄}>
              <button className={css.보내기} disabled={!열림}
                onClick={() => 들어가기(상태, 찾은)}>
                {열림 ? "취조실로 들어간다 →" : `증거를 더 찾아야 한다 (${상태.가진증거.length}/3)`}
              </button>
            </div>
          </section>

          <aside>
            <div className={css.옆칸}>
              <h2 className={css.옆제목}>{곳들.find((c) => c.id === 곳)?.이름}</h2>
              <p className={css.옆설명}>{곳들.find((c) => c.id === 곳)?.설명}</p>
              {지점들.filter((p) => p.곳 === 곳).map((p) => (
                <button key={p.id} className={`${css.서류} ${p.봤나 ? css.썼음 : ""}`}
                  disabled={기다림} onClick={() => void 조사(p.id)}>
                  {p.잠김 ? "🔒 " : ""}{p.이름}
                  {p.봤나 && <span className={css.썼음표}> · 본 적 있음</span>}
                </button>
              ))}
            </div>

            <div className={css.옆칸}>
              <h2 className={css.옆제목}>손에 든 것</h2>
              <p className={css.옆설명}>{상태.가진증거.length}개</p>
              {찾은.length === 0 && <p className={css.옆설명}>아직 찾은 게 없다. 접수 때 받은 서류 하나뿐.</p>}
              {찾은.map((e) => (
                <div key={e.id} className={css.확인줄}>
                  <span className={css.확인표}>✔</span>
                  <span>{e.이름}<small>{e.설명}</small></span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
