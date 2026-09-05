import { ExecutionError, setStep } from "@/lib/execution/shared";
import type { EmployeeSkill, SkillRunContext } from "@/lib/skills/types";
import { createImageProvider } from "@/lib/providers/images";
import { defaultMeshProvider } from "@/lib/providers/meshy";
import { judgeMesh, JudgeUnavailable, type MeshVerdict } from "@/lib/providers/judge";
import { z } from "zod";
import { storeDeliverableFile } from "@/lib/deliverables/files";
import { renderGamedevLessons } from "@/lib/knowledge/gamedev";

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
      label: "Make a 3D mesh from one reference image, measured against the intake spec",
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

    const roleInput = (ctx.context.roleInput ?? {}) as { referenceImage?: string | null };
    const reference = typeof roleInput.referenceImage === "string" ? roleInput.referenceImage : null;

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
    if (!image) {
      const drawer = createImageProvider();
      const made = await drawer.draw(CONCEPT_FORM + " " + brief.conceptPrompt, "medium");
      image = made.dataUrl;
      conceptByMachine = true;
    }

    // ── 2. 메시 ────────────────────────────────────────────────────
    const mesher = defaultMeshProvider();
    let mesh;
    try {
      mesh = await mesher.imageTo3D(image, { poseMode: brief.poseMode });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new ExecutionError(
        "MODEL_DELIVERABLE_FAILED",
        msg === "MESHY_NO_CREDITS" ? "Meshy 크레딧이 없습니다." : `메시를 못 만들었습니다: ${msg}`,
      );
    }

    // ── 3. 판정 ────────────────────────────────────────────────────
    await setStep(ctx.supabase, ctx.executionId, "verifying");
    let verdict: MeshVerdict;
    try {
      verdict = await judgeMesh(
        { glbUrl: mesh.glbUrl, glbBase64: mesh.glbBase64 },
        { wantRig: brief.wantRig },
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
      "- 파일은 이 대화 아래 '열기·저장' 과 유니티 창(Window → Rookery)에서 받습니다.\n" +
      `\n- 생성기: ${mesh.model} · 크레딧 ${mesh.consumedCredits}\n\n` +
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
      conceptImage: conceptByMachine ? image : null,
      mesh: { ...mesh, glbBase64: mesh.glbBase64 ? "(생략)" : null },
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

    // ── 5. 파일을 저장소에 ─────────────────────────────────────────
    // 산출물은 이미 저장됐다. 파일 하나를 못 올려도 산출물이 실패로 바뀌지는
    // 않는다 — 다만 못 올린 것은 못 올렸다고 적어야 하는데, 그 자리는 다음 판.
    const companyId = ctx.execution.company_id as string;
    const put = async (
      filename: string,
      body: Uint8Array | null,
      mime: string,
      kind: "document" | "image",
      title: string,
    ) => {
      if (!body) return;
      await storeDeliverableFile(ctx.supabase, {
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
    };
    await put("model.glb", glbBytes, "model/gltf-binary", "document", `${brief.subject} (GLB)`);
    await put("model.fbx", fbxBytes, "application/octet-stream", "document", `${brief.subject} (FBX)`);
    await put("thumbnail.png", thumbBytes, "image/png", "image", `${brief.subject} 미리보기`);

    return {
      deliverableId,
      deliverableType: "mesh_assets",
      metrics: { candidateCount: 1, selectedCount: verdict.verdict === "PASS" ? 1 : 0 },
    };
  },
};
