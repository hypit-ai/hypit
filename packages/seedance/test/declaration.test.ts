import assert from "node:assert/strict";
import test from "node:test";

import { blobTypes } from "@hypit/hypit/blob";
import type { AuthorDeclarationCompiler, AuthorResolvedReference } from "@hypit/hypit/author";
import { promptTypes } from "@hypit/hypit/prompt";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { compileSvmlDeclaration } from "../../../test/compile-svml-declaration.js";

import {
  seedanceFrameVideoAuthorDeclaration,
  seedanceReferenceVideoAuthorDeclaration,
  seedanceTextVideoAuthorDeclaration,
} from "../src/declaration.js";
import { seedanceModuleRef } from "../src/index.js";

const refs = new Map<string, AuthorResolvedReference>([
  ["direction", {
    ref: { kind: "component-output", component: "assembled-direction", output: "text" },
    type: promptTypes.prompt,
  }],
  ...["first.image", "last.image", "generated.image", "voice.audio"].map((path) => [path, {
    ref: { kind: "component-output" as const, component: path.split(".")[0]!, output: path.split(".")[1]! },
    type: blobTypes.blob,
  }] as const),
]);

async function decode(source: string, compiler: AuthorDeclarationCompiler, references = refs) {
  return await compileSvmlDeclaration({
    source,
    module: seedanceModuleRef,
    alias: "seedance",
    compilers: [compiler],
    references,
  });
}

test("TextVideo exposes one authored Prompt edge and one settings draft", async () => {
  const result = await decode(
    'seedance.text-video { id: motion model: mini prompt: @direction duration: 6 resolution: 720p aspect-ratio: 9:16 generate-audio: false web-search: true }',
    seedanceTextVideoAuthorDeclaration,
  );
  assert.deepEqual(result.components[0]?.inputs["prompt:value"], {
    kind: "component-output", component: "assembled-direction", output: "text",
  });
  assert.deepEqual(result.components[0]?.outputs, { video: "motion.video" });
  assert.deepEqual(Object.keys(result.components[0]?.inputs ?? {}).sort(), ["draft", "prompt:value"]);
});

test("supplied M4A audio is rejected at decode while future audio remains a graph reference", async () => {
  const source = `seedance.reference-video {
    id: speaker model: mini prompt: @direction duration: 6
    Reference { image: @generated.image person-reference: true }
    Reference { audio: @voice.audio }
  }`;
  for (const mediaType of ["audio/mp4", "audio/x-m4a", "audio/wav", "audio/mpeg"]) {
    const supplied = new Map(refs);
    supplied.set("voice.audio", {
      ...refs.get("voice.audio")!,
      record: {
        id: "voice", type: blobTypes.blob,
        value: { kind: "blob", resource: fixtureResource("supplied-voice"), size: 4, mediaType },
      },
    });
    if (mediaType === "audio/mp4" || mediaType === "audio/x-m4a") {
      await assert.rejects(decode(source, seedanceReferenceVideoAuthorDeclaration, supplied), /m4a/);
    } else {
      assert.ok((await decode(source, seedanceReferenceVideoAuthorDeclaration, supplied)).components.length);
    }
  }
  const future = await decode(source, seedanceReferenceVideoAuthorDeclaration);
  assert.deepEqual(future.components[0]!.inputs["media-0002:artifact"], refs.get("voice.audio")!.ref);
});

test("Seedance 2.5 is an exact model with 1080p and auto or 4-30 second duration", async () => {
  const automatic = await decode(
    'seedance.text-video { id: motion model: 2.5 prompt: @direction duration: -1 resolution: 1080p aspect-ratio: 9:16 }',
    seedanceTextVideoAuthorDeclaration,
  );
  assert.deepEqual(automatic.components[0]?.outputs, { video: "motion.video" });
  await assert.rejects(
    async () => await decode(
      'seedance.text-video { id: invalid model: 2.5 prompt: @direction duration: 3 }',
      seedanceTextVideoAuthorDeclaration,
    ),
    /must be one of -1, 4/u,
  );
});

test("FrameVideo exposes first-frame and optional last-frame as exact Model fields", async () => {
  const result = await decode(
    'seedance.frame-video { id: bridge model: fast prompt: @direction duration: 5 first-frame: @first.image first-frame-person-reference: true last-frame: @last.image last-frame-person-reference: false }',
    seedanceFrameVideoAuthorDeclaration,
  );
  const component = result.components[0]!;
  assert.deepEqual(component.inputs["media-0001:artifact"], {
    kind: "component-output", component: "first", output: "image",
  });
  assert.deepEqual(component.inputs["media-0002:artifact"], {
    kind: "component-output", component: "last", output: "image",
  });
  const bindings = result.records.filter((record) => record.id.includes(".binding"));
  assert.equal(bindings.length, 2);
  assert.equal(Object.keys(component.inputs).filter((name) => name.endsWith(":artifact")).length, 2);
});

test("ReferenceVideo keeps rendered Prompt and heterogeneous references on explicit graph edges", async () => {
  const result = await decode(
    `seedance.reference-video {
      id: speaker model: mini prompt: @direction duration: 6 generate-audio: true
      Reference { image: @generated.image person-reference: true }
      Reference { audio: @voice.audio }
    }`,
    seedanceReferenceVideoAuthorDeclaration,
  );
  const component = result.components[0]!;
  assert.deepEqual(component.inputs["media-0001:artifact"], {
    kind: "component-output", component: "generated", output: "image",
  });
  assert.deepEqual(component.inputs["media-0002:artifact"], {
    kind: "component-output", component: "voice", output: "audio",
  });
  assert.deepEqual(component.inputs["prompt:value"], {
    kind: "component-output", component: "assembled-direction", output: "text",
  });
  const draft = result.records.find((record) => record.id === "speaker.draft");
  assert.ok(draft);
  assert.deepEqual(draft.value, { fields: {
    aspectRatio: ["9:16"], duration: [6], generateAudio: [true], resolution: ["720p"], webSearch: [false],
  } });
});

test("the three declarations make incompatible invocation shapes unrepresentable", async () => {
  await assert.rejects(
    async () => await decode(
      'seedance.reference-video { id: empty model: mini prompt: @direction duration: 5 }',
      seedanceReferenceVideoAuthorDeclaration,
    ),
    /requires at least one Reference/u,
  );
  await assert.rejects(
    async () => await decode(
      'seedance.reference-video { id: search model: mini prompt: @direction duration: 5 web-search: true Reference { image: @generated.image person-reference: true } }',
      seedanceReferenceVideoAuthorDeclaration,
    ),
    /does not declare field web-search/u,
  );
});

test("visual reference classification survives authoring as per-input metadata", async () => {
  const result = await decode(`seedance.reference-video {
    id: motion model: mini prompt: @direction duration: 6
    Reference { image: @generated.image person-reference: true }
    Reference { video: @first.image person-reference: false }
    Reference { image: @last.image person-reference: false }
  }`, seedanceReferenceVideoAuthorDeclaration);
  const bindings = result.records.filter((record) => record.id.endsWith(".binding"));
  assert.deepEqual(bindings.map((record) => record.value), [
    { role: "image", fields: { personReference: true } },
    { role: "video", fields: { personReference: false } },
    { role: "image", fields: { personReference: false } },
  ]);
  const frames = await decode('seedance.frame-video { id: frames model: fast prompt: @direction duration: 5 first-frame: @first.image first-frame-person-reference: true last-frame: @last.image last-frame-person-reference: false }', seedanceFrameVideoAuthorDeclaration);
  const frameBindings = frames.records.filter((record) => record.id.endsWith(".binding"));
  assert.deepEqual(frameBindings.map((record) => record.value), [
    { role: "image", fields: { personReference: true } },
    { role: "image", fields: { personReference: false } },
  ]);
  await assert.rejects(decode('seedance.reference-video { id: bad model: mini prompt: @direction duration: 6 Reference { audio: @voice.audio person-reference: true } }', seedanceReferenceVideoAuthorDeclaration), /applies to image or video/);
  await assert.rejects(decode('seedance.reference-video { id: bad model: mini prompt: @direction duration: 6 Reference { image: @generated.image person-reference: maybe } }', seedanceReferenceVideoAuthorDeclaration), /unsupported value|must be true or false/u);
  await assert.rejects(decode('seedance.frame-video { id: bad model: mini prompt: @direction duration: 6 first-frame: @first.image first-frame-person-reference: true last-frame-person-reference: true }', seedanceFrameVideoAuthorDeclaration), /requires last-frame/);
});

test("every supplied visual requires classification, while absent frames and audio do not", async () => {
  for (const kind of ["image", "video"]) {
    await assert.rejects(decode(`seedance.reference-video { id: bad model: mini prompt: @direction duration: 6 Reference { ${kind}: @generated.image } }`, seedanceReferenceVideoAuthorDeclaration), /person-reference is required/);
  }
  await assert.rejects(decode('seedance.frame-video { id: bad model: fast prompt: @direction duration: 5 first-frame: @first.image }', seedanceFrameVideoAuthorDeclaration), /requires field first-frame-person-reference|first-frame-person-reference is required/u);
  await assert.rejects(decode('seedance.frame-video { id: bad model: fast prompt: @direction duration: 5 first-frame: @first.image first-frame-person-reference: false last-frame: @last.image }', seedanceFrameVideoAuthorDeclaration), /last-frame-person-reference is required/);
  const firstOnly = await decode('seedance.frame-video { id: first model: fast prompt: @direction duration: 5 first-frame: @first.image first-frame-person-reference: false }', seedanceFrameVideoAuthorDeclaration);
  assert.equal(firstOnly.records.filter((record) => record.id.endsWith(".binding")).length, 1);
  const audioOnly = await decode('seedance.reference-video { id: voice model: 2.5 prompt: @direction duration: 5 Reference { audio: @voice.audio } }', seedanceReferenceVideoAuthorDeclaration);
  const binding = audioOnly.records.find((record) => record.id.endsWith(".binding"))!;
  assert.deepEqual(binding.value, { role: "audio" });
});
