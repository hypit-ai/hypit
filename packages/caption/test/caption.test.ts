import assert from "node:assert/strict";
import test from "node:test";

import {
  captionComponent,
  captionManifest,
  defaultCaptionTrackProgram,
  planCaptionPresentation,
  renderCaptionProgram,
  renderCaptionTrack,
  resolveCaptionProgram,
  sealCaptionPlan,
  sealCaptionStyle,
  sealCaptionTrackProgram,
  temporalizeCaption,
  temporalizeCaptionPlan,
} from "@svml/caption";
import {
  sealAlignedTranscriptEvidence,
  sealProgramSpace,
  sealSpeechBasis,
} from "@svml/contracts";
import type { AlignedTranscriptSegment, Narrative, NarrativeSelectionRef, SpeechAudioBasis } from "@svml/contracts";
import { digestOf } from "@svml/protocol";
import { narrativeSelectionValue, parseScript } from "@svml/script";
import { locateSpeechTiming } from "@svml/speech-align";

test("the component enumerates every Manifest Producer and owned Type validator", () => {
  assert.deepEqual(
    captionComponent.producers.map((facet) => ({
      name: facet.producer.name,
      digest: facet.implementationDigest,
    })),
    captionManifest.producers.map((producer) => ({
      name: producer.name,
      digest: producer.implementation.digest,
    })),
  );
  assert.deepEqual(
    captionComponent.validators?.map((facet) => ({
      name: facet.type.name,
      digest: facet.implementationDigest,
    })),
    captionManifest.types.map((type) => ({
      name: type.name,
      digest: type.validator?.implementation.digest,
    })),
  );
});

function locate(narrative: Narrative, durationSec: number, segments: readonly AlignedTranscriptSegment[]) {
  const programSpace = captionSpace(durationSec);
  const audioDigest = digestOf(`caption:audio:${narrative.segments.map((segment) => segment.id).join("+")}`);
  const basisSegments = narrative.segments.map((segment, index) => ({
    segmentId: segment.id,
    startSec: segments[index]!.startSec,
    endSec: segments[index]!.endSec,
  }));
  const basis = sealSpeechBasis({
    contract: "svml.speech-basis@1",
    programSpace,
    audio: { digest: audioDigest, size: 1, mediaType: "audio/wav", durationSec },
    visualTrack: { clips: basisSegments.map((segment) => ({
      segmentId: segment.segmentId,
      artifact: {
        digest: digestOf(`caption:clip:${segment.segmentId}`),
        size: 1,
        mediaType: "video/mp4",
        durationSec: segment.endSec - segment.startSec,
      },
      startSec: segment.startSec,
      endSec: segment.endSec,
    })) },
    segments: basisSegments,
  });
  const evidence = sealAlignedTranscriptEvidence({
    contract: "svml.aligned-transcript-evidence@1",
    durationSec,
    segments,
  });
  const audioBasis: SpeechAudioBasis = {
    contract: "svml.speech-audio-basis@1",
    programSpace: basis.programSpace,
    audio: basis.audio,
    segments: basis.segments,
  };
  return locateSpeechTiming(narrative, audioBasis, evidence);
}

function captionSpace(durationSec: number) {
  return sealProgramSpace({
    contract: "svml.program-space@1",
    durationSec,
    frameRate: { numerator: 1_000, denominator: 1 },
  });
}

test("Caption-owned validators reject semantically invalid values", () => {
  const narrative = parseScript("validator.svml", "<line>Hello.</line>");
  const projection = temporalizeCaption(narrative, locate(narrative, 1, [{
    sourceSegmentId: "line",
    startSec: 0,
    endSec: 1,
    words: [{ text: "Hello", startSec: 0.1, endSec: 0.6 }],
    chars: [],
  }]));
  const program = defaultCaptionTrackProgram("validator-caption");
  const projectionValidator = captionComponent.validators?.find((facet) =>
    facet.type.name === "TimedCaptionProjection");
  const programValidator = captionComponent.validators?.find((facet) =>
    facet.type.name === "CaptionTrackProgram");
  assert(projectionValidator);
  assert(programValidator);
  assert.throws(
    () => projectionValidator.handler({
      type: projectionValidator.type,
      value: { kind: "inline", value: { ...projection, contract: "invalid" } },
    }),
    /Unsupported TimedCaptionProjection/u,
  );
  assert.throws(
    () => programValidator.handler({
      type: programValidator.type,
      value: { kind: "inline", value: { ...program, id: "" } },
    }),
    /identity and font family must not be empty/u,
  );
});

test("Caption temporalization preserves evidence envelopes and labels local estimates", () => {
  const narrative = parseScript(
    "caption.svml",
    "<line><that was insane | what the fuck> <15% off | fifteen percent off></line>",
  );
  const map = locate(narrative, 2, [{
      sourceSegmentId: "line",
      startSec: 0,
      endSec: 2,
      words: [
        { text: "what", startSec: 0.1, endSec: 0.25 },
        { text: "the", startSec: 0.3, endSec: 0.42 },
        { text: "fuck", startSec: 0.48, endSec: 0.72 },
        { text: "fifteen", startSec: 0.9, endSec: 1.15 },
        { text: "percent", startSec: 1.2, endSec: 1.42 },
        { text: "off", startSec: 1.48, endSec: 1.65 },
      ],
      chars: [],
    }]);
  const originalMap = structuredClone(map);
  const timed = temporalizeCaption(narrative, map);

  assert.equal(timed.regions[0]?.display, "that was insane");
  assert.deepEqual(
    [timed.regions[0]?.startSec, timed.regions[0]?.endSec, timed.regions[0]?.refinements.length],
    [0.1, 0.72, 0],
  );
  assert.deepEqual(timed.regions[1]?.refinements.map((item) => item.display), ["off"]);

  const whole = planCaptionPresentation(timed, "whole");
  assert.deepEqual(
    [whole.units[0]?.display, whole.units[0]?.startSec, whole.units[0]?.endSec, whole.units[0]?.basis],
    ["that was insane", 0.1, 0.72, "region-envelope"],
  );

  const words = planCaptionPresentation(timed, "proportional-word");
  assert.deepEqual(words.units.slice(0, 3).map((unit) => unit.basis), [
    "presentation-estimate",
    "presentation-estimate",
    "presentation-estimate",
  ]);
  assert.equal(words.units.find((unit) => unit.display === "off")?.basis, "exact-correspondence");
  assert.equal(words.units.find((unit) => unit.display === "15")?.timingQuality, "estimated");
  assert.deepEqual(map, originalMap, "caption presentation must not modify the global speech map");
});

test("multiple Cues inside one display alias receive ordered local estimates, not duplicate envelopes", () => {
  const narrative = parseScript("alias-plan.svml", "<line><that was insane | what the fuck></line>");
  const map = locate(narrative, 1, [{
    sourceSegmentId: "line",
    startSec: 0,
    endSec: 1,
    words: [
      { text: "what", startSec: 0.1, endSec: 0.25 },
      { text: "the", startSec: 0.3, endSec: 0.42 },
      { text: "fuck", startSec: 0.48, endSec: 0.72 },
    ],
    chars: [],
  }]);
  const base = defaultCaptionTrackProgram("alias-base");
  const style = sealCaptionStyle({
    contract: "svml.caption-style@1",
    id: "alias-style",
    planning: { cueInstruction: "One word per Cue for this test.", fields: [] },
    presentation: { mode: "whole", stackingOrder: 100, style: base.style },
  });
  const program = resolveCaptionProgram(narrative, "alias-caption", style, []);
  const run = program.runs[0]!;
  const plan = sealCaptionPlan({
    contract: "svml.caption-plan@1",
    runs: [{
      id: run.id,
      styleId: run.styleId,
      cues: run.atomIds.map((atomId, index) => ({ id: `alias-cue:${index + 1}`, atomIds: [atomId], fields: [] })),
    }],
  });
  const projection = temporalizeCaptionPlan(narrative, map, program, plan);

  assert.deepEqual(projection.regions.map((region) => region.display), ["that", "was", "insane"]);
  assert.equal(projection.regions.every((region) =>
    region.startQuality === "estimated" && region.endQuality === "estimated"), true);
  assert.equal(projection.regions[0]!.endSec <= projection.regions[1]!.startSec, true);
  assert.equal(projection.regions[1]!.endSec <= projection.regions[2]!.startSec, true);
  assert.deepEqual(
    [projection.regions[0]!.startSec, projection.regions[2]!.endSec],
    [0.1, 0.72],
  );
});

test("hidden speech owns time but emits no visible presentation unit", () => {
  const narrative = parseScript("hidden.svml", "<line>Hello < | um> world.</line>");
  const map = locate(narrative, 1, [{
      sourceSegmentId: "line",
      startSec: 0,
      endSec: 1,
      words: [
        { text: "Hello", startSec: 0.1, endSec: 0.25 },
        { text: "um", startSec: 0.3, endSec: 0.4 },
        { text: "world", startSec: 0.45, endSec: 0.7 },
      ],
      chars: [],
    }]);
  const timed = temporalizeCaption(narrative, map);
  const hidden = timed.regions.find((region) => region.kind === "hidden");
  assert.deepEqual([hidden?.startSec, hidden?.endSec], [0.3, 0.4]);
  assert.equal(planCaptionPresentation(timed).units.some((unit) => unit.regionId === hidden?.id), false);
});

test("official caption styling lowers to an ordinary self-contained VisualTrack", () => {
  const narrative = parseScript("track.svml", "<line>Hello world.</line>");
  const map = locate(narrative, 1, [{
    sourceSegmentId: "line",
    startSec: 0,
    endSec: 1,
    words: [
      { text: "Hello", startSec: 0.1, endSec: 0.35 },
      { text: "world", startSec: 0.4, endSec: 0.75 },
    ],
    chars: [],
  }]);
  const projection = temporalizeCaption(narrative, map);
  const program = defaultCaptionTrackProgram("primary-caption");
  const track = renderCaptionTrack(projection, program, captionSpace(1));

  assert.equal(track.contract, "svml.visual-track@1");
  assert.equal(track.presents[0]?.elements.some((element) => element.kind === "text"), true);
  assert.equal(
    track.presents.flatMap((present) => present.elements).some((element) => "text" in element && element.text.includes("Hello")),
    true,
  );
});

test("two caption styles become two peer Tracks without mutating one another", () => {
  const narrative = parseScript("two-tracks.svml", "<line>Hello world.</line>");
  const projection = temporalizeCaption(narrative, locate(narrative, 1, [{
    sourceSegmentId: "line",
    startSec: 0,
    endSec: 1,
    words: [{ text: "Hello", startSec: 0.1, endSec: 0.35 }, { text: "world", startSec: 0.4, endSec: 0.75 }],
    chars: [],
  }]));
  const first = defaultCaptionTrackProgram("speaker-a");
  const second = sealCaptionTrackProgram({
    ...first,
    id: "speaker-b",
    stacking: { order: 101, tieBreak: "speaker-b" },
    style: { ...first.style, color: "#00ff00", bottomPercent: 20 },
  });
  const firstTrack = renderCaptionTrack(projection, first, captionSpace(1));
  const secondTrack = renderCaptionTrack(projection, second, captionSpace(1));

  assert.notDeepEqual(firstTrack, secondTrack);
  assert.deepEqual(
    firstTrack.presents.map((present) => present.span),
    secondTrack.presents.map((present) => present.span),
  );
  assert.equal(firstTrack.presents[0]?.stacking.order, 100);
  assert.equal(secondTrack.presents[0]?.stacking.order, 101);
});

test("a planner-neutral CaptionPlan joins SemanticMap only after Cue and field planning", () => {
  const narrative = parseScript("planned.svml", "<line><ALICE>Meaning becomes the source.</line>");
  const map = locate(narrative, 2, [{
    sourceSegmentId: "line",
    startSec: 0,
    endSec: 2,
    words: [
      { text: "Meaning", startSec: 0.1, endSec: 0.35 },
      { text: "becomes", startSec: 0.4, endSec: 0.7 },
      { text: "the", startSec: 0.8, endSec: 1.0 },
      { text: "source", startSec: 1.1, endSec: 1.5 },
    ],
    chars: [],
  }]);
  const base = defaultCaptionTrackProgram("planned-caption");
  const style = sealCaptionStyle({
    contract: "svml.caption-style@1",
    id: "alice",
    planning: {
      cueInstruction: "Use short semantic phrases.",
      fields: [{
        id: "important",
        value: { kind: "boolean" },
        instruction: "Select at most one important word.",
        minimumPerCue: 0,
        maximumPerCue: 1,
      }],
    },
    presentation: { mode: "whole", stackingOrder: 100, style: base.style },
  });
  const program = resolveCaptionProgram(narrative, "planned-caption", style, []);
  const ids = program.atoms.map((atom) => atom.id);
  const plan = sealCaptionPlan({
    contract: "svml.caption-plan@1",
    runs: [{
      id: program.runs[0]!.id,
      styleId: style.id,
      cues: [
        {
          id: "cue:1",
          atomIds: ids.slice(0, 2),
          fields: [{ declarationId: "important", atomId: ids[0]!, value: "true" }],
        },
        { id: "cue:2", atomIds: ids.slice(2), fields: [] },
      ],
    }],
  });
  const projection = temporalizeCaptionPlan(narrative, map, program, plan);
  assert.deepEqual(projection.regions.map((region) => region.display), ["Meaning becomes", "the source."]);
  assert.deepEqual(projection.regions[0]?.fields?.map((field) => field.declarationId), ["important"]);
  const track = renderCaptionProgram(projection, program, captionSpace(2));
  const firstText = track.presents[0]?.elements.find((element) => element.kind === "text");
  assert.equal(firstText?.attributes?.some((attribute) =>
    attribute.name === "data-caption-style" && attribute.value === "alice"), true);
  assert.equal(firstText?.attributes?.some((attribute) =>
    attribute.name === "data-caption-fields" && attribute.value.includes("important")), true);
});

test("a default Style covers roleless text and ordered whole-style overrides use last match", () => {
  const narrative = parseScript("cascade.svml", `
    <intro>Roleless words stay readable.</intro>
    <answer><ALICE>Only this sentence changes.</answer>
  `);
  const base = defaultCaptionTrackProgram("base");
  const make = (id: string, color: string) => sealCaptionStyle({
    contract: "svml.caption-style@1",
    id,
    planning: { cueInstruction: `Plan ${id}.`, fields: [] },
    presentation: { mode: "whole", stackingOrder: 100, style: { ...base.style, color } },
  });
  const normal = make("normal", "#ffffff");
  const alice = make("alice", "#00ff00");
  const final = make("final", "#ff00ff");
  const program = resolveCaptionProgram(narrative, "captions", normal, [
    { id: "alice", selector: { kind: "role", role: "ALICE" }, style: alice },
    { id: "alice-later", selector: { kind: "role", role: "ALICE" }, style: final },
  ]);
  assert.deepEqual(program.runs.map((run) => run.styleId), ["normal", "final"]);
  assert.equal(program.styles.some((style) => style.id === "alice"), true, "declared overrides stay auditable");
  assert.throws(() => resolveCaptionProgram(narrative, "invalid", normal, [{
    id: "typo",
    selector: { kind: "role", role: "ALIEC" },
    style: alice,
  }]), /selects no visible display atom/u);
});

test("an explicit Selection replaces only its words without authoring the complement", () => {
  const narrative = parseScript(
    "selection-style.svml",
    "<line>Keep this @special one sentence different @/special and return.</line>",
  );
  const base = defaultCaptionTrackProgram("base");
  const make = (id: string, color: string) => sealCaptionStyle({
    contract: "svml.caption-style@1",
    id,
    planning: { cueInstruction: `Plan ${id}.`, fields: [] },
    presentation: { mode: "whole", stackingOrder: 100, style: { ...base.style, color } },
  });
  const normal = make("normal", "#ffffff");
  const special = make("special", "#ff00ff");
  const selection = narrativeSelectionValue(narrative.selections[0]!) as unknown as NarrativeSelectionRef;
  const program = resolveCaptionProgram(narrative, "captions", normal, [{
    id: "special-use",
    selector: { kind: "selection", selection },
    style: special,
  }]);
  assert.deepEqual(program.runs.map((run) => [run.styleId, run.atomIds.length]), [
    ["normal", 2],
    ["special", 3],
    ["normal", 2],
  ]);
});
