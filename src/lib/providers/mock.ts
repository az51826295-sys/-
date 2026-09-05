import { mockUnityOutput } from "./mock-unity";
import type { AIProvider } from "./types";

/**
 * Deterministic stand-in for the model, used to exercise the execution
 * pipeline without spending API calls. It cites only the source ids present in
 * the prompt it was given, so citation validation is tested honestly rather
 * than bypassed.
 *
 * Refuses to load outside development — this must never serve real users.
 */
export function createMockAIProvider(): AIProvider {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Mock AI provider is not available in production.");
  }

  return {
    name: "mock",
    model: "mock-deterministic",

    async generateStructuredOutput({
      systemInstructions,
      input,
      schema,
      schemaName,
      tier = "judgment",
    }) {
      // The Unity calls are recognised by the **name of the shape they asked
      // for**, not by a heading in their prompt. Sniffing the text works only
      // while nobody rewrites it, and prompt text is prose written for a human
      // to read — it gets rewritten. A schema name changes when the shape
      // changes, which is the thing that actually has to be matched.
      const unity = mockUnityOutput(schemaName, input, systemInstructions);
      const output = unity ?? buildOutput(input);
      // Parsed through the same schema the real provider uses, so a shape the
      // pipeline couldn't handle fails here too.
      const parsed = schema.parse(output);
      return {
        output: parsed,
        inputTokens: 0,
        outputTokens: 0,
        // Reports the tier it was asked for, so a mock run shows which calls
        // would have been routed where. The name stays unpriced either way — a
        // test run must never appear as money.
        model: `mock-deterministic:${tier}`,
      };
    },
  };
}

function extractSourceIds(input: string): string[] {
  return [...input.matchAll(/<SOURCE id="([^"]+)">/g)].map((match) => match[1]);
}

function extractAssignmentTitle(input: string): string {
  const match = input.match(/^Title: (.+)$/m);
  return match ? match[1] : "the assignment";
}

function extractCompetitors(input: string): string[] {
  const match = input.match(/^Known competitors: (.+)$/m);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function buildOutput(input: string): unknown {
  // Each call is recognised by a heading only that prompt writes. Checked
  // before the source-count branches, which are specific to market research.
  if (input.includes("## Reference ids you may cite")) {
    return buildLearningOutput(input);
  }
  if (input.includes("## The organisation")) {
    return buildOperatingPlan(input);
  }
  if (input.includes("## Who is available")) {
    return buildOperatingReview(input);
  }
  if (input.includes("## Who works here")) {
    return buildProjectPlan(input);
  }
  if (input.includes("## What your team produced")) {
    return buildProjectBrief(input);
  }
  if (input.includes("## What this work was for")) {
    return buildWorkItemSummary(input);
  }
  if (input.includes("## What you have been asked for")) {
    return buildArtBible(input);
  }
  if (input.includes("## Colleagues you could ask")) {
    return buildCollaborationDecision(input);
  }
  if (input.includes("## What you found (")) {
    return buildInitiativeOutput(input);
  }
  if (input.includes("## Verified companies")) {
    return buildLeadListOutput(input);
  }
  if (input.includes("## The ideal customer, as the manager described it")) {
    return buildLeadPlanOutput(input);
  }
  if (input.includes("## What qualifies a company")) {
    return buildLeadCandidatesOutput(input);
  }

  // The observation-planning call has no sources yet and no observations, so it
  // is recognised by its own heading before the source-count branches.
  if (input.includes("## What the company does") && !input.includes("## Assignment")) {
    return buildObservationQueries(input);
  }

  const sourceIds = extractSourceIds(input);

  // No SOURCE blocks means this is the research-planning call.
  if (sourceIds.length === 0) {
    const competitors = extractCompetitors(input);
    const title = extractAssignmentTitle(input);

    const queries = competitors.length
      ? competitors.flatMap((name) => [
          `${name} pricing official`,
          `${name} product announcement`,
        ])
      : [
          `${title} pricing`,
          `${title} market overview`,
          `${title} recent changes`,
        ];

    return {
      objective: `Establish how the market around "${title}" currently looks, using public sources.`,
      questions: [
        "How does each competitor describe its product today?",
        "What pricing information is publicly available?",
        "Which customer segments does each competitor target?",
        "What recent product or positioning changes have occurred?",
      ],
      searchQueries: queries.slice(0, 6),
      preferredSourceTypes: [
        "official_pricing",
        "official_website",
        "official_announcement",
        "reputable_publication",
      ],
    };
  }

  // Otherwise it is the deliverable call. Every factual-sounding section gets a
  // citation drawn from the ids actually supplied.
  const sections = sourceIds.slice(0, 4).map((id, index) => ({
    heading: `Finding ${index + 1}`,
    content:
      "The reviewed source describes this company's positioning around customer support automation, and its public materials emphasise breadth of product surface.",
    citations: [id],
  }));

  sections.push({
    heading: "Where we differ",
    content:
      "Against that backdrop, a narrower focus on smaller teams reads as a genuine gap rather than a smaller version of the same product.",
    citations: [],
  });

  return {
    title: "Competitive Landscape Analysis",
    executiveSummary:
      "The reviewed competitors position around broad customer support suites. The clearest opening is simplicity and speed of setup for smaller teams.",
    sections,
    keyImplications: [
      "Position around simpler setup rather than feature count.",
      "Make pricing legible where competitors are opaque.",
    ],
    recommendedNextSteps: [
      "Run a verified pricing comparison across the reviewed competitors.",
      "Review recent public customer complaints for recurring themes.",
    ],
    limitations: [
      "Public pricing was not directly comparable across every competitor reviewed.",
      "This run used a deterministic stand-in for the analyst model, so the wording is illustrative.",
    ],
    appliedMemoryIds: extractMemoryIds(input),
  };
}

function extractMemoryIds(input: string): string[] {
  const section = input.split("## What you have learned on previous assignments")[1];
  if (!section) return [];
  return [...section.matchAll(/^- \[([0-9a-f-]{36})\]/gm)].map((match) => match[1]);
}

function extractSourceBlocks(
  input: string,
): { id: string; domain: string; url: string; title: string }[] {
  return [
    ...input.matchAll(
      /<SOURCE id="([^"]+)" domain="([^"]*)">\nTitle: ([^\n]*)\nURL: ([^\n]*)/g,
    ),
  ].map((match) => ({
    id: match[1],
    domain: match[2],
    title: match[3],
    url: match[4],
  }));
}

function buildLeadPlanOutput(input: string): unknown {
  const industries =
    input.match(/^Industries: (.+)$/m)?.[1]?.split(",").map((s) => s.trim()) ?? [];
  const roles = input.match(/^Buyer roles: (.+)$/m)?.[1] ?? "Head of Customer Support";

  const base = industries.length ? industries : ["B2B SaaS"];

  return {
    objective: `Find companies matching the manager's ideal customer profile in ${base.join(", ")}.`,
    qualificationCriteria: [
      {
        field: "industry",
        description: `The company operates in ${base.join(" or ")}.`,
        importance: "required",
      },
      {
        field: "growth_signal",
        description: "The company shows a public sign of growing customer operations.",
        importance: "preferred",
      },
    ],
    exclusionCriteria: ["Agencies", "Consultancies"],
    companySearchQueries: [
      ...base.map((industry) => `${industry} company hiring customer support manager`),
      ...base.map((industry) => `${industry} company careers customer experience`),
    ].slice(0, 6),
    buyerRoles: roles.split(",").map((role) => role.trim()).filter(Boolean),
    evidenceRequirements: [
      "Official company website",
      "Public job listing or company announcement",
    ],
  };
}

/**
 * The company a page is *about*, not the site hosting the page.
 *
 * This is the judgement the real model is asked to make, so the stand-in has to
 * make it too — a mock that returned the host domain would let a job board
 * through as a lead and the dedupe and identity rules would never be tested.
 */
function companyMentionedIn(title: string): string | null {
  const at = title.match(/\bat\s+([A-Z][A-Za-z0-9&.\- ]{2,30})/);
  if (at) return at[1].trim().replace(/\s+$/, "");

  const dash = title.match(/^([A-Z][A-Za-z0-9&.]{2,20})\s*[|\-–]/);
  return dash ? dash[1].trim() : null;
}

function domainFrom(companyName: string): string {
  const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return slug ? `${slug}.com` : "";
}

function buildLeadCandidatesOutput(input: string): unknown {
  const blocks = extractSourceBlocks(input);
  const byCompany = new Map<string, { name: string; sourceIds: string[] }>();

  for (const block of blocks) {
    const name = companyMentionedIn(block.title);
    if (!name) continue;
    const domain = domainFrom(name);
    if (!domain) continue;

    const existing = byCompany.get(domain);
    if (existing) {
      existing.sourceIds.push(block.id);
    } else {
      byCompany.set(domain, { name, sourceIds: [block.id] });
    }
  }

  const candidates = [...byCompany.entries()]
    .slice(0, 8)
    .map(([domain, company]) => ({
      companyName: company.name,
      websiteUrl: `https://${domain}`,
      industry: "B2B SaaS",
      companyDescription:
        "A software company whose public pages describe a customer-facing support operation.",
      employeeRange: { min: 0, max: 0, label: "" },
      location: "United States",
      fitReasons: [
        "The company's public pages describe a business model in the target industry.",
      ],
      buyingSignals: [
        {
          type: "hiring",
          description: "The company is advertising a customer support role.",
          observedAt: "",
          sourceIds: [company.sourceIds[0]],
        },
      ],
      recommendedBuyerRoles: ["Head of Customer Support"],
      verifiedContacts: [],
      publicContactEmail: "",
      qualificationNotes: "Matches the target industry.",
      excluded: false,
      exclusionReason: "",
      identitySourceIds: company.sourceIds,
    }));

  // One deliberately excluded company, so the exclusion path is exercised on
  // every run rather than only when the web happens to supply an agency.
  if (candidates.length > 0) {
    candidates.push({
      ...candidates[0],
      companyName: "Brightline Consulting Agency",
      websiteUrl: "https://brightlineconsultingagency.com",
      companyDescription: "A marketing agency serving software companies.",
      excluded: false,
      exclusionReason: "",
    });
  }

  return { candidates };
}

function buildLeadListOutput(input: string): unknown {
  const ids = [...input.matchAll(/\[id: ([0-9a-f-]{36})\]/g)].map((match) => match[1]);
  const requested = Number(input.match(/^Companies wanted: (\d+)$/m)?.[1] ?? "20");

  return {
    title: "Qualified Prospect List",
    executiveSummary:
      "These companies match the target profile and each has at least one verified source behind it. This run used a deterministic stand-in for the model, so the wording is illustrative.",
    targetProfileSummary: {
      industries: ["B2B SaaS"],
      locations: ["United States"],
      employeeRange: "",
      keySignals: ["Hiring support agents"],
    },
    leads: ids.map((id, index) => ({
      leadCandidateId: id,
      fitReasons: [
        "Operates in the target industry and shows a public sign of growing customer operations.",
      ],
      recommendedBuyerRoles: ["Head of Customer Support"],
      rank: index + 1,
    })),
    researchLimitations:
      ids.length < requested
        ? ["Fewer companies met the evidence requirements than were requested."]
        : [],
    recommendedNextSteps: [
      "Confirm the current owner of customer support at each company before reaching out.",
    ],
  };
}

/**
 * One task per employee, with the second waiting on the first.
 *
 * Deliberately builds a two-wave plan even when the work would parallelise, so
 * dependency ordering is actually exercised rather than assumed.
 */
function buildOperatingPlan(input: string): unknown {
  const departments = [...input.matchAll(/^- ([A-Z][A-Za-z ]+)$/gm)].map((match) =>
    match[1].trim(),
  );

  if (departments.length === 0) {
    return {
      summary: "",
      phases: [],
      firstProject: { title: "", goal: "", expectedOutcome: "", reasoning: "" },
      risks: [],
      cannotPlan: true,
      cannotPlanReason: "There are no departments to carry this out.",
    };
  }

  return {
    summary:
      "Two phases: understand the market first, then build a pipeline against what we learn. This run used a deterministic stand-in for the model, so the wording is illustrative.",
    phases: [
      {
        name: "Understand the market",
        intent:
          "Establish who else is in this market and which customers are underserved.",
        departments: [departments[0]],
        startsAfter: "",
      },
      {
        name: "Build the pipeline",
        intent: "Find and qualify companies matching what the first phase found.",
        departments: [departments[1] ?? departments[0]],
        startsAfter: "Understand the market",
      },
    ],
    firstProject: {
      title: "Customer Support AI Market Opportunity",
      goal: "Analyze the customer support AI market and identify companies we should target.",
      expectedOutcome:
        "A market overview, recommended customer segments, and a verified prospect list.",
      reasoning: "Nothing else can be scoped until we know which segment to chase.",
    },
    risks: ["Public company-size information may be inconsistent."],
    cannotPlan: false,
    cannotPlanReason: "",
  };
}

/**
 * Always returns one runnable recommendation and one for the manager, so both
 * approval paths are exercised. The real model is expected to recommend
 * nothing much of the time; that restraint is what a live run tests.
 */
function buildOperatingReview(input: string): unknown {
  const finishedNothing = input.includes("## Finished\nNothing yet.");

  return {
    summary: finishedNothing
      ? "Nothing has finished yet, so there is not much to judge. This run used a deterministic stand-in for the model, so the wording is illustrative."
      : "The market work is done and points at a single segment. This run used a deterministic stand-in for the model, so the wording is illustrative.",
    blockers: input.includes("## Waiting on the manager\nNothing.")
      ? []
      : ["Work is waiting on your review."],
    recommendations: [
      {
        title: "Build a prospect list for the recommended segment",
        reasoning:
          "The market read named a segment; turning it into companies is the next thing that moves the objective.",
        projectGoal:
          "Find and verify companies matching the recommended customer segment.",
        projectOutcome: "A verified prospect list with fit reasons and evidence.",
        priority: "high",
        needsManagerAction: false,
      },
      {
        title: "Decide which segment to commit to",
        reasoning:
          "Two segments look comparable on the evidence and picking one is a judgement call, not research.",
        projectGoal: "",
        projectOutcome: "",
        priority: "normal",
        needsManagerAction: true,
      },
    ],
    objectiveLooksMet: false,
  };
}

/**
 * Two work items, the second waiting on the first.
 *
 * Deliberately builds a dependency even where the work would parallelise, so
 * the ordering, the queueing and the handoff of one item's output into the
 * next are all actually exercised rather than assumed.
 */
function buildProjectPlan(input: string): unknown {
  const employees = [...input.matchAll(/^- employeeId: ([0-9a-f-]+)$/gim)].map(
    (match) => match[1],
  );
  const skills = [...input.matchAll(/^ {2}skillId: ([a-z0-9_]+)/gim)].map(
    (match) => match[1],
  );

  if (employees.length === 0) {
    return {
      projectSummary: "",
      successCriteria: [],
      workItems: [],
      finalDeliverable: { title: "", sections: [] },
      risks: [],
      assumptions: [],
      cannotPlan: true,
      cannotPlanReason: "Nobody is available to take this on.",
    };
  }

  const workItems = employees.slice(0, 2).map((employeeId, index) => ({
    clientId: index === 0 ? "market-analysis" : "lead-research",
    title:
      index === 0
        ? "Analyze the customer support AI market"
        : "Find companies in the recommended segments",
    objective:
      index === 0
        ? "Research the major competitors, their positioning and pricing, and work out which customer segments look most attractive. This run used a deterministic stand-in for the model, so the wording is illustrative."
        : "Using the segments identified in the market analysis, find and verify companies that match them.",
    expectedOutcome:
      index === 0
        ? "A sourced market read with recommended customer segments."
        : "A verified list of companies with fit reasons and evidence.",
    requiredSkillId: skills[index] ?? skills[0] ?? "market_research",
    recommendedCompanyEmployeeId: employeeId,
    assigneeRationale:
      index === 0
        ? "This piece decides which segments the rest of the project aims at, so it needs somebody who will say what they could not establish rather than fill the gap."
        : "Verifying that a company is real and a fit is different work from reading a market, and this list is going to be contacted by a person.",
    priority: index === 0 ? "high" : "normal",
    executionMode: index === 0 ? "parallel" : "after_dependencies",
    dependencyClientIds: index === 0 ? [] : ["market-analysis"],
    inputFromDependencies:
      index === 0
        ? []
        : [
            {
              dependencyClientId: "market-analysis",
              inputType: "structured_output",
              description:
                "Use the recommended customer segments from the market analysis.",
            },
          ],
    // Deliberately not the schema default: a plan that always reproduced the
    // default would never show whether the plan's own sizing is what runs.
    roleInput:
      index === 0 ? [] : [{ key: "targetCount", value: "12" }],
    requiredForProjectCompletion: true,
  }));

  return {
    projectSummary:
      "Split into two pieces: establish the market first, then find the companies worth approaching once we know what we are looking for.",
    successCriteria: [
      "Explain the competitive landscape",
      "Identify attractive customer segments",
      "Provide a verified list of potential customers",
    ],
    workItems,
    finalDeliverable: {
      title: "Customer Support AI Market Opportunity Brief",
      sections: [
        "Executive Summary",
        "Market Landscape",
        "Recommended Customer Segments",
        "Priority Prospects",
        "Recommended Next Steps",
      ],
    },
    risks: ["Public company-size information may be inconsistent."],
    assumptions: ["The project should use the company's current customer profile."],
    cannotPlan: false,
    cannotPlanReason: "",
  };
}

function buildWorkItemSummary(input: string): unknown {
  const ids = (input.match(/## Ids you may cite\n(.+)/)?.[1] ?? "")
    .split(", ")
    .map((id) => id.trim())
    .filter((id) => id && id !== "(none — cite nothing)");

  return {
    objective: "Deliver this piece of the project.",
    completedOutcome:
      "The work was completed. This run used a deterministic stand-in for the model, so the wording is illustrative.",
    keyFindings: ["Mid-market SaaS companies appear underserved."],
    recommendations: ["Target SaaS companies with 50–300 employees."],
    // Deliberately includes one id that was never offered, to prove the
    // citation filter drops it rather than passing it to the manager.
    citationIds: [...ids.slice(0, 2), "source-that-does-not-exist"],
  };
}

function buildProjectBrief(input: string): unknown {
  const contributors = [...input.matchAll(/^### ([^,]+), (.+)$/gm)].map((match) => ({
    name: match[1].trim(),
    role: match[2].trim(),
  }));
  const workItemIds = [...input.matchAll(/^workItemId: ([0-9a-f-]+)$/gim)].map(
    (match) => match[1],
  );
  const ids = (input.match(/## Ids you may cite\n(.+)/)?.[1] ?? "")
    .split(", ")
    .map((id) => id.trim())
    .filter((id) => id && id !== "(none — cite nothing)");

  return {
    title: "Customer Support AI Market Opportunity Brief",
    executiveSummary:
      "Two pieces of work, brought together. This run used a deterministic stand-in for the model, so the wording is illustrative.",
    projectGoal: "Assess the market and identify companies worth approaching.",
    keyFindings: [
      {
        title: "The market read and the prospect list point at the same segment",
        summary:
          "Both contributions converge on mid-market B2B SaaS companies with growing support teams.",
        supportingWorkItemIds: workItemIds.slice(0, 2),
        citationIds: [...ids.slice(0, 1), "fabricated-source-id"],
      },
    ],
    employeeContributions: contributors.map((contributor, index) => ({
      employeeName: contributor.name,
      role: contributor.role,
      workItemTitle:
        index === 0
          ? "Analyze the customer support AI market"
          : "Find companies in the recommended segments",
      summary: `${contributor.name} completed their part of this project.`,
    })),
    recommendations: [
      {
        recommendation:
          "Focus outbound sales on mid-market B2B SaaS companies with growing support teams.",
        rationale:
          "This segment showed the strongest fit and produced the most verified prospects.",
        priority: "high",
        supportingWorkItemIds: workItemIds.slice(0, 2),
        citationIds: ids.slice(0, 1),
      },
    ],
    actionPlan: [
      {
        action: "Review the verified prospects",
        ownerSuggestion: "You",
        timing: "This week",
        reason: "Nothing should be contacted before you have seen the list.",
      },
    ],
    limitations: [
      "This brief was assembled by a deterministic stand-in rather than by reading the underlying work.",
    ],
  };
}

/**
 * Always asks for help, so the collaboration path is actually exercised. The
 * real model is expected to say no most of the time; that judgement is what the
 * live run tests, not this.
 */
/**
 * A stand-in art bible.
 *
 * Built to pass the skill's own self-consistency checks, and that is the whole
 * point rather than an incidental detail: every hex named in a rule is in the
 * palette, no two groups share a filename prefix, no group claims more states
 * than files, and the prompt template carries a palette colour. A fixture that
 * failed any of those would make every mock run look like a bug in the skill,
 * which is exactly the confusion the mock exists to prevent.
 *
 * The numbers are deliberately specific for the same reason the real prompt
 * insists on them. A placeholder full of round guesses would let a change that
 * breaks the counting slip through here and only show up on a paid run.
 */
function buildArtBible(input: string): unknown {
  const title = input.match(/^## What you have been asked for\n(.+)$/m)?.[1] ?? "the work";

  return {
    title: `Art Bible — ${title.slice(0, 60)}`,
    oneLine:
      "One accent colour carries the whole idea; everything else gets out of its way.",
    rationale:
      "This run used a deterministic stand-in for the model, so the wording is illustrative. The structure is the contract a real bible has to meet: every line something a finished file could pass or fail.",
    palette: [
      {
        role: "Background",
        hex: "#1A1614",
        usage: "The furthest layer. Never on a character.",
      },
      {
        role: "Structure",
        hex: "#4A3F35",
        usage: "Floors, platforms, anything you stand on.",
      },
      {
        role: "Primary material",
        hex: "#8B6F47",
        usage: "Machinery, pipes, fittings.",
      },
      {
        role: "Accent",
        hex: "#4FE3C1",
        usage: "The one mechanic that matters, and nothing else.",
      },
      {
        role: "Danger",
        hex: "#D14B3A",
        usage: "Incoming damage only.",
      },
    ],
    forbidden: [
      {
        rule: "#4FE3C1 appears only on the core mechanic",
        reason:
          "The moment it becomes decoration the player stops reading it as meaning anything.",
      },
      {
        rule: "No pure black; #1A1614 is the floor",
        reason: "Pure black reads as a hole in the screen rather than a dark room.",
      },
    ],
    namingConvention: {
      pattern: "{group}_{subject}_{state}_{nn}.png",
      example: "char_lead_idle_01.png",
    },
    assetGroups: [
      {
        name: "Player character",
        namePrefix: "char_lead_",
        fileCount: 48,
        widthPx: 512,
        heightPx: 512,
        format: "png",
        transparentBackground: true,
        variants: ["idle", "run", "jump", "dash", "hurt", "death"],
        notes: "Eight frames per state.",
      },
      {
        name: "Standard enemy",
        namePrefix: "enemy_basic_",
        fileCount: 24,
        widthPx: 512,
        heightPx: 512,
        format: "png",
        transparentBackground: true,
        variants: ["idle", "walk", "attack", "break"],
        notes: "Six frames per state.",
      },
      {
        name: "Tileset",
        namePrefix: "tile_",
        fileCount: 48,
        widthPx: 32,
        heightPx: 32,
        format: "png",
        transparentBackground: true,
        variants: [],
        notes: "Seamless against adjacent tiles.",
      },
      {
        name: "UI icons",
        namePrefix: "icon_",
        fileCount: 24,
        widthPx: 64,
        heightPx: 64,
        format: "png",
        transparentBackground: true,
        variants: [],
        notes: "One pixel outline in #1A1614.",
      },
    ],
    promptTemplate: [
      "2D game sprite, side view, {subject}, {state} pose,",
      "palette limited to #1A1614 #4A3F35 #8B6F47, accent #4FE3C1 only on {mechanic},",
      "1px outline #1A1614, flat orthographic, no perspective,",
      "transparent background, {width}x{height}",
    ].join("\n"),
    openQuestions: [
      "How many playable characters there are",
      "Whether backgrounds animate or are static plates",
      "Target platform, which decides the minimum readable sprite size",
    ],
  };
}

function buildCollaborationDecision(input: string): unknown {
  const capability = input.match(/^- \[([a-z_]+)\]/m)?.[1];

  if (!capability) {
    return {
      needsHelp: false,
      capabilityId: "",
      requestTitle: "",
      requestDescription: "",
      whyNeeded: "",
    };
  }

  return {
    needsHelp: true,
    capabilityId: capability,
    requestTitle: "Qualify the companies surfaced by this research",
    requestDescription:
      "Take the companies that came up in this research and check which of them match our ideal customer profile, with a reason and a source for each. This run used a deterministic stand-in for the model, so the wording is illustrative.",
    whyNeeded:
      "The report should say which of these companies are worth approaching, and that is not something I can verify myself.",
  };
}

function buildObservationQueries(input: string): unknown {
  const competitors = extractCompetitors(input);
  const base = competitors.length ? competitors : ["customer support software"];

  return {
    queries: base.flatMap((name) => [
      `${name} product launch announcement`,
      `${name} pricing change`,
    ]),
  };
}

/**
 * One proposal, cited to a real observation, plus one that cites an id nobody
 * collected. The second is there on purpose: it proves the server discards
 * proposals built on invented evidence rather than trusting the model.
 */
function buildInitiativeOutput(input: string): unknown {
  const ids = [...input.matchAll(/<OBSERVATION id="([0-9a-f-]{36})"/g)].map(
    (match) => match[1],
  );

  if (ids.length === 0) return { proposals: [], nothingNoteworthy: true };

  return {
    nothingNoteworthy: false,
    proposals: [
      {
        title: "A competitor shipped something worth looking at",
        summary:
          "One of the pages reviewed describes a competitor announcing a change to their product. This run used a deterministic stand-in for the model, so the wording is illustrative.",
        recommendation:
          "Analyse what this changes about how we position against them.",
        reasoning:
          "A shipped change alters the comparison a buyer makes, which is the comparison our positioning has to answer.",
        kind: "product_launch",
        priority: "normal",
        confidence: "high",
        signalKey: "mock-competitor-product-change",
        observationIds: [ids[0]],
        assignmentTitle: "Analyse the competitor's product change",
        assignmentDescription:
          "Review what the competitor announced, what it changes for buyers comparing us, and what we should say differently as a result.",
        assignmentExpectedOutcome:
          "A short evidence-backed read on what changed and what to do about it.",
      },
      {
        title: "A proposal with no real evidence behind it",
        summary: "Cites an observation that was never collected.",
        recommendation: "This should never reach the manager.",
        reasoning: "Included so the evidence check can be seen working.",
        kind: "other",
        priority: "low",
        confidence: "high",
        signalKey: "mock-fabricated-evidence",
        observationIds: ["00000000-0000-0000-0000-000000000000"],
        assignmentTitle: "Should not be created",
        assignmentDescription: "Should not be created.",
        assignmentExpectedOutcome: "Nothing.",
      },
    ],
  };
}

/** One candidate per manager comment, cited to that comment. Enough to exercise
 *  validation, deduplication and persistence without a model call. */
function buildLearningOutput(input: string): unknown {
  const reviewIds = [...input.matchAll(/^- deliverable_review ([0-9a-f-]{36})$/gm)].map(
    (match) => match[1],
  );

  return {
    candidates: reviewIds.slice(0, 2).map((id, index) => ({
      category: "manager_preference",
      title: `Manager preference ${index + 1}`,
      content:
        "State the limitation explicitly when a specific competitor's public pricing cannot be verified, rather than estimating a figure.",
      reason: "Recorded from a review comment on this assignment.",
      confidence: "high",
      sourceType: "manager_feedback",
      sourceReferences: [{ type: "deliverable_review", id }],
    })),
    // Exactly one, and only when there was a review to draw it from. The real
    // bar is "most assignments produce none", and a stand-in that proposed
    // something every time would make the approval queue look busy in testing
    // and quiet in production — the wrong way round for finding problems.
    organizationCandidates:
      reviewIds.length > 0
        ? [
            {
              title: "Report missing public pricing rather than estimating it",
              summary:
                "Enterprise vendors frequently publish no pricing at all. Record the absence as a finding rather than treating it as a research failure or filling the gap with an estimate.",
              reason:
                "This holds for anyone here researching a market, not just for the person who hit it on this assignment.",
              category: "best_practice",
              confidence: "medium",
            },
          ]
        : [],
  };
}
