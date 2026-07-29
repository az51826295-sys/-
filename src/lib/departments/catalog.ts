/**
 * The departments a company can have, and what each is responsible for.
 *
 * Data rather than branching. Adding a department, or moving a skill from one
 * to another, is an edit here — nothing in the routing code knows that
 * Marketing exists.
 */
export interface DepartmentTemplate {
  name: string;
  description: string;
  /** Skill ids this department owns. A skill belongs to exactly one department,
   *  which is what makes "where does this work go" a question with one answer. */
  skillIds: string[];
}

export const DEPARTMENT_CATALOG: DepartmentTemplate[] = [
  {
    name: "Marketing",
    description:
      "Understands the market, the competition, and where the openings are.",
    skillIds: ["market_research"],
  },
  {
    name: "Sales",
    description:
      "Finds the companies worth approaching and works out who to talk to.",
    skillIds: ["lead_research"],
  },
  {
    name: "Product",
    description: "Shapes what the company builds and why.",
    skillIds: [],
  },
  {
    name: "Operations",
    description: "Keeps the company running day to day.",
    skillIds: [],
  },
  {
    name: "Customer Success",
    description: "Looks after customers once they have bought.",
    skillIds: [],
  },
];

/** Which department a skill belongs to, by name. Used when setting a company up
 *  and when a newly hired employee needs a home. */
export function departmentForSkill(skillId: string): DepartmentTemplate | undefined {
  return DEPARTMENT_CATALOG.find((department) =>
    department.skillIds.includes(skillId),
  );
}

/**
 * Where work with no matching department goes.
 *
 * An employee whose skill nobody has claimed still has to work somewhere, and
 * leaving them unassigned would make every "who is free" question quietly
 * wrong.
 */
export const FALLBACK_DEPARTMENT: DepartmentTemplate = {
  name: "Operations",
  description: "Keeps the company running day to day.",
  skillIds: [],
};
