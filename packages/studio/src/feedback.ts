/** Project-owned review notes. Times are seconds in the reviewed authoring context. */
export type FeedbackComment = {
  readonly id: string;
  readonly context: string;
  readonly at: number;
  readonly text: string;
  readonly resolved?: boolean;
};

export type FeedbackDocument = { readonly comments: readonly FeedbackComment[] };
export type FeedbackView = FeedbackDocument & { readonly file: string; readonly context: string };
export type FeedbackMutation =
  | { readonly type: "add"; readonly comment: FeedbackComment }
  | { readonly type: "replace"; readonly before: FeedbackComment; readonly comment: FeedbackComment }
  | { readonly type: "delete"; readonly before: FeedbackComment };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function time(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function readFeedbackComment(value: unknown): FeedbackComment {
  if (!record(value) || !nonempty(value.id) || !nonempty(value.context) || !nonempty(value.text) || !time(value.at)) {
    throw new Error("Each comment needs an id, context, non-empty text and a non-negative time in seconds.");
  }
  if (value.resolved !== undefined && typeof value.resolved !== "boolean") throw new Error("Comment resolved must be true or false.");
  // Preserve any project-added fields when Studio edits this document.
  return value as FeedbackComment;
}

export function readFeedbackDocument(value: unknown): FeedbackDocument {
  if (!record(value) || !Array.isArray(value.comments)) throw new Error("FEEDBACK.json needs a comments array.");
  const ids = new Set<string>();
  for (const entry of value.comments) {
    const comment = readFeedbackComment(entry);
    if (ids.has(comment.id)) throw new Error(`Duplicate comment id: ${comment.id}`);
    ids.add(comment.id);
  }
  return value as FeedbackDocument;
}

export function readFeedbackMutation(value: unknown): FeedbackMutation {
  if (!record(value)) throw new Error("Expected a comment operation.");
  if (value.type === "add") return { type: "add", comment: readFeedbackComment(value.comment) };
  if (value.type === "delete") return { type: "delete", before: readFeedbackComment(value.before) };
  if (value.type === "replace") return { type: "replace", before: readFeedbackComment(value.before), comment: readFeedbackComment(value.comment) };
  throw new Error("Unknown comment operation.");
}

export function feedbackClock(seconds: number): string {
  const ticks = Math.round(seconds * 100);
  return `${String(Math.floor(ticks / 6000)).padStart(2, "0")}:${String(Math.floor(ticks / 100) % 60).padStart(2, "0")}.${String(ticks % 100).padStart(2, "0")}`;
}
