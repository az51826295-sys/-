/**
 * Meshy — 이미지 한 장을 3D 메시로.
 *
 * 2026-09-05 사장님 결정: 진짜 게임은 3D, 메시는 Meshy(오디션 없이). 문서에서
 * 확인한 문: `POST https://api.meshy.ai/openapi/v1/image-to-3d`, 폴링
 * `GET .../image-to-3d/:id`, 상태 PENDING → IN_PROGRESS → SUCCEEDED | FAILED |
 * CANCELED. 결과 링크(`model_urls.glb`, `thumbnail_url`)는 **서명돼 있어 짧게
 * 산다**(`expires_at`) — 그래서 이 제공자는 바이트를 받아 오지 않고 링크만 주고,
 * 쓰는 쪽이 바로 받거나 저장한다.
 *
 * ## 값
 * 실패한 판은 크레딧을 돌려준다(`consumed_credits: 0`). 402 는 크레딧 부족이다.
 * 잔액은 `GET /openapi/v1/balance`.
 *
 * ## 목
 * 키가 없거나 `AI_PROVIDER=mock` 이면 실제로 부르지 않고, 작은 상자 GLB 를
 * base64 로 준다. 배관(폴링 → 판정 → 저장 → 대화로 돌아옴)은 끝까지 돌고 값은
 * 0 이다. 목이 준 것은 게임 자산이 아니다 — `mock: true` 를 달아 판정문에 남긴다.
 */

export type MeshyTask = {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
  progress: number;
  model_urls?: { glb?: string; fbx?: string; obj?: string; usdz?: string };
  thumbnail_url?: string;
  texture_urls?: { base_color?: string; normal?: string; roughness?: string; metallic?: string }[];
  consumed_credits?: number;
  expires_at?: number;
  task_error?: { message?: string } | null;
};

export type MeshResult = {
  taskId: string;
  glbUrl: string | null;
  fbxUrl: string | null;
  thumbnailUrl: string | null;
  consumedCredits: number;
  expiresAt: number | null;
  /** 목이 준 것이면 base64 GLB 가 여기 있고 링크는 비어 있다. */
  glbBase64: string | null;
  mock: boolean;
  model: string;
};

export type MeshOptions = {
  /** 사장님이 고른 것. 기본 meshy-6. (meshy-7 도 문에 있다 — 바꾸는 것은 사람이 정한다.) */
  aiModel?: "meshy-5" | "meshy-6" | "meshy-7";
  /** 쿼드 리메시. 규격 v0 가 쿼드를 전제한다. */
  topology?: "quad" | "triangle";
  targetPolycount?: number;
  poseMode?: "a-pose" | "t-pose" | "";
  enablePbr?: boolean;
  /** 2k(기본)·4k·8k. 09-06 07:39: 4k 도 30 크레딧 그대로, 피부 고주파가 2배. 캐릭터는 4k. */
  textureResolution?: "2k" | "4k" | "8k";
};

export type RigResult = {
  taskId: string;
  riggedGlbUrl: string | null;
  riggedFbxUrl: string | null;
  walkingFbxUrl: string | null;
  runningFbxUrl: string | null;
  consumedCredits: number;
  mock: boolean;
};

export type MeshProvider = {
  name: string;
  imageTo3D(imageDataUrl: string, opts?: MeshOptions): Promise<MeshResult>;
  /**
   * 여러 장(1~4, 첫 장이 정면) → 3D. 09-06 18회차: 전신 + 뒷모습 + **얼굴 클로즈업**을
   * meshy-7 에 주니 얼굴이 사람에 가까워졌다 — 화질의 원천은 콘셉트 그림의 얼굴 픽셀이다.
   */
  multiImageTo3D(imageDataUrls: string[], opts?: MeshOptions): Promise<MeshResult>;
  /**
   * 리깅(`POST /openapi/v1/rigging`, 5 크레딧). 휴머노이드만, 텍스처 있어야, 얼굴이
   * +Z. 걷기·달리기 애니가 같이 온다. 실패는 던진다 — 크레딧은 돌아온다.
   */
  rig(inputTaskId: string, heightMeters: number): Promise<RigResult>;
  balance(): Promise<number | null>;
};

const BASE = "https://api.meshy.ai/openapi/v1";
const POLL_MS = 10_000;
const MAX_WAIT_MS = 15 * 60_000;

export function createMeshyProvider(apiKey: string): MeshProvider {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  async function get(path: string): Promise<Response> {
    return fetch(BASE + path, { headers, signal: AbortSignal.timeout(60_000) });
  }

  return {
    name: "meshy",

    async balance() {
      try {
        const r = await get("/balance");
        if (!r.ok) return null;
        return Number(((await r.json()) as { balance?: number }).balance ?? NaN) || null;
      } catch {
        return null;
      }
    },

    async rig(inputTaskId, heightMeters) {
      const created = await fetch(BASE + "/rigging", {
        method: "POST",
        headers,
        body: JSON.stringify({ input_task_id: inputTaskId, height_meters: heightMeters }),
        signal: AbortSignal.timeout(60_000),
      });
      if (created.status === 402) throw new Error("MESHY_NO_CREDITS");
      if (!created.ok) throw new Error(`MESHY_RIG_HTTP_${created.status}: ${(await created.text()).slice(0, 200)}`);
      const { result: taskId } = (await created.json()) as { result: string };

      // 문서는 평평하게 적어 놨지만 실제 응답은 `result` 아래에, 애니는 그 아래
      // `basic_animations` 에 온다(09-05 17:00 실측 — 첫 리깅 판이 5 크레딧을 쓰고도
      // 링크를 못 읽었다). 두 모양을 다 받는다.
      type RigTask = MeshyTask & {
        result?: {
          rigged_character_glb_url?: string;
          rigged_character_fbx_url?: string;
          basic_animations?: { walking_fbx_url?: string; running_fbx_url?: string };
        };
        rigged_character_glb_url?: string;
        rigged_character_fbx_url?: string;
        walking_fbx_url?: string;
        running_fbx_url?: string;
      };
      const until = Date.now() + MAX_WAIT_MS;
      let task: RigTask | null = null;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const r = await get(`/rigging/${taskId}`);
        if (!r.ok) continue;
        task = (await r.json()) as RigTask;
        if (task.status === "SUCCEEDED" || task.status === "FAILED" || task.status === "CANCELED") break;
      }
      if (!task) throw new Error("MESHY_RIG_NO_ANSWER");
      if (task.status !== "SUCCEEDED") {
        throw new Error(`MESHY_RIG_${task.status}: ${task.task_error?.message ?? "이유 없음"}`);
      }
      const res = task.result ?? {};
      const anim = res.basic_animations ?? {};
      return {
        taskId,
        riggedGlbUrl: res.rigged_character_glb_url ?? task.rigged_character_glb_url ?? null,
        riggedFbxUrl: res.rigged_character_fbx_url ?? task.rigged_character_fbx_url ?? null,
        walkingFbxUrl: anim.walking_fbx_url ?? task.walking_fbx_url ?? null,
        runningFbxUrl: anim.running_fbx_url ?? task.running_fbx_url ?? null,
        consumedCredits: task.consumed_credits ?? 0,
        mock: false,
      };
    },

    async multiImageTo3D(imageDataUrls, opts = {}) {
      return runTo3D("/multi-image-to-3d", { image_urls: imageDataUrls }, { aiModel: "meshy-7", ...opts });
    },

    async imageTo3D(imageDataUrl, opts = {}) {
      return runTo3D("/image-to-3d", { image_url: imageDataUrl }, opts);
    },
  };

  async function runTo3D(path: string, imageField: Record<string, unknown>, opts: MeshOptions): Promise<MeshResult> {
    {
      const model = opts.aiModel ?? "meshy-6";
      const body = {
        ...imageField,
        ai_model: model,
        should_remesh: true,
        topology: opts.topology ?? "quad",
        // 쿼드 하나가 삼각형 둘이라, 20,000 을 주니 40,991 삼각형이 와서 규격
        // T1(≤ 40,000)에 걸렸다(09-05 첫 판). 규격을 늦추지 않고 목표를 내린다.
        target_polycount: opts.targetPolycount ?? 15_000,
        enable_pbr: opts.enablePbr ?? true,
        texture_resolution: opts.textureResolution ?? "2k",
        target_formats: ["glb", "fbx"],
        pose_mode: opts.poseMode ?? "",
        // 규격 S1(높이 0.5~3 m)을 재려면 실제 크기 추정이 있어야 한다. 없으면
        // 생성기가 임의 단위로 내고, 그 숫자는 아무것도 뜻하지 않는다.
        auto_size: true,
        origin_at: "bottom",
      };
      const created = await fetch(BASE + path, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      if (created.status === 402) throw new Error("MESHY_NO_CREDITS");
      if (!created.ok) throw new Error(`MESHY_HTTP_${created.status}: ${(await created.text()).slice(0, 200)}`);
      const { result: taskId } = (await created.json()) as { result: string };

      const until = Date.now() + MAX_WAIT_MS;
      let task: MeshyTask | null = null;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const r = await get(`${path}/${taskId}`);
        if (!r.ok) continue; // 한 번 못 물어본 것은 다음에 또 묻는다
        task = (await r.json()) as MeshyTask;
        if (task.status === "SUCCEEDED" || task.status === "FAILED" || task.status === "CANCELED") break;
      }
      if (!task) throw new Error("MESHY_NO_ANSWER");
      if (task.status !== "SUCCEEDED") {
        throw new Error(
          `MESHY_${task.status}: ${task.task_error?.message ?? "이유 없음"}`,
        );
      }
      return {
        taskId,
        glbUrl: task.model_urls?.glb ?? null,
        fbxUrl: task.model_urls?.fbx ?? null,
        thumbnailUrl: task.thumbnail_url ?? null,
        consumedCredits: task.consumed_credits ?? 0,
        expiresAt: task.expires_at ?? null,
        glbBase64: null,
        mock: false,
        model,
      };
    }
  }
}

/**
 * 목. 상자 하나(높이 1.6 m, 12면)를 GLB 로 낸다 — 규격 v0 에서 T1 이 떨어지는
 * 것이 **맞다**. 목이 통과하면 판정기가 고장 난 것이다.
 */
export function createMockMeshProvider(): MeshProvider {
  return {
    name: "mock-mesh",
    async balance() {
      return 0;
    },
    async rig() {
      // 목은 리깅을 못 한다. 본 0개 그대로 — B1 이 떨어지는 것이 맞다.
      return { taskId: "mock-rig", riggedGlbUrl: null, riggedFbxUrl: null, walkingFbxUrl: null, runningFbxUrl: null, consumedCredits: 0, mock: true };
    },
    async multiImageTo3D() {
      return this.imageTo3D("", {});
    },
    async imageTo3D() {
      return {
        taskId: "mock-" + Date.now().toString(36),
        glbUrl: null,
        fbxUrl: null,
        thumbnailUrl: null,
        consumedCredits: 0,
        expiresAt: null,
        glbBase64: MOCK_BOX_GLB,
        mock: true,
        model: "mock",
      };
    },
  };
}

export function defaultMeshProvider(): MeshProvider {
  const key = process.env.MESHY_API_KEY;
  if (process.env.AI_PROVIDER === "mock" || !key) return createMockMeshProvider();
  return createMeshyProvider(key);
}

// trimesh.creation.box(extents=(0.5, 1.6, 0.3)) → glb, base64. 12면. 재질 없음.
const MOCK_BOX_GLB =
  "Z2xURgIAAADcAwAA0AIAAEpTT057InNjZW5lIjowLCJzY2VuZXMiOlt7Im5vZGVzIjpbMF19XSwiYXNzZXQiOnsidmVyc2lvbiI6IjIuMCIsImdlbmVyYXRvciI6Imh0dHBzOi8vZ2l0aHViLmNvbS9taWtlZGgvdHJpbWVzaCJ9LCJhY2Nlc3NvcnMiOlt7ImNvbXBvbmVudFR5cGUiOjUxMjUsInR5cGUiOiJTQ0FMQVIiLCJidWZmZXJWaWV3IjowLCJjb3VudCI6MzYsIm1heCI6WzddLCJtaW4iOlswXX0seyJjb21wb25lbnRUeXBlIjo1MTI2LCJ0eXBlIjoiVkVDMyIsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjEsImNvdW50Ijo4LCJtYXgiOlswLjI1LDAuODAwMDAwMDExOTIwOTI5LDAuMTUwMDAwMDA1OTYwNDY0NDhdLCJtaW4iOlstMC4yNSwtMC44MDAwMDAwMTE5MjA5MjksLTAuMTUwMDAwMDA1OTYwNDY0NDhdfV0sIm1lc2hlcyI6W3sibmFtZSI6Imdlb21ldHJ5XzAiLCJleHRyYXMiOnsic2hhcGUiOiJib3giLCJleHRlbnRzIjpbMC41LDEuNiwwLjNdfSwicHJpbWl0aXZlcyI6W3siYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6MX0sImluZGljZXMiOjAsIm1vZGUiOjR9XX1dLCJub2RlcyI6W3sibmFtZSI6Imdlb21ldHJ5XzAiLCJtZXNoIjowfV0sImJ1ZmZlcnMiOlt7ImJ5dGVMZW5ndGgiOjI0MH1dLCJidWZmZXJWaWV3cyI6W3siYnVmZmVyIjowLCJieXRlT2Zmc2V0IjowLCJieXRlTGVuZ3RoIjoxNDR9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjoxNDQsImJ5dGVMZW5ndGgiOjk2fV19ICDwAAAAQklOAAEAAAADAAAAAAAAAAQAAAABAAAAAAAAAAAAAAADAAAAAgAAAAIAAAAEAAAAAAAAAAEAAAAHAAAAAwAAAAUAAAABAAAABAAAAAUAAAAHAAAAAQAAAAMAAAAHAAAAAgAAAAYAAAAEAAAAAgAAAAIAAAAHAAAABgAAAAYAAAAFAAAABAAAAAcAAAAFAAAABgAAAAAAgL7NzEy/mpkZvgAAgL7NzEy/mpkZPgAAgL7NzEw/mpkZvgAAgL7NzEw/mpkZPgAAgD7NzEy/mpkZvgAAgD7NzEy/mpkZPgAAgD7NzEw/mpkZvgAAgD7NzEw/mpkZPg==";
