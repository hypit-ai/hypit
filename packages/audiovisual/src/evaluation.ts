import {
  addExactTemporalValues,
  assertExactTemporalValue,
  compareExactTemporalValues,
  evaluateTemporalMap,
  subtractExactTemporalValues,
} from "@hypit/temporal/algebra";
import type { TemporalMap, TemporalRange } from "@hypit/temporal/algebra";

import { occurrenceParentRange } from "./occurrence.js";
import { evaluateMappedSpatialMapControl, resolveTemporalControlPosition } from "./control.js";
import { assertAudiovisualProgram } from "./program.js";
import type {
  AudioGraph,
  AudiovisualEvaluation,
  AudiovisualProgram,
  EvaluatedAudioGraph,
  EvaluatedAudioNode,
  EvaluatedPictureGraph,
  EvaluatedPictureNode,
  EvaluatedSourceSample,
  Occurrence,
  PictureGraph,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function contains(range: TemporalRange, at: AudiovisualEvaluation["at"]): boolean {
  return compareExactTemporalValues(at, range.start) >= 0
    && compareExactTemporalValues(at, range.end) < 0;
}

function evaluateControlPositions(
  controls: Readonly<Record<string, import("@hypit/temporal/algebra").LocalTemporalDomain>>,
  mappings: Readonly<Record<string, TemporalMap>>,
  program: AudiovisualProgram,
  at: AudiovisualEvaluation["at"],
): Readonly<Record<string, AudiovisualEvaluation["at"]>> | undefined {
  const positions: Record<string, AudiovisualEvaluation["at"]> = {};
  for (const [name, mapping] of Object.entries(mappings)) {
    const position = resolveTemporalControlPosition(controls[name]!, mapping, program.domain, at);
    if (position === undefined) return undefined;
    positions[name] = position;
  }
  return positions;
}

function evaluateUse(
  occurrence: Occurrence,
  output: string,
  parentAt: AudiovisualEvaluation["at"],
): EvaluatedSourceSample | undefined {
  const parentRange = occurrenceParentRange(occurrence);
  if (!contains(parentRange, parentAt)) return undefined;
  const localAt = addExactTemporalValues(occurrence.placement.active.start,
    subtractExactTemporalValues(parentAt, occurrence.placement.start));
  const selection = occurrence.selections[output];
  assert(selection !== undefined, `Occurrence ${occurrence.id} has no Selection for output ${output}.`);
  if (selection.kind === "constant") return {
    occurrence: occurrence.id,
    output,
    source: occurrence.source.id,
    temporal: { kind: "constant" },
  };
  const source = evaluateTemporalMap(selection.mapping, localAt, "after");
  if (source === undefined) return undefined;
  const sourceOutput = occurrence.source.outputs[output]!;
  assert(sourceOutput.kind === "signal", `Occurrence ${occurrence.id}.${output} Source output is not a signal.`);
  return {
    occurrence: occurrence.id,
    output,
    source: occurrence.source.id,
    ...(selection.reconstruction === undefined ? {} : {
      reconstruction: structuredClone(selection.reconstruction),
    }),
    temporal: {
      kind: "signal",
      domain: structuredClone(sourceOutput.domain),
      at: source.position,
      side: source.sourceSide,
    },
  };
}

function evaluatePicture(
  graph: PictureGraph,
  program: AudiovisualProgram,
  at: AudiovisualEvaluation["at"],
): EvaluatedPictureGraph {
  const nodes: Record<string, EvaluatedPictureNode> = {};
  for (const [id, node] of Object.entries(graph.nodes)) {
    switch (node.kind) {
      case "transparent": nodes[id] = { kind: "transparent" }; break;
      case "use": {
        const occurrence = program.occurrences[node.occurrence]!;
        const sample = evaluateUse(occurrence, node.output, at);
        nodes[id] = sample === undefined ? { kind: "transparent" } : {
          kind: "sample",
          ...sample,
          sourceSpace: structuredClone(occurrence.source.outputs[node.output]!.spatialDomain!),
        };
        break;
      }
      case "restrict":
        nodes[id] = contains(node.range, at)
          ? { kind: "alias", input: node.input }
          : { kind: "transparent" };
        break;
      case "crop": nodes[id] = {
        kind: "crop",
        input: node.input,
        region: structuredClone(node.region),
      }; break;
      case "remap": nodes[id] = {
        kind: "remap",
        input: node.input,
        mapping: structuredClone(node.mapping),
      }; break;
      case "remap-control": {
        const mapping = evaluateMappedSpatialMapControl(
          node.control, node.controlMapping, program.domain, at,
        );
        nodes[id] = mapping === undefined ? { kind: "transparent" } : {
          kind: "remap",
          input: node.input,
          mapping,
        };
        break;
      }
      case "over": nodes[id] = { kind: "over", inputs: [...node.inputs] }; break;
      case "apply": {
        const positions = evaluateControlPositions(
          node.operator.temporalControls, node.controlMappings, program, at,
        );
        nodes[id] = positions === undefined ? { kind: "transparent" } : {
          kind: "apply",
          operator: structuredClone(node.operator),
          inputs: structuredClone(node.inputs),
          controlPositions: positions,
        };
        break;
      }
    }
  }
  return { domain: structuredClone(program.pictureDomain!), root: graph.root, nodes };
}

function evaluateAudio(
  graph: AudioGraph,
  program: AudiovisualProgram,
  at: AudiovisualEvaluation["at"],
): EvaluatedAudioGraph {
  const nodes: Record<string, EvaluatedAudioNode> = {};
  for (const [id, node] of Object.entries(graph.nodes)) {
    switch (node.kind) {
      case "silence": nodes[id] = { kind: "silence" }; break;
      case "use": {
        const sample = evaluateUse(program.occurrences[node.occurrence]!, node.output, at);
        nodes[id] = sample === undefined ? { kind: "silence" } : { kind: "sample", ...sample };
        break;
      }
      case "restrict":
        nodes[id] = contains(node.range, at)
          ? { kind: "alias", input: node.input }
          : { kind: "silence" };
        break;
      case "mix": nodes[id] = { kind: "mix", inputs: [...node.inputs] }; break;
      case "apply": {
        const positions = evaluateControlPositions(
          node.operator.temporalControls, node.controlMappings, program, at,
        );
        nodes[id] = positions === undefined ? { kind: "silence" } : {
          kind: "apply",
          operator: structuredClone(node.operator),
          inputs: structuredClone(node.inputs),
          controlPositions: positions,
        };
        break;
      }
    }
  }
  return { root: graph.root, nodes };
}

/**
 * Evaluate exact authored relations at one Programme-local position.
 * No frame rate, sample rate, Canvas or renderer policy is selected here.
 */
function evaluateVerifiedAudiovisualProgramAt(
  value: AudiovisualProgram,
  at: AudiovisualEvaluation["at"],
): AudiovisualEvaluation {
  assertExactTemporalValue(at, "Audiovisual evaluation position");
  assert(compareExactTemporalValues(at, { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }) >= 0
    && compareExactTemporalValues(at, value.domain.duration) < 0,
  `Audiovisual evaluation position lies outside Programme domain ${value.domain.id}.`);
  return {
    program: value.id,
    at: structuredClone(at),
    ...(value.picture === undefined ? {} : { picture: evaluatePicture(value.picture, value, at) }),
    ...(value.audio === undefined ? {} : { audio: evaluateAudio(value.audio, value, at) }),
  };
}

/** Validate one immutable Programme once, then evaluate any number of exact positions against it. */
export function createAudiovisualProgramEvaluator(
  value: AudiovisualProgram,
): (at: AudiovisualEvaluation["at"]) => AudiovisualEvaluation {
  assertAudiovisualProgram(value);
  return (at) => evaluateVerifiedAudiovisualProgramAt(value, at);
}

export function evaluateAudiovisualProgramAt(
  value: AudiovisualProgram,
  at: AudiovisualEvaluation["at"],
): AudiovisualEvaluation {
  return createAudiovisualProgramEvaluator(value)(at);
}
