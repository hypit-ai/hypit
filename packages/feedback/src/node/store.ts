import { isDeepStrictEqual } from "node:util";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  createFeedbackDocument,
  parseFeedbackDocument,
  serializeFeedbackDocument,
} from "../document.js";
import type { FeedbackAttachmentUpload, FeedbackDocument, FeedbackMutation } from "../types.js";

async function replaceFile(from: string, to: string): Promise<void> {
  if (process.platform !== "win32") {
    await rename(from, to);
    return;
  }
  const moduleName = "@hypit/atomic-file";
  const atomicFile = await import(moduleName) as { readonly replaceFile: (source: string, destination: string) => Promise<void> };
  await atomicFile.replaceFile(from, to);
}

export class FeedbackConflict extends Error {
  override readonly name = "FeedbackConflict";
}

/** The Project Feedback document remains authoritative; each mutation reads and atomically replaces the real file. */
export function createFeedbackStore(projectRoot: string) {
  const root = resolve(projectRoot);
  const path = resolve(root, "feedback", "project.feedback.json");
  let pending: Promise<unknown> = Promise.resolve();

  const readText = async (): Promise<string | undefined> => {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  };
  const decode = (text: string | undefined): FeedbackDocument => text === undefined
    ? createFeedbackDocument()
    : parseFeedbackDocument(text);

  const attachmentTarget = (upload: FeedbackAttachmentUpload): string => {
    const target = resolve(dirname(path), upload.attachment.path);
    const local = relative(root, target);
    if (local === "" || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)
      || !upload.attachment.path.startsWith("attachments/")) {
      throw new Error(`Feedback attachment ${upload.attachment.path} leaves the Feedback attachments directory.`);
    }
    return target;
  };

  const apply = async (
    mutation: FeedbackMutation,
    uploads: readonly FeedbackAttachmentUpload[],
  ): Promise<FeedbackDocument> => {
    const previous = await readText();
    const document = decode(previous);
    const comments = [...document.comments];
    const removedAttachments = mutation.type === "add"
      ? []
      : mutation.before.attachments.filter((before) => mutation.type === "delete"
        || !mutation.comment.attachments.some((after) => after.id === before.id));
    if (mutation.type === "add") {
      if (comments.some((comment) => comment.id === mutation.comment.id)) {
        throw new FeedbackConflict(`Feedback comment ${mutation.comment.id} already exists.`);
      }
      comments.push(structuredClone(mutation.comment));
    } else {
      const index = comments.findIndex((comment) => comment.id === mutation.before.id);
      if (index < 0 || !isDeepStrictEqual(comments[index], mutation.before)) {
        throw new FeedbackConflict("This comment changed outside this view. Refresh it before saving again.");
      }
      if (mutation.type === "delete") {
        comments.splice(index, 1);
      } else {
        if (mutation.comment.id !== mutation.before.id || mutation.comment.context !== mutation.before.context) {
          throw new Error("Editing a Feedback comment preserves its id and context.");
        }
        comments[index] = structuredClone(mutation.comment);
      }
    }
    const next = createFeedbackDocument(comments);
    const nextAttachments = mutation.type === "delete" ? [] : mutation.comment.attachments;
    for (const upload of uploads) {
      const declared = nextAttachments.find((attachment) => attachment.id === upload.attachment.id);
      if (declared === undefined || !isDeepStrictEqual(declared, upload.attachment)) {
        throw new Error(`Feedback upload ${upload.attachment.id} is not declared by the saved comment.`);
      }
    }
    const promoted: string[] = [];
    await mkdir(dirname(path), { recursive: true });
    const temporaryDirectory = await mkdtemp(join(dirname(path), ".hypit-feedback-save-"));
    const temporary = join(temporaryDirectory, basename(path));
    try {
      for (const upload of uploads) {
        const target = attachmentTarget(upload);
        await mkdir(dirname(target), { recursive: true });
        await rename(upload.stagedFile, target);
        promoted.push(target);
      }
      await writeFile(temporary, serializeFeedbackDocument(next), { encoding: "utf8", flag: "wx" });
      if (await readText() !== previous) {
        throw new FeedbackConflict("project.feedback.json changed while saving. Refresh it before saving again.");
      }
      await replaceFile(temporary, path);
      await Promise.allSettled(removedAttachments
        .filter((attachment) => attachment.path.startsWith("attachments/"))
        .map((attachment) => rm(resolve(dirname(path), attachment.path), { force: true })));
    } catch (error) {
      await Promise.all(promoted.map((file) => rm(file, { force: true })));
      throw error;
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
    return next;
  };

  return {
    path,
    read: async (): Promise<FeedbackDocument> => decode(await readText()),
    mutate(
      mutation: FeedbackMutation,
      uploads: readonly FeedbackAttachmentUpload[] = [],
    ): Promise<FeedbackDocument> {
      const result = pending.then(() => apply(mutation, uploads));
      pending = result.catch(() => undefined);
      return result;
    },
  };
}
