import { NextResponse } from "next/server";
import { getOwnedDeliverable } from "@/lib/deliverables/access";
import type { LeadListDeliverable } from "@/lib/leads/types";
import { fitLabelText } from "@/lib/leads/types";

/** Escapes a value for CSV. The leading-character guard stops a spreadsheet
 *  treating a company name that starts with "=" or "+" as a formula. */
function cell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '""';
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deliverableId: string }> },
) {
  const { deliverableId } = await params;

  // Same ownership check as the page. An export is a copy of the data, so it
  // cannot be easier to reach than the data itself.
  const owned = await getOwnedDeliverable(deliverableId);
  if (!owned) {
    return NextResponse.json({ error: "Deliverable not found." }, { status: 404 });
  }

  const { supabase, deliverable, employee } = owned;

  if (deliverable.deliverable_type !== "lead_list") {
    return NextResponse.json({ error: "This deliverable can't be exported." }, { status: 400 });
  }

  const content = deliverable.content_json as LeadListDeliverable | null;
  if (!content || !Array.isArray(content.leads)) {
    return NextResponse.json({ error: "This lead list has no rows." }, { status: 400 });
  }

  const { data: sourceRows } = await supabase
    .from("deliverable_sources")
    .select("citation_number, research_sources(url)")
    .eq("deliverable_id", deliverable.id);

  const urlByNumber = new Map(
    ((sourceRows ?? []) as unknown as {
      citation_number: number;
      research_sources: { url: string } | null;
    }[])
      .filter((row) => row.research_sources)
      .map((row) => [row.citation_number, row.research_sources!.url]),
  );

  const header = [
    "Company Name",
    "Website",
    "Fit",
    "Industry",
    "Company Size",
    "Location",
    "Fit Reasons",
    "Buying Signals",
    "Recommended Buyer Roles",
    "Verified Contact Name",
    "Verified Contact Title",
    "Public Profile URL",
    "Public Contact Email",
    "Source URLs",
  ];

  const rows = content.leads.map((lead) => {
    // The first verified contact only. The same privacy rules apply here as on
    // screen: nothing is exported that wasn't verified on a public page.
    const contact = lead.verifiedContacts[0];
    const sourceNumbers = [
      ...new Set([
        ...lead.citationNumbers,
        ...lead.buyingSignals.flatMap((signal) => signal.citationNumbers),
        ...lead.verifiedContacts.flatMap((entry) => entry.citationNumbers),
      ]),
    ].sort((a, b) => a - b);

    return [
      cell(lead.companyName),
      cell(lead.websiteUrl),
      cell(fitLabelText[lead.fitLabel]),
      cell(lead.industry),
      cell(lead.companySize),
      cell(lead.location),
      cell(lead.fitReasons.join(" | ")),
      cell(lead.buyingSignals.map((signal) => signal.description).join(" | ")),
      cell(lead.recommendedBuyerRoles.join(", ")),
      cell(contact?.name),
      cell(contact?.title),
      cell(contact?.profileUrl),
      cell(lead.publicContactEmail),
      cell(
        sourceNumbers
          .map((number) => urlByNumber.get(number))
          .filter(Boolean)
          .join(" | "),
      ),
    ].join(",");
  });

  const csv = [header.map(cell).join(","), ...rows].join("\r\n");

  const submitted = deliverable.submitted_at
    ? new Date(deliverable.submitted_at)
    : new Date();
  const stamp = submitted.toISOString().slice(0, 10);
  const filename = `${employee.name.toLowerCase()}-lead-list-${stamp}.csv`;

  return new NextResponse(`﻿${csv}`, {
    headers: {
      // The BOM keeps non-ASCII company names readable when the file is opened
      // in Excel.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
