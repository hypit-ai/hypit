import assert from "node:assert/strict";
import test from "node:test";

import { registerTypeValidatorFacets } from "@svml/component-kit";
import { createResolvedClosure } from "@svml/core";
import { canonicalize, digestOf } from "@svml/protocol";
import { TypeValidatorRegistry, validateValue } from "@svml/validation";

import {
  assertCompositionIdentity,
  assertVisualTrackIdentity,
  compositionContractsComponent,
  contractTypes,
  HYPERFRAMES_VISUAL_IR_V1,
  sealAudioTrack,
  sealComposition,
  sealProgramSpace,
  sealVisualTrack,
  videoContractManifests,
} from "../src/index.js";
import type { MediaArtifactRef, VisualTrack } from "../src/index.js";

const image: MediaArtifactRef = {
  digest: digestOf("image"),
  size: 12,
  mediaType: "image/png",
  durationSec: 0,
};
const audio: MediaArtifactRef = {
  digest: digestOf("audio"),
  size: 24,
  mediaType: "audio/wav",
  durationSec: 4,
};

function fixture() {
  const programSpace = sealProgramSpace({
    contract: "svml.program-space@0",
    durationSec: 4,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const visual = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.hyperframes-visual-ir@1",
    id: "caption",
    programSpaceDigest: programSpace.digest,
    presents: [{
      id: "cue-1",
      span: { startFrame: 0, endFrameExclusive: 60 },
      stacking: { order: 100, tieBreak: "caption" },
      elements: [
        { id: "root", order: 0, kind: "box", style: [{ name: "position", value: "absolute" }] },
        { id: "text", parent: "root", order: 1, kind: "text", text: "Hello", style: [] },
      ],
    }],
  });
  const sound = sealAudioTrack({
    contract: "svml.audio-track@1",
    id: "speech",
    programSpaceDigest: programSpace.digest,
    clips: [{ id: "speech", span: { startFrame: 0, endFrameExclusive: 120 }, artifact: audio, bus: "speech" }],
  });
  return { programSpace, visual, sound };
}

test("Composition accepts self-contained peer VisualTrack and AudioTrack values", () => {
  const { programSpace, visual, sound } = fixture();
  assert.equal(visual.visualIr, HYPERFRAMES_VISUAL_IR_V1);
  const composition = sealComposition({
    contract: "svml.composition@1",
    id: "main",
    programSpace,
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [sound, visual],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(composition));
  assert.deepEqual(composition.tracks.map((track) => track.id), ["speech", "caption"]);
});

test("VisualTrack rejects cross-Track pixel sampling styles", () => {
  const { programSpace, visual, sound } = fixture();
  const content = structuredClone(visual) as VisualTrack;
  const first = content.presents[0]!.elements[0]!;
  const invasive = sealVisualTrack({
    ...content,
    presents: [{
      ...content.presents[0]!,
      elements: [{ ...first, style: [{ name: "backdrop-filter", value: "blur(20px)" }] }],
    }],
  });
  const composition = sealComposition({
    contract: "svml.composition@1",
    id: "invasive",
    programSpace,
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [sound, invasive],
  });
  assert.throws(() => assertCompositionIdentity(composition), /cross-Track style backdrop-filter/);
});

test("VisualTrack style values cannot smuggle a second declaration", () => {
  const { programSpace, visual } = fixture();
  const content = structuredClone(visual) as VisualTrack;
  const first = content.presents[0]!.elements[0]!;
  const smuggled = sealVisualTrack({
    ...content,
    presents: [{
      ...content.presents[0]!,
      elements: [{ ...first, style: [{ name: "color", value: "red;backdrop-filter:blur(20px)" }] }],
    }],
  });
  assert.throws(
    () => assertCompositionIdentity(sealComposition({
      contract: "svml.composition@1",
      id: "smuggled",
      programSpace,
      canvas: { width: 1080, height: 1920, clearColor: "#000000" },
      tracks: [smuggled],
    })),
    /escapes its declaration/,
  );
});

test("VisualTrack cannot silently extend the versioned HyperFrames Visual IR", () => {
  const { programSpace, visual } = fixture();
  const first = visual.presents[0]!.elements[0]!;
  const unknownStyle = sealVisualTrack({
    ...visual,
    presents: [{
      ...visual.presents[0]!,
      elements: [{ ...first, style: [{ name: "mask-image", value: "linear-gradient(black, transparent)" }] }],
    }],
  });
  assert.throws(
    () => assertCompositionIdentity(sealComposition({
      contract: "svml.composition@1",
      id: "unknown-style",
      programSpace,
      canvas: { width: 1080, height: 1920, clearColor: "#000000" },
      tracks: [unknownStyle],
    })),
    /outside svml\.hyperframes-visual-ir@1/u,
  );

  const fixedPosition = sealVisualTrack({
    ...visual,
    presents: [{
      ...visual.presents[0]!,
      elements: [{ ...first, style: [{ name: "position", value: "fixed" }] }],
    }],
  });
  assert.throws(
    () => assertVisualTrackIdentity(fixedPosition, programSpace),
    /position has unsupported value fixed/u,
  );

  const environmentBound = sealVisualTrack({
    ...visual,
    presents: [{
      ...visual.presents[0]!,
      elements: [{ ...first, style: [{ name: "color", value: "var(--host-color)" }] }],
    }],
  });
  assert.throws(
    () => assertVisualTrackIdentity(environmentBound, programSpace),
    /environment-dependent style value/u,
  );
});

test("VisualTrack explicitly binds the visual IR instead of trusting the Runtime", () => {
  const { programSpace, visual } = fixture();
  assert.throws(
    () => assertVisualTrackIdentity({
      ...visual,
      visualIr: "third-party.browser-css@9",
    } as unknown as VisualTrack, programSpace),
    /Unsupported VisualTrack visual IR/u,
  );
});

test("the Type owner rejects an invalid VisualTrack at the shared admission gate", async () => {
  const { visual } = fixture();
  const present = visual.presents[0]!;
  const invalid = sealVisualTrack({
    ...visual,
    presents: [{
      ...present,
      elements: [
        ...present.elements,
        { id: "second-root", order: 2, kind: "box", style: [] },
      ],
    }],
  });
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, compositionContractsComponent.validators);

  await assert.rejects(
    async () => await validateValue(
      createResolvedClosure(videoContractManifests),
      contractTypes.visualTrack,
      { kind: "inline", value: canonicalize(invalid) },
      validators,
    ),
    /must contain exactly one root element/u,
  );
});

test("Composition rejects a Track from another ProgramSpace even when its shape is valid", () => {
  const { programSpace, visual } = fixture();
  const foreign = sealProgramSpace({
    contract: "svml.program-space@0",
    durationSec: 4,
    frameRate: { numerator: 24, denominator: 1 },
  });
  const composition = sealComposition({
    contract: "svml.composition@1",
    id: "foreign",
    programSpace: foreign,
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [visual],
  });
  assert.throws(() => assertCompositionIdentity(composition), /belongs to another ProgramSpace/);
  assert.notEqual(programSpace.digest, foreign.digest);
});

test("Composition identity binds every Track digest and rejects tampering", () => {
  const { programSpace, visual } = fixture();
  const composition = sealComposition({
    contract: "svml.composition@1",
    id: "main",
    programSpace,
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [visual],
  });
  const tampered = structuredClone(composition);
  (tampered.tracks[0] as { id: string }).id = "changed";
  assert.throws(() => assertCompositionIdentity(tampered), /Composition digest does not match/);
});

test("one authoring Track may contribute independently stacked Presents", () => {
  const { programSpace, visual } = fixture();
  const content = structuredClone(visual) as VisualTrack;
  const second = {
    ...structuredClone(content.presents[0]!),
    id: "cue-2",
    stacking: { order: 30, tieBreak: "board" },
  };
  const interleaved = sealVisualTrack({
    ...content,
    presents: [
      { ...content.presents[0]!, stacking: { order: 80, tieBreak: "icon" } },
      second,
    ],
  });
  const composition = sealComposition({
    contract: "svml.composition@1",
    id: "interleaved",
    programSpace,
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [interleaved],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(composition));
  assert.deepEqual(interleaved.presents.map((present) => present.stacking.order), [30, 80]);
});

test("Visual Present animations are frame-exact and cannot animate cross-Track styles", () => {
  const { programSpace, visual } = fixture();
  const present = visual.presents[0]!;
  const root = present.elements[0]!;
  const animated = sealVisualTrack({
    ...visual,
    presents: [{
      ...present,
      elements: [{
        ...root,
        animation: {
          keyframes: [
            { atFrame: 0, style: [{ name: "opacity", value: 0 }] },
            { atFrame: 60, easing: "ease-out", style: [{ name: "opacity", value: 1 }] },
          ],
        },
      }],
    }],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(sealComposition({
    contract: "svml.composition@1",
    id: "animated",
    programSpace,
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [animated],
  })));
  const invasive = sealVisualTrack({
    ...visual,
    presents: [{
      ...present,
      elements: [{
        ...root,
        animation: {
          keyframes: [
            { atFrame: 0, style: [{ name: "backdrop-filter", value: "blur(0px)" }] },
            { atFrame: 60, style: [{ name: "backdrop-filter", value: "blur(20px)" }] },
          ],
        },
      }],
    }],
  });
  assert.throws(() => assertCompositionIdentity(sealComposition({
    contract: "svml.composition@1",
    id: "animated-invasive",
    programSpace,
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [invasive],
  })), /cross-Track style backdrop-filter/);
});
