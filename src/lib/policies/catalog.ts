import type { PolicyCategory, PolicyPriority } from "@/lib/policies/types";

/**
 * Standards a company can adopt as written, and edit from there.
 *
 * Data rather than defaults applied behind the manager's back. Nothing here is
 * installed automatically: a company's way of working is the manager's to
 * decide, and a policy nobody chose would still block their work.
 */
export interface PolicyRuleTemplate {
  title: string;
  instruction: string;
  priority: PolicyPriority;
  /** Set only where the rule can be checked for free. */
  checkId?: string;
  checkConfig?: Record<string, number>;
}

export interface PolicyTemplate {
  key: string;
  name: string;
  category: PolicyCategory;
  description: string;
  rules: PolicyRuleTemplate[];
}

export const POLICY_CATALOG: PolicyTemplate[] = [
  {
    key: "brand_standards",
    name: "Brand Standards",
    category: "brand",
    description: "How the company sounds, and what it will not claim.",
    rules: [
      {
        title: "Write plainly",
        instruction:
          "Write in plain, direct language. Prefer short sentences. Do not use marketing superlatives or filler that adds length without adding meaning.",
        priority: "required",
      },
      {
        title: "No overstatement",
        instruction:
          "Never describe something as the best, the only, the fastest or the market leader unless a cited source says so in those terms. Where the evidence supports a weaker claim, make the weaker claim.",
        priority: "required",
      },
      {
        title: "Numbers come with their source",
        instruction:
          "Every figure — market size, price, headcount, growth rate — is stated together with where it came from and as of when. A number with no source does not go in.",
        priority: "required",
        checkId: "everything_cited",
      },
      {
        title: "Speak to the reader, not about them",
        instruction:
          "Address the manager directly. Do not write about 'the client' or 'the user' when you mean the person reading this.",
        priority: "recommended",
      },
      {
        title: "Name the company consistently",
        instruction:
          "Use the company's name exactly as it is written in the company profile. Do not abbreviate it, translate it, or invent a shorter form.",
        priority: "recommended",
      },
      {
        title: "No hedging as a substitute for evidence",
        instruction:
          "Do not soften a claim with 'may', 'could' or 'reportedly' to avoid needing evidence. Either the evidence supports it and you cite it, or you say you could not establish it.",
        priority: "recommended",
      },
    ],
  },
  {
    key: "research_standards",
    name: "Research Standards",
    category: "research",
    description: "What counts as evidence here.",
    rules: [
      {
        title: "At least three sources",
        instruction:
          "Any conclusion the manager might act on rests on at least three separate sources. One source is an anecdote.",
        priority: "required",
        checkId: "minimum_sources",
        checkConfig: { count: 3 },
      },
      {
        title: "Never present an inference as a fact",
        instruction:
          "Separate what the sources say from what you concluded from them. If you reasoned your way to something, say that is what you did.",
        priority: "required",
      },
      {
        title: "Say what you couldn't find out",
        instruction:
          "State what you tried to establish and could not. Silence about a gap reads as an absence of the gap.",
        priority: "required",
        checkId: "states_limitations",
      },
      {
        title: "Prefer recent evidence",
        instruction:
          "Where sources disagree and one is materially newer, lead with the newer one and say the older one differs. Date anything time-sensitive.",
        priority: "recommended",
      },
      {
        title: "Primary over secondary",
        instruction:
          "A company's own pricing page beats an article about its pricing. Where you have both, cite the primary source.",
        priority: "recommended",
      },
    ],
  },
  {
    key: "review_standards",
    name: "Review Standards",
    category: "review",
    description: "What every piece of work must contain before it reaches you.",
    rules: [
      {
        title: "Opens with what it found",
        instruction:
          "Start with a summary that stands on its own. A manager who reads only that paragraph should know what you found and what it means.",
        priority: "required",
        checkId: "requires_summary",
      },
      {
        title: "Ends with what to do",
        instruction:
          "Finish with concrete next steps. Not 'consider exploring' — say what to do, and why that and not something else.",
        priority: "required",
        checkId: "requires_action_items",
        checkConfig: { count: 2 },
      },
      {
        title: "Nothing unsupported",
        instruction:
          "Every substantive section carries the evidence it rests on. A section that asserts and cites nothing does not go in.",
        priority: "required",
        checkId: "everything_cited",
      },
      {
        title: "Length follows the evidence",
        instruction:
          "A short piece of work with solid evidence is better than a long one padded to look thorough. Do not restate the assignment back to the manager.",
        priority: "recommended",
      },
    ],
  },
  {
    key: "sales_standards",
    name: "Sales Standards",
    category: "sales",
    description: "Who the company approaches, and how.",
    rules: [
      {
        title: "Fit before volume",
        instruction:
          "A company that does not match the customer profile does not go on the list, however hard it was to find. Twelve companies that fit beat fifty that might.",
        priority: "required",
      },
      {
        title: "Every company on the list is evidenced",
        instruction:
          "Each company you put forward carries evidence that it exists, what it does, and why it fits. A company you could not verify is left off and named as unverified.",
        priority: "required",
        checkId: "everything_cited",
      },
      {
        title: "Never disparage a competitor",
        instruction:
          "Describe competitors factually and with sources. Do not characterise their product as bad, failing or inferior, even where a source does.",
        priority: "required",
      },
      {
        title: "Don't lead with price",
        instruction:
          "Do not propose pricing or discounts in outreach material. Pricing is a conversation the manager decides to have.",
        priority: "required",
      },
      {
        title: "Say who to talk to and why",
        instruction:
          "For each company, name the role worth approaching and what would make that role care. A list with no route in is a list of names.",
        priority: "recommended",
      },
    ],
  },
  {
    key: "security_standards",
    name: "Security Standards",
    category: "security",
    description: "What must never appear in work that leaves the company.",
    rules: [
      {
        title: "No keys or credentials",
        instruction:
          "Never write an API key, token, password or connection string into work, even one you found in a public source.",
        priority: "required",
        checkId: "no_credentials",
      },
      {
        title: "Keep internal detail internal",
        instruction:
          "Do not restate the company's internal plans, unreleased products, customer names or revenue in work intended to go outside the company.",
        priority: "required",
      },
      {
        title: "No personal contact details in written material",
        instruction:
          "Do not include named individuals' email addresses or phone numbers in reports and written material. Scope this to the departments that produce outward-facing writing — a prospect list carries contact details by design.",
        priority: "recommended",
        checkId: "no_personal_contact_details",
      },
    ],
  },
];

export function getPolicyTemplate(key: string): PolicyTemplate | undefined {
  return POLICY_CATALOG.find((template) => template.key === key);
}
