import { z } from "zod";

/**
 * What each role knows and what each role can be asked for.
 *
 * These live apart from the employee definitions on purpose. A definition says
 * who an employee is and how they are presented; a schema says what shape their
 * knowledge and their assignment input take, and is what the server validates
 * before anything is stored. Adding an employee means adding entries here, not
 * editing the code that reads them.
 */

const employeeRangeSchema = z
  .object({
    min: z.number().int().min(0).max(1_000_000).optional(),
    max: z.number().int().min(0).max(1_000_000).optional(),
  })
  .refine(
    (range) =>
      range.min === undefined || range.max === undefined || range.min <= range.max,
    { message: "The smallest company size must not be larger than the largest." },
  );

export type EmployeeRange = z.infer<typeof employeeRangeSchema>;

// --- Role knowledge (written once, at the end of onboarding) ----------------

export const marketResearchKnowledgeSchema = z.object({
  marketsToMonitor: z.string().optional(),
});

export const leadResearchKnowledgeSchema = z.object({
  idealCustomerProfile: z.object({
    companyTypes: z.array(z.string().max(120)).max(20).default([]),
    industries: z.array(z.string().max(120)).max(20).default([]),
    employeeRange: employeeRangeSchema.optional(),
    locations: z.array(z.string().max(120)).max(20).default([]),
    excludedCompanies: z.array(z.string().max(200)).max(20).default([]),
  }),
  buyerRoles: z.array(z.string().max(120)).max(20).default([]),
  buyingSignals: z.array(z.string().max(200)).max(20).default([]),
  qualificationPriorities: z.array(z.string().max(120)).max(20).default([]),
});

export type LeadResearchKnowledge = z.infer<typeof leadResearchKnowledgeSchema>;

/**
 * What an art director is told during onboarting, once, so every bible after
 * it starts from the same place.
 *
 * Deliberately thin. Most of what shapes a bible belongs in the assignment —
 * this game, this mood — not in a standing profile. What lives here is the
 * handful of constraints that outlast any one project: the engine the assets
 * have to load into, and house rules the company has already settled.
 */
export const artDirectionKnowledgeSchema = z.object({
  targetEngine: z.string().max(120).default(''),
  /** Platforms the art has to hold up on, which decides minimum sizes. */
  platforms: z.array(z.string().max(60)).max(10).default([]),
  /** Rules the company has already decided and should not be re-litigated per
   *  project — "we never use pure black", "everything ships with alpha". */
  houseRules: z.array(z.string().max(200)).max(20).default([]),
  referenceTouchstones: z.array(z.string().max(160)).max(20).default([]),
});

export type ArtDirectionKnowledge = z.infer<typeof artDirectionKnowledgeSchema>;

// Nova(게임 아티스트)와 Dev(앱 빌더)는 08-28 에 뽑으면서 여기 등록을 빠뜨렸다.
// 그래서 09-05 까지 둘은 이 길로 업무를 **한 번도** 받을 수 없었다 — 대화가
// "Unknown assignment input schema" 로 막혔다. 둘은 업무 문장 자체가 입력이라
// 따로 묻는 칸이 없다. 빈 객체가 맞다.
export const gameArtKnowledgeSchema = z.object({});
export const appBuildKnowledgeSchema = z.object({});
export const meshAssetsKnowledgeSchema = z.object({});
// 분석(Ana, 36회차): 링크와 물음이 업무 문장에 있다. 따로 묻는 칸 없음.
export const analysisKnowledgeSchema = z.object({});
export const videoKnowledgeSchema = z.object({});

export const roleKnowledgeSchemaRegistry = {
  art_direction_knowledge_v1: artDirectionKnowledgeSchema,
  market_research_knowledge_v1: marketResearchKnowledgeSchema,
  lead_research_knowledge_v1: leadResearchKnowledgeSchema,
  game_art_knowledge_v1: gameArtKnowledgeSchema,
  app_build_knowledge_v1: appBuildKnowledgeSchema,
  mesh_assets_knowledge_v1: meshAssetsKnowledgeSchema,
  analysis_knowledge_v1: analysisKnowledgeSchema,
  video_knowledge_v1: videoKnowledgeSchema,
} as const;

export type RoleKnowledgeSchemaId = keyof typeof roleKnowledgeSchemaRegistry;

// --- Assignment input (written per assignment) ------------------------------

/** Hard ceiling on one lead list. Above this the run stops being research and
 *  starts being scraping, which is not what Emma is for. */
export const MAX_TARGET_COUNT = 50;
export const DEFAULT_TARGET_COUNT = 20;

export const marketResearchAssignmentSchema = z.object({});

export const leadResearchAssignmentSchema = z.object({
  targetCount: z
    .number()
    .int()
    .min(1)
    .max(MAX_TARGET_COUNT)
    .default(DEFAULT_TARGET_COUNT),
  industries: z.array(z.string().max(120)).max(20).default([]),
  locations: z.array(z.string().max(120)).max(20).default([]),
  employeeRange: employeeRangeSchema.optional(),
  requiredSignals: z.array(z.string().max(200)).max(20).default([]),
  excludedCompanies: z.array(z.string().max(200)).max(20).default([]),
  buyerRoles: z.array(z.string().max(120)).max(20).default([]),
});

export type LeadResearchAssignmentInput = z.infer<typeof leadResearchAssignmentSchema>;

/** Nothing to size. An art bible is one document however big the game is —
 *  the asset counts inside it are the scale, and those come from the brief. */
export const artBibleAssignmentSchema = z.object({});

export const gameAssetsAssignmentSchema = z.object({});
// 고치는 판이면 이전 산출물 id 가 온다. Dev 는 그 파일들과 떨어진 줄을 바탕으로 고친다 —
// 처음부터 다시 쓰면 지난 판에서 통과한 것까지 새로 깨진다(09-05).
export const appBuildAssignmentSchema = z.object({
  previousDeliverableId: z.string().optional().nullable(),
});
// 3D 는 이미지 한 장이 입력이다. 대화에 올린 사진이 여기로 온다(data URL).
export const meshAssetsAssignmentSchema = z.object({
  referenceImage: z.string().optional().nullable(),
  /** 같은 대화에서 Vox 가 마지막으로 돌려준 산출물. 그림이 없으면 그 콘셉트 그림을 다시 쓴다. */
  previousDeliverableId: z.string().optional().nullable(),
});

export const analysisAssignmentSchema = z.object({ urls: z.array(z.string()).optional().nullable() });

export const videoAssignmentSchema = z.object({
  previousDeliverableId: z.string().optional().nullable(),
  /** 재료로 쓸 산출물(44회차): 이 대화의 분석·조사 결과를 영상으로 옮길 때. */
  sourceDeliverableId: z.string().optional().nullable(),
});

export const assignmentInputSchemaRegistry = {
  art_bible_assignment_v1: artBibleAssignmentSchema,
  market_research_assignment_v1: marketResearchAssignmentSchema,
  lead_research_assignment_v1: leadResearchAssignmentSchema,
  game_assets_assignment_v1: gameAssetsAssignmentSchema,
  app_build_assignment_v1: appBuildAssignmentSchema,
  mesh_assets_assignment_v1: meshAssetsAssignmentSchema,
  analysis_assignment_v1: analysisAssignmentSchema,
  video_assignment_v1: videoAssignmentSchema,
} as const;

export type AssignmentInputSchemaId = keyof typeof assignmentInputSchemaRegistry;

// --- Validation -------------------------------------------------------------

export type SchemaValidation<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function firstProblem(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Some of these answers couldn't be saved.";
  // Zod's own message for a custom refine already reads like a sentence; the
  // built-in ones don't, so they get a plain fallback rather than being shown raw.
  return issue.message.match(/[a-z] [a-z]/i)
    ? issue.message
    : "Some of these answers couldn't be saved.";
}

/**
 * Validates on the server, always. The onboarding and assignment forms shape
 * the input, but a malformed body must not reach the database — a bad ideal
 * customer profile would then be replayed into every future lead search.
 */
export function validateRoleKnowledge(
  schemaId: string,
  value: unknown,
): SchemaValidation<unknown> {
  const schema =
    roleKnowledgeSchemaRegistry[schemaId as RoleKnowledgeSchemaId];
  if (!schema) return { ok: false, error: "Unknown role knowledge schema." };

  const parsed = schema.safeParse(value);
  if (!parsed.success) return { ok: false, error: firstProblem(parsed.error) };
  return { ok: true, value: parsed.data };
}

export function validateAssignmentRoleInput(
  schemaId: string,
  value: unknown,
): SchemaValidation<unknown> {
  const schema =
    assignmentInputSchemaRegistry[schemaId as AssignmentInputSchemaId];
  if (!schema) return { ok: false, error: "Unknown assignment input schema." };

  const parsed = schema.safeParse(value ?? {});
  if (!parsed.success) return { ok: false, error: firstProblem(parsed.error) };
  return { ok: true, value: parsed.data };
}
