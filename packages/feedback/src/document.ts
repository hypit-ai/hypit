import type {
  FeedbackAttachment,
  FeedbackComment,
  FeedbackDocument,
  FeedbackMutation,
  FeedbackView,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  assert(unexpected === undefined, `${label} has unsupported field ${unexpected}.`);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function projectRelativePath(value: unknown): value is string {
  if (!nonempty(value) || value.includes("\\") || value.startsWith("/")) return false;
  const parts = value.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..")
    && !/^[A-Za-z]:/u.test(parts[0] ?? "");
}

function identity(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value);
}

function mediaType(value: unknown): value is string {
  return typeof value === "string"
    && /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/u.test(value);
}

export function readFeedbackAttachment(value: unknown, label = "Feedback attachment"): FeedbackAttachment {
  assert(record(value), `${label} must be an object.`);
  exactKeys(value, ["id", "path", "mediaType", "name"], label);
  assert(identity(value.id), `${label}.id is invalid.`);
  assert(projectRelativePath(value.path) && value.path.startsWith("attachments/"),
    `${label}.path must be a portable path under the Feedback attachments directory.`);
  assert(mediaType(value.mediaType), `${label}.mediaType is invalid.`);
  assert(nonempty(value.name) && !value.name.includes("/") && !value.name.includes("\\"),
    `${label}.name must be a plain file name.`);
  return structuredClone(value) as FeedbackAttachment;
}

export function readFeedbackComment(value: unknown, label = "Feedback comment"): FeedbackComment {
  assert(record(value), `${label} must be an object.`);
  exactKeys(value, ["id", "context", "at", "text", "resolved", "attachments"], label);
  assert(nonempty(value.id), `${label}.id must be a non-empty string.`);
  assert(projectRelativePath(value.context), `${label}.context must be a portable project-relative path.`);
  assert(typeof value.at === "number" && Number.isFinite(value.at) && value.at >= 0,
    `${label}.at must be a non-negative finite time in seconds.`);
  assert(typeof value.resolved === "boolean", `${label}.resolved must be true or false.`);
  assert(Array.isArray(value.attachments), `${label}.attachments must be an array.`);
  const attachmentIds = new Set<string>();
  value.attachments.forEach((attachment, index) => {
    const parsed = readFeedbackAttachment(attachment, `${label} attachment ${index}`);
    assert(!attachmentIds.has(parsed.id), `${label} repeats attachment ${parsed.id}.`);
    attachmentIds.add(parsed.id);
  });
  assert(typeof value.text === "string" && (value.text.trim().length > 0 || value.attachments.length > 0),
    `${label} needs text or at least one attachment.`);
  return structuredClone(value) as FeedbackComment;
}

export function assertFeedbackDocument(value: unknown): asserts value is FeedbackDocument {
  assert(record(value), "Feedback document must be an object.");
  exactKeys(value, ["format", "comments"], "Feedback document");
  assert(value.format === "hypit.feedback@1", "Feedback document format must be hypit.feedback@1.");
  assert(Array.isArray(value.comments), "Feedback document comments must be an array.");
  const ids = new Set<string>();
  const attachmentIds = new Set<string>();
  value.comments.forEach((entry, index) => {
    const comment = readFeedbackComment(entry, `Feedback comment ${index}`);
    assert(!ids.has(comment.id), `Feedback document repeats comment ${comment.id}.`);
    ids.add(comment.id);
    for (const attachment of comment.attachments) {
      assert(!attachmentIds.has(attachment.id), `Feedback document repeats attachment ${attachment.id}.`);
      attachmentIds.add(attachment.id);
    }
  });
}

export function createFeedbackDocument(comments: readonly FeedbackComment[] = []): FeedbackDocument {
  const value: FeedbackDocument = { format: "hypit.feedback@1", comments: structuredClone(comments) };
  assertFeedbackDocument(value);
  return value;
}

export function parseFeedbackDocument(text: string): FeedbackDocument {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Invalid Feedback JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  assertFeedbackDocument(value);
  return structuredClone(value);
}

export function serializeFeedbackDocument(value: FeedbackDocument): string {
  assertFeedbackDocument(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function readFeedbackMutation(value: unknown): FeedbackMutation {
  assert(record(value), "Feedback mutation must be an object.");
  if (value.type === "add") {
    exactKeys(value, ["type", "comment"], "Feedback add mutation");
    return { type: "add", comment: readFeedbackComment(value.comment) };
  }
  if (value.type === "replace") {
    exactKeys(value, ["type", "before", "comment"], "Feedback replace mutation");
    return {
      type: "replace",
      before: readFeedbackComment(value.before, "Feedback previous comment"),
      comment: readFeedbackComment(value.comment),
    };
  }
  if (value.type === "delete") {
    exactKeys(value, ["type", "before"], "Feedback delete mutation");
    return { type: "delete", before: readFeedbackComment(value.before, "Feedback previous comment") };
  }
  throw new Error("Feedback mutation type must be add, replace or delete.");
}

export function projectFeedbackView(document: FeedbackDocument, context: string): FeedbackView {
  assertFeedbackDocument(document);
  assert(projectRelativePath(context), "Feedback context must be a portable project-relative path.");
  return {
    format: "hypit.feedback-view@1",
    file: "feedback/project.feedback.json",
    context,
    comments: structuredClone(document.comments.filter((comment) => comment.context === context)),
  };
}

export function feedbackClock(seconds: number): string {
  assert(Number.isFinite(seconds) && seconds >= 0, "Feedback clock requires non-negative seconds.");
  const ticks = Math.round(seconds * 100);
  return `${String(Math.floor(ticks / 6000)).padStart(2, "0")}:${String(Math.floor(ticks / 100) % 60).padStart(2, "0")}.${String(ticks % 100).padStart(2, "0")}`;
}
