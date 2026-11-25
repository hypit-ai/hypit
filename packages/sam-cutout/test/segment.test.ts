import assert from "node:assert/strict";
import test from "node:test";

import { blobTypes } from "@hypit/blob";
import { parseStructuredElement } from "@hypit/markup";
import type { StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/markup";

import pkg from "../src/activation.js";
import { decodeSamSegmentSurface } from "../src/segment-surface.js";

const shot: SurfaceResolvedReference = {
  path: "shot",
  ref: { kind: "component-output", component: "shot", output: "video" },
  type: blobTypes.blob,
  record: {
    id: "shot.video",
    type: blobTypes.blob,
    value: { kind: "blob", mediaType: "video/mp4", resource: "res://shot" },
  },
} as unknown as SurfaceResolvedReference;

const still: SurfaceResolvedReference = {
  path: "still",
  ref: { kind: "component-output", component: "still", output: "image" },
  type: blobTypes.blob,
  record: {
    id: "still.image",
    type: blobTypes.blob,
    value: { kind: "blob", mediaType: "image/png", resource: "res://still" },
  },
} as unknown as SurfaceResolvedReference;

const refs = new Map<string, SurfaceResolvedReference>([["shot", shot], ["still", still]]);

function draftPorts(record: { readonly value: unknown } | undefined): unknown {
  return (record?.value as { readonly value?: { readonly ports?: unknown } })?.value?.ports;
}

async function decode(source: string, handler: StructuredSurfaceHandler = decodeSamSegmentSurface) {
  const element = parseStructuredElement({ name: "sam.svml", text: source }, 0).element;
  return await handler({
    sourceName: "sam.svml",
    element,
    resolveReference: (path) => refs.get(path),
    resolveAsset: () => { throw new Error("no asset"); },
  });
}

test("Segment keeps one mask Artifact per authored object", async () => {
  const result = await decode('<sam:Segment id="tracked" prompt="person" also="ball, red card" source={shot}/>');
  const component = result.components[0]!;
  assert.deepEqual(component.outputs, {
    person: "tracked.person",
    ball: "tracked.ball",
    "red-card": "tracked.red-card",
  });
  const draft = result.records.find((record) => record.id === "tracked.draft");
  assert.deepEqual(draftPorts(draft), {
    prompt: ["person", "ball", "red card"],
    format: ["WEBM"],
  });
  const fragment = result.fragments[0]!;
  assert.deepEqual(fragment.operations.map((operation) => operation.id), [
    "bind:0001:source",
    "finalize-request",
    "generate",
    "select-mask:0001",
    "select-mask:0002",
    "select-mask:0003",
  ]);
  // Exports are canonicalized by name, so the authoring order lives in the selector ordinals.
  assert.deepEqual(Object.fromEntries(fragment.exports.map((entry) => [
    entry.name,
    (entry.root as { readonly operation: string }).operation,
  ])), {
    person: "select-mask:0001",
    ball: "select-mask:0002",
    "red-card": "select-mask:0003",
  });
});

test("Segment accepts a single object and matches the Cutout grammar", async () => {
  const result = await decode('<sam:Segment id="one" prompt="person" source={shot} format="MOV"/>');
  assert.deepEqual(result.components[0]!.outputs, { person: "one.person" });
  const draft = result.records.find((record) => record.id === "one.draft");
  assert.deepEqual(draftPorts(draft), {
    prompt: ["person"],
    format: ["MOV"],
  });
  assert.equal(result.fragments[0]!.operations.filter((op) => op.id.startsWith("select-mask:")).length, 1);
});

test("Segment names objects by geometry and carries boxes and points on the objects port", async () => {
  const result = await decode(`<sam:Segment id="geo" source={shot}>
    <sam:Object name="left hand" box="0.19,0.09,0.81,0.94" frame="0"/>
    <sam:Object name="face" points="0.5,0.3; 0.42,0.36,neg" frame="12"/>
  </sam:Segment>`);
  assert.deepEqual(result.components[0]!.outputs, {
    "left-hand": "geo.left-hand",
    face: "geo.face",
  });
  const ports = draftPorts(result.records.find((record) => record.id === "geo.draft")) as {
    readonly objects: readonly string[];
    readonly prompt?: unknown;
    readonly format: readonly string[];
  };
  assert.equal(ports.prompt, undefined);
  assert.deepEqual(ports.objects.map((entry) => JSON.parse(entry)), [
    { name: "left hand", frame: 0, box: [0.19, 0.09, 0.81, 0.94] },
    { name: "face", frame: 12, points: [{ x: 0.5, y: 0.3 }, { x: 0.42, y: 0.36, negative: true }] },
  ]);
});

test("Segment refuses to mix noun phrases with geometry in one element", async () => {
  await assert.rejects(
    () => decode(`<sam:Segment id="mixed" prompt="person" source={shot}>
      <sam:Object name="hand" box="0.1,0.1,0.2,0.2"/>
    </sam:Segment>`),
    /not both/u,
  );
});

test("Segment requires one of the two request forms", async () => {
  await assert.rejects(
    () => decode('<sam:Segment id="t" source={shot}/>'),
    /requires prompt, or Object children/u,
  );
});

test("Segment refuses backward propagation without an anchor after the first frame", async () => {
  await assert.rejects(
    () => decode('<sam:Segment id="t" prompt="person" propagation="backward" source={shot}/>'),
    /needs an Object anchored on a frame after the first/u,
  );
  await assert.rejects(
    () => decode(`<sam:Segment id="t" propagation="backward" source={shot}>
      <sam:Object name="hand" box="0.1,0.1,0.2,0.2" frame="0"/>
    </sam:Segment>`),
    /needs an Object anchored on a frame after the first/u,
  );
});

test("Segment carries propagation and confidence onto the request", async () => {
  const result = await decode(`<sam:Segment id="t" propagation="backward" min-confidence="0.6" source={shot}>
    <sam:Object name="hand" box="0.1,0.1,0.2,0.2" frame="30"/>
  </sam:Segment>`);
  assert.deepEqual(draftPorts(result.records.find((record) => record.id === "t.draft")), {
    objects: [JSON.stringify({ name: "hand", frame: 30, box: [0.1, 0.1, 0.2, 0.2] })],
    propagation: ["backward"],
    minConfidence: [0.6],
    format: ["WEBM"],
  });
});

test("Segment validates geometry: box ordering, ranges, and point syntax", async () => {
  await assert.rejects(
    () => decode(`<sam:Segment id="t" source={shot}>
      <sam:Object name="hand" box="0.8,0.9,0.2,0.3"/>
    </sam:Segment>`),
    /x1 < x2 and y1 < y2/u,
  );
  await assert.rejects(
    () => decode(`<sam:Segment id="t" source={shot}>
      <sam:Object name="hand" points="1.4,0.3"/>
    </sam:Segment>`),
    /must be a number from 0 to 1/u,
  );
  await assert.rejects(
    () => decode(`<sam:Segment id="t" source={shot}>
      <sam:Object name="hand" points="0.5,0.5,maybe"/>
    </sam:Segment>`),
    /"x,y" or "x,y,neg"/u,
  );
  await assert.rejects(
    () => decode(`<sam:Segment id="t" source={shot}>
      <sam:Object name="hand"/>
    </sam:Segment>`),
    /exactly one of box or points/u,
  );
});

test("Segment refuses duplicate object names and more objects than the graph supports", async () => {
  await assert.rejects(
    () => decode(`<sam:Segment id="t" source={shot}>
      <sam:Object name="Hand" box="0.1,0.1,0.2,0.2"/>
      <sam:Object name="hand" box="0.3,0.3,0.4,0.4"/>
    </sam:Segment>`),
    /repeats the object/u,
  );
  const nine = Array.from({ length: 9 }, (_unused, index) =>
    `<sam:Object name="o${index}" box="0.1,0.1,0.2,0.2"/>`).join("");
  await assert.rejects(
    () => decode(`<sam:Segment id="t" source={shot}>${nine}</sam:Segment>`),
    /at most 8 are supported/u,
  );
});

test("Segment rejects an unknown propagation direction and out-of-range confidence", async () => {
  await assert.rejects(
    () => decode('<sam:Segment id="t" prompt="person" propagation="sideways" source={shot}/>'),
    /propagation must be one of/u,
  );
  await assert.rejects(
    () => decode('<sam:Segment id="t" prompt="person" min-confidence="1.4" source={shot}/>'),
    /min-confidence must be a number from 0 to 1/u,
  );
});

test("Segment rejects a repeated object instead of silently merging it", async () => {
  await assert.rejects(
    () => decode('<sam:Segment id="t" prompt="person" also="Person" source={shot}/>'),
    /repeats the object "Person"/u,
  );
});

test("Segment rejects objects that collide after slugging", async () => {
  await assert.rejects(
    () => decode('<sam:Segment id="t" prompt="red ball" also="red-ball" source={shot}/>'),
    /collide after slugging/u,
  );
});

test("Segment refuses more concepts than the static output map supports", async () => {
  const many = Array.from({ length: 9 }, (_unused, index) => `object ${index}`).join(", ");
  await assert.rejects(
    () => decode(`<sam:Segment id="t" prompt="one" also="${many}" source={shot}/>`),
    /at most 8/u,
  );
});

test("package activation exposes the segment capability, 8 selectors and both surfaces", () => {
  const manifest = pkg.modules[0]!.manifest;
  assert.deepEqual(manifest.capabilities.map((item) => item.name), ["sam-3.1-cutout", "sam-3.1-segment"]);
  const selectors = manifest.producers.filter((item) => item.name.startsWith("select-mask-"));
  assert.equal(selectors.length, 8);
  for (const selector of selectors) {
    assert.deepEqual(selector.inputs.map((input) => input.name), ["set"]);
    assert.deepEqual(selector.outputs.map((output) => output.name), ["mask"]);
  }
  const tags = pkg.facets
    .filter((facet) => facet.abi === "hypit.markup-surface@1")
    .map((facet) => (facet.implementation as { tag: string }).tag)
    .sort();
  assert.deepEqual(tags, ["Cutout", "Segment"]);
});

test("mask selectors return the authored ordinal and refuse a missing object", () => {
  const facet = pkg.facets.find((entry) => entry.abi === "hypit.producer-package@1")!;
  const producers = (facet.implementation as {
    producers: readonly { producer: { name: string }; handler: (input: unknown) => unknown }[];
  }).producers;
  const handlerOf = (name: string) => producers.find((entry) => entry.producer.name === name)!.handler;
  const set = { value: { kind: "inline", value: { videos: [{ resource: "a" }, { resource: "b" }] } } };
  const second = handlerOf("select-mask-2")({ inputs: { set } }) as { outputs: { mask: unknown } };
  assert.deepEqual(second.outputs.mask, { resource: "b" });
  assert.throws(() => handlerOf("select-mask-3")({ inputs: { set } }), /object 3 is missing/u);
});

test("Segment rejects unknown attributes, unknown children and non-video sources", async () => {
  await assert.rejects(
    () => decode('<sam:Segment id="t" prompt="person" source={shot} colour="red"/>'),
    /does not accept colour/u,
  );
  await assert.rejects(
    () => decode(`<sam:Segment id="t" source={shot}><sam:Box name="h" box="0.1,0.1,0.2,0.2"/></sam:Segment>`),
    /accepts only Object children/u,
  );
  await assert.rejects(
    () => decode('<sam:Segment id="t" prompt="person" source={still}/>'),
    /must be video media/u,
  );
});
