import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readFeedbackDocument } from "./feedback.js";
import type { FeedbackDocument, FeedbackMutation } from "./feedback.js";

export class FeedbackConflict extends Error {}

/** The file is authoritative; every operation reads it afresh and edits one note. */
export function createFeedbackStore(workspaceRoot: string) {
  const path = join(workspaceRoot, "FEEDBACK.json");
  let pending: Promise<unknown> = Promise.resolve();
  const readText = async (): Promise<string | undefined> => {
    try { return await readFile(path, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  };
  const decode = (text: string | undefined): FeedbackDocument => text === undefined
    ? { comments: [] } : readFeedbackDocument(JSON.parse(text));

  const apply = async (mutation: FeedbackMutation): Promise<FeedbackDocument> => {
    const previous = await readText();
    const document = decode(previous);
    const comments = [...document.comments];
    if (mutation.type === "add") {
      if (comments.some((comment) => comment.id === mutation.comment.id)) throw new FeedbackConflict("This comment already exists.");
      comments.push(mutation.comment);
    } else {
      const index = comments.findIndex((comment) => comment.id === mutation.before.id);
      if (index < 0 || !isDeepStrictEqual(comments[index], mutation.before)) {
        throw new FeedbackConflict("This comment changed outside this view. Your unsaved text is kept in the editor; reopen the comment to edit its latest version.");
      }
      if (mutation.type === "delete") comments.splice(index, 1);
      else {
        if (mutation.comment.id !== mutation.before.id || mutation.comment.context !== mutation.before.context) {
          throw new Error("Editing a comment preserves its id and authoring context.");
        }
        comments[index] = mutation.comment;
      }
    }
    const next = { ...document, comments };
    const temporary = join(workspaceRoot, `.FEEDBACK.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      if (await readText() !== previous) throw new FeedbackConflict("FEEDBACK.json changed while saving. Your draft is kept; please try again.");
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    }
    return next;
  };

  return {
    path,
    read: async (): Promise<FeedbackDocument> => decode(await readText()),
    mutate(mutation: FeedbackMutation): Promise<FeedbackDocument> {
      // Serialize browser submissions, without keeping a second copy of the document.
      const result = pending.then(() => apply(mutation));
      pending = result.catch(() => undefined);
      return result;
    },
  };
}
