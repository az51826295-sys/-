import { ExecutionError, setStep } from "@/lib/execution/shared";
import type { EmployeeSkill, SkillRunContext } from "@/lib/skills/types";
import { createImageProvider } from "@/lib/providers/images";
import { defaultMeshProvider } from "@/lib/providers/meshy";
import { meshTextures, judgeMesh, JudgeUnavailable, type MeshVerdict } from "@/lib/providers/judge";
import { z } from "zod";
import { storeDeliverableFile, signedUrlFor, pathFor } from "@/lib/deliverables/files";
import { renderGamedevLessons } from "@/lib/knowledge/gamedev";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 3D 자산 — 이미지 한 장을 메시로 만들고, 규격 v0 로 재고, 대화로 돌려준다.
 *
 * 2026-09-05 사장님: "진짜 게임은 3D, AI 는 Meshy, 오디션 없이." 그 결정의 배관이다.
 *
 * ## 무엇을 하고 무엇을 안 하나
 * - 레퍼런스 이미지가 **왔으면 그것을** 쓴다. 창작은 사장님 것이다.
 * - 안 왔으면 콘셉트 그림을 기계가 그려서 쓴다 — 그리고 **그렇게 적는다.** 기계가
 *   지어낸 생김새를 사람이 준 것처럼 넘기면 다음 판부터 무엇이 누구 것인지 모른다.
 * - 메시는 한 번만 만든다. 떨어져도 다시 만들지 않는다 — 크레딧이 나가고, 다시
 *   할지는 사람이 정한다.
 * - 판정기(`/api/judge/mesh`)는 거르기만 한다. 순위 없음. 못 재면 UNDEFINED.
 */

const briefSchema = z.object({
  /** 이 자산이 무엇인지 한 줄. 산출물 제목. */
  subject: z.string(),
  /** 레퍼런스가 없을 때 콘셉트 그림에 갈 문장. 영어. 한 물체, 정면, 빈 배경. */
  conceptPrompt: z.string(),
  /** 움직여야 하는 것(캐릭터·생물)이면 참. 본 규칙(B1)이 종합에 들어간다. */
  wantRig: z.boolean(),
  /** 캐릭터면 a-pose 가 리깅에 유리하다. 소품이면 빈 문자열. */
  poseMode: z.enum(["a-pose", "t-pose", ""]),
});

const CONCEPT_FORM =
  "Concept art for a 3D game asset, to be converted to a 3D model. ONE single " +
  "subject alone, centered, full body, front view, neutral A-pose if it is a " +
  "character, evenly lit, no harsh shadows, plain flat light-grey background, " +
  "nothing else: no ground, no text, no frame, no second object.";

function ruleLine(r: MeshVerdict["rules"][number]): string {
  const mark = r.verdict === "PASS" ? "✅" : r.verdict === "FAIL" ? "❌" : "◻︎";
  const m = r.measured === null || r.measured === undefined ? "" : ` \`${JSON.stringify(r.measured)}\``;
  return `- ${mark} **${r.id}**${m} — ${r.why}`;
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

function toDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

export const meshAssetsSkill: EmployeeSkill = {
  id: "mesh_assets",
  deliverableType: "mesh_assets",
  capabilities: [
    {
      id: "mesh_from_image",
      label: "3D 모델·메시·캐릭터 모델(GLB/FBX, 유니티용) — '3D' 가 들어간 만들기 요청은 여기 / 3D mesh from an image",
      produces:
        "One GLB (and FBX) made from the reference image — or from a machine-drawn " +
        "concept, flagged as such — with the verdict per rule: triangles, closedness, " +
        "normals, UVs, texture, size, up-axis, bones.",
    },
  ],
  acceptsInternalRequests: true,
  // 하나만 만든다. 여럿 중 고르는 것이 아니다 — 크레딧이 나가는 일이라.
  selects: false,

  async run(ctx: SkillRunContext) {
    await setStep(ctx.supabase, ctx.executionId, "planning");

    const roleInput = (ctx.context.roleInput ?? {}) as { referenceImage?: string | null; previousDeliverableId?: string | null };
    let reference = typeof roleInput.referenceImage === "string" ? roleInput.referenceImage : null;
    // 그림이 안 왔고 지난 캐릭터가 있으면 그 콘셉트 그림을 다시 쓴다 — "같은 얼굴로 다시"
    // 가 되게(09-06 17회차: 4K 로 다시 만들 때 얼굴이 바뀌면 안 된다).
    let reusedConcept = false;
    if (!reference && roleInput.previousDeliverableId) {
      const { data: prev } = await ctx.supabase
        .from("deliverables")
        .select("content_json")
        .eq("id", roleInput.previousDeliverableId)
        .maybeSingle();
      const ci = (prev?.content_json as { conceptImage?: string } | null)?.conceptImage;
      if (typeof ci === "string" && ci.startsWith("data:image")) { reference = ci; reusedConcept = true; }
    }

    const { output: brief } = await ctx.providers.ai.generateStructuredOutput({
      systemInstructions:
        "너는 3D 아티스트다. 업무 문장에서 **무엇을 만들지 하나**를 뽑는다.\n" +
        "- `subject`: 그 물체가 무엇인지 한 줄(한국어).\n" +
        "- `conceptPrompt`: 레퍼런스가 없을 때 콘셉트 그림 생성기에 갈 영어 문장. " +
        "생김새·재질·색을 구체적으로. 배경·바닥·글자는 쓰지 않는다.\n" +
        "- `wantRig`: 걷거나 움직여야 하는 것이면 true.\n" +
        "- `poseMode`: 캐릭터면 \"a-pose\", 아니면 \"\".\n" +
        (reference ? "레퍼런스 이미지가 **있다**. conceptPrompt 는 그래도 쓴다(기록용)." : "") +
        renderGamedevLessons("mesh_assets"),
      input:
        `업무: ${ctx.context.assignment.title}\n` +
        `설명: ${ctx.context.assignment.description ?? ""}\n` +
        `기대 결과: ${ctx.context.assignment.expectedOutcome ?? ""}`,
      schema: briefSchema,
      schemaName: "mesh_asset_brief",
      maxTokens: 1500,
      // 제목·콘셉트 문장·리깅 여부를 뽑는 작은 일. 메시를 만드는 것은 Meshy 다.
      tier: "routine",
    });

    // ── 1. 이미지: 받은 것 또는 기계 콘셉트 ─────────────────────────
    await setStep(ctx.supabase, ctx.executionId, "generating");
    let image = reference;
    let conceptByMachine = false;
    // 캐릭터는 세 장(정면 전신 1024×1536 · 뒷모습 · 얼굴 클로즈업)으로 만든다(18회차).
    // 얼굴 화질의 원천은 콘셉트 그림의 얼굴 픽셀이라, 전신 한 장(얼굴 120 px)으로는
    // 4K 로 칠해도 흐렸다. 클로즈업은 전신 그림을 참조로 편집해 같은 사람을 유지한다.
    const views: { back?: string; face?: string } = {};
    const drawer = createImageProvider();
    if (!image) {
      const made = brief.wantRig
        ? await drawer.draw(CONCEPT_FORM + " " + brief.conceptPrompt + ", full body head to toe, facing the camera, even studio lighting", "high", "1024x1536")
        : await drawer.draw(CONCEPT_FORM + " " + brief.conceptPrompt, "medium");
      image = made.dataUrl;
      conceptByMachine = true;
    }
    if (brief.wantRig) {
      try {
        views.face = (await drawer.edit(image,
          "Close-up portrait of the SAME person shown in this image: identical face, hair, and skin, head and shoulders, facing the camera straight, neutral expression, sharp focus on skin and hair, even studio lighting, plain background",
          "1024x1024")).dataUrl;
        views.back = (await drawer.edit(image,
          "The SAME person shown in this image seen from directly behind, full body head to toe, same pose, same clothes and hair, even studio lighting, plain background",
          "1024x1536")).dataUrl;
      } catch (e) {
        console.warn("[mesh_assets] 추가 뷰 실패 — 한 장으로 간다:", e instanceof Error ? e.message : e);
      }
    }

    // ── 2. 메시 ────────────────────────────────────────────────────
    const mesher = defaultMeshProvider();
    let mesh;
    try {
      // 캐릭터는 4k — 같은 30 크레딧에 피부 고주파 2배(07:39). 소품은 2k 로 족하다.
      mesh = views.face && views.back
        ? await mesher.multiImageTo3D([image, views.back, views.face], { poseMode: brief.poseMode, textureResolution: "4k", aiModel: "meshy-7" })
        : await mesher.imageTo3D(image, { poseMode: brief.poseMode, textureResolution: brief.wantRig ? "4k" : "2k" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new ExecutionError(
        "MODEL_DELIVERABLE_FAILED",
        msg === "MESHY_NO_CREDITS" ? "Meshy 크레딧이 없습니다." : `메시를 못 만들었습니다: ${msg}`,
      );
    }

    // ── 2b. 리깅 (캐릭터만) ───────────────────────────────────────
    // Meshy 리깅은 별도 API(5 크레딧). 휴머노이드만 되고, 안 되면 던진다 — 그때는
    // 본 0개인 메시를 그대로 판정해 B1 에서 떨어지게 두고, 이유를 본문에 적는다.
    // 재는 것은 리깅된 GLB 다(본이 거기 있다).
    let rig = null as Awaited<ReturnType<typeof mesher.rig>> | null;
    let rigError: string | null = null;
    if (brief.wantRig && !mesh.mock) {
      try {
        rig = await mesher.rig(mesh.taskId, 1.7);
      } catch (error) {
        rigError = error instanceof Error ? error.message : String(error);
      }
    }
    const judgeGlbUrl = rig?.riggedGlbUrl ?? mesh.glbUrl;

    // ── 3. 판정 ────────────────────────────────────────────────────
    await setStep(ctx.supabase, ctx.executionId, "verifying");
    let verdict: MeshVerdict;
    try {
      verdict = await judgeMesh(
        { glbUrl: judgeGlbUrl, glbBase64: mesh.glbBase64 },
        { wantRig: brief.wantRig, profile: brief.wantRig ? "character" : "prop" },
      );
    } catch (error) {
      // 판정기에 못 닿았다. 지어내지 않는다 — 못 쟀다고 적는다.
      const why = error instanceof JudgeUnavailable ? error.message : String(error);
      verdict = {
        verdict: "UNDEFINED",
        rules: [{ id: "judge", verdict: "UNDEFINED", measured: null, why }],
        measured: {},
        thresholds: {},
      };
    }

    // ── 4. 본문 ────────────────────────────────────────────────────
    // 생성기 링크는 3일이면 죽는다. 지금 바이트를 받아 **우리 저장소**에 둔다 —
    // 유니티가 며칠 뒤에 가져가는 자리가 거기다. 받기는 여기서, 올리기는 산출물
    // id 가 생긴 뒤에(아래 5).
    const glbBytes: Uint8Array | null = mesh.glbUrl
      ? await fetchBytes(mesh.glbUrl)
      : mesh.glbBase64
        ? new Uint8Array(Buffer.from(mesh.glbBase64, "base64"))
        : null;
    const fbxBytes = mesh.fbxUrl ? await fetchBytes(mesh.fbxUrl) : null;
    const thumbBytes = mesh.thumbnailUrl ? await fetchBytes(mesh.thumbnailUrl) : null;
    const riggedFbx = rig?.riggedFbxUrl ? await fetchBytes(rig.riggedFbxUrl) : null;
    const walkingFbx = rig?.walkingFbxUrl ? await fetchBytes(rig.walkingFbxUrl) : null;
    const runningFbx = rig?.runningFbxUrl ? await fetchBytes(rig.runningFbxUrl) : null;
    const thumb = thumbBytes ? toDataUrl(thumbBytes, "image/png") : null;

    const headline =
      verdict.verdict === "PASS"
        ? "규격 v0 통과"
        : verdict.verdict === "FAIL"
          ? "규격 v0 **떨어짐**"
          : "규격 v0 **못 잼**(통과 아님)";

    const markdown =
      `**${brief.subject}** — ${headline}\n\n` +
      (mesh.mock
        ? "> 목(mock) 판입니다. 실제 메시가 아니라 상자 하나입니다 — 배관 시험용이고 값은 0 입니다.\n\n"
        : "") +
      (conceptByMachine
        ? "> 레퍼런스 이미지가 없어서 **콘셉트 그림을 기계가 그려** 썼습니다. 생김새는 사장님이 정하신 것이 아닙니다.\n\n"
        : "> 사장님이 주신 레퍼런스 이미지로 만들었습니다.\n\n") +
      (thumb ? `![미리보기](${thumb})\n\n` : "") +
      `## 판정 (${verdict.rules.filter((r) => r.verdict === "PASS").length} PASS · ` +
      `${verdict.rules.filter((r) => r.verdict === "FAIL").length} FAIL · ` +
      `${verdict.rules.filter((r) => r.verdict === "UNDEFINED").length} 못 잼)\n\n` +
      verdict.rules.map(ruleLine).join("\n") +
      "\n\n## 파일\n\n" +
      (glbBytes ? `- model.glb (${(glbBytes.byteLength / 1024).toFixed(0)} KB)\n` : "- GLB 를 못 받았습니다.\n") +
      (fbxBytes ? `- model.fbx (${(fbxBytes.byteLength / 1024).toFixed(0)} KB)\n` : "") +
      (riggedFbx ? `- rigged.fbx (${(riggedFbx.byteLength / 1024).toFixed(0)} KB) — 리깅됨. 유니티에서 Rig → Humanoid\n` : "") +
      (walkingFbx ? "- walking.fbx · running.fbx — Meshy 가 같이 준 걷기·달리기\n" : "") +
      (rigError ? `- 리깅 실패: ${rigError} (휴머노이드가 아니거나 얼굴이 +Z 를 안 볼 때 그렇습니다. 크레딧은 돌아옵니다)\n` : "") +
      "- 파일은 이 대화 아래 '받기' 와 유니티 창(Window → Rookery)에서 받습니다.\n" +
      `\n- 생성기: ${mesh.model} · 크레딧 ${mesh.consumedCredits + (rig?.consumedCredits ?? 0)}\n\n` +
      "## 유니티에 넣을 때\n\n" +
      (brief.wantRig
        ? "- 캐릭터라 **FBX** 를 쓰십시오. Rig → Humanoid. GLB 는 리타깃 설정이 없습니다.\n"
        : "- 소품이라 GLB(패키지 com.unity.cloud.gltfast 필요) 또는 FBX 둘 다 됩니다.\n") +
      "- 크기가 100배로 보이면 임포트 Scale Factor 0.01. 분홍이면 URP/Lit 으로, 하얗면 재질 다시 추출.\n" +
      "- 콜라이더는 따로 붙이십시오. 피벗은 바닥 중앙으로 청했습니다.\n\n" +
      "---\n\n" +
      "판정기는 걸렀을 뿐 고르지 않았습니다. 닮았는지·예쁜지·움직임이 자연스러운지는 " +
      "재지 않습니다 — 그것은 사람 눈입니다. 다시 만들지도 사람이 정합니다(크레딧이 나갑니다).";

    const content = {
      brief,
      conceptByMachine,
      reusedConcept,
      textureResolution: brief.wantRig ? "4k" : "2k",
      views: Object.keys(views),
      conceptImage: conceptByMachine ? image : null,
      mesh: { ...mesh, glbBase64: mesh.glbBase64 ? "(생략)" : null },
      rig,
      rigError,
      verdict,
    };

    const { data: saved, error: saveError } = await ctx.supabase.rpc(
      "submit_generated_deliverable",
      {
        p_execution_id: ctx.executionId,
        p_title: brief.subject,
        p_deliverable_type: "mesh_assets",
        p_content_markdown: markdown,
        p_content_json: content,
        p_generation_model: `${ctx.providers.ai.model} + ${mesh.model}`,
        p_citations: [],
      },
    );
    if (saveError) throw new ExecutionError("DELIVERABLE_SAVE_FAILED", saveError.message);
    const rpc = saved as { ok: boolean; reason?: string; deliverableId?: string };
    if (!rpc.ok && !(rpc.reason === "already_submitted" && rpc.deliverableId)) {
      throw new ExecutionError("DELIVERABLE_SAVE_FAILED", rpc.reason ?? "unknown");
    }
    const deliverableId = rpc.deliverableId as string;
    // 파일이 다 올라갈 때까지 대화에 붙지 않게 표시한다(workReturns 가 본다).
    await createServiceClient().from("deliverables").update({ content_json: { ...content, filesPending: true } }).eq("id", deliverableId);

    // ── 5. 파일을 저장소에 ─────────────────────────────────────────
    // 산출물은 이미 저장됐다. 파일 하나를 못 올려도 산출물이 실패로 바뀌지는
    // 않는다 — 다만 못 올린 것은 못 올렸다고 적어야 하는데, 그 자리는 다음 판.
    const companyId = ctx.execution.company_id as string;
    // 저장은 서버 열쇠로 한다. 09-05 16:38 첫 판에서 사용자 세션 클라이언트로 올린
    // 것이 조용히 안 올라갔다(GLB 6MB·FBX 13MB 는 받아 놓고). 이 실행은 응답이
    // 나간 뒤 서버에서 도는 일이라 사용자 쿠키에 기대는 것 자체가 위태롭다.
    // 경로는 어차피 회사 id 로 시작하고, 읽기는 주인 확인을 거친다(/api/files).
    const store = createServiceClient();
    const storageErrors: string[] = [];
    const put = async (
      filename: string,
      body: Uint8Array | null,
      mime: string,
      kind: "document" | "image",
      title: string,
    ) => {
      if (!body) return;
      const r = await storeDeliverableFile(store, {
        companyId,
        deliverableId,
        filename,
        body,
        // 표의 kind 는 audio/image/archive/document 뿐이다(마이그레이션을 안 만든다).
        // 메시는 document 로 두고 mime 으로 가른다.
        kind,
        mimeType: mime,
        title,
        producedByBackend: mesh.model,
      });
      if (!r.ok) {
        // 삼키지 않는다. 못 올린 파일은 없는 파일이고, 그 사실이 어디에도 안 남으면
        // 유니티 앞의 사람은 "왜 비었지" 만 본다.
        storageErrors.push(`${filename}: ${r.error}`);
        console.error("[mesh_assets] 저장 실패", filename, r.error);
      }
    };
    await put("model.glb", glbBytes, "model/gltf-binary", "document", `${brief.subject} (GLB)`);
    await put("model.fbx", fbxBytes, "application/octet-stream", "document", `${brief.subject} (FBX)`);
    await put("thumbnail.png", thumbBytes, "image/png", "image", `${brief.subject} 미리보기`);
    const b64bytes = (d?: string) => (d ? new Uint8Array(Buffer.from(d.split(",")[1] ?? "", "base64")) : null);
    if (views.face) await put("concept_face.png", b64bytes(views.face), "image/png", "image", `${brief.subject} 콘셉트 얼굴`);
    if (views.back) await put("concept_back.png", b64bytes(views.back), "image/png", "image", `${brief.subject} 콘셉트 뒷모습`);
    await put("rigged.fbx", riggedFbx, "application/octet-stream", "document", `${brief.subject} (리깅 FBX)`);
    await put("walking.fbx", walkingFbx, "application/octet-stream", "document", `${brief.subject} 걷기`);
    await put("running.fbx", runningFbx, "application/octet-stream", "document", `${brief.subject} 달리기`);

    // ── PBR 맵 되찾기 ─────────────────────────────────────────────
    // 리깅 FBX 에는 베이스컬러 하나만 온다(22:40 확인). 원본 GLB 의 노멀·금속거칠기
    // 맵을 자에게서 유니티 묶음으로 받아 파일로 둔다 — Dev 의 씬 빌더가 리깅 재질에
    // 붙인다. 생성 AI 를 다시 돌리지 않고 디테일을 올리는 자리(사장님 22:37).
    if (glbBytes) {
      try {
        // 저장소에 올린 model.glb 의 서명 링크로 — base64 는 4K 에서 시간이 넘는다(07:56 판).
        const glbUrl = await signedUrlFor(store, pathFor(companyId, deliverableId, "model.glb"));
        const maps = await meshTextures(glbUrl ? { glbUrl } : { glbBase64: Buffer.from(glbBytes).toString("base64") });
        if (maps.ok) {
          const dec = (b64: string | null | undefined) => (b64 ? new Uint8Array(Buffer.from(b64, "base64")) : null);
          await put("normal.png", dec(maps.normal_png), "image/png", "image", `${brief.subject} 노멀 맵`);
          await put("metallic_smoothness.png", dec(maps.metallic_smoothness_png), "image/png", "image", `${brief.subject} 금속·매끄러움 맵(R=metallic, A=smoothness)`);
          await put("occlusion.png", dec(maps.occlusion_png), "image/png", "image", `${brief.subject} 오클루전 맵`);
          // 피부 질감(16회차): 캐릭터에만. 유니티 창이 재질의 Detail 슬롯에 얹는다.
          if (brief.wantRig) {
            await put("detail_normal.png", dec(maps.detail_normal_png), "image/png", "image", `${brief.subject} 피부 디테일 노멀(타일)`);
            await put("detail_mask.png", dec(maps.detail_mask_png), "image/png", "image", `${brief.subject} 피부 마스크(알파)`);
          }
        } else {
          storageErrors.push(`pbr maps: ${maps.error ?? "?"}`);
        }
      } catch (e) {
        storageErrors.push(`pbr maps: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await store
      .from("deliverables")
      .update({ content_json: { ...content, filesPending: false, ...(storageErrors.length ? { storageErrors } : {}) } })
      .eq("id", deliverableId);

    return {
      deliverableId,
      deliverableType: "mesh_assets",
      metrics: { candidateCount: 1, selectedCount: verdict.verdict === "PASS" ? 1 : 0 },
    };
  },
};
