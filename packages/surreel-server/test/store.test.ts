import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, open, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { event, ProjectMetadataError, ProjectStore } from "../src/store.js";
import type { ProjectInput } from "../src/types.js";

const input: ProjectInput = {
  title: "A quieter kind of morning",
  prompt: "Create a cinematic coffee ad with soft natural light.",
  aspectRatio: "9:16",
  duration: 30,
  style: "Talking-head UGC",
  format: "talking-head",
  referenceUrl: "https://example.com/reference",
};

test("projects survive a reload and metadata remains outside isolated agent workspaces", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "surreel-store-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new ProjectStore(root);
  const first = await store.create(input);
  const second = await store.create({ ...input, title: "Another story" });
  assert.notEqual(first.id, second.id);
  assert.equal(first.status, "draft");
  assert.deepEqual(first.events, []);
  assert.deepEqual(first.artifacts, []);
  assert.equal(store.workspacePath(first.id), join(root, "workspaces", first.id));
  assert.notEqual(store.workspacePath(first.id), store.workspacePath(second.id));

  await mkdir(join(store.workspacePath(first.id), "meta"));
  await writeFile(join(store.workspacePath(first.id), "meta", `${first.id}.json`), "agent workspace content");
  const reloaded = new ProjectStore(root);
  await reloaded.initialize();
  assert.deepEqual(await reloaded.get(first.id), first);
  assert.equal((await reloaded.list()).length, 2);
  assert.equal(await reloaded.get(randomUUID()), undefined);
  const envelope: unknown = JSON.parse(await readFile(join(root, "meta", `${first.id}.json`), "utf8"));
  assert.deepEqual(envelope, { version: "@1", project: first });
  if (process.platform !== "win32") {
    assert.equal((await stat(join(root, "meta", `${first.id}.json`))).mode & 0o777, 0o600);
    assert.equal((await stat(join(root, "meta"))).mode & 0o777, 0o700);
    assert.equal((await stat(store.workspacePath(first.id))).mode & 0o777, 0o700);
  }
});

test("concurrent updates preserve every change and a failed update does not block the queue", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "surreel-concurrency-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new ProjectStore(root);
  const project = await store.create(input);
  const changes = Array.from({ length: 60 }, (_, index) => store.update(project.id, (current) =>
    event({ ...current, duration: current.duration + 1 }, "progress", `Step ${index}`)));
  await Promise.all(changes);
  const final = await store.get(project.id);
  assert.equal(final?.duration, 90);
  assert.equal(final?.events.length, 60);
  assert.equal(new Set(final?.events.map((item) => item.message)).size, 60);
  assert.equal(new Set(final?.events.map((item) => item.id)).size, 60);

  const rejected = store.update(project.id, () => { throw new Error("Intentional update failure"); });
  const following = store.update(project.id, (current) => ({ ...current, title: "Still writable" }));
  await assert.rejects(rejected, /Intentional update failure/u);
  assert.equal((await following).title, "Still writable");
  assert.deepEqual((await readdir(join(root, "meta"))).filter((name) => name.endsWith(".tmp")), []);
});

test("initialization fails interrupted queued and running projects exactly once", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "surreel-recovery-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new ProjectStore(root);
  const queued = await store.create(input);
  const running = await store.create(input);
  const completed = await store.create(input);
  await store.update(queued.id, (current) => ({ ...current, status: "queued" }));
  await store.update(running.id, (current) => event({ ...current, status: "running" }, "progress", "Agent started"));
  await store.update(completed.id, (current) => ({ ...current, status: "completed" }));
  await store.initialize();
  assert.equal((await store.get(running.id))?.status, "running", "repeated initialize is not a server restart");

  const restarted = new ProjectStore(root);
  await restarted.initialize();
  for (const original of [queued, running]) {
    const recovered = await restarted.get(original.id);
    assert.equal(recovered?.status, "failed");
    assert.match(recovered?.error ?? "", /server restarted/u);
    assert.match(recovered?.events.at(-1)?.message ?? "", /server restarted/u);
    assert.equal(recovered?.events.at(-1)?.type, "error");
  }
  assert.equal((await restarted.get(completed.id))?.status, "completed");
  const again = new ProjectStore(root);
  assert.equal((await again.get(running.id))?.events.length, 2);
});

test("invalid IDs and malformed metadata cannot escape the store or poison its project list", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "surreel-invalid-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new ProjectStore(root);
  const valid = await store.create(input);
  const invalid = await store.create(input);
  for (const id of ["../../outside", "", "00000000-0000-0000-0000-000000000000", `${valid.id}/extra`]) {
    assert.throws(() => store.workspacePath(id), /UUID/u);
    await assert.rejects(store.get(id), /UUID/u);
    await assert.rejects(store.update(id, (current) => current), /UUID/u);
  }
  await assert.rejects(store.update(randomUUID(), (current) => current), /not found/u);
  await assert.rejects(store.update(valid.id, (current) => ({ ...current, id: randomUUID() })), /cannot change/u);
  await writeFile(join(root, "meta", `${invalid.id}.json`), "{ broken JSON");
  await assert.rejects(store.get(invalid.id), ProjectMetadataError);
  assert.deepEqual((await store.list()).map((project) => project.id), [valid.id]);

  await writeFile(join(root, "meta", `${invalid.id}.json`), JSON.stringify({
    version: "@1", project: { ...invalid, events: [{ type: "progress", message: "Missing ID and timestamp" }] },
  }));
  await assert.rejects(store.get(invalid.id), /event.id/u);
  await writeFile(join(root, "meta", `${invalid.id}.json`), JSON.stringify({
    version: "@1", project: { ...invalid, id: valid.id },
  }));
  await assert.rejects(store.get(invalid.id), /does not match its filename/u);
  assert.equal((await new ProjectStore(root).list()).length, 1);
});

test("oversized files and metadata symlinks are rejected before content is loaded", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "surreel-limits-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new ProjectStore(root);
  await store.initialize();
  const oversizedId = randomUUID();
  const handle = await open(join(root, "meta", `${oversizedId}.json`), "w");
  await handle.truncate(8 * 1024 * 1024 + 1);
  await handle.close();
  await assert.rejects(store.get(oversizedId), /exceeds/u);
  assert.deepEqual(await store.list(), []);
  if (process.platform !== "win32") {
    const symlinkId = randomUUID();
    await symlink(join(root, "meta", `${oversizedId}.json`), join(root, "meta", `${symlinkId}.json`));
    await assert.rejects(store.get(symlinkId), /symbolic link/u);
    assert.deepEqual(await store.list(), []);
  }
});

test("event retention and message limits persist through reloads alongside artifact URLs", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "surreel-events-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new ProjectStore(root);
  const project = await store.create(input);
  const entries = Array.from({ length: 350 }, (_, index) => ({
    id: randomUUID(), type: "progress", message: `Step ${index}`, createdAt: new Date().toISOString(),
  }));
  const updated = await store.update(project.id, (current) => ({
    ...current,
    events: entries,
    artifacts: [{ id: "preview.mp4", name: "Preview", url: `/api/projects/${project.id}/artifacts/preview.mp4`, mimeType: "video/mp4" }],
  }));
  assert.equal(updated.events.length, 300);
  assert.equal(updated.events[0]?.message, "Step 50");
  await store.update(project.id, (current) => event(current, "progress", "a".repeat(5_000)));
  const reloaded = await new ProjectStore(root).get(project.id);
  assert.equal(reloaded?.events.length, 300);
  assert.equal(reloaded?.events.at(-1)?.message.length, 4_000);
  assert.deepEqual(reloaded?.artifacts, updated.artifacts);
});
