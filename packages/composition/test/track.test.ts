import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";

import { registerTypeValidatorFacets } from "@hypit/component-kit";
import { createResolvedClosure } from "@hypit/core";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";
import { TypeValidatorRegistry, validateValue } from "@hypit/validation";
import { artifactManifest } from "@hypit/artifact";
import type { FontArtifactRef } from "@hypit/media";
import { mediaManifest } from "@hypit/media";
import { narrativeManifest } from "@hypit/narrative";
import { programSpaceManifest, sealProgramSpace } from "@hypit/program-space";
import { speechManifest } from "@hypit/speech";
import { speechEvidenceManifest } from "@hypit/speech-evidence";
import { spatialManifest } from "@hypit/spatial";
import { VISUAL_IR_V1, visualIrManifest } from "@hypit/visual-ir";

import {
  assertCompositionIdentity,
  assertVisualTrackIdentity,
  compositionComponent,
  compositionManifest,
  compositionTypes,
  sealAudioTrack,
  sealComposition,
  sealVisualTrack,
} from "../src/index.js";
import type { VisualTrack } from "../src/index.js";

const videoContractManifests = [artifactManifest, narrativeManifest, mediaManifest, programSpaceManifest,
  speechManifest, speechEvidenceManifest, spatialManifest, visualIrManifest, compositionManifest] as const;

const font: FontArtifactRef = {
  sources: [{ artifact: { kind: "blob", digest: fixtureDigest("track:test-font"), size: 1_024, mediaType: "font/woff2" } }],
  weight: 700,
  style: "normal",
};
const audio: BlobRef = {
  kind: "blob",
  digest: fixtureDigest("audio"),
  size: 24,
  mediaType: "audio/wav",
};

function fixture() {
  const programSpace = sealProgramSpace({ id: "test-space", narrativeId: "test-narrative",
    durationSec: 4,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const visual = sealVisualTrack({ programSpaceId: "test-space",
    visualIr: "hypit.visual-ir@1",
    id: "caption",
    presents: [{
      id: "cue-1",
      span: { startFrame: 0, endFrameExclusive: 60 },
      stacking: { order: 100, tieBreak: "caption" },
      elements: [
        { id: "root", order: 0, kind: "box", style: [{ name: "position", value: "absolute" }] },
        { id: "text", parent: "root", order: 1, kind: "text", text: "Hello", fonts: [font], style: [] },
      ],
    }],
  });
  const sound = sealAudioTrack({ programSpaceId: "test-space",
    id: "speech",
    clips: [{
      id: "speech",
      artifact: audio,
      target: { startSample: 0, endSampleExclusive: 192_000 },
      source: { sampleFrames: 192_000, startSample: 0, endSampleExclusive: 192_000, loop: false, phaseSample: 0 },
      playbackRate: 1,
      pitch: "preserve",
      gain: 1,
      fadeInSamples: 0,
      fadeOutSamples: 0,
    }],
  });
  return { programSpace, visual, sound };
}

test("Composition accepts self-contained peer VisualTrack and AudioTrack values", () => {
  const { programSpace, visual, sound } = fixture();
  assert.equal(visual.visualIr, VISUAL_IR_V1);
  const composition = sealComposition({
    id: "main",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [sound, visual],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(composition, programSpace));
  assert.deepEqual(composition.tracks.map((track) => track.id), ["speech", "caption"]);
});

test("Composition accepts case-insensitive hexadecimal canvas colors", () => {
  const { programSpace, visual } = fixture();
  const composition = sealComposition({
    id: "uppercase-color",
    canvas: { width: 480, height: 854, clearColor: "#09090B" },
    tracks: [visual],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(composition, programSpace));
});

test("VisualTrack rejects cross-Track pixel sampling styles", () => {
  const { programSpace, visual, sound } = fixture();
  const content = structuredClone(visual) as VisualTrack;
  const first = content.presents[0]!.elements[0]!;
  const invasive = sealVisualTrack({...content,
    presents: [{
      ...content.presents[0]!,
      elements: [{ ...first, style: [{ name: "backdrop-filter", value: "blur(20px)" }] }],
    }],
  });
  const composition = sealComposition({
    id: "invasive",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [sound, invasive],
  });
  assert.throws(() => assertCompositionIdentity(composition, programSpace), /cross-Track style backdrop-filter/);
});

test("VisualTrack style values cannot smuggle a second declaration", () => {
  const { programSpace, visual } = fixture();
  const content = structuredClone(visual) as VisualTrack;
  const first = content.presents[0]!.elements[0]!;
  const smuggled = sealVisualTrack({...content,
    presents: [{
      ...content.presents[0]!,
      elements: [{ ...first, style: [{ name: "color", value: "red;backdrop-filter:blur(20px)" }] }],
    }],
  });
  assert.throws(
    () => assertCompositionIdentity(sealComposition({
      id: "smuggled",
      canvas: { width: 1080, height: 1920, clearColor: "#000000" },
      tracks: [smuggled],
    }), programSpace),
    /escapes its declaration/,
  );
});

test("VisualTrack cannot silently extend the versioned public Visual IR", () => {
  const { programSpace, visual } = fixture();
  const first = visual.presents[0]!.elements[0]!;
  const unknownStyle = sealVisualTrack({...visual,
    presents: [{
      ...visual.presents[0]!,
      elements: [{ ...first, style: [{ name: "mask-image", value: "linear-gradient(black, transparent)" }] }],
    }],
  });
  assert.throws(
    () => assertCompositionIdentity(sealComposition({
      id: "unknown-style",
      canvas: { width: 1080, height: 1920, clearColor: "#000000" },
      tracks: [unknownStyle],
    }), programSpace),
    /outside hypit\.visual-ir@1/u,
  );

  const fixedPosition = sealVisualTrack({...visual,
    presents: [{
      ...visual.presents[0]!,
      elements: [{ ...first, style: [{ name: "position", value: "fixed" }] }],
    }],
  });
  assert.throws(
    () => assertVisualTrackIdentity(fixedPosition, programSpace),
    /position has unsupported value fixed/u,
  );

  const environmentBound = sealVisualTrack({...visual,
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
      visualIr: "third-party.browser-css@1",
    } as unknown as VisualTrack, programSpace),
    /Unsupported VisualTrack visual IR/u,
  );
});

test("the Type owner rejects an invalid VisualTrack at the shared admission gate", async () => {
  const { visual } = fixture();
  const present = visual.presents[0]!;
  const invalid = sealVisualTrack({...visual,
    presents: [{
      ...present,
      elements: [
        ...present.elements,
        { id: "second-root", order: 2, kind: "box", style: [] },
      ],
    }],
  });
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, compositionComponent.validators);

  await assert.rejects(
    async () => await validateValue(
      createResolvedClosure(videoContractManifests),
      compositionTypes.visualTrack,
      { kind: "inline", value: canonicalize(invalid) },
      validators,
    ),
    /must contain exactly one root element/u,
  );
});

test("Composition validates Track frame ranges against the explicitly connected ProgramSpace", () => {
  const { programSpace, visual } = fixture();
  const foreign = sealProgramSpace({ id: "test-space", narrativeId: "test-narrative",
    durationSec: 1,
    frameRate: { numerator: 24, denominator: 1 },
  });
  const composition = sealComposition({
    id: "foreign",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [visual],
  });
  assert.throws(() => assertCompositionIdentity(composition, foreign), /outside ProgramSpace/);
  assert.notDeepEqual(programSpace, foreign);
});

test("one authoring Track may contribute independently stacked Presents", () => {
  const { programSpace, visual } = fixture();
  const content = structuredClone(visual) as VisualTrack;
  const second = {
    ...structuredClone(content.presents[0]!),
    id: "cue-2",
    stacking: { order: 30, tieBreak: "board" },
  };
  const interleaved = sealVisualTrack({...content,
    presents: [
      { ...content.presents[0]!, stacking: { order: 80, tieBreak: "icon" } },
      second,
    ],
  });
  const composition = sealComposition({
    id: "interleaved",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [interleaved],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(composition, programSpace));
  assert.deepEqual(interleaved.presents.map((present) => present.stacking.order), [30, 80]);
});

test("Visual Present animations may finish before or after their visibility window without changing Track isolation", () => {
  const { programSpace, visual } = fixture();
  const present = visual.presents[0]!;
  const root = present.elements[0]!;
  const animated = sealVisualTrack({...visual,
    presents: [{
      ...present,
      elements: [{
        ...root,
        animation: {
          keyframes: [
            { atFrame: 0, style: [{ name: "opacity", value: 0 }] },
            { atFrame: 10, easing: "ease-out", style: [{ name: "opacity", value: 1 }] },
          ],
        },
      }],
    }],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(sealComposition({
    id: "animated",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [animated],
  }), programSpace));
  const clipped = sealVisualTrack({...visual,
    presents: [{
      ...present,
      elements: [{
        ...root,
        animation: {
          keyframes: [
            { atFrame: 0, style: [{ name: "opacity", value: 0 }] },
            { atFrame: 90, easing: "ease-out", style: [{ name: "opacity", value: 1 }] },
          ],
        },
      }],
    }],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(sealComposition({
    id: "clipped-animation",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [clipped],
  }), programSpace));
  const invasive = sealVisualTrack({...visual,
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
    id: "animated-invasive",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [invasive],
  }), programSpace), /cross-Track style backdrop-filter/);
});
