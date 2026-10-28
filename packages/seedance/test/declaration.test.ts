import assert from "node:assert/strict";
import test from "node:test";

import { blobTypes } from "@hypit/hypit/blob";
import type { AuthorDeclarationCompiler, AuthorResolvedReference } from "@hypit/hypit/author";
import { textTypes } from "@hypit/hypit/text";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { compileMarkupDeclaration } from "../../../test/compile-markup-declaration.js";

import {
  seedanceFrameVideoAuthorDeclaration,
  seedanceMarkupDeclarations,
  seedanceReferenceVideoAuthorDeclaration,
  seedanceTextVideoAuthorDeclaration,
} from "../src/declaration.js";
import { seedanceModuleRef } from "../src/index.js";

const refs = new Map<string, AuthorResolvedReference>([
  ["direction", {
    path: "direction",
    ref: { kind: "component-output", component: "assembled-direction", output: "text" },
    type: textTypes.text,
  }],
  ...["first.image", "last.image", "generated.image", "voice.audio"].map((path) => [path, {
    path,
    ref: { kind: "component-output" as const, component: path.split(".")[0]!, output: path.split(".")[1]! },
    type: blobTypes.blob,
  }] as const),
]);

async function decode(source: string, compiler: AuthorDeclarationCompiler, references = refs) {
  return await compileMarkupDeclaration({
    source,
    module: seedanceModuleRef,
    alias: "seedance",
    compilers: [compiler],
    syntax: seedanceMarkupDeclarations,
    references,
  });
}

test("TextVideo exposes one authored Text edge and one settings draft", async () => {
  const result = await decode(
    '<seedance:TextVideo id="motion" model="mini" prompt={direction} duration="6" resolution="720p" aspect-ratio="9:16" generate-audio="false" web-search="true"/>',
    seedanceTextVideoAuthorDeclaration,
  );
  assert.deepEqual(result.components[0]?.inputs["prompt:text"], {
    kind: "component-output", component: "assembled-direction", output: "text",
  });
  assert.deepEqual(result.components[0]?.outputs, { video: "motion.video" });
  assert.deepEqual(Object.keys(result.components[0]?.inputs ?? {}).sort(), ["draft", "prompt:text"]);
});

test("supplied M4A audio is rejected at decode while future audio remains a graph reference", async () => {
  const source = '<seedance:ReferenceVideo id="speaker" model="mini" prompt={direction} duration="6"><seedance:Reference image={generated.image} person-reference="true"/><seedance:Reference audio={voice.audio}/></seedance:ReferenceVideo>';
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
    '<seedance:TextVideo id="motion" model="2.5" prompt={direction} duration="-1" resolution="1080p" aspect-ratio="9:16"/>',
    seedanceTextVideoAuthorDeclaration,
  );
  assert.deepEqual(automatic.components[0]?.outputs, { video: "motion.video" });
  await assert.rejects(
    async () => await decode(
      '<seedance:TextVideo id="invalid" model="2.5" prompt={direction} duration="3"/>',
      seedanceTextVideoAuthorDeclaration,
    ),
    /must be one of -1, 4/u,
  );
});

test("FrameVideo exposes first-frame and optional last-frame as exact Model fields", async () => {
  const result = await decode(
    '<seedance:FrameVideo id="bridge" model="fast" prompt={direction} duration="5" first-frame={first.image} first-frame-person-reference="true" last-frame={last.image} last-frame-person-reference="false"/>',
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

test("ReferenceVideo keeps rendered prompt Text and heterogeneous references on explicit graph edges", async () => {
  const result = await decode(
    `<seedance:ReferenceVideo id="speaker" model="mini" prompt={direction} duration="6" generate-audio="true">
      <seedance:Reference image={generated.image} person-reference="true"/>
      <seedance:Reference audio={voice.audio}/>
    </seedance:ReferenceVideo>`,
    seedanceReferenceVideoAuthorDeclaration,
  );
  const component = result.components[0]!;
  assert.deepEqual(component.inputs["media-0001:artifact"], {
    kind: "component-output", component: "generated", output: "image",
  });
  assert.deepEqual(component.inputs["media-0002:artifact"], {
    kind: "component-output", component: "voice", output: "audio",
  });
  assert.deepEqual(component.inputs["prompt:text"], {
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
      '<seedance:ReferenceVideo id="empty" model="mini" prompt={direction} duration="5"/>',
      seedanceReferenceVideoAuthorDeclaration,
    ),
    /requires at least one Reference/u,
  );
  await assert.rejects(
    async () => await decode(
      '<seedance:ReferenceVideo id="search" model="mini" prompt={direction} duration="5" web-search="true"><seedance:Reference image={generated.image} person-reference="true"/></seedance:ReferenceVideo>',
      seedanceReferenceVideoAuthorDeclaration,
    ),
    /does not declare field web-search/u,
  );
});

test("visual reference classification survives authoring as per-input metadata", async () => {
  const result = await decode(`<seedance:ReferenceVideo id="motion" model="mini" prompt={direction} duration="6">
    <seedance:Reference image={generated.image} person-reference="true"/>
    <seedance:Reference video={first.image} person-reference="false"/>
    <seedance:Reference image={last.image} person-reference="false"/>
  </seedance:ReferenceVideo>`, seedanceReferenceVideoAuthorDeclaration);
  const bindings = result.records.filter((record) => record.id.endsWith(".binding"));
  assert.deepEqual(bindings.map((record) => record.value), [
    { role: "image", fields: { personReference: true } },
    { role: "video", fields: { personReference: false } },
    { role: "image", fields: { personReference: false } },
  ]);
  const frames = await decode('<seedance:FrameVideo id="frames" model="fast" prompt={direction} duration="5" first-frame={first.image} first-frame-person-reference="true" last-frame={last.image} last-frame-person-reference="false"/>', seedanceFrameVideoAuthorDeclaration);
  const frameBindings = frames.records.filter((record) => record.id.endsWith(".binding"));
  assert.deepEqual(frameBindings.map((record) => record.value), [
    { role: "image", fields: { personReference: true } },
    { role: "image", fields: { personReference: false } },
  ]);
  await assert.rejects(decode('<seedance:ReferenceVideo id="bad" model="mini" prompt={direction} duration="6"><seedance:Reference audio={voice.audio} person-reference="true"/></seedance:ReferenceVideo>', seedanceReferenceVideoAuthorDeclaration), /applies to image or video/);
  await assert.rejects(decode('<seedance:ReferenceVideo id="bad" model="mini" prompt={direction} duration="6"><seedance:Reference image={generated.image} person-reference="maybe"/></seedance:ReferenceVideo>', seedanceReferenceVideoAuthorDeclaration), /unsupported value|must be true or false/u);
  await assert.rejects(decode('<seedance:FrameVideo id="bad" model="mini" prompt={direction} duration="6" first-frame={first.image} first-frame-person-reference="true" last-frame-person-reference="true"/>', seedanceFrameVideoAuthorDeclaration), /requires last-frame/);
});

test("every supplied visual requires classification, while absent frames and audio do not", async () => {
  for (const kind of ["image", "video"]) {
    await assert.rejects(decode(`<seedance:ReferenceVideo id="bad" model="mini" prompt={direction} duration="6"><seedance:Reference ${kind}={generated.image}/></seedance:ReferenceVideo>`, seedanceReferenceVideoAuthorDeclaration), /person-reference is required/);
  }
  await assert.rejects(decode('<seedance:FrameVideo id="bad" model="fast" prompt={direction} duration="5" first-frame={first.image}/>', seedanceFrameVideoAuthorDeclaration), /requires field first-frame-person-reference|first-frame-person-reference is required/u);
  await assert.rejects(decode('<seedance:FrameVideo id="bad" model="fast" prompt={direction} duration="5" first-frame={first.image} first-frame-person-reference="false" last-frame={last.image}/>', seedanceFrameVideoAuthorDeclaration), /last-frame-person-reference is required/);
  const firstOnly = await decode('<seedance:FrameVideo id="first" model="fast" prompt={direction} duration="5" first-frame={first.image} first-frame-person-reference="false"/>', seedanceFrameVideoAuthorDeclaration);
  assert.equal(firstOnly.records.filter((record) => record.id.endsWith(".binding")).length, 1);
  const audioOnly = await decode('<seedance:ReferenceVideo id="voice" model="2.5" prompt={direction} duration="5"><seedance:Reference audio={voice.audio}/></seedance:ReferenceVideo>', seedanceReferenceVideoAuthorDeclaration);
  const binding = audioOnly.records.find((record) => record.id.endsWith(".binding"))!;
  assert.deepEqual(binding.value, { role: "audio" });
});
