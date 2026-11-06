import assert from "node:assert/strict";
import test from "node:test";

import {
  audioType,
  evaluateAudiovisualProgramAt,
  occurrenceParentRange,
  pictureType,
  pointwiseOperatorTemporalSupport,
  sealAudiovisualProgram,
  sealOccurrence,
  type AudiovisualProgram,
  type Occurrence,
  type ProgramSource,
} from "@hypit/audiovisual";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import {
  exactTemporalValue,
  sealLocalTemporalDomain,
  sealTemporalMap,
  type ExactTemporalValue,
  type LocalTemporalDomain,
  type TemporalMap,
} from "@hypit/temporal/algebra";

import {
  moveProgramOccurrence,
  rippleTrimProgramOccurrence,
  rollProgramOccurrences,
  slipProgramOccurrence,
  splitProgramOccurrence,
} from "../src/index.js";

const seconds = (value: number): ExactTemporalValue =>
  exactTemporalValue({ numerator: BigInt(value), denominator: 1n });
const domain = (id: string, duration: number): LocalTemporalDomain =>
  sealLocalTemporalDomain({ id, duration: seconds(duration) });
function mapping(target: LocalTemporalDomain, source: LocalTemporalDomain): TemporalMap {
  return sealTemporalMap({ stages: [{ target, source, pieces: [{
    target: { start: seconds(0), end: target.duration },
    sourceAtStart: seconds(0),
    rate: { numerator: 1, denominator: 1 },
  }] }] });
}

function editingFixture(): AudiovisualProgram {
  const parent = domain("edit:time", 20);
  const make = (id: string, start: number, duration: number): Occurrence => {
    const local = domain(`${id}:time`, 10);
    const sourceDomain = domain(`${id}:source-time`, 10);
    const source: ProgramSource = { id: `${id}:source`, outputs: { audio: {
      kind: "signal", type: audioType, domain: sourceDomain,
    } } };
    return sealOccurrence({
      id,
      source,
      domain: local,
      placement: {
        parent,
        start: seconds(start),
        active: { start: seconds(0), end: seconds(duration) },
      },
      selections: { audio: { kind: "signal", mapping: mapping(local, sourceDomain) } },
    });
  };
  const left = make("left", 0, 5);
  const right = make("right", 5, 5);
  const independent = make("independent", 12, 2);
  return sealAudiovisualProgram({
    id: "edit",
    domain: parent,
    occurrences: { left, right, independent },
    audio: { root: "mix", nodes: {
      left: { kind: "use", occurrence: "left", output: "audio" },
      right: { kind: "use", occurrence: "right", output: "audio" },
      independent: { kind: "use", occurrence: "independent", output: "audio" },
      mix: { kind: "mix", inputs: ["left", "right", "independent"] },
    } },
  });
}

function coordinatedFixture(): AudiovisualProgram {
  const parent = domain("main:time", 12);
  const local = domain("interview-use:time", 12);
  const pictureDomain = domain("interview:picture-time", 12);
  const audioDomain = domain("interview:audio-time", 12);
  const pictureSpace = sealLocalSpatialDomain({
    id: "main:picture-space",
    region: { x: 0, y: 0, width: 1920, height: 1080 },
  });
  const source: ProgramSource = { id: "interview", outputs: {
    picture: { kind: "signal", type: pictureType, domain: pictureDomain, spatialDomain: pictureSpace },
    audio: { kind: "signal", type: audioType, domain: audioDomain },
  } };
  const occurrence = sealOccurrence({
    id: "interview-use",
    source,
    domain: local,
    placement: { parent, start: seconds(0), active: { start: seconds(0), end: seconds(12) } },
    selections: {
      picture: { kind: "signal", mapping: mapping(local, pictureDomain) },
      audio: { kind: "signal", mapping: mapping(local, audioDomain) },
    },
  });
  return sealAudiovisualProgram({
    id: "main",
    domain: parent,
    pictureDomain: pictureSpace,
    occurrences: { "interview-use": occurrence },
    picture: { root: "interview", nodes: {
      interview: { kind: "use", occurrence: "interview-use", output: "picture" },
    } },
    audio: { root: "dialogue", nodes: {
      dialogue: { kind: "use", occurrence: "interview-use", output: "audio" },
    } },
  });
}

function controlledFixture(): AudiovisualProgram {
  const base = coordinatedFixture();
  const occurrence = base.occurrences["interview-use"]!;
  const audioOutput = occurrence.source.outputs.audio!;
  if (audioOutput.kind !== "signal") throw new Error("controlled fixture audio is not a signal");
  return sealAudiovisualProgram({
    ...base,
    picture: { root: "picture-effect", nodes: {
      picture: { kind: "use", occurrence: occurrence.id, output: "picture" },
      "picture-effect": {
        kind: "apply",
        operator: {
          id: "test.picture-control",
          inputs: ["picture"],
          temporalControls: {
            local: occurrence.domain,
            absolute: base.domain,
          },
          temporalSupport: pointwiseOperatorTemporalSupport(["picture"]),
          program: { format: "test.picture-control@1", payload: {}, artifacts: [] },
        },
        inputs: { picture: "picture" },
        controlBindings: {
          local: { kind: "occurrence", occurrence: occurrence.id },
          absolute: { kind: "program" },
        },
      },
    } },
    audio: { root: "audio-effect", nodes: {
      audio: { kind: "use", occurrence: occurrence.id, output: "audio" },
      "audio-effect": {
        kind: "apply",
        operator: {
          id: "test.audio-control",
          inputs: ["signal"],
          temporalControls: { source: audioOutput.domain },
          temporalSupport: pointwiseOperatorTemporalSupport(["signal"]),
          program: { format: "test.audio-control@1", payload: {}, artifacts: [] },
        },
        inputs: { signal: "audio" },
        controlBindings: {
          source: { kind: "source", occurrence: occurrence.id, output: "audio" },
        },
      },
    } },
  });
}

function controlledSplitGraphs(value: AudiovisualProgram) {
  const picture = value.picture?.nodes["picture-effect"];
  const audio = value.audio?.nodes["audio-effect"];
  if (picture?.kind !== "apply" || audio?.kind !== "apply") {
    throw new Error("controlled fixture has no effect nodes");
  }
  return {
    picture: {
      root: "picture-effect",
      nodes: {
        "picture-left": { kind: "use" as const, occurrence: "interview-left", output: "picture" },
        "picture-right": { kind: "use" as const, occurrence: "interview-right", output: "picture" },
        "picture-effect-left": {
          ...structuredClone(picture),
          inputs: { picture: "picture-left" },
          controlBindings: {
            local: { kind: "occurrence" as const, occurrence: "interview-left" },
            absolute: { kind: "program" as const },
          },
        },
        "picture-effect-right": {
          ...structuredClone(picture),
          inputs: { picture: "picture-right" },
          controlBindings: {
            local: { kind: "occurrence" as const, occurrence: "interview-right" },
            absolute: { kind: "program" as const },
          },
        },
        "picture-effect": {
          kind: "over" as const,
          inputs: ["picture-effect-left", "picture-effect-right"],
        },
      },
    },
    audio: {
      root: "audio-effect",
      nodes: {
        "audio-left": { kind: "use" as const, occurrence: "interview-left", output: "audio" },
        "audio-right": { kind: "use" as const, occurrence: "interview-right", output: "audio" },
        "audio-effect-left": {
          ...structuredClone(audio),
          inputs: { signal: "audio-left" },
          controlBindings: {
            source: { kind: "source" as const, occurrence: "interview-left", output: "audio" },
          },
        },
        "audio-effect-right": {
          ...structuredClone(audio),
          inputs: { signal: "audio-right" },
          controlBindings: {
            source: { kind: "source" as const, occurrence: "interview-right", output: "audio" },
          },
        },
        "audio-effect": {
          kind: "mix" as const,
          inputs: ["audio-effect-left", "audio-effect-right"],
        },
      },
    },
  };
}

test("Roll moves one explicit shared boundary without Track adjacency", () => {
  const original = editingFixture();
  const rolled = rollProgramOccurrences(original, { left: "left", right: "right", at: seconds(6) });
  assert.deepEqual(occurrenceParentRange(rolled.occurrences.left!), { start: seconds(0), end: seconds(6) });
  assert.deepEqual(occurrenceParentRange(rolled.occurrences.right!), { start: seconds(6), end: seconds(10) });
  assert.deepEqual(rolled.occurrences.independent, original.occurrences.independent);
  assert.throws(() => rollProgramOccurrences(original, {
    left: "left", right: "independent", at: seconds(6),
  }), /do not share/u);
});

test("Ripple moves only its explicit transient scope", () => {
  const original = editingFixture();
  const rippled = rippleTrimProgramOccurrence(original, "left", {
    active: { start: seconds(0), end: seconds(3) },
    boundary: "end",
    scope: ["right"],
  });
  assert.deepEqual(occurrenceParentRange(rippled.occurrences.left!), { start: seconds(0), end: seconds(3) });
  assert.deepEqual(occurrenceParentRange(rippled.occurrences.right!), { start: seconds(3), end: seconds(8) });
  assert.deepEqual(occurrenceParentRange(rippled.occurrences.independent!), { start: seconds(12), end: seconds(14) });
});

test("Slip atomically replaces explicit output Maps and preserves placement", () => {
  const original = coordinatedFixture();
  const occurrence = original.occurrences["interview-use"]!;
  const hold = (output: "picture" | "audio", at: number) => sealTemporalMap({ stages: [{
    target: occurrence.domain,
    source: (occurrence.source.outputs[output] as Extract<ProgramSource["outputs"][string], { kind: "signal" }>).domain,
    pieces: [{
      target: { start: seconds(0), end: occurrence.domain.duration },
      sourceAtStart: seconds(at),
      rate: { numerator: 0, denominator: 1 },
    }],
  }] });
  const slipped = slipProgramOccurrence(original, occurrence.id, {
    picture: hold("picture", 3),
    audio: hold("audio", 4),
  });
  assert.deepEqual(slipped.occurrences[occurrence.id]?.placement, occurrence.placement);
  assert.deepEqual(slipped.occurrences[occurrence.id]?.selections.picture,
    { kind: "signal", mapping: hold("picture", 3) });
  assert.deepEqual(slipped.occurrences[occurrence.id]?.selections.audio,
    { kind: "signal", mapping: hold("audio", 4) });
  assert.throws(() => slipProgramOccurrence(original, occurrence.id, {}), /at least one/u);
});

test("Programme Split closes Picture and Audio uses explicitly", () => {
  const original = coordinatedFixture();
  const split = splitProgramOccurrence(original, "interview-use", {
    at: seconds(6),
    leftId: "interview-left",
    rightId: "interview-right",
    picture: { kind: "split-uses",
      uses: { interview: { left: "interview-picture-left", right: "interview-picture-right" } } },
    audio: { kind: "split-uses",
      uses: { dialogue: { left: "interview-audio-left", right: "interview-audio-right" } } },
  });
  assert.deepEqual(Object.keys(split.occurrences).sort(), ["interview-left", "interview-right"]);
  assert.deepEqual(split.picture?.nodes.interview, {
    kind: "over", inputs: ["interview-picture-left", "interview-picture-right"],
  });
  assert.deepEqual(split.audio?.nodes.dialogue, {
    kind: "mix", inputs: ["interview-audio-left", "interview-audio-right"],
  });
  assert.deepEqual(occurrenceParentRange(split.occurrences["interview-left"]!),
    { start: seconds(0), end: seconds(6) });
  assert.deepEqual(occurrenceParentRange(split.occurrences["interview-right"]!),
    { start: seconds(6), end: seconds(12) });
});

test("Programme Split requires explicit graph surgery for Occurrence-dependent Controls", () => {
  const original = controlledFixture();
  assert.throws(() => splitProgramOccurrence(original, "interview-use", {
    at: seconds(6),
    leftId: "interview-left",
    rightId: "interview-right",
    picture: { kind: "split-uses",
      uses: { picture: { left: "picture-left", right: "picture-right" } } },
    audio: { kind: "split-uses",
      uses: { audio: { left: "audio-left", right: "audio-right" } } },
  }), /Control binding picture-effect\.local.*explicit replacement graph/u);
});

test("explicit Split graph surgery preserves occurrence-, source- and program-local Controls", () => {
  const original = controlledFixture();
  const replacements = controlledSplitGraphs(original);
  const split = splitProgramOccurrence(original, "interview-use", {
    at: seconds(6),
    leftId: "interview-left",
    rightId: "interview-right",
    picture: { kind: "replace", graph: replacements.picture },
    audio: { kind: "replace", graph: replacements.audio },
  });

  const left = evaluateAudiovisualProgramAt(split, seconds(3));
  const leftPicture = left.picture?.nodes["picture-effect-left"];
  const leftAudio = left.audio?.nodes["audio-effect-left"];
  assert.equal(leftPicture?.kind, "apply");
  assert.equal(leftAudio?.kind, "apply");
  if (leftPicture?.kind === "apply") {
    assert.deepEqual(leftPicture.controlPositions, { local: seconds(3), absolute: seconds(3) });
  }
  if (leftAudio?.kind === "apply") assert.deepEqual(leftAudio.controlPositions.source, seconds(3));

  const right = evaluateAudiovisualProgramAt(split, seconds(9));
  const rightPicture = right.picture?.nodes["picture-effect-right"];
  const rightAudio = right.audio?.nodes["audio-effect-right"];
  assert.equal(rightPicture?.kind, "apply");
  assert.equal(rightAudio?.kind, "apply");
  if (rightPicture?.kind === "apply") {
    assert.deepEqual(rightPicture.controlPositions, { local: seconds(9), absolute: seconds(9) });
  }
  if (rightAudio?.kind === "apply") assert.deepEqual(rightAudio.controlPositions.source, seconds(9));

  const moved = moveProgramOccurrence(split, "interview-right", seconds(4));
  const afterMove = evaluateAudiovisualProgramAt(moved, seconds(7));
  const movedPicture = afterMove.picture?.nodes["picture-effect-right"];
  const movedAudio = afterMove.audio?.nodes["audio-effect-right"];
  assert.equal(movedPicture?.kind, "apply");
  assert.equal(movedAudio?.kind, "apply");
  if (movedPicture?.kind === "apply") {
    assert.deepEqual(movedPicture.controlPositions, { local: seconds(9), absolute: seconds(7) });
  }
  if (movedAudio?.kind === "apply") assert.deepEqual(movedAudio.controlPositions.source, seconds(9));
});
