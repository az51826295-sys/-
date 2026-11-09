"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TarotSpread, type SpreadCard } from "../TarotSpread";

/**
 * 점집 화면 — 사람마다 한 줄. 뽑을 수 있으면 **덮인 카드 세 장**, 이미 봤으면 그때 읽은 것.
 *
 * 아직 말을 안 섞은 사람은 **잠긴 채로 보여 준다.** 숨기면 왜 없는지 모르고, 보여 주면
 * "말을 걸면 생긴다"가 한눈에 읽힌다(막다른 길은 안 남긴다 — 눌러도 방으로만 간다).
 */
type 사람 = {
  characterId: string; slug: string; name: string; 점수: number; 단계: number;
  뽑을수있나: boolean;
  지난것: { 단계: number; 카드: SpreadCard[]; 관계: string; 때: string }[];
  패: { 자리: string; 카드: string; 역방향: boolean }[] | null;
};

export default function TarotClient() {
  const [사람들, set사람들] = useState<사람[] | null>(null);
  const [뽑는중, set뽑는중] = useState<string | null>(null);
  const [알림, set알림] = useState<string | null>(null);

  async function 다시읽기() {
    try {
      const r = await fetch("/api/dot/tarot");
      const d = await r.json();
      set사람들(r.ok ? d.사람들 : []);
    } catch { set사람들([]); }
  }
  useEffect(() => { void 다시읽기(); }, []);

  async function 뽑기(c: 사람) {
    if (뽑는중) return;
    set뽑는중(c.characterId);
    set알림(null);
    try {
      const r = await fetch("/api/dot/tarot", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ characterId: c.characterId }),
      });
      const d = await r.json();
      if (!r.ok) { set알림(d.error ?? "지금은 카드가 안 열려요"); return; }
      await 다시읽기();
    } catch { set알림("지금은 카드가 안 열려요"); }
    finally { set뽑는중(null); }
  }

  return (
    <div className="tr-root">
      <style>{CSS}</style>
      <div className="tr-top">
        <Link href="/dot/me" className="tr-back">{"<"} 내 창</Link>
        <span className="tr-day">우리 사이 카드</span>
      </div>
      <p className="tr-lead">나눈 말에서 읽어요. <b>더 친해질 때마다</b> 한 판씩 와요.</p>

      {알림 && <p className="tr-warn">{알림}</p>}
      {!사람들 && <p className="tr-wait">카드를 세는 중…</p>}

      {사람들?.map((c) => (
        <section className="tr-one" key={c.characterId}>
          <div className="tr-head">
            <Link href={`/dot/${c.slug}`} className="tr-who">{c.name}</Link>
            <span className="tr-stage">{c.점수 > 0 ? `${c.단계}단계` : "아직 안 만남"}</span>
          </div>

          {c.점수 <= 0 ? (
            <p className="tr-none">말을 몇 마디 섞으면 카드가 생겨요.</p>
          ) : c.뽑을수있나 ? (
            <button type="button" className="tr-draw" disabled={뽑는중 === c.characterId} onClick={() => 뽑기(c)}>
              {뽑는중 === c.characterId ? "카드를 펼치는 중…" : `${c.단계}단계 카드 받기`}
            </button>
          ) : null}

          {c.지난것.map((g) => (
            <div className="tr-past" key={g.단계}>
              <div className="tr-past-head">{g.단계}단계에 받은 카드</div>
              <TarotSpread 카드들={g.카드} 관계={g.관계} />
            </div>
          ))}

          {!c.지난것.length && !c.뽑을수있나 && c.점수 > 0 && (
            <p className="tr-none">다음 단계가 되면 첫 카드가 와요.</p>
          )}
        </section>
      ))}
    </div>
  );
}

const CSS = `
.tr-root{min-height:100dvh;background:#fff;color:#1c1c1c;padding:14px 16px 60px;
  display:flex;flex-direction:column;align-items:center;gap:10px}
.tr-top{width:100%;max-width:420px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#8a8aa0}
.tr-back{color:inherit;text-decoration:none}
.tr-lead{width:100%;max-width:420px;margin:2px 0 8px;font-size:12px;color:#55556a;line-height:1.7}
.tr-lead b{color:#6b5bd2}
.tr-warn{width:100%;max-width:420px;margin:0;padding:8px;font-size:12px;color:#8a2a3a;background:#ffeef1;
  box-shadow:inset 0 0 0 2px #1c1c1c}
.tr-wait,.tr-none{font-size:12px;color:#8a8aa0;margin:4px 0}
.tr-one{width:100%;max-width:420px;padding:12px 0 16px;border-bottom:2px solid #eef1f5;
  display:flex;flex-direction:column;align-items:flex-start;gap:8px}
.tr-head{width:100%;display:flex;justify-content:space-between;align-items:baseline}
.tr-who{font-size:14px;color:#1c1c1c;text-decoration:none}
.tr-stage{font-size:11px;color:#8a8aa0}
.tr-draw{background:#1b1630;color:#ffd369;border:0;padding:10px 14px;font-family:inherit;font-size:13px;
  cursor:pointer;box-shadow:inset 0 0 0 2px #1c1c1c;filter:drop-shadow(2px 2px 0 rgba(28,28,28,.55))}
.tr-draw:active{transform:translate(2px,2px);filter:none}
.tr-draw:disabled{opacity:.6;cursor:default}
.tr-past{width:100%;margin-top:18px}
.tr-past-head{font-size:11px;color:#8a8aa0;margin-bottom:2px}
.tr-need{margin:40px 0 10px;font-size:13px;line-height:1.8;text-align:center;color:#55556a}
.tr-go{font-size:13px;color:#6b5bd2}
`;
