import { z } from "zod";

/**
 * What an art bible has to contain to be worth anything.
 *
 * This is the first deliverable in the product that creates rather than
 * reports, and the shape reflects that: there are no sources, no citations, no
 * claims about the world to check. What replaces them is *self-consistency* —
 * an art bible is useful exactly to the degree that a later step can be checked
 * against it.
 *
 * So the schema is deliberately heavier on the machine-checkable parts than a
 * human writing one would bother with. The palette carries hex codes rather
 * than "warm brass"; the asset list carries counts and dimensions rather than
 * "a set of character sprites". Those are what let a generated file be
 * accepted or rejected later without anybody's opinion.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

export const paletteEntrySchema = z.object({
  /** What it is for, in the game's own terms: "time", "danger", "structure". */
  role: z.string(),
  hex: z.string().regex(HEX, "must be a #RRGGBB hex colour"),
  /** Where it appears, and — more usefully — where it must not. */
  usage: z.string(),
});

export const assetGroupSchema = z.object({
  /** "Player character", "Clockwork soldier", "Interior tileset". */
  name: z.string(),
  /** The filename prefix every file in this group starts with, so a finished
   *  folder can be matched against the plan without anybody reading it. */
  namePrefix: z.string(),
  /** How many distinct files this group must contain when it is finished.
   *  This is the number a later check counts against. */
  fileCount: z.number().int().min(1).max(2000),
  widthPx: z.number().int().min(8).max(8192),
  heightPx: z.number().int().min(8).max(8192),
  format: z.enum(["png", "svg", "jpg", "webp"]),
  transparentBackground: z.boolean(),
  /** States or variants this group covers — idle, run, hurt. Empty for things
   *  that have no states, like a background plate. */
  variants: z.array(z.string()),
  notes: z.string(),
});

export const artBibleOutputSchema = z.object({
  title: z.string(),

  /** The whole look in one sentence. If this cannot be written, the direction
   *  is not decided yet and everything below it will drift. */
  oneLine: z.string(),

  /** Why it looks like this — tied to what the game is about, not to taste. */
  rationale: z.string(),

  palette: z.array(paletteEntrySchema).min(3).max(16),

  /**
   * Colours, shapes or motifs that are forbidden, and why.
   *
   * Asked for explicitly because a bible made only of permissions does not
   * constrain anything. The rule that makes a palette mean something is the
   * one that says where its accent may *not* go.
   */
  forbidden: z.array(z.object({ rule: z.string(), reason: z.string() })).min(1),

  /** How every file is named, as a pattern plus an example. */
  namingConvention: z.object({ pattern: z.string(), example: z.string() }),

  /**
   * Twelve, not forty.
   *
   * The first real run of this produced twelve and a half thousand output
   * tokens — more than eight finished research reports put together — because
   * the ceiling invited an inventory. A bible is a specification, and a
   * specification that lists forty groups has stopped being read.
   *
   * The limit is doing real work here: it is the difference between a document
   * somebody uses and one nobody finishes, and it is also most of what the
   * deliverable costs.
   */
  assetGroups: z.array(assetGroupSchema).min(1).max(12),

  /** A reusable prompt skeleton with {placeholders}, so generating the hundredth
   *  asset is the same act as generating the first. */
  promptTemplate: z.string(),

  /** What the author could not settle and is handing back to the manager.
   *  Kept for the same reason research deliverables carry limitations: the
   *  gaps are the useful part. */
  openQuestions: z.array(z.string()),
});

export type ArtBibleOutput = z.infer<typeof artBibleOutputSchema>;

/** Every file this bible commits the company to producing. Used by the policy
 *  check that compares a finished folder against the plan. */
export function totalAssetCount(bible: ArtBibleOutput): number {
  return bible.assetGroups.reduce((sum, group) => sum + group.fileCount, 0);
}
