// Kept free of server imports so client components can share these definitions.

export type PlaybookStatus = "draft" | "active" | "archived";

export interface PlaybookStep {
  id: string;
  instruction: string;
  /** What this step should leave behind. An instruction with no stated result
   *  can be believed to have been followed while producing nothing. */
  expectedOutput: string;
  required: boolean;
  orderIndex: number;
}

export interface PlaybookStage {
  id: string;
  title: string;
  intent: string;
  orderIndex: number;
  steps: PlaybookStep[];
}

export interface PlaybookQualityCheck {
  id: string;
  title: string;
  description: string;
  /** Points at the same free check registry the company's standards use. */
  checkId: string | null;
  checkConfig: Record<string, unknown>;
  orderIndex: number;
}

export interface Playbook {
  id: string;
  name: string;
  description: string;
  status: PlaybookStatus;
  version: number;
  departmentId: string | null;
  departmentName: string | null;
  skillId: string | null;
  updatedAt: string;
  stages: PlaybookStage[];
  qualityChecks: PlaybookQualityCheck[];
}

/**
 * The method one piece of work was actually done to.
 *
 * Taken when the work starts. Publishing a new version midway must not change
 * the steps the employee was given, or what the deliverable is read against.
 */
export interface PlaybookSnapshot {
  capturedAt: string;
  playbookId: string | null;
  name: string;
  version: number;
  stages: {
    title: string;
    intent: string;
    steps: { instruction: string; expectedOutput: string; required: boolean }[];
  }[];
  qualityChecks: {
    title: string;
    description: string;
    checkId: string | null;
    checkConfig: Record<string, unknown>;
  }[];
}

// --- Limits --------------------------------------------------------------

export const PLAYBOOK_NAME_MAX = 80;
export const PLAYBOOK_DESCRIPTION_MAX = 500;
export const STAGE_TITLE_MAX = 80;
export const STEP_INSTRUCTION_MIN = 5;
export const STEP_INSTRUCTION_MAX = 500;
export const MAX_STAGES = 10;
export const MAX_STEPS_PER_STAGE = 10;
export const MAX_QUALITY_CHECKS = 12;

// --- Presentation --------------------------------------------------------

export const playbookStatusLabel: Record<PlaybookStatus, string> = {
  draft: "Draft",
  active: "In use",
  archived: "Retired",
};

export const playbookStatusClass: Record<PlaybookStatus, string> = {
  draft: "bg-blue-50 text-blue-700",
  active: "bg-green-50 text-green-700",
  archived: "bg-zinc-100 text-zinc-500",
};
