/**
 * Methods a company can start from, keyed to the work they are methods for.
 *
 * Data rather than branching, and matched by skill id so a company that hires a
 * market analyst is offered the way this product knows market research is done
 * — without anything in the code knowing that Alex exists.
 *
 * None of these is installed automatically. A method the manager did not choose
 * would start shaping their employees' work in ways they never agreed to, and
 * they would be right to find that alarming.
 */
export interface PlaybookStepTemplate {
  instruction: string;
  expectedOutput: string;
  required?: boolean;
}

export interface PlaybookStageTemplate {
  title: string;
  intent: string;
  steps: PlaybookStepTemplate[];
}

export interface PlaybookQualityCheckTemplate {
  title: string;
  description: string;
  checkId?: string;
  checkConfig?: Record<string, number>;
}

export interface PlaybookTemplate {
  key: string;
  name: string;
  description: string;
  /** The work this is the method for. Used to offer it to the right department. */
  skillId: string;
  stages: PlaybookStageTemplate[];
  qualityChecks: PlaybookQualityCheckTemplate[];
}

export const PLAYBOOK_CATALOG: PlaybookTemplate[] = [
  {
    key: "market_research_standard",
    name: "Market Research",
    description:
      "How this company works out where a market stands and where the opening is.",
    skillId: "market_research",
    stages: [
      {
        title: "Define the market",
        intent:
          "Settle what is being looked at before looking, so the answer is about one thing.",
        steps: [
          {
            instruction:
              "State which market this is about, in the terms a buyer in it would use rather than the terms an analyst would.",
            expectedOutput: "One sentence naming the market and who buys in it.",
          },
          {
            instruction:
              "Say explicitly what is out of scope — adjacent markets that will not be covered here.",
            expectedOutput: "A short list of what this does not cover.",
            required: false,
          },
        ],
      },
      {
        title: "Map the competition",
        intent: "Establish who is already there, from their own material.",
        steps: [
          {
            instruction:
              "Identify the companies actually selling into this market. Use each company's own site as the primary source.",
            expectedOutput: "A named list of competitors, each with a source.",
          },
          {
            instruction:
              "For each, record what they claim to do and who they say it is for, in their words.",
            expectedOutput: "Positioning per competitor, cited.",
          },
        ],
      },
      {
        title: "Read the pricing",
        intent:
          "Find what the market actually charges, which is where positioning stops being talk.",
        steps: [
          {
            instruction:
              "Find published pricing for each competitor. Where pricing is not published, say so rather than estimating it.",
            expectedOutput: "Prices with sources, and an explicit gap where absent.",
          },
        ],
      },
      {
        title: "Find the opening",
        intent: "Turn the map into something the company can act on.",
        steps: [
          {
            instruction:
              "Name where the market is underserved, and say which evidence points there.",
            expectedOutput: "One or more openings, each tied to specific findings.",
          },
          {
            instruction:
              "Say what would have to be true for the company to take that opening.",
            expectedOutput: "The conditions, stated plainly.",
          },
        ],
      },
    ],
    qualityChecks: [
      {
        title: "Stands on at least three sources",
        description: "A conclusion drawn from one source is an anecdote.",
        checkId: "minimum_sources",
        checkConfig: { count: 3 },
      },
      {
        title: "Nothing asserted without evidence",
        description: "Every substantive section carries what it rests on.",
        checkId: "everything_cited",
      },
      {
        title: "Says where the evidence ran out",
        description: "Silence about a gap reads as an absence of the gap.",
        checkId: "states_limitations",
      },
      {
        title: "Competitors described from their own material",
        description:
          "Positioning taken from a third-party article is the article's opinion, not the competitor's claim.",
      },
    ],
  },
  {
    key: "sdr_outreach_standard",
    name: "SDR Outreach",
    description:
      "How this company decides which companies are worth approaching, and who to approach.",
    skillId: "lead_research",
    stages: [
      {
        title: "Fix the profile",
        intent:
          "Know what a fit looks like before searching, so the list is filtered rather than justified afterwards.",
        steps: [
          {
            instruction:
              "Restate the customer profile being worked to: industry, size, location, and the signals that suggest a fit.",
            expectedOutput: "The profile in concrete, checkable terms.",
          },
        ],
      },
      {
        title: "Find candidates",
        intent: "Cast wide, because filtering is cheaper than searching again.",
        steps: [
          {
            instruction:
              "Search for companies matching the profile. Prefer sources that list many companies over sources about one.",
            expectedOutput: "A candidate pool larger than the target count.",
          },
        ],
      },
      {
        title: "Verify each company",
        intent:
          "Establish that the company exists and is what it appeared to be, before anybody spends a call on it.",
        steps: [
          {
            instruction:
              "Confirm each candidate against its own website: what it does, roughly how big it is, and where it operates.",
            expectedOutput: "Verified facts per company, each cited.",
          },
          {
            instruction:
              "Drop any company you could not verify. Say how many were dropped and why.",
            expectedOutput: "A stated count of what did not survive verification.",
          },
        ],
      },
      {
        title: "Judge the fit",
        intent: "Say why this company, in terms the profile can be checked against.",
        steps: [
          {
            instruction:
              "For each surviving company, give the specific reason it fits the profile. Not 'growing SaaS company' — what about it fits.",
            expectedOutput: "One concrete fit reason per company.",
          },
        ],
      },
      {
        title: "Name the route in",
        intent: "A list with nobody to contact is a list of names.",
        steps: [
          {
            instruction:
              "For each company, name the role worth approaching and what would make that role care.",
            expectedOutput: "A buyer role and an angle per company.",
          },
        ],
      },
    ],
    qualityChecks: [
      {
        title: "Every company carries evidence",
        description: "A company nobody could verify is a wasted call.",
        checkId: "everything_cited",
      },
      {
        title: "Says what it could not establish",
        description:
          "Where the list came up short of the target, that is a finding, not a failure to hide.",
        checkId: "states_limitations",
      },
      {
        title: "Fit reasons are specific",
        description:
          "A reason that would apply to any company in the industry is not a reason.",
      },
    ],
  },
];

export function getPlaybookTemplate(key: string): PlaybookTemplate | undefined {
  return PLAYBOOK_CATALOG.find((template) => template.key === key);
}

/** What this company could adopt for work it actually does. */
export function templatesForSkills(skillIds: string[]): PlaybookTemplate[] {
  const wanted = new Set(skillIds);
  return PLAYBOOK_CATALOG.filter((template) => wanted.has(template.skillId));
}
