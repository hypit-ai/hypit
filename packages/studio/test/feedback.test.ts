import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFeedbackStore, FeedbackConflict } from "../src/feedback-store.js";
import { readFeedbackComment } from "../src/feedback.js";
import type { FeedbackComment } from "../src/feedback.js";

const note: FeedbackComment = { id: "caption-size", context: "authors/main.svml", at: 12.5, text: "字幕大一点" };

test("comments remain ordinary files through edits, completion, reopening and deletion", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-feedback-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createFeedbackStore(directory);
  assert.deepEqual(await store.read(), { comments: [] });
  await store.mutate({ type: "add", comment: note });
  const external = { comments: [note, { ...note, id: "agent-note", text: "保留这条", context: "authors/other.svml" }], projectNote: "hand edited" };
  await writeFile(store.path, JSON.stringify(external));
  const complete = { ...note, resolved: true };
  await store.mutate({ type: "replace", before: note, comment: complete });
  assert.equal((await store.read()).comments[0]?.resolved, true);
  await store.mutate({ type: "replace", before: complete, comment: note });
  await store.mutate({ type: "delete", before: note });
  assert.deepEqual(JSON.parse(await readFile(store.path, "utf8")), { ...external, comments: [external.comments[1]] });
});

test("stale browser edits cannot overwrite a comment changed by the Agent", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-feedback-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createFeedbackStore(directory);
  const changed = { ...note, text: "新意见", resolved: true };
  await writeFile(store.path, JSON.stringify({ comments: [changed] }));
  await assert.rejects(store.mutate({ type: "delete", before: note }), FeedbackConflict);
  assert.deepEqual((await store.read()).comments, [changed]);
});

test("simultaneous comments are saved without replacing each other", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-feedback-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createFeedbackStore(directory);
  await Promise.all(["one", "two", "three"].map((id) => store.mutate({ type: "add", comment: { ...note, id } })));
  assert.equal((await store.read()).comments.length, 3);
});

test("unfinished manual JSON stays intact and timestamps are required", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-feedback-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createFeedbackStore(directory);
  await writeFile(store.path, '{"comments": [');
  await assert.rejects(store.mutate({ type: "add", comment: note }));
  assert.equal(await readFile(store.path, "utf8"), '{"comments": [');
  assert.throws(() => readFeedbackComment({ ...note, at: undefined }), /time/u);
});
