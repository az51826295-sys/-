import { validateAssignmentRoleInput } from "@/lib/roles/schemas";

/**
 * Turns the plan's key/value pairs into role input the skill will accept.
 *
 * The plan states scale in flat strings because one plan schema has to serve
 * every employee. This is where that becomes typed: values are coerced by
 * shape, then handed to the skill's own schema, which has the final word.
 *
 * Anything the schema rejects is dropped rather than failing the plan. A
 * misjudged quantity should fall back to the default, not lose the manager a
 * whole plan they were about to approve.
 */
export function resolveRoleInput(
  schemaId: string,
  pairs: { key: string; value: string }[],
): Record<string, unknown> {
  const candidate: Record<string, unknown> = {};

  for (const pair of pairs) {
    const key = pair.key.trim();
    if (!key) continue;
    candidate[key] = coerce(pair.value);
  }

  const validated = validateAssignmentRoleInput(schemaId, candidate);
  if (validated.ok) return validated.value as Record<string, unknown>;

  // One bad field should not throw away the good ones, so each is retried on
  // its own against the same schema.
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(candidate)) {
    const attempt = validateAssignmentRoleInput(schemaId, { [key]: value });
    if (attempt.ok) kept[key] = value;
  }

  const fallback = validateAssignmentRoleInput(schemaId, kept);
  return fallback.ok ? (fallback.value as Record<string, unknown>) : {};
}

/** Numbers, booleans and comma-separated lists arrive as text and have to be
 *  read back into the shape the schema expects. */
function coerce(raw: string): unknown {
  const value = raw.trim();
  if (!value) return "";

  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d*\.\d+$/.test(value)) return Number.parseFloat(value);
  if (value === "true") return true;
  if (value === "false") return false;

  if (value.includes(",")) {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return value;
}
