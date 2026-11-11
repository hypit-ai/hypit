import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createFeedbackDocument,
  parseFeedbackDocument,
  projectFeedbackView,
  serializeFeedbackDocument,
  type FeedbackComment,
} from "../src/index.js";
import { createFeedbackStore, FeedbackConflict } from "../src/node/index.js";

const note: FeedbackComment = {
  id: "c-caption",
  context: "edits/film.nle.json",
  at: 12.5,
  text: "字幕大一点",
  resolved: false,
  attachments: [],
};

test("Feedback document is strict and projects one explicit context", () => {
  const document = createFeedbackDocument([note, { ...note, id: "c-scene", context: "scenes/opening.scene.json" }]);
  assert.deepEqual(parseFeedbackDocument(serializeFeedbackDocument(document)), document);
  assert.deepEqual(projectFeedbackView(document, note.context).comments, [note]);
  assert.throws(() => parseFeedbackDocument(JSON.stringify({ comments: [] })), /format/u);
});

test("Feedback store preserves external comments and rejects stale replacement", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-feedback-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createFeedbackStore(directory);
  await store.mutate({ type: "add", comment: note });
  const external = { ...note, text: "Agent 已经改过", resolved: true };
  await writeFile(store.path, serializeFeedbackDocument(createFeedbackDocument([external])));
  await assert.rejects(store.mutate({ type: "replace", before: note, comment: { ...note, text: "旧页面覆盖" } }), FeedbackConflict);
  assert.deepEqual(parseFeedbackDocument(await readFile(store.path, "utf8")).comments, [external]);
});
