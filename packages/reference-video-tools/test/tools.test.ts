import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createReferenceVideoTools } from "../src/tools.js";
import type { GenerateText } from "../src/tools.js";
import type { ReferenceState } from "../src/types.js";

type Call = { readonly instruction: string; readonly mimeTypes: readonly string[]; readonly text: string };

const REFERENCE = "ref-fixture";

async function workspace(shotCount: number): Promise<{ readonly root: string; readonly stateRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), "reference-video-tools-"));
  const stateRoot = join(root, ".hypit", "reference-video-tools", REFERENCE);
  const shots = join(stateRoot, "shots");
  await mkdir(shots, { recursive: true });
  const media: ReferenceState["shots"][number][] = [];
  for (let index = 0; index < shotCount; index += 1) {
    const id = String(index + 1).padStart(3, "0");
    const clip = join(shots, `${id}.mp4`);
    const representative = join(shots, `${id}-representative.jpg`);
    const tail = join(shots, `${id}-tail.jpg`);
    const framesTile = join(shots, `${id}-frames.jpg`);
    for (const path of [clip, representative, tail, framesTile]) await writeFile(path, `bytes-${id}`, "utf8");
    media.push({
      shot_id: `shot-${id}`,
      index: index + 1,
      start_seconds: index,
      end_seconds: index + 1,
      duration_seconds: 1,
      initial_group: index,
      part: 1,
      parts: 1,
      clip_ref: clip,
      representative_frame_ref: representative,
      tail_frame_ref: tail,
      frames_tile_ref: framesTile,
      audio_tail_ref: null,
    });
  }
  const state: ReferenceState = {
    reference_id: REFERENCE,
    video_path: join(root, "reference.mp4"),
    root: stateRoot,
    video: { duration_seconds: shotCount, width: 360, height: 640, has_audio: true },
    shots: media,
    storyboard_ref: join(stateRoot, "storyboard.jpg"),
    analysis_video_ref: join(stateRoot, "analysis.mp4"),
    people_and_product: { status: "complete", text: "one recurring host" },
    voices: { status: "complete", text: "one voice" },
    persistent_systems: { status: "complete", text: "one caption system for the whole video" },
    places: { status: "complete", text: "one room, one camera position" },
  };
  await writeFile(join(stateRoot, "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await writeFile(join(stateRoot, "observations.json"), "{}\n", "utf8");
  return { root, stateRoot };
}

async function agentWorkspace(shotCount: number): Promise<{ readonly root: string; readonly stateRoot: string }> {
  const made = await workspace(shotCount);
  const path = join(made.stateRoot, "state.json");
  const state = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  // The four whole-reference observations are what the agent observer still owes at this point, so
  // the fixture drops them rather than starting from a reference that was already read.
  for (const key of ["people_and_product", "voices", "persistent_systems", "places"]) delete state[key];
  await writeFile(path, `${JSON.stringify({ ...state, observer: "agent" }, null, 2)}\n`, "utf8");
  return made;
}

function recorder(calls: Call[], answer = "observed"): GenerateText {
  return async ({ parts, instruction }) => {
    calls.push({
      instruction,
      mimeTypes: parts.flatMap((part) => part.inlineData?.mimeType === undefined ? [] : [part.inlineData.mimeType]),
      text: parts.flatMap((part) => part.text === undefined ? [] : [part.text]).join("\n"),
    });
    return answer;
  };
}

function tools(root: string, calls: Call[], answer?: string) {
  return createReferenceVideoTools({ workspaceRoot: root, concurrency: 4, launchGapMs: 0, retryDelayMs: 0, generate: recorder(calls, answer) });
}

test("installed packages can be listed, and one that will not load is reported rather than hidden", async () => {
  const root = await mkdtemp(join(tmpdir(), "reference-video-tools-scope-"));
  const scope = join(root, "node_modules", "@hypit");
  await mkdir(join(scope, "with-activation"), { recursive: true });
  await mkdir(join(scope, "plain-library"), { recursive: true });
  await writeFile(join(scope, "with-activation", "package.json"),
    JSON.stringify({ name: "@hypit/with-activation", description: "declares a Surface", hypit: { activation: "./src/activation.ts" } }), "utf8");
  await writeFile(join(scope, "plain-library", "package.json"),
    JSON.stringify({ name: "@hypit/plain-library" }), "utf8");

  const result = await createReferenceVideoTools({ packageRoot: root, generate: async () => "" }).list_svml_packages();
  const packages = result["packages"] as readonly Record<string, unknown>[];
  assert.deepEqual(packages.map((item) => item["package_name"]), ["@hypit/with-activation"],
    "a package without an activation contributes no author vocabulary and is not vocabulary to discover");
  assert.equal(packages[0]!["description"], "declares a Surface");
  assert.equal(typeof packages[0]!["unreadable"], "string",
    "a package that declares an activation it cannot load is named, not silently dropped");
  assert.equal(packages[0]!["tags"] !== undefined
    && (packages[0]!["tags"] as readonly unknown[]).includes(null), false,
    "a facet that is not a Markup Surface has no tag, and reading one out of it produced a null entry");
});

test("observation covers picture, drawn type and sound for every shot and caches every key", async () => {
  const { root, stateRoot } = await workspace(2);
  const calls: Call[] = [];
  const result = await tools(root, calls).observe_reference({ reference_id: REFERENCE });

  const cache = JSON.parse(await readFile(join(stateRoot, "observations.json"), "utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(cache).sort(), [
    "audio:shot-001", "audio:shot-002",
    "boundary:shot-002",
    "type:shot-001", "type:shot-002",
    "visual:shot-001", "visual:shot-002",
  ], "one cut is one observation, not a same-take question and an overlay question over the same media");

  const shots = result["shots"] as readonly Record<string, unknown>[];
  assert.equal(shots.length, 2);
  assert.deepEqual(Object.keys(shots[0]!).sort(), ["audio", "shot_id", "text_appearance", "visual"]);
  assert.deepEqual(result["unresolved"], []);

  const picture = calls.find((call) => call.instruction.startsWith("Observe picture only"))!;
  assert.match(picture.text, /does this picture move at all/u,
    "whether a stretch of picture moves decides whether it is generated or held as a still");
  assert.match(picture.text, /depicted scene/u);
  assert.match(picture.text, /flat designed field/u);
  assert.match(picture.text, /the picture inside the frame and the frame itself separately/u);
  assert.match(picture.text, /persistent on-screen system evidence/u);

  const type = calls.find((call) => call.instruction.startsWith("Observe the appearance of on-screen text"))!;
  assert.match(type.text, /outline or stroke/u);
  assert.match(type.text, /drop shadow/u);
  assert.match(type.text, /typeface character/u);
});

test("a second observation reuses the cache and only an explicit reobserve runs the model again", async () => {
  const { root } = await workspace(2);
  const first: Call[] = [];
  await tools(root, first).observe_reference({ reference_id: REFERENCE });
  assert.equal(first.length, 7, "two shots: picture, type and sound each, plus one shared boundary");

  const second: Call[] = [];
  await tools(root, second).observe_reference({ reference_id: REFERENCE });
  assert.deepEqual(second, []);

  const selected: Call[] = [];
  await tools(root, selected).observe_reference({ reference_id: REFERENCE, shot_ids: ["shot-002"] });
  assert.deepEqual(selected, [], "naming a shot must not silently re-run its cached observations");

  const forced: Call[] = [];
  await tools(root, forced).observe_reference({ reference_id: REFERENCE, shot_ids: ["shot-002"], reobserve: true });
  assert.equal(forced.length, 4, "reobserve reruns the selected shot's picture, type and sound plus its one boundary, and nothing else");
});

test("a narrow question costs one call, answers from the named shots and never re-runs observations", async () => {
  const { root, stateRoot } = await workspace(4);
  const calls: Call[] = [];
  const result = await tools(root, calls, "the caption sits above the lower edge")
    .observe_reference({ reference_id: REFERENCE, shot_ids: ["shot-003"], question: "How thick is the caption outline?" });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.mimeTypes, ["video/mp4", "image/jpeg"]);
  assert.equal(calls[0]!.text, "How thick is the caption outline?");
  assert.deepEqual(result["shot_ids"], ["shot-003"]);
  assert.deepEqual(result["answer"], { status: "complete", text: "the caption sits above the lower edge" });
  assert.equal(await readFile(join(stateRoot, "observations.json"), "utf8"), "{}\n");

  await assert.rejects(
    tools(root, []).observe_reference({ reference_id: REFERENCE, question: "which shot?" }),
    /question requires at least one shot id/u);
  await assert.rejects(
    tools(root, []).observe_reference({ reference_id: REFERENCE, shot_ids: ["shot-001", "shot-002", "shot-003", "shot-004"], question: "which shot?" }),
    /at most three shots/u);
});

test("reconstruction comparison sends an unlabelled pair and accepts rendered PNG frames", async () => {
  const { root } = await workspace(1);
  const rendered = join(root, "rendered.png");
  await writeFile(rendered, "rendered-bytes", "utf8");
  const calls: Call[] = [];
  const result = await tools(root, calls, "the list starts lower in one image")
    .compare_reconstruction({ reference_id: REFERENCE, shot_id: "shot-001", image_path: rendered, question: "only the full-screen list area" });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.mimeTypes, ["image/jpeg", "image/png"]);
  assert.match(calls[0]!.text, /image one, then image two/u);
  assert.match(calls[0]!.text, /only the full-screen list area/u);
  assert.doesNotMatch(calls[0]!.text, /reconstruction|rendered|generated|authored|component|SVML/iu,
    "the comparison must never say which image was built or how");
  assert.match(calls[0]!.instruction, /You are not told how either image was made/u);
  assert.deepEqual(result["differences"], { status: "complete", text: "the list starts lower in one image" });

  await assert.rejects(
    tools(root, []).compare_reconstruction({ reference_id: REFERENCE, shot_id: "shot-009", image_path: rendered }),
    /shot shot-009 does not exist/u);
});

test("an unsupported media extension fails loudly instead of being sent as opaque bytes", async () => {
  const { root } = await workspace(1);
  const rendered = join(root, "rendered.tiff");
  await writeFile(rendered, "rendered-bytes", "utf8");
  await assert.rejects(
    tools(root, []).compare_reconstruction({ reference_id: REFERENCE, shot_id: "shot-001", image_path: rendered }),
    /unsupported media extension/u);
});

test("a rejected request fails once instead of being retried until the loop gives up", async () => {
  const { root } = await workspace(1);
  let attempts = 0;
  const rejecting = createReferenceVideoTools({
    workspaceRoot: root,
    concurrency: 4,
    launchGapMs: 0,
    retryDelayMs: 0,
    generate: async () => {
      attempts += 1;
      throw new Error(`{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}`);
    },
  });
  const result = await rejecting.observe_reference({ reference_id: REFERENCE });
  assert.equal(attempts, 3, "one shot has three observations, and each one must give up after a single rejected request");
  assert.deepEqual([...(result["unresolved"] as readonly string[])].sort(), ["audio:shot-001", "type:shot-001", "visual:shot-001"]);
});

test("a failed observation is reported as unresolved instead of an empty list", async () => {
  const { root } = await workspace(1);
  const failing = createReferenceVideoTools({
    workspaceRoot: root,
    concurrency: 4,
    launchGapMs: 0,
    retryDelayMs: 0,
    generate: async ({ instruction }) => {
      if (instruction.startsWith("Observe the appearance of on-screen text")) throw new Error("model refused");
      return "observed";
    },
  });
  const result = await failing.observe_reference({ reference_id: REFERENCE });
  assert.deepEqual(result["unresolved"], ["type:shot-001"]);
});

test("the agent observer hands every observation out as a task, with pictures, and calls no model", async () => {
  const { root, stateRoot } = await agentWorkspace(3);
  const calls: Call[] = [];
  const result = await tools(root, calls).observe_reference({ reference_id: REFERENCE });

  assert.equal(calls.length, 0, "the agent observer is the model; nothing may be generated on its behalf");
  assert.equal(result["observer"], "agent");
  const pending = result["pending_observations"] as readonly { key: string; prompt: string; image_refs: readonly string[] }[];
  assert.deepEqual(pending.map((task) => task.key).sort(), [
    "audio:shot-001", "audio:shot-002", "audio:shot-003",
    "boundary:shot-002", "boundary:shot-003",
    "type:shot-001", "type:shot-002", "type:shot-003",
    "visual:shot-001", "visual:shot-002", "visual:shot-003",
  ], "the same keys the Gemini observer answers, so everything downstream reads one shape");

  const visual = pending.find((task) => task.key === "visual:shot-002")!;
  assert.deepEqual(visual.image_refs.map((path) => path.split(/[\\/]/).at(-1)), ["002-frames.jpg", "002-representative.jpg", "001-tail.jpg"],
    "the shot's clip is replaced by the tile of its frames; the still evidence is unchanged");
  assert.equal(visual.image_refs.some((path) => path.endsWith(".mp4")), false, "an observer that reads pictures is never handed video");
  assert.match(visual.prompt, /grid of frames is one shot/u, "the tile has to be described, or a grid reads as one picture");
  assert.doesNotMatch(visual.prompt, /cannot hear/u, "a picture question carries no note about sound it never asked for");

  const audio = pending.find((task) => task.key === "audio:shot-002")!;
  assert.match(audio.prompt, /cannot hear this reference/u, "a question that needs sound says the sound is missing rather than inviting a guess");
  assert.equal(audio.image_refs.some((path) => path.endsWith(".wav")), false, "audio has no picture to become");

  const cached = JSON.parse(await readFile(join(stateRoot, "observations.json"), "utf8")) as Record<string, unknown>;
  assert.deepEqual(cached, {}, "a task handed out is not an answer received, so nothing is cached yet");
});

test("a recorded observation completes its key, and the whole-reference ones land in the state", async () => {
  const { root, stateRoot } = await agentWorkspace(3);
  const calls: Call[] = [];
  const kit = tools(root, calls);

  const shot = await kit.record_observation({ reference_id: REFERENCE, key: "visual:shot-002", text: "a flat designed field of colour columns" });
  assert.equal(shot["stored_in"], "observations");
  const whole = await kit.record_observation({ reference_id: REFERENCE, key: "places", text: "one room, one camera position" });
  assert.equal(whole["stored_in"], "state");

  const again = await kit.observe_reference({ reference_id: REFERENCE });
  const pending = (again["pending_observations"] as readonly { key: string }[]).map((task) => task.key);
  assert.equal(pending.includes("visual:shot-002"), false, "an answered observation is not handed out a second time");
  assert.equal(pending.includes("visual:shot-001"), true, "the rest are still owed");
  const observed = (again["shots"] as readonly Record<string, { status: string; text: string }>[])
    .find((entry) => (entry["shot_id"] as unknown as string) === "shot-002")!;
  assert.equal(observed["visual"]!.status, "complete");
  assert.equal(observed["visual"]!.text, "a flat designed field of colour columns");
  assert.equal(observed["audio"]!.status, "pending", "an unanswered observation is pending, which is not a failure");

  const state = JSON.parse(await readFile(join(stateRoot, "state.json"), "utf8")) as Record<string, { text: string }>;
  assert.equal(state["places"]!.text, "one room, one camera position");
  assert.equal(calls.length, 0);
});

test("a reference keeps the observer it was prepared with", async () => {
  const { root } = await agentWorkspace(2);
  const calls: Call[] = [];
  await assert.rejects(
    () => tools(root, calls).record_observation({ reference_id: REFERENCE, key: "visual:shot-001", text: "x" })
      .then(async () => {
        const gemini = await workspace(2);
        return await tools(gemini.root, calls).record_observation({ reference_id: REFERENCE, key: "visual:shot-001", text: "x" });
      }),
    /read by the gemini observer/u,
    "recording an answer against a reference Gemini is reading would mix two kinds of evidence under one key");
});
