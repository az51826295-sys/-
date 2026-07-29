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

export const roleKnowledgeSchemaRegistry = {
  art_direction_knowledge_v1: artDirectionKnowledgeSchema,
  market_research_knowledge_v1: marketResearchKnowledgeSchema,
  lead_research_knowledge_v1: leadResearchKnowledgeSchema,
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

export const assignmentInputSchemaRegistry = {
  art_bible_assignment_v1: artBibleAssignmentSchema,
  market_research_assignment_v1: marketResearchAssignmentSchema,
  lead_research_assignment_v1: leadResearchAssignmentSchema,
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
