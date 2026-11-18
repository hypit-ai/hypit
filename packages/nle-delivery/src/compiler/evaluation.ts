import {
  addExactTemporalValues,
  assertExactTemporalValue,
  compareExactTemporalValues,
  evaluateTemporalMap,
  exactTemporalZero,
  resolveTemporalControlPosition,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type TemporalMap,
  type TemporalRange,
} from "@hypit/temporal/algebra";
import { occurrenceParentRange } from "./occurrence.js";
import { assertCompilationGraph } from "./program.js";
import type {
  CompilationGraph,
  EvaluatedPictureGraph,
  EvaluatedPictureNode,
  EvaluatedSourceSample,
  Occurrence,
  PictureGraph,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function contains(range: TemporalRange, at: ExactTemporalValue): boolean {
  return compareExactTemporalValues(at, range.start) >= 0 && compareExactTemporalValues(at, range.end) < 0;
}

function evaluateControlPositions(
  controls: Readonly<Record<string, import("@hypit/temporal/algebra").LocalTemporalDomain>>,
  mappings: Readonly<Record<string, TemporalMap>>,
  program: CompilationGraph,
  at: ExactTemporalValue,
): Readonly<Record<string, ExactTemporalValue>> | undefined {
  const positions: Record<string, ExactTemporalValue> = {};
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
  parentAt: ExactTemporalValue,
): EvaluatedSourceSample | undefined {
  if (!contains(occurrenceParentRange(occurrence), parentAt)) return undefined;
  const localAt = addExactTemporalValues(occurrence.placement.active.start,
    subtractExactTemporalValues(parentAt, occurrence.placement.start));
  const selection = occurrence.selections[output];
  assert(selection !== undefined, `Occurrence ${occurrence.id} has no Selection for output ${output}.`);
  if (selection.kind === "constant") return {
    temporal: { kind: "constant" },
  };
  const source = evaluateTemporalMap(selection.mapping, localAt, "after");
  if (source === undefined) return undefined;
  return {
    temporal: {
      kind: "signal",
      at: source.position,
      side: source.sourceSide,
    },
  };
}

function evaluatePicture(graph: PictureGraph, program: CompilationGraph, at: ExactTemporalValue): EvaluatedPictureGraph {
  const nodes: Record<string, EvaluatedPictureNode> = {};
  for (const [id, node] of Object.entries(graph.nodes)) {
    switch (node.kind) {
      case "transparent": nodes[id] = { kind: "transparent" }; break;
      case "use": {
        const occurrence = program.occurrences[node.occurrence]!;
        const sample = evaluateUse(occurrence, node.output, at);
        nodes[id] = sample === undefined ? { kind: "transparent" } : {
          kind: "sample", ...sample,
        };
        break;
      }
      case "restrict": nodes[id] = contains(node.range, at)
        ? { kind: "alias", input: node.input } : { kind: "transparent" }; break;
      case "crop": nodes[id] = { kind: "crop", input: node.input, region: structuredClone(node.region) }; break;
      case "remap": nodes[id] = { kind: "remap", input: node.input, mapping: structuredClone(node.mapping) }; break;
      case "over": nodes[id] = { kind: "over", inputs: [...node.inputs] }; break;
      case "apply": {
        const positions = evaluateControlPositions(node.operator.temporalControls, node.controlMappings, program, at);
        nodes[id] = positions === undefined ? { kind: "transparent" } : {
          kind: "apply",
          controlPositions: positions,
        };
        break;
      }
    }
  }
  return { nodes };
}

export function createPictureEvaluator(program: CompilationGraph) {
  assertCompilationGraph(program);
  const graph = program.picture;
  assert(graph !== undefined, "Picture evaluation requires a Picture graph.");
  return (at: ExactTemporalValue): EvaluatedPictureGraph => {
    assertExactTemporalValue(at, "Picture evaluation position");
    assert(compareExactTemporalValues(at, exactTemporalZero()) >= 0
      && compareExactTemporalValues(at, program.domain.duration) < 0,
    `Picture evaluation position lies outside Programme domain ${program.domain.id}.`);
    return evaluatePicture(graph, program, at);
  };
}
