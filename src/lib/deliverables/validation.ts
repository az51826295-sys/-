// Kept free of server imports so client components can share these rules.

export const FEEDBACK_MIN = 10;
export const FEEDBACK_MAX = 2000;

export function validateFeedback(feedback: string): string | null {
  const trimmed = feedback.trim();

  if (trimmed.length < FEEDBACK_MIN) {
    return `Add at least ${FEEDBACK_MIN} characters of feedback.`;
  }
  if (trimmed.length > FEEDBACK_MAX) {
    return `Keep your feedback under ${FEEDBACK_MAX} characters.`;
  }
  return null;
}
