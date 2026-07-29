import { Markdown } from "@/components/Markdown";
import type { LeadListDeliverable } from "@/lib/leads/types";
import type { ProjectBrief } from "@/lib/projects/types";
import { LeadListViewer, type EvidenceSource } from "./LeadListViewer";
import {
  ProjectBriefViewer,
  type ContributionLink,
} from "./ProjectBriefViewer";

/**
 * Picks the viewer for a deliverable type.
 *
 * The route, the review actions, the versioning and the sources list are shared
 * by every employee; only the body differs. A market research report is a
 * document, a lead list is a table, and neither should be forced into the
 * other's shape.
 */
export function DeliverableBody({
  deliverableType,
  contentMarkdown,
  contentJson,
  sources,
  employeeName,
  deliverableId,
  contributions,
}: {
  deliverableType: string;
  contentMarkdown: string;
  contentJson: unknown;
  sources: EvidenceSource[];
  employeeName: string;
  deliverableId: string;
  /** Only a project brief has these — the links back to each employee's own
   *  work behind the merged result. */
  contributions?: ContributionLink[];
}) {
  if (deliverableType === "project_brief" && isProjectBrief(contentJson)) {
    return (
      <ProjectBriefViewer brief={contentJson} contributions={contributions ?? []} />
    );
  }

  if (deliverableType === "lead_list" && isLeadList(contentJson)) {
    return (
      <LeadListViewer
        deliverable={contentJson}
        sources={sources}
        employeeName={employeeName}
        canExport
        deliverableId={deliverableId}
      />
    );
  }

  return (
    <article className="mt-6 rounded-lg border border-zinc-200 p-8">
      <Markdown>{contentMarkdown}</Markdown>
    </article>
  );
}

/** A lead list stored before this shape existed, or one that failed to save
 *  properly, falls back to the markdown rather than rendering an empty table. */
function isLeadList(value: unknown): value is LeadListDeliverable {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as LeadListDeliverable).leads)
  );
}

/** A brief stored before this shape existed falls back to the markdown rather
 *  than rendering an empty document. */
function isProjectBrief(value: unknown): value is ProjectBrief {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ProjectBrief).executiveSummary === "string" &&
    Array.isArray((value as ProjectBrief).employeeContributions)
  );
}

/** Whether this deliverable type keeps its own sources section. The lead list
 *  attaches evidence per row, so a second flat list underneath is noise. */
export function rendersOwnSources(deliverableType: string): boolean {
  return deliverableType === "lead_list";
}
