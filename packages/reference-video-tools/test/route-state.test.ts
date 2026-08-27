import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkpointRouteState,
  readRouteState,
  reconcileRouteState,
  routeStatePath,
  startRouteState,
} from "../src/route-state.js";

test("route state starts once, checkpoints idempotently, and advances to the next step", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-route-state-"));
  const started = await startRouteState({ projectRoot: root, route: "reconstruction", run: "build.svrun" });
  assert.equal(started.current_step, 1);
  assert.equal(started.run, join(root, "build.svrun"));
  const completed = await checkpointRouteState({ projectRoot: root, route: "reconstruction", step: 1, status: "complete", nextAction: "prepare reference" });
  assert.deepEqual(completed.completed_steps, [1]);
  assert.equal(completed.current_step, 2);
  const repeated = await checkpointRouteState({ projectRoot: root, route: "reconstruction", step: 1, status: "complete" });
  assert.deepEqual(repeated.completed_steps, [1]);
  assert.equal((await readRouteState(root))?.current_step, 2);
});

test("reconcile uses durable artifact pointers and preserves manual gaps", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-route-state-"));
  const source = join(root, "main.svml");
  await writeFile(source, "source", "utf8");
  await startRouteState({ projectRoot: root, route: "description" });
  await checkpointRouteState({ projectRoot: root, route: "description", step: 3, status: "complete", artifacts: { author_source: source } });
  const reconciled = await reconcileRouteState(root);
  assert.equal(reconciled?.completed_steps.includes(3), true);
  assert.equal(reconciled?.current_step, 1, "manual earlier steps remain owed instead of being guessed from a later file");
});

test("corrupt route state fails without replacing the original file", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-route-state-"));
  await mkdir(join(root, ".hypit"), { recursive: true });
  await writeFile(routeStatePath(root), "{broken", "utf8");
  await assert.rejects(readRouteState(root), /invalid JSON.*original file was preserved/u);
  assert.equal(await readFile(routeStatePath(root), "utf8"), "{broken");
});

test("a project cannot switch an active route", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-route-state-"));
  await startRouteState({ projectRoot: root, route: "reconstruction" });
  await assert.rejects(startRouteState({ projectRoot: root, route: "description" }), /already has an active reconstruction route/u);
});

test("a completed route no longer blocks a new route", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-route-state-"));
  await startRouteState({ projectRoot: root, route: "reconstruction" });
  for (let step = 1; step <= 11; step += 1) {
    await checkpointRouteState({ projectRoot: root, route: "reconstruction", step, status: "complete" });
  }
  assert.equal((await readRouteState(root))?.status, "complete");
  const restarted = await startRouteState({ projectRoot: root, route: "description" });
  assert.equal(restarted.route, "description");
  assert.deepEqual(restarted.completed_steps, []);
});

test("checkpoint artifacts are merged and stale machine evidence is rolled back", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-route-state-"));
  const source = join(root, "main.svml");
  const check = join(root, "preview-check.json");
  await writeFile(source, "source", "utf8");
  await writeFile(check, JSON.stringify({ sound: true }), "utf8");
  await startRouteState({ projectRoot: root, route: "description" });
  await checkpointRouteState({ projectRoot: root, route: "description", step: 3, status: "complete", artifacts: { author_source: source } });
  await checkpointRouteState({ projectRoot: root, route: "description", step: 5, status: "complete", artifacts: { preview_check: check } });
  assert.deepEqual((await readRouteState(root))?.artifacts, { author_source: source, preview_check: check });
  await reconcileRouteState(root);
  assert.equal((await readRouteState(root))?.completed_steps.includes(5), true);
  await writeFile(check, JSON.stringify({ sound: false }), "utf8");
  const rolledBack = await reconcileRouteState(root);
  assert.equal(rolledBack?.completed_steps.includes(5), false);
  assert.equal(rolledBack?.current_step, 1);
  assert.match(rolledBack?.conflicts?.[0] ?? "", /step 5.*preview_check/u);
});

test("description reconciliation uses brief and vocabulary evidence rather than reference artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-route-state-"));
  const brief = join(root, "brief.md");
  const vocabulary = join(root, "vocabulary.json");
  await writeFile(brief, "brief", "utf8");
  await writeFile(vocabulary, "{}", "utf8");
  await startRouteState({ projectRoot: root, route: "description" });
  await checkpointRouteState({ projectRoot: root, route: "description", step: 2, status: "complete", artifacts: { brief } });
  await checkpointRouteState({ projectRoot: root, route: "description", step: 4, status: "complete", artifacts: { vocabulary } });
  const state = await reconcileRouteState(root);
  assert.equal(state?.completed_steps.includes(2), true);
  assert.equal(state?.completed_steps.includes(4), true);
  assert.equal(state?.completed_steps.includes(3), false);
});

test("an interrupted in-progress step resumes at the first unmet step", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-route-state-"));
  await startRouteState({ projectRoot: root, route: "reconstruction" });
  await checkpointRouteState({ projectRoot: root, route: "reconstruction", step: 1, status: "complete" });
  const interrupted = await checkpointRouteState({ projectRoot: root, route: "reconstruction", step: 2, status: "in_progress", nextAction: "finish reference preparation" });
  assert.equal(interrupted.in_progress?.step, 2);
  const resumed = await reconcileRouteState(root);
  assert.equal(resumed?.current_step, 2);
  assert.equal(resumed?.in_progress?.step, 2);
  assert.equal(resumed?.next_action, "complete reference-prepared");
});
