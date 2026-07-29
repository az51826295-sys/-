"use server";

import { redirect } from "next/navigation";
import { isFailure } from "@/lib/assignments/service";
import { submitDeliverable } from "@/lib/deliverables/service";

/**
 * Development-only stand-in for the employee finishing its work. Day 4 has no
 * background worker, so submission is triggered by hand; the button that calls
 * this is hidden outside development.
 */
export async function submitDeliverableAction(formData: FormData) {
  if (process.env.NODE_ENV === "production") {
    redirect("/dashboard");
  }

  const assignmentId = String(formData.get("assignmentId") ?? "");
  const result = await submitDeliverable(assignmentId);

  if (isFailure(result)) {
    if (result.deliverableId) {
      redirect(`/dashboard/deliverables/${result.deliverableId}`);
    }
    redirect(
      `/dashboard/assignments/${assignmentId}?error=` + encodeURIComponent(result.error),
    );
  }

  redirect(`/dashboard/deliverables/${result.deliverableId}`);
}
