import assert from "node:assert/strict";
import test from "node:test";

import { artifactTypes } from "@hypit/artifact";
import { parseStructuredElement } from "@hypit/markup";
import type { StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/markup";
import { textTypes } from "@hypit/text";

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
    type: artifactTypes.blob,
  }] as const),
]);

async function decode(source: string, handler: StructuredSurfaceHandler) {
  const element = parseStructuredElement({ name: "seedance.svml", text: source }, 0).element;
  return await handler({
    sourceName: "seedance.svml",
    element,
    resolveReference: (path) => refs.get(path),
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
    '<seedance:FrameVideo id="bridge" model="fast" prompt={direction} duration="5" first-frame={first.image} last-frame={last.image}/>',
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

test("ReferenceVideo keeps generated Text and heterogeneous references on explicit graph edges", async () => {
  const result = await decode(
    `<seedance:ReferenceVideo id="speaker" model="mini" prompt={direction} duration="6" generate-audio="true">
      <seedance:Reference image={generated.image}/>
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
  assert.ok(draft?.value.kind === "inline");
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
      '<seedance:ReferenceVideo id="search" model="mini" prompt={direction} duration="5" web-search="true"><seedance:Reference image={generated.image}/></seedance:ReferenceVideo>',
      decodeSeedanceReferenceVideoSurface,
    ),
    /requires/u,
  );
});
