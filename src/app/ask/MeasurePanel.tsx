"use client";

import { useState } from "react";
import { listIncoming, markSeen, readAsBase64, seenBefore, type 들어온것 } from "@/lib/hand/folder";

/**
 * **폴더에 떨군 것을 잰다** — 점 세 개 메뉴 안의 조각 (10-26).
 *
 * 사장님: "그 사람이 쓰던 AI 도 붙을 수 있었으면 좋겠어."
 * MCP 를 말하는 도구만 붙는 게 아니다. 웹에서만 되는 그림 AI 도, 블렌더도, 손으로 그린 것도
 * **파일로는 나온다.** 그래서 폴더가 가장 넓은 콘센트다 — 무엇으로 만들었든 같은 자로 잰다.
 */

type 결과 = { path: string; 말: string; 맞음: boolean | null; 잰값?: Record<string, unknown> };

export default function MeasurePanel() {
  const [목록, 목록설정] = useState<들어온것[] | null>(null);
  const [재는중, 재는중설정] = useState(false);
  const [결과들, 결과들설정] = useState<결과[]>([]);

  async function 훑기() {
    const all = await listIncoming();
    /* 이미 재 본 것은 빼고 보여 준다 — 폴더에 쌓인 걸 매번 다시 재면 아무도 안 쓴다 */
    목록설정(all.filter((x) => !seenBefore(x)).slice(0, 20));
    결과들설정([]);
  }

  async function 재기(it: 들어온것) {
    재는중설정(true);
    try {
      const f = await readAsBase64(it.path);
      if (!f) { 결과들설정((p) => [...p, { path: it.path, 말: "못 읽었어요", 맞음: null }]); return; }
      const 메시 = /\.(glb|gltf)$/i.test(it.path);
      const r = await fetch("/api/ask/measure", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(메시 ? { kind: "mesh", glbBase64: f.base64 } : { kind: "character", images: [f.base64] }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean; error?: string;
        verdict?: { verdict?: string; fail?: string[]; undefined?: string[]; rules?: { id: string; verdict: string; why: string }[] };
      };
      if (!r.ok || !j.ok) {
        /* 못 닿은 것을 "어긋남" 으로 적지 않는다 — 멀쩡한 자산을 고치러 들어가게 된다 */
        결과들설정((p) => [...p, { path: it.path, 말: j.error ?? "못 쟀어요", 맞음: null }]);
        return;
      }
      const v = j.verdict ?? {};
      const 판 = v.verdict ?? "UNDEFINED";
      const 까닭 = [...(v.fail ?? []), ...(v.undefined ?? []), ...(v.rules ?? []).filter((x) => x.verdict === "FAIL").map((x) => `${x.id}: ${x.why}`)];
      결과들설정((p) => [...p, {
        path: it.path,
        맞음: 판 === "PASS" ? true : 판 === "FAIL" ? false : null,
        말: 판 === "PASS" ? "기준에 맞아요" : 판 === "FAIL" ? (까닭[0] ?? "어긋나요") : (까닭[0] ?? "못 쟀어요"),
      }]);
      markSeen(it);
      목록설정((p) => (p ?? []).filter((x) => x.path !== it.path));
    } catch (e) {
      결과들설정((p) => [...p, { path: it.path, 말: "못 쟀어요: " + (e instanceof Error ? e.message : String(e)).slice(0, 50), 맞음: null }]);
    } finally { 재는중설정(false); }
  }

  const 줄 = "w-full px-3 py-2 text-left text-sm hover:bg-[var(--rk-100)]";
  const 밑말 = "block text-[11px] text-[var(--rk-400)]";

  return (
    <>
      <button type="button" className={줄} onClick={() => void 훑기()}>
        폴더에서 새로 온 것 재기
        <span className={밑말}>
          어떤 AI로 만들었든 폴더에 넣으면 같은 기준으로 재요 · 그림과 .glb
        </span>
      </button>

      {목록 !== null && 목록.length === 0 && (
        <div className="px-3 pb-2 text-[11px] text-[var(--rk-400)]">새로 들어온 게 없어요</div>
      )}

      {목록?.map((it) => (
        <button key={it.path} type="button" disabled={재는중}
          className={줄 + " disabled:opacity-50"} onClick={() => void 재기(it)}>
          <span className="font-mono text-[11px]">{it.path}</span>
          <span className={밑말}>{재는중 ? "재는 중…" : "눌러서 재기"}</span>
        </button>
      ))}

      {결과들.map((r, i) => (
        <div key={r.path + i} className="px-3 py-2 text-[11px]">
          {/* 맞음(·) · 어긋남(≠) · 못 잼(–) — 딱지 대신 사실. 규격은 계약이라 어긋남은 취향이 아니다. */}
          <span className="font-mono">{r.맞음 === true ? "·" : r.맞음 === false ? "≠" : "–"}</span>{" "}
          <span className="font-mono">{r.path}</span>
          <span className="block text-[var(--rk-400)]">{r.말}</span>
        </div>
      ))}
    </>
  );
}
