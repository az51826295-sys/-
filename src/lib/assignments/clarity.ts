// Kept free of server imports: this runs in the form as the manager types.

/**
 * How clearly an assignment has been written.
 *
 * The quality of what comes back from this product is decided almost entirely
 * before any work starts — by how well the manager said what they wanted. Until
 * now nothing told them that. "Research competitors" and "research what the
 * four main AI note-takers charge small teams in Korea, and where the gap is"
 * cost the same and produce very different work, and the difference was
 * invisible at the moment it was being made.
 *
 * Two things this deliberately is not:
 *
 * It is not a judgement of the idea. A vague assignment can be exactly the
 * right question to ask, and a precise one can be a waste of money. This scores
 * how much the employee has to guess, nothing else.
 *
 * It does not call a model. A score that cost money per keystroke would be
 * switched off, and one that ran on a delay would arrive after the manager had
 * already pressed submit. Every check here is arithmetic over the text.
 */
export interface ClarityCheck {
  id: string;
  /** What the manager reads when this is not satisfied. */
  hint: string;
  points: number;
  passed: boolean;
}

export interface ClarityScore {
  /** Out of 100. */
  score: number;
  band: "unclear" | "workable" | "clear";
  checks: ClarityCheck[];
  /** Unsatisfied checks, worst first. What to actually fix. */
  missing: ClarityCheck[];
}

export interface AssignmentText {
  title: string;
  description: string;
  expectedOutcome: string;
}

/**
 * Words that stand in for the thing the manager has not decided yet.
 *
 * Kept short and only lightly penalised. Everyday writing contains these
 * honestly, and a score that punished ordinary prose would teach people to
 * write stiffly rather than clearly.
 */
const VAGUE = [
  "대충",
  "알아서",
  "적당히",
  "아무거나",
  "그냥",
  "etc",
  "and so on",
  "whatever",
  "anything",
  "something about",
];

/** A number, a year, a currency figure, or a capitalised name — anything that
 *  anchors the request to a specific thing in the world. */
function hasConcreteAnchor(text: string): boolean {
  if (/\d/.test(text)) return true;
  // A capitalised word that is not simply the start of a sentence.
  if (/[a-z][.,]?\s+[A-Z][A-Za-z]{2,}/.test(text)) return true;
  // Korean proper nouns rarely capitalise; a quoted or bracketed term is the
  // equivalent signal that something specific is being named.
  if (/["'“”『「(]\S+/.test(text)) return true;
  return false;
}

export function scoreClarity(input: AssignmentText): ClarityScore {
  const title = input.title.trim();
  const description = input.description.trim();
  const outcome = input.expectedOutcome.trim();
  const all = `${title} ${description} ${outcome}`;

  const checks: ClarityCheck[] = [
    {
      id: "title",
      hint: "Say in one sentence what you want done.",
      points: 20,
      passed: title.length >= 12,
    },
    {
      id: "description",
      // The single biggest lever. An employee given only a title has to invent
      // the scope, and will invent a different one than the manager had.
      hint: "Add context — which market, which competitors, which customers.",
      points: 30,
      passed: description.length >= 40,
    },
    {
      id: "outcome",
      hint: "Say what a good result looks like, so they know when they're done.",
      points: 25,
      passed: outcome.length >= 20,
    },
    {
      id: "anchor",
      hint: "Name something specific — a company, a country, a number, a date.",
      points: 15,
      passed: hasConcreteAnchor(all),
    },
    {
      id: "not_vague",
      hint: "Replace the vague parts with what you actually want.",
      points: 10,
      passed: !VAGUE.some((word) => all.toLowerCase().includes(word)),
    },
  ];

  const score = checks.reduce(
    (sum, check) => sum + (check.passed ? check.points : 0),
    0,
  );

  return {
    score,
    // Three bands rather than five. The useful distinction is "they will have
    // to guess" versus "they won't", and a finer scale would imply a precision
    // this measurement does not have.
    band: score >= 80 ? "clear" : score >= 50 ? "workable" : "unclear",
    checks,
    missing: checks
      .filter((check) => !check.passed)
      .sort((a, b) => b.points - a.points),
  };
}

export const clarityBandLabel: Record<ClarityScore["band"], string> = {
  unclear: "They'll have to guess",
  workable: "Workable",
  clear: "Clear",
};

export const clarityBandClass: Record<ClarityScore["band"], string> = {
  unclear: "bg-amber-50 text-amber-800",
  workable: "bg-blue-50 text-blue-700",
  clear: "bg-green-50 text-green-700",
};
