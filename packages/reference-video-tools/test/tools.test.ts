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
  // Prepared state is read from the Hypit tree, which HYPIT_REPOSITORY names. A fixture puts the tree
  // in a directory of its own so the state it writes is the state the tools read.
  process.env["HYPIT_REPOSITORY"] = root;
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

function tools(calls: Call[], answer?: string) {
  return createReferenceVideoTools({ concurrency: 4, launchGapMs: 0, retryDelayMs: 0, generate: recorder(calls, answer) });
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
  const { stateRoot } = await workspace(2);
  const calls: Call[] = [];
  const result = await tools(calls).observe_reference({ reference_id: REFERENCE });

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
  await workspace(2);
  const first: Call[] = [];
  await tools(first).observe_reference({ reference_id: REFERENCE });
  assert.equal(first.length, 7, "two shots: picture, type and sound each, plus one shared boundary");

  const second: Call[] = [];
  await tools(second).observe_reference({ reference_id: REFERENCE });
  assert.deepEqual(second, []);

  const selected: Call[] = [];
  await tools(selected).observe_reference({ reference_id: REFERENCE, shot_ids: ["shot-002"] });
  assert.deepEqual(selected, [], "naming a shot must not silently re-run its cached observations");

  const forced: Call[] = [];
  await tools(forced).observe_reference({ reference_id: REFERENCE, shot_ids: ["shot-002"], reobserve: true });
  assert.equal(forced.length, 4, "reobserve reruns the selected shot's picture, type and sound plus its one boundary, and nothing else");
});

test("a narrow question costs one call, answers from the named shots and never re-runs observations", async () => {
  const { stateRoot } = await workspace(4);
  const calls: Call[] = [];
  const result = await tools(calls, "the caption sits above the lower edge")
    .observe_reference({ reference_id: REFERENCE, shot_ids: ["shot-003"], question: "How thick is the caption outline?" });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.mimeTypes, ["video/mp4", "image/jpeg"]);
  assert.equal(calls[0]!.text, "How thick is the caption outline?");
  assert.deepEqual(result["shot_ids"], ["shot-003"]);
  assert.deepEqual(result["answer"], { status: "complete", text: "the caption sits above the lower edge" });
  assert.equal(await readFile(join(stateRoot, "observations.json"), "utf8"), "{}\n");

  await assert.rejects(
    tools([]).observe_reference({ reference_id: REFERENCE, question: "which shot?" }),
    /question requires at least one shot id/u);
  await assert.rejects(
    tools([]).observe_reference({ reference_id: REFERENCE, shot_ids: ["shot-001", "shot-002", "shot-003", "shot-004"], question: "which shot?" }),
    /at most three shots/u);
});

test("reconstruction comparison sends an unlabelled pair and accepts rendered PNG frames", async () => {
  const { root } = await workspace(1);
  const rendered = join(root, "rendered.png");
  await writeFile(rendered, "rendered-bytes", "utf8");
  const calls: Call[] = [];
  const result = await tools(calls, "the list starts lower in one image")
    .compare_reconstruction({ reference_id: REFERENCE, shot_id: "shot-001", image_path: rendered, question: "only the full-screen list area" });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.mimeTypes, ["image/jpeg", "image/png"]);
  assert.match(calls[0]!.text, /supplied in order: one, then two/u);
  assert.match(calls[0]!.text, /only the full-screen list area/u);
  assert.doesNotMatch(calls[0]!.text, /reconstruction|rendered|generated|authored|component|SVML/iu,
    "the comparison must never say which image was built or how");
  assert.match(calls[0]!.instruction, /You are not told how either was made/u);
  assert.deepEqual(result["differences"], { status: "complete", text: "the list starts lower in one image" });

  await assert.rejects(
    tools([]).compare_reconstruction({ reference_id: REFERENCE, shot_id: "shot-009", image_path: rendered }),
    /shot shot-009 does not exist/u);
});

test("an unsupported media extension fails loudly instead of being sent as opaque bytes", async () => {
  const { root } = await workspace(1);
  const rendered = join(root, "rendered.tiff");
  await writeFile(rendered, "rendered-bytes", "utf8");
  await assert.rejects(
    tools([]).compare_reconstruction({ reference_id: REFERENCE, shot_id: "shot-001", image_path: rendered }),
    /unsupported media extension/u);
});

test("a rejected request fails once instead of being retried until the loop gives up", async () => {
  await workspace(1);
  let attempts = 0;
  const rejecting = createReferenceVideoTools({
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
  await workspace(1);
  const failing = createReferenceVideoTools({
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
