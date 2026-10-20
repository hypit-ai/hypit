import assert from "node:assert/strict";
import test from "node:test";

import { blobTypes } from "@hypit/hypit/blob";
import { parseStructuredElement } from "@hypit/markup";
import type { StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/hypit/markup";
import { textTypes } from "@hypit/hypit/text";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  decodeSeedanceFrameVideoSurface,
  decodeSeedanceReferenceVideoSurface,
  decodeSeedanceTextVideoSurface,
} from "../src/index.js";

const refs = new Map<string, SurfaceResolvedReference>([
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

async function decode(source: string, handler: StructuredSurfaceHandler, references = refs) {
  const element = parseStructuredElement({ name: "seedance.svml", text: source }, 0).element;
  return await handler({
    sourceName: "seedance.svml",
    element,
    resolveReference: (path) => references.get(path),
    resolveAsset: () => { throw new Error("no asset"); },
  });
}

test("TextVideo exposes prompt-only generation without inventing a usage", async () => {
  const result = await decode(
    '<seedance:TextVideo id="motion" model="mini" prompt={direction} duration="6" resolution="720p" aspect-ratio="9:16" generate-audio="false" web-search="true"/>',
    decodeSeedanceTextVideoSurface,
  );
  assert.deepEqual(result.components[0]?.inputs["prompt:text"], {
    kind: "component-output", component: "assembled-direction", output: "text",
  });
  assert.deepEqual(result.components[0]?.outputs, { video: "motion.video" });
  assert.equal(Object.keys(result.components[0]?.inputs ?? {}).some((name) => name.includes("media")), false);
});

test("admitted M4A audio is rejected at decode while future audio remains a graph reference", async () => {
  const source = '<seedance:ReferenceVideo id="speaker" model="mini" prompt={direction} duration="6"><seedance:Reference image={generated.image} person-reference="true"/><seedance:Reference audio={voice.audio}/></seedance:ReferenceVideo>';
  for (const mediaType of ["audio/mp4", "audio/x-m4a", "audio/wav", "audio/mpeg"]) {
    const admitted = new Map(refs);
    admitted.set("voice.audio", {
      ...refs.get("voice.audio")!,
      record: {
        id: "voice", type: blobTypes.blob,
        value: { kind: "blob", resource: fixtureResource("admitted-voice"), size: 4, mediaType },
      },
    });
    if (mediaType === "audio/mp4" || mediaType === "audio/x-m4a") {
      await assert.rejects(decode(source, decodeSeedanceReferenceVideoSurface, admitted), /m4a/);
    } else {
      assert.ok((await decode(source, decodeSeedanceReferenceVideoSurface, admitted)).components.length);
    }
  }
  const future = await decode(source, decodeSeedanceReferenceVideoSurface);
  assert.deepEqual(future.components[0]!.inputs["media-0002:artifact"], refs.get("voice.audio")!.ref);
});

test("Seedance 2.5 is an exact model with 1080p and auto or 4-30 second duration", async () => {
  const automatic = await decode(
    '<seedance:TextVideo id="motion" model="2.5" prompt={direction} duration="-1" resolution="1080p" aspect-ratio="9:16"/>',
    decodeSeedanceTextVideoSurface,
  );
  assert.deepEqual(automatic.components[0]?.outputs, { video: "motion.video" });
  await assert.rejects(
    async () => await decode(
      '<seedance:TextVideo id="invalid" model="2.5" prompt={direction} duration="3"/>',
      decodeSeedanceTextVideoSurface,
    ),
    /-1 \(auto\) or between 4 and 30/u,
  );
});

test("FrameVideo exposes first-frame and optional last-frame as exact model ports", async () => {
  const result = await decode(
    '<seedance:FrameVideo id="bridge" model="fast" prompt={direction} duration="5" first-frame={first.image} first-frame-person-reference="true" last-frame={last.image} last-frame-person-reference="false"/>',
    decodeSeedanceFrameVideoSurface,
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
    decodeSeedanceReferenceVideoSurface,
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
  assert.equal(JSON.stringify(draft.value).includes("referenceImage"), false,
    "runtime references must remain graph edges rather than authored draft metadata");
});

test("the three Surfaces make incompatible invocation shapes unrepresentable", async () => {
  await assert.rejects(
    async () => await decode(
      '<seedance:ReferenceVideo id="empty" model="mini" prompt={direction} duration="5"/>',
      decodeSeedanceReferenceVideoSurface,
    ),
    /requires at least one Reference/u,
  );
  await assert.rejects(
    async () => await decode(
      '<seedance:ReferenceVideo id="search" model="mini" prompt={direction} duration="5" web-search="true"><seedance:Reference image={generated.image} person-reference="true"/></seedance:ReferenceVideo>',
      decodeSeedanceReferenceVideoSurface,
    ),
    /requires/u,
  );
});

test("visual reference classification survives authoring as per-input metadata", async () => {
  const result = await decode(`<seedance:ReferenceVideo id="motion" model="mini" prompt={direction} duration="6">
    <seedance:Reference image={generated.image} person-reference="true"/>
    <seedance:Reference video={first.image} person-reference="false"/>
    <seedance:Reference image={last.image} person-reference="false"/>
  </seedance:ReferenceVideo>`, decodeSeedanceReferenceVideoSurface);
  const bindings = result.records.filter((record) => record.id.endsWith(".binding"));
  assert.deepEqual(bindings.map((record) => record.value), [
    { role: "image", fields: { personReference: true } },
    { role: "video", fields: { personReference: false } },
    { role: "image", fields: { personReference: false } },
  ]);
  const frames = await decode('<seedance:FrameVideo id="frames" model="fast" prompt={direction} duration="5" first-frame={first.image} first-frame-person-reference="true" last-frame={last.image} last-frame-person-reference="false"/>', decodeSeedanceFrameVideoSurface);
  const frameBindings = frames.records.filter((record) => record.id.endsWith(".binding"));
  assert.deepEqual(frameBindings.map((record) => record.value), [
    { role: "image", fields: { personReference: true } },
    { role: "image", fields: { personReference: false } },
  ]);
  await assert.rejects(decode('<seedance:ReferenceVideo id="bad" model="mini" prompt={direction} duration="6"><seedance:Reference audio={voice.audio} person-reference="true"/></seedance:ReferenceVideo>', decodeSeedanceReferenceVideoSurface), /applies to image or video/);
  await assert.rejects(decode('<seedance:ReferenceVideo id="bad" model="mini" prompt={direction} duration="6"><seedance:Reference image={generated.image} person-reference="maybe"/></seedance:ReferenceVideo>', decodeSeedanceReferenceVideoSurface), /must be true or false/);
  await assert.rejects(decode('<seedance:FrameVideo id="bad" model="mini" prompt={direction} duration="6" first-frame={first.image} first-frame-person-reference="true" last-frame-person-reference="true"/>', decodeSeedanceFrameVideoSurface), /requires last-frame/);
});

test("every supplied visual requires classification, while absent frames and audio do not", async () => {
  for (const kind of ["image", "video"]) {
    await assert.rejects(decode(`<seedance:ReferenceVideo id="bad" model="mini" prompt={direction} duration="6"><seedance:Reference ${kind}={generated.image}/></seedance:ReferenceVideo>`, decodeSeedanceReferenceVideoSurface), /person-reference is required/);
  }
  await assert.rejects(decode('<seedance:FrameVideo id="bad" model="fast" prompt={direction} duration="5" first-frame={first.image}/>', decodeSeedanceFrameVideoSurface), /first-frame-person-reference is required/);
  await assert.rejects(decode('<seedance:FrameVideo id="bad" model="fast" prompt={direction} duration="5" first-frame={first.image} first-frame-person-reference="false" last-frame={last.image}/>', decodeSeedanceFrameVideoSurface), /last-frame-person-reference is required/);
  const firstOnly = await decode('<seedance:FrameVideo id="first" model="fast" prompt={direction} duration="5" first-frame={first.image} first-frame-person-reference="false"/>', decodeSeedanceFrameVideoSurface);
  assert.equal(firstOnly.records.filter((record) => record.id.endsWith(".binding")).length, 1);
  const audioOnly = await decode('<seedance:ReferenceVideo id="voice" model="2.5" prompt={direction} duration="5"><seedance:Reference audio={voice.audio}/></seedance:ReferenceVideo>', decodeSeedanceReferenceVideoSurface);
  const binding = audioOnly.records.find((record) => record.id.endsWith(".binding"))!;
  assert.deepEqual(binding.value, { role: "audio" });
});
