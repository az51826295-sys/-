"use client";

import type { ComponentType } from "react";
import { LeadResearchFields } from "./LeadResearchFields";

export interface AssignmentFormExtensionProps {
  employeeName: string;
  /** What the employee already knows, used for placeholders. Read only — the
   *  assignment form never edits the onboarding profile. */
  defaults: unknown;
  value: unknown;
  onChange: (value: unknown) => void;
}

/**
 * Extra assignment fields by skill. The common fields — what to do, context,
 * what a good result looks like, priority — stay identical for every employee;
 * only this block differs.
 */
const assignmentInputRenderers: Record<
  string,
  ComponentType<AssignmentFormExtensionProps>
> = {
  lead_research: LeadResearchFields,
};

export function AssignmentFormExtension({
  skillId,
  ...props
}: AssignmentFormExtensionProps & { skillId: string }) {
  const Renderer = assignmentInputRenderers[skillId];
  // A skill with no extra fields renders nothing rather than an empty box.
  if (!Renderer) return null;
  return <Renderer {...props} />;
}
