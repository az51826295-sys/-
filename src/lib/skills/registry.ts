import { artBibleSkill } from "@/lib/skills/artBible";
import { leadResearchSkill } from "@/lib/skills/leadResearch";
import { marketResearchSkill } from "@/lib/skills/marketResearch";
import { SkillNotFoundError, type EmployeeSkill } from "@/lib/skills/types";

/**
 * Every way an employee can work. The execution engine looks a skill up by the
 * id on the employee's definition — adding an employee means adding an entry
 * here and a definition, never a branch in the engine.
 */
export const employeeSkillRegistry: Record<string, EmployeeSkill> = {
  market_research: marketResearchSkill,
  art_bible: artBibleSkill,
  lead_research: leadResearchSkill,
};

export function getEmployeeSkill(skillId: string): EmployeeSkill {
  const skill = employeeSkillRegistry[skillId];
  if (!skill) throw new SkillNotFoundError(skillId);
  return skill;
}
