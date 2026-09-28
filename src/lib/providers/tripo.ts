/**
 * **Tripo 3D — 두 번째 3D 손** (226회차 2026-09-28).
 *
 * 사장님 09-28: *"전문기능을 더 잘하는 것도 합치면 안돼?"*
 *
 * 그날 분석(영상 5편, 읽은 출처 5개)이 숫자를 줬다: **Tripo 로우폴리 8~15초** ·
 * Rodin 37초 · Meshy 1분 44초 · Hunyuan 2분 10초. 그래서 붙일 값이 있는 것은 Tripo 다 —
 * Rodin 은 API 가 **월 $120** 이라 사장님 한 달 예산($21)의 여섯 배다(그래서 안 붙인다).
 *
 * 값: 100크레딧 = $1. 텍스처 포함 한 판 **70크레딧 = $0.35**, 텍스처 없이 56크레딧 = $0.28.
 * 새 계정에 **무료 300크레딧(2주)** — 나란히 재는 판 넷쯤은 돈 없이 돌릴 수 있다.
 *
 * **키가 없으면 조용히 없는 셈 친다**(`null`). 붙이는 쪽에서 "Tripo 는 아직 없다" 로 읽는다 —
 * 던지면 3D 업무 전체가 죽는다.
 *
 * **아직 고르는 규칙은 없다.** 언제 Meshy 대신 이것을 쓸지는 **나란히 재 본 뒤에** 정한다.
 * 도구를 늘리는 것보다 고르는 눈이 어렵다 — 09-28 에 엮기(두 모델)는 값만 21% 더 들었다
 * ([[ensemble-buys-a-signal-not-a-score]]).
 */
export type TripoResult = {
  taskId: string;
  glbUrl: string | null;
  thumbnailUrl: string | null;
  /** 이 판에 든 크레딧. 100크레딧 = $1. */
  consumedCredits: number;
  model: string;
  /** 만드는 데 걸린 시간(ms). Meshy 와 나란히 재는 자가 이것을 쓴다. */
  ms: number;
};

export type TripoOptions = {
  /** 로우폴리로 뽑을까. 09-28 분석: Tripo 의 강점이 여기(8~15초)라고 영상들이 말했다. */
  lowPoly?: boolean;
  /** 텍스처를 입힐까. 없으면 56크레딧, 있으면 70크레딧. */
  texture?: boolean;
  /** 몇 초까지 기다릴까. */
  timeoutMs?: number;
};

const BASE = "https://api.tripo3d.ai/v2/openapi";

/** 키가 없으면 null. 부르는 쪽이 "이 손은 아직 없다" 로 읽는다. */
export function tripoKey(): string | null {
  return process.env.TRIPO_API_KEY?.trim() || null;
}

async function 청하기(key: string, path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const j = (await r.json().catch(() => ({}))) as { code?: number; message?: string; data?: unknown };
  // **오류를 읽는다.** 09-18 에 DB 제약 거부를 안 읽어 좀비 업무가 생겼다.
  if (!r.ok || (typeof j.code === "number" && j.code !== 0)) {
    throw new Error(`tripo ${path} 실패 HTTP ${r.status} code=${j.code ?? "?"} ${String(j.message ?? "").slice(0, 120)}`);
  }
  return j.data as Record<string, unknown>;
}

/**
 * 글 한 줄 → 3D 하나. 다 될 때까지 기다렸다가 돌려준다.
 *
 * Meshy 와 **같은 모양으로** 돌려준다(taskId·glbUrl·크레딧·시간) — 그래야 나란히 잴 수 있다.
 * 다른 모양으로 돌려주면 견주는 자를 두 벌 만들게 된다.
 */
export async function makeTripoMesh(prompt: string, opts: TripoOptions = {}): Promise<TripoResult> {
  return 만들기({ type: "text_to_model", prompt: prompt.slice(0, 1024) }, opts);
}

/**
 * **그림 → 3D.** 나란히 재려면 이 길이 맞다 — 로키의 Meshy 길은 글이 아니라 **그림**에서 만든다
 * (`imageTo3D`). 글로 견주면 같은 입력이 아니라서 손이 아니라 **말**을 비교한 것이 된다.
 * 09-28 에 처음 짤 때 그 실수를 했고 타입 검사가 잡았다(`textToMesh` 는 없는 문이었다).
 */
export async function makeTripoMeshFromImage(imageDataUrl: string, opts: TripoOptions = {}): Promise<TripoResult> {
  // Tripo 는 올린 파일의 token 을 쓴다. data URL 을 올려 token 을 받아 온다.
  const key = tripoKey();
  if (!key) throw new Error("TRIPO_API_KEY 가 없다");
  const m = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(imageDataUrl.trim());
  if (!m) throw new Error("그림이 data URL 이 아니다");
  const bytes = Buffer.from(m[2], "base64");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: m[1] }), `concept.${m[1].split("/")[1]}`);
  const up = await fetch(`${BASE}/upload`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  const uj = (await up.json().catch(() => ({}))) as { code?: number; message?: string; data?: { image_token?: string } };
  if (!up.ok || (typeof uj.code === "number" && uj.code !== 0) || !uj.data?.image_token) {
    throw new Error(`tripo 그림 올리기 실패 HTTP ${up.status} ${String(uj.message ?? "").slice(0, 100)}`);
  }
  return 만들기(
    { type: "image_to_model", file: { type: m[1].split("/")[1], file_token: uj.data.image_token } },
    opts,
  );
}

async function 만들기(본문: Record<string, unknown>, opts: TripoOptions): Promise<TripoResult> {
  const key = tripoKey();
  if (!key) throw new Error("TRIPO_API_KEY 가 없다 — 사장님이 키를 넣어야 이 손이 움직인다");
  const t0 = Date.now();

  const started = await 청하기(key, "/task", {
    method: "POST",
    body: JSON.stringify({
      ...본문,
      ...(opts.lowPoly ? { face_limit: 3000 } : {}),
      texture: opts.texture !== false,
    }),
  });
  const taskId = String((started as { task_id?: string }).task_id ?? "");
  if (!taskId) throw new Error("tripo 가 task_id 를 안 줬다");

  // 다 될 때까지 묻는다. 2초마다, 기본 6분까지. 유튜브 429 처럼 **너무 자주 묻지 않는다.**
  const 끝 = Date.now() + (opts.timeoutMs ?? 6 * 60_000);
  while (Date.now() < 끝) {
    await new Promise((r) => setTimeout(r, 2000));
    const d = (await 청하기(key, `/task/${taskId}`)) as {
      status?: string;
      output?: { pbr_model?: string; model?: string; rendered_image?: string };
      result?: { pbr_model?: { url?: string }; model?: { url?: string }; rendered_image?: { url?: string } };
    };
    const st = String(d.status ?? "");
    if (st === "success") {
      const glb =
        d.result?.pbr_model?.url ?? d.result?.model?.url ?? d.output?.pbr_model ?? d.output?.model ?? null;
      return {
        taskId,
        glbUrl: glb ?? null,
        thumbnailUrl: d.result?.rendered_image?.url ?? d.output?.rendered_image ?? null,
        consumedCredits: Number((d as { credits?: number }).credits ?? (opts.texture === false ? 56 : 70)),
        model: opts.lowPoly ? "tripo-lowpoly" : "tripo",
        ms: Date.now() - t0,
      };
    }
    if (st === "failed" || st === "cancelled" || st === "banned") {
      throw new Error(`tripo 판이 ${st} 로 끝났다 (${taskId})`);
    }
  }
  throw new Error(`tripo 가 ${((opts.timeoutMs ?? 360000) / 1000).toFixed(0)}초 안에 안 끝났다 (${taskId})`);
}
