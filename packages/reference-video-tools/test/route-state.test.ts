import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkpointRouteState,
  componentFitPath,
  readRouteState,
  reconcileRouteState,
  routeStatePath,
  startRouteState,
  ROUTE_STATE_STEPS,
} from "../src/route-state.js";

async function writeComponentFit(root: string, route: "description" | "reconstruction"): Promise<string> {
  const path = componentFitPath(root);
  await mkdir(join(root, ".hypit"), { recursive: true });
  await writeFile(path, JSON.stringify({
    version: 1,
    route,
    basis: route === "description" ? ".hypit/brief.json" : "reference-test",
    systems: [{
      role: "test system",
      inspected_candidates: ["@hypit/test"],
      selected_package: "@hypit/test",
      decision: "reuse-existing",
      rationale: "sufficiently similar for the test",
      accepted_variances: [],
    }],
  }), "utf8");
  return path;
}

async function completeDescriptionSourceGates(root: string): Promise<void> {
  const vocabulary = join(root, "vocabulary.json");
  const componentFit = await writeComponentFit(root, "description");
  const packageReady = join(root, "package-ready.json");
  const scriptCues = join(root, "script-cues.json");
  await writeFile(vocabulary, JSON.stringify({ packages: [], surfaces: [] }), "utf8");
  await writeFile(packageReady, JSON.stringify({ passed: true }), "utf8");
  await writeFile(scriptCues, JSON.stringify({ passed: true }), "utf8");
  await checkpointRouteState({ projectRoot: root, route: "description", step: 3, status: "complete", artifacts: { vocabulary, component_fit: componentFit } });
  await checkpointRouteState({ projectRoot: root, route: "description", step: 4, status: "complete", artifacts: { package_ready: packageReady } });
  await checkpointRouteState({ projectRoot: root, route: "description", step: 5, status: "complete", artifacts: { script_cues: scriptCues } });
}

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

test("named checkpoints default to complete and cannot skip an earlier stage", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-route-state-"));
  await startRouteState({ projectRoot: root, route: "reconstruction" });
  const completed = await checkpointRouteState({ projectRoot: root, route: "reconstruction", step: "environment" });
  assert.deepEqual(completed.completed_steps, [1]);
  await assert.rejects(
    checkpointRouteState({ projectRoot: root, route: "reconstruction", step: "reference-observed" }),
    /cannot complete reference-observed before reference-prepared/u,
  );
});

test("reconcile uses durable artifact pointers and preserves manual gaps", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-route-state-"));
  const source = join(root, "main.svml");
  await writeFile(source, "source", "utf8");
  await startRouteState({ projectRoot: root, route: "description" });
  await completeDescriptionSourceGates(root);
  await checkpointRouteState({ projectRoot: root, route: "description", step: 6, status: "complete", artifacts: { author_source: source } });
  const reconciled = await reconcileRouteState(root);
  assert.equal(reconciled?.completed_steps.includes(6), true);
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
  const vocabulary = join(root, "vocabulary.json");
  const componentFit = await writeComponentFit(root, "reconstruction");
  await writeFile(vocabulary, JSON.stringify({ packages: [], surfaces: [] }), "utf8");
  await startRouteState({ projectRoot: root, route: "reconstruction" });
  for (let step = 1; step <= ROUTE_STATE_STEPS.reconstruction.length; step += 1) {
    await checkpointRouteState({
      projectRoot: root,
      route: "reconstruction",
      step,
      status: "complete",
      ...(step === 4 ? { artifacts: { vocabulary, component_fit: componentFit } } : {}),
    });
  }
  assert.equal((await readRouteState(root))?.status, "complete");
  const completed = await readRouteState(root);
  const restarted = await startRouteState({ projectRoot: root, route: "description" });
  assert.equal(restarted.route, "description");
  assert.deepEqual(restarted.completed_steps, []);
  assert.notEqual(restarted.route_id, completed?.route_id);
  assert.equal(JSON.parse(await readFile(join(root, ".hypit", "routes", completed!.route_id, "state.json"), "utf8")).status, "complete");
});

test("checkpoint artifacts are merged and stale machine evidence is rolled back", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-route-state-"));
  const source = join(root, "main.svml");
  const check = join(root, "preview-check.json");
  await writeFile(source, "source", "utf8");
  await writeFile(check, JSON.stringify({ sound: true }), "utf8");
  await startRouteState({ projectRoot: root, route: "description" });
  await completeDescriptionSourceGates(root);
  await checkpointRouteState({ projectRoot: root, route: "description", step: 6, status: "complete", artifacts: { author_source: source } });
  await checkpointRouteState({ projectRoot: root, route: "description", step: 7, status: "complete", artifacts: { preview_check: check } });
  const mergedArtifacts = (await readRouteState(root))?.artifacts ?? {};
  assert.equal(mergedArtifacts.author_source, source);
  assert.equal(mergedArtifacts.preview_check, check);
  await reconcileRouteState(root);
  assert.equal((await readRouteState(root))?.completed_steps.includes(7), true);
  await writeFile(check, JSON.stringify({ sound: false }), "utf8");
  const rolledBack = await reconcileRouteState(root);
  assert.equal(rolledBack?.completed_steps.includes(7), false);
  assert.equal(rolledBack?.current_step, 1);
  assert.match(rolledBack?.conflicts?.[0] ?? "", /step 7.*preview_check/u);
});

test("description reconciliation uses brief and vocabulary evidence rather than reference artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-route-state-"));
  const brief = join(root, ".hypit", "brief.json");
  const vocabulary = join(root, "vocabulary.json");
  const componentFit = await writeComponentFit(root, "description");
  await mkdir(join(root, ".hypit"), { recursive: true });
  await writeFile(brief, JSON.stringify({ intent: "brief" }), "utf8");
  await writeFile(vocabulary, JSON.stringify({ packages: [], surfaces: [] }), "utf8");
  await startRouteState({ projectRoot: root, route: "description" });
  await checkpointRouteState({ projectRoot: root, route: "description", step: 2, status: "complete", artifacts: { brief } });
  await checkpointRouteState({ projectRoot: root, route: "description", step: 3, status: "complete", artifacts: { vocabulary, component_fit: componentFit } });
  const state = await reconcileRouteState(root);
  assert.equal(state?.completed_steps.includes(2), true);
  assert.equal(state?.completed_steps.includes(3), true);
  assert.equal(state?.completed_steps.includes(6), false);
  await writeFile(brief, JSON.stringify({ intent: "changed after freeze" }), "utf8");
  await writeFile(componentFit, JSON.stringify({ changed: true }), "utf8");
  const conflicted = await reconcileRouteState(root);
  const conflicts = conflicted?.conflicts?.join("\n") ?? "";
  assert.match(conflicts, /brief digest changed/u);
  assert.match(conflicts, /component_fit digest changed/u);
  assert.equal(conflicted?.completed_steps.includes(3), false);
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

test("v1 route snapshots migrate by stage name and re-open new gates", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-route-state-"));
  await mkdir(join(root, ".hypit"), { recursive: true });
  await writeFile(routeStatePath(root), JSON.stringify({
    version: 1, route: "reconstruction", project_root: root, status: "active", current_step: 4,
    completed_steps: [1, 2, 3, 4], in_progress: { step: 4, started_at: new Date().toISOString() },
    artifacts: {}, decisions: [], next_action: "write Source", updated_at: new Date().toISOString(),
  }), "utf8");
  const migrated = await readRouteState(root);
  assert.equal(migrated?.version, 4);
  assert.equal(migrated?.completed_steps.includes(3), true);
  assert.equal(migrated?.completed_steps.includes(4), false, "new vocabulary gate is not guessed from old source state");
  assert.equal(migrated?.current_step, 4);
});

test("source-authored cannot bypass vocabulary, package and Script gates", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-route-state-"));
  await startRouteState({ projectRoot: root, route: "reconstruction" });
  const sourceStep = ROUTE_STATE_STEPS.reconstruction.indexOf("source-authored") + 1;
  await assert.rejects(
    checkpointRouteState({ projectRoot: root, route: "reconstruction", step: sourceStep, status: "complete" }),
    /source-authored cannot be completed before/u,
  );
  const statePath = routeStatePath(root);
  const raw = JSON.parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
  raw.completed_steps = [4, 5, 6, sourceStep];
  await writeFile(statePath, `${JSON.stringify(raw)}\n`, "utf8");
  const reconciled = await reconcileRouteState(root);
  assert.equal(reconciled?.completed_steps.includes(sourceStep), false);
  assert.equal((reconciled?.conflicts?.length ?? 0) > 0, true);
});
