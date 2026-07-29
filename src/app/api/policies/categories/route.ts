import { NextResponse } from "next/server";
import { POLICY_CATALOG } from "@/lib/policies/catalog";
import { listPolicyChecks } from "@/lib/policies/checks";
import {
  POLICY_CATEGORIES,
  policyCategoryDescription,
  policyCategoryLabel,
} from "@/lib/policies/types";

/** What a company can adopt, and what can be checked without spending. Static:
 *  none of it depends on who is asking. */
export async function GET() {
  return NextResponse.json({
    categories: POLICY_CATEGORIES.map((category) => ({
      id: category,
      label: policyCategoryLabel[category],
      description: policyCategoryDescription[category],
      templates: POLICY_CATALOG.filter(
        (template) => template.category === category,
      ).map((template) => ({
        key: template.key,
        name: template.name,
        description: template.description,
        ruleCount: template.rules.length,
      })),
    })),
    checks: listPolicyChecks().map((check) => ({
      id: check.id,
      label: check.label,
      description: check.description,
      config: check.config ?? null,
    })),
  });
}
