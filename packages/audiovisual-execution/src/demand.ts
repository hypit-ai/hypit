import {
  assertAudiovisualProgram,
  occurrenceParentRange,
  pictureNodeSpatialDomains,
  type AudioNode,
  type AudiovisualProgram,
  type Occurrence,
  type OperatorTemporalSupport,
  type PictureNode,
} from "@hypit/audiovisual";
import {
  assertSpatialRegion,
  transformSpatialPosition,
  type SpatialRegion,
} from "@hypit/spatial/algebra";
import {
  addExactTemporalValues,
  assertTemporalMapPoint,
  assertTemporalMapRegionSet,
  compareExactTemporalValues,
  compareTemporalMapPoints,
  composeTemporalMaps,
  exactTemporalRational,
  exactTemporalValue,
  exactTemporalZero,
  imageTemporalMapRegions,
  intersectTemporalMapRegionSets,
  sealTemporalMap,
  subtractExactTemporalValues,
  temporalRangeRegionSet,
  temporalMapPointRegionSet,
  unionTemporalMapRegionSets,
  type ExactTemporalValue,
  type TemporalMapPoint,
  type TemporalMapRegionSet,
} from "@hypit/temporal/algebra";

import type {
  AudiovisualDemandPlan,
  AudiovisualOutputDemand,
  AudiovisualSignal,
  ExecutionNodeDemand,
  SourceExecutionTaskDemand,
  SourceUseDemand,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function nodeKey(signal: AudiovisualSignal, node: string): string {
  return `${signal}:${node}`;
}

function sourceTaskKey(signal: AudiovisualSignal, source: string, output: string): string {
  return `${signal}\u0000${source}\u0000${output}`;
}

function sourceTaskId(signal: AudiovisualSignal, source: string, output: string): string {
  return `source-task:${signal}:${source.length}:${source}:${output}`;
}

function temporalEqual(left: TemporalMapRegionSet, right: TemporalMapRegionSet): boolean {
  return left.domain.id === right.domain.id
    && compareExactTemporalValues(left.domain.duration, right.domain.duration) === 0
    && left.regions.length === right.regions.length
    && left.regions.every((region, index) => {
      const other = right.regions[index]!;
      return compareTemporalMapPoints(region.start, other.start) === 0
        && compareTemporalMapPoints(region.end, other.end) === 0;
    });
}

function spatialEqual(left: SpatialRegion | undefined, right: SpatialRegion): boolean {
  return left !== undefined && left.x === right.x && left.y === right.y
    && left.width === right.width && left.height === right.height;
}

function normalizeSamplePoints(values: readonly TemporalMapPoint[]): TemporalMapPoint[] {
  const ordered = values.map((value) => {
    assertTemporalMapPoint(value);
    return {
      position: exactTemporalValue(exactTemporalRational(value.position)),
      side: value.side,
    };
  }).sort(compareTemporalMapPoints);
  return ordered.filter((value, index) => index === 0
    || compareTemporalMapPoints(ordered[index - 1]!, value) !== 0);
}

function samplesInside(
  values: readonly TemporalMapPoint[],
  temporal: TemporalMapRegionSet,
  label: string,
): TemporalMapPoint[] {
  const samples = normalizeSamplePoints(values);
  for (const sample of samples) assert(temporal.regions.some((region) =>
    compareTemporalMapPoints(region.start, sample) <= 0
    && compareTemporalMapPoints(sample, region.end) <= 0),
  `${label} lies outside its demanded temporal regions.`);
  return samples;
}

function pictureSourceSamples(
  program: AudiovisualProgram,
  samples: readonly TemporalMapPoint[],
): ReadonlyMap<string, readonly TemporalMapPoint[]> {
  const graph = program.picture!;
  const collected = new Map<string, TemporalMapPoint[]>();
  for (const sample of samples) {
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      const node = graph.nodes[id]!;
      switch (node.kind) {
        case "transparent": return;
        case "use": {
          const occurrence = program.occurrences[node.occurrence]!;
          const parent = intersectTemporalMapRegionSets(
            temporalMapPointRegionSet(program.domain, sample),
            temporalRangeRegionSet(program.domain, occurrenceParentRange(occurrence)),
          );
          if (parent.regions.length === 0) return;
          const mapped = sourceTemporalDemand(occurrence, node.output, parent);
          if (mapped.kind === "constant") return;
          const points = mapped.regions.regions.map((region) => {
            assert(compareTemporalMapPoints(region.start, region.end) === 0,
              `Picture Source sample ${id} unexpectedly became a temporal range.`);
            return region.start;
          });
          collected.set(id, [...(collected.get(id) ?? []), ...points]);
          return;
        }
        case "restrict": {
          const active = intersectTemporalMapRegionSets(
            temporalMapPointRegionSet(program.domain, sample),
            temporalRangeRegionSet(program.domain, node.range),
          );
          if (active.regions.length > 0) visit(node.input);
          return;
        }
        case "crop": visit(node.input); return;
        case "remap": visit(node.input); return;
        case "remap-control": visit(node.input); return;
        case "over": for (const input of node.inputs) visit(input); return;
        case "apply": {
          // Non-pointwise support expands temporal acquisition below. Exact
          // output observations still carry the cadence required to sample it.
          for (const input of Object.values(node.inputs)) visit(input);
          return;
        }
      }
    };
    visit(graph.root);
  }
  return new Map([...collected].map(([node, values]) => [node, normalizeSamplePoints(values)]));
}

function unionTemporal(
  current: TemporalMapRegionSet | undefined,
  next: TemporalMapRegionSet,
): { readonly value: TemporalMapRegionSet; readonly changed: boolean } {
  if (current === undefined) return { value: structuredClone(next), changed: true };
  const value = unionTemporalMapRegionSets(current, next);
  return { value, changed: !temporalEqual(current, value) };
}

function intersectRegion(left: SpatialRegion, right: SpatialRegion): SpatialRegion | undefined {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const endX = Math.min(left.x + left.width, right.x + right.width);
  const endY = Math.min(left.y + left.height, right.y + right.height);
  return endX > x && endY > y ? { x, y, width: endX - x, height: endY - y } : undefined;
}

function unionRegion(left: SpatialRegion | undefined, right: SpatialRegion): SpatialRegion {
  if (left === undefined) return structuredClone(right);
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const endX = Math.max(left.x + left.width, right.x + right.width);
  const endY = Math.max(left.y + left.height, right.y + right.height);
  return { x, y, width: endX - x, height: endY - y };
}

function mappedRegion(mapping: import("@hypit/spatial/algebra").SpatialMap, region: SpatialRegion): SpatialRegion | undefined {
  const target = intersectRegion(mapping.target.region, region);
  if (target === undefined) return undefined;
  const points = [
    { x: target.x, y: target.y },
    { x: target.x + target.width, y: target.y },
    { x: target.x, y: target.y + target.height },
    { x: target.x + target.width, y: target.y + target.height },
  ].map((point) => transformSpatialPosition(point, mapping.transform));
  const x = Math.min(...points.map((point) => point.x));
  const y = Math.min(...points.map((point) => point.y));
  const endX = Math.max(...points.map((point) => point.x));
  const endY = Math.max(...points.map((point) => point.y));
  return intersectRegion(mapping.source.region, {
    x, y,
    width: Math.max(Number.EPSILON, endX - x),
    height: Math.max(Number.EPSILON, endY - y),
  });
}

function clampSubtract(value: ExactTemporalValue, amount: ExactTemporalValue): ExactTemporalValue {
  return compareExactTemporalValues(value, amount) <= 0
    ? exactTemporalZero() : subtractExactTemporalValues(value, amount);
}

function clampAdd(
  value: ExactTemporalValue,
  amount: ExactTemporalValue,
  limit: ExactTemporalValue,
): ExactTemporalValue {
  const result = addExactTemporalValues(value, amount);
  return compareExactTemporalValues(result, limit) >= 0 ? structuredClone(limit) : result;
}

function expandTemporal(
  value: TemporalMapRegionSet,
  before: ExactTemporalValue,
  after: ExactTemporalValue,
): TemporalMapRegionSet {
  return {
    domain: structuredClone(value.domain),
    regions: value.regions.map((region) => ({
      start: { position: clampSubtract(region.start.position, before), side: "after" as const },
      end: { position: clampAdd(region.end.position, after, value.domain.duration), side: "before" as const },
    })),
  };
}

function inputTemporalDemand(
  output: TemporalMapRegionSet,
  support: OperatorTemporalSupport,
  input: string,
): TemporalMapRegionSet {
  const inputSupport = support.inputs[input]!;
  return expandTemporal(output, inputSupport.before, inputSupport.after);
}

function occurrenceMap(value: Occurrence) {
  const parentRange = occurrenceParentRange(value);
  return sealTemporalMap({ stages: [{
    target: structuredClone(value.placement.parent),
    source: structuredClone(value.domain),
    pieces: [{
      target: parentRange,
      sourceAtStart: structuredClone(value.placement.active.start),
      rate: { numerator: 1, denominator: 1 },
    }],
  }] });
}

function sourceTemporalDemand(
  occurrence: Occurrence,
  output: string,
  parent: TemporalMapRegionSet,
): SourceExecutionTaskDemand["temporal"] {
  const selection = occurrence.selections[output]!;
  if (selection.kind === "constant") return { kind: "constant" };
  const mapped = imageTemporalMapRegions(
    composeTemporalMaps(occurrenceMap(occurrence), selection.mapping),
    parent,
  );
  return { kind: "signal", regions: mapped };
}

function dependencies(node: PictureNode | AudioNode): readonly string[] {
  switch (node.kind) {
    case "transparent":
    case "silence":
    case "use": return [];
    case "restrict":
    case "crop":
    case "remap":
    case "remap-control": return [node.input];
    case "over":
    case "mix": return node.inputs;
    case "apply": return Object.values(node.inputs);
  }
}

function planSignal(
  program: AudiovisualProgram,
  signal: AudiovisualSignal,
  initialTemporal: TemporalMapRegionSet,
  initialSpatial: SpatialRegion | undefined,
  initialSamples?: readonly TemporalMapPoint[],
): {
  readonly nodes: ExecutionNodeDemand[];
  readonly uses: SourceUseDemand[];
  readonly sourceTasks: SourceExecutionTaskDemand[];
  readonly output: string;
} {
  const graph = signal === "picture" ? program.picture! : program.audio!;
  const pictureDomains = signal === "picture"
    ? pictureNodeSpatialDomains(program.picture!, program) : undefined;
  const temporal = new Map<string, TemporalMapRegionSet>([[graph.root, initialTemporal]]);
  const spatial = new Map<string, SpatialRegion>();
  if (initialSpatial !== undefined) spatial.set(graph.root, initialSpatial);
  const queue = [graph.root];
  const useDemands = new Map<string, SourceUseDemand>();
  const sourceTasks = new Map<string, SourceExecutionTaskDemand>();
  const sourceSamples = signal === "picture" && initialSamples !== undefined
    ? pictureSourceSamples(program, initialSamples) : new Map<string, readonly TemporalMapPoint[]>();

  const push = (node: string, nextTemporal: TemporalMapRegionSet, nextSpatial?: SpatialRegion): void => {
    const temporalUnion = unionTemporal(temporal.get(node), nextTemporal);
    if (temporalUnion.changed) temporal.set(node, temporalUnion.value);
    let spatialChanged = false;
    if (nextSpatial !== undefined) {
      const previous = spatial.get(node);
      const next = unionRegion(previous, nextSpatial);
      spatialChanged = !spatialEqual(previous, next);
      if (spatialChanged) spatial.set(node, next);
    }
    if (temporalUnion.changed || spatialChanged) queue.push(node);
  };

  while (queue.length > 0) {
    const id = queue.shift()!;
    const demand = temporal.get(id)!;
    if (demand.regions.length === 0) continue;
    const node = graph.nodes[id]! as PictureNode | AudioNode;
    const pictureRegion = spatial.get(id);
    switch (node.kind) {
      case "transparent":
      case "silence": break;
      case "use": {
        const occurrence = program.occurrences[node.occurrence]!;
        const parent = intersectTemporalMapRegionSets(
          demand,
          temporalRangeRegionSet(program.domain, occurrenceParentRange(occurrence)),
        );
        if (parent.regions.length === 0) break;
        const use = nodeKey(signal, id);
        const taskKey = sourceTaskKey(signal, occurrence.source.id, node.output);
        const taskId = sourceTaskId(signal, occurrence.source.id, node.output);
        const nextTemporal = sourceTemporalDemand(occurrence, node.output, parent);
        const nextSamples = sourceSamples.get(id);
        const sourceOutput = occurrence.source.outputs[node.output]!;
        useDemands.set(use, {
          id: use,
          program: program.id,
          node: use,
          signal,
          occurrence: occurrence.id,
          source: occurrence.source.id,
          output: node.output,
          producer: taskId,
          programmeTemporal: structuredClone(parent),
          sourceTemporal: structuredClone(nextTemporal),
          ...(nextSamples === undefined ? {} : { sourceSamples: structuredClone(nextSamples) }),
          ...(pictureRegion === undefined ? {} : { sourceSpatial: structuredClone(pictureRegion) }),
        });

        const current = sourceTasks.get(taskKey);
        let combinedTemporal = nextTemporal;
        if (current !== undefined) {
          assert(current.temporal.kind === nextTemporal.kind,
            `Source ${occurrence.source.id}.${node.output} has inconsistent temporal kinds.`);
          if (current.temporal.kind === "signal" && nextTemporal.kind === "signal") {
            combinedTemporal = { kind: "signal", regions: unionTemporalMapRegionSets(
              current.temporal.regions, nextTemporal.regions,
            ) };
          }
        }
        sourceTasks.set(taskKey, {
          id: taskId,
          program: program.id,
          signal,
          source: occurrence.source.id,
          output: node.output,
          uses: [...new Set([...(current?.uses ?? []), use])].sort(),
          temporal: combinedTemporal,
          ...(signal === "picture" ? { pictureDomain: structuredClone(sourceOutput.spatialDomain!) } : {}),
          ...((current?.samples === undefined && nextSamples === undefined) ? {} : {
            samples: normalizeSamplePoints([...(current?.samples ?? []), ...(nextSamples ?? [])]),
          }),
          ...(pictureRegion === undefined ? {} : {
            spatial: unionRegion(current?.spatial, pictureRegion),
          }),
        });
        break;
      }
      case "restrict": {
        const restricted = intersectTemporalMapRegionSets(
          demand,
          temporalRangeRegionSet(program.domain, node.range),
        );
        if (restricted.regions.length > 0) push(node.input, restricted, pictureRegion);
        break;
      }
      case "crop": {
        assert(signal === "picture", "Only Picture demand can cross a crop.");
        const region = pictureRegion === undefined ? node.region : intersectRegion(pictureRegion, node.region);
        if (region !== undefined) push(node.input, demand, region);
        break;
      }
      case "remap": {
        assert(signal === "picture", "Only Picture demand can cross a remap.");
        const region = mappedRegion(node.mapping, pictureRegion ?? node.mapping.target.region);
        if (region !== undefined) push(node.input, demand, region);
        break;
      }
      case "remap-control": {
        assert(signal === "picture", "Only Picture demand can cross a remap Control.");
        // A time-varying projective envelope has no region-of-interest contract yet.
        // Requesting the complete Source domain is conservative and explicit.
        push(node.input, demand, node.control.segments[0]!.from.source.region);
        break;
      }
      case "over": for (const input of node.inputs) push(input, demand, pictureRegion); break;
      case "mix": for (const input of node.inputs) push(input, demand); break;
      case "apply": {
        for (const [port, input] of Object.entries(node.inputs)) {
          const temporalInput = inputTemporalDemand(demand, node.operator.temporalSupport, port);
          // AVIR operators do not yet declare a spatial region-of-interest contract.
          // A Picture operator therefore receives its complete input domain.
          const operatorSpatial = signal === "picture"
            ? pictureDomains!.get(input)!.region : undefined;
          push(input, temporalInput, operatorSpatial);
        }
        break;
      }
    }
  }

  const nodes = [...temporal.entries()].filter(([, value]) => value.regions.length > 0)
    .map(([id, value]): ExecutionNodeDemand => {
      const node = graph.nodes[id]! as PictureNode | AudioNode;
      return {
        id: nodeKey(signal, id),
        signal,
        node: id,
        operation: node.kind,
        dependencies: node.kind === "use"
          ? [useDemands.get(nodeKey(signal, id))!.producer]
          : dependencies(node).filter((dependency) => temporal.has(dependency))
            .map((dependency) => nodeKey(signal, dependency)),
        temporal: structuredClone(value),
        ...(signal === "picture" ? {
          pictureDomain: structuredClone(pictureDomains!.get(id)!),
        } : {}),
        ...(spatial.get(id) === undefined ? {} : { spatial: structuredClone(spatial.get(id)!) }),
      };
    });
  return {
    nodes,
    uses: [...useDemands.values()].map((value) => structuredClone(value)),
    sourceTasks: [...sourceTasks.values()].map((value) => structuredClone(value)),
    output: nodeKey(signal, graph.root),
  };
}

export type AudiovisualRegionDemand = {
  readonly picture?: {
    readonly temporal: TemporalMapRegionSet;
    readonly region?: SpatialRegion;
    readonly samples?: readonly TemporalMapPoint[];
  };
  readonly audio?: { readonly temporal: TemporalMapRegionSet };
};

/** Internal range-set form used when a nested Programme receives disjoint Source-local demand. */
export function planAudiovisualRegionDemand(
  program: AudiovisualProgram,
  demand: AudiovisualRegionDemand,
): AudiovisualDemandPlan {
  assertAudiovisualProgram(program);
  assert(demand.picture !== undefined || demand.audio !== undefined,
    "Audiovisual execution demand selects no outputs.");
  const nodes: ExecutionNodeDemand[] = [];
  const uses: SourceUseDemand[] = [];
  const sourceTasks: SourceExecutionTaskDemand[] = [];
  const outputs: Partial<Record<AudiovisualSignal, string>> = {};
  if (demand.picture !== undefined) {
    assertTemporalMapRegionSet(demand.picture.temporal);
    assert(demand.picture.temporal.domain.id === program.domain.id
      && compareExactTemporalValues(
        demand.picture.temporal.domain.duration, program.domain.duration,
      ) === 0, `Picture execution demand does not belong to Programme ${program.id}.`);
    assert(program.picture !== undefined && program.pictureDomain !== undefined,
      `Audiovisual Programme ${program.id} has no Picture output.`);
    if (demand.picture.region !== undefined) assertSpatialRegion(demand.picture.region, "Picture demand region");
    const region = intersectRegion(program.pictureDomain.region,
      demand.picture.region ?? program.pictureDomain.region);
    assert(region !== undefined, "Picture demand does not intersect the Programme Picture domain.");
    const samples = demand.picture.samples === undefined ? undefined
      : samplesInside(demand.picture.samples, demand.picture.temporal, "Picture execution sample");
    const result = planSignal(program, "picture", demand.picture.temporal, region, samples);
    nodes.push(...result.nodes);
    uses.push(...result.uses);
    sourceTasks.push(...result.sourceTasks);
    outputs.picture = result.output;
  }
  if (demand.audio !== undefined) {
    assertTemporalMapRegionSet(demand.audio.temporal);
    assert(demand.audio.temporal.domain.id === program.domain.id
      && compareExactTemporalValues(
        demand.audio.temporal.domain.duration, program.domain.duration,
      ) === 0, `Audio execution demand does not belong to Programme ${program.id}.`);
    assert(program.audio !== undefined, `Audiovisual Programme ${program.id} has no Audio output.`);
    const result = planSignal(program, "audio", demand.audio.temporal, undefined);
    nodes.push(...result.nodes);
    uses.push(...result.uses);
    sourceTasks.push(...result.sourceTasks);
    outputs.audio = result.output;
  }
  return { program: program.id, nodes, uses, sourceTasks, outputs };
}

/** Propagate one explicit output request through a closed AVIR Programme. */
export function planAudiovisualDemand(
  program: AudiovisualProgram,
  demand: AudiovisualOutputDemand,
): AudiovisualDemandPlan {
  assertAudiovisualProgram(program);
  return planAudiovisualRegionDemand(program, {
    ...(demand.picture === undefined ? {} : { picture: {
      temporal: temporalRangeRegionSet(program.domain, demand.picture.range),
      ...(demand.picture.region === undefined ? {} : { region: demand.picture.region }),
      ...(demand.picture.samples === undefined ? {} : { samples: demand.picture.samples }),
    } }),
    ...(demand.audio === undefined ? {} : { audio: {
      temporal: temporalRangeRegionSet(program.domain, demand.audio.range),
    } }),
  });
}
