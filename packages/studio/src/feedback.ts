/** Project-owned review notes. Times are seconds in the reviewed authoring context. */
export type FeedbackComment = {
  readonly id: string;
  readonly context: string;
  readonly run?: string;
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
  const context = record(value) && nonempty(value.context)
    ? value.context
    : record(value) && nonempty(value.run)
      ? value.run
      : undefined;
  if (!record(value) || !nonempty(value.id) || context === undefined || !nonempty(value.text) || !time(value.at)) {
    throw new Error("Each comment needs an id, context, non-empty text and a non-negative time in seconds.");
  }
  if (value.resolved !== undefined && typeof value.resolved !== "boolean") throw new Error("Comment resolved must be true or false.");
  // Older project files named the same explicit authoring namespace `run`.
  // Preserve it and other project-added fields while exposing the current name.
  return { ...value, context } as FeedbackComment;
}

export function readFeedbackDocument(value: unknown): FeedbackDocument {
  if (!record(value) || !Array.isArray(value.comments)) throw new Error("FEEDBACK.json needs a comments array.");
  const ids = new Set<string>();
  const comments: FeedbackComment[] = [];
  for (const entry of value.comments) {
    const comment = readFeedbackComment(entry);
    if (ids.has(comment.id)) throw new Error(`Duplicate comment id: ${comment.id}`);
    ids.add(comment.id);
    comments.push(comment);
  }
  return { ...value, comments };
}

/** A legacy run reviewed one production; current comments review one authoring Source. */
export function feedbackBelongsToContext(comment: FeedbackComment, context: string): boolean {
  if (comment.context === context) return true;
  const run = nonempty(comment.run) && comment.context === comment.run
    ? comment.run
    : comment.run === undefined && comment.context.endsWith(".svrun")
      ? comment.context
      : undefined;
  if (run === undefined) return false;
  const parts = run.split("/");
  if (parts.length < 3 || parts.some((part) => part.length === 0 || part === "." || part === "..")) return false;
  const production = parts.slice(0, -2).join("/");
  return context === production || context.startsWith(`${production}/`);
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
