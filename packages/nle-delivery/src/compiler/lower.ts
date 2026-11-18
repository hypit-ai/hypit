import { resolvedMediaSource } from "./media.js";
import { occurrenceParentRange } from "./occurrence.js";
import { sealCompilationGraph } from "./program.js";
import { pictureNodeSpatialDomains } from "./picture.js";
import { sealLocalSpatialDomain, sealSpatialMap, type LocalSpatialDomain, type SpatialMap } from "./spatial.js";
import type {
  AudioNode, CompilationGraph, Occurrence, PictureNode, PictureRead, ResolvedSource,
} from "./types.js";
import type { HtmlPictureReconstruction } from "@hypit/html-program";
import {
  addExactTemporalValues,
  compareExactTemporalValues,
  composeTemporalMaps,
  exactTemporalZero,
  preimageTemporalMapRegions,
  sealLocalTemporalDomain,
  sealTemporalMap,
  sliceTemporalMapPieces,
  subtractExactTemporalValues,
  temporalRangeRegionSet,
  type ExactTemporalValue,
  type LocalTemporalDomain,
  type TemporalMap,
  type TemporalMapPiece,
} from "@hypit/temporal/algebra";
import {
  fitNlePictureContent,
  assertIdentity,
  assertNleProject,
  findNleComposition,
  nleCompositionDuration,
  nleLinearTimeMapping,
  nleTimeMappingRequiredDuration,
  resolveNleOperatorParameters,
  resolveNleComponentValue,
  resolveNlePictureLayout,
  rootNleComposition,
  nleProcessControlDuration,
  resolveNleProcessTime,
} from "@hypit/nle";
import type {
  NleAdjustItem,
  NleComposition,
  NleItem,
  NleProcess,
  NlePresentItem,
  NleProject,
  NleTimeMapping,
  NleTrack,
  NleTransition,
} from "@hypit/nle";
import type { NleProcessRenderContext, NleRenderContext } from "../render-contribution.js";
import type { NleRenderResolver } from "./resolve.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function programmeSpace(composition: NleComposition): LocalSpatialDomain {
  return sealLocalSpatialDomain({
    id: `${composition.id}:picture-space`,
    region: {
      x: 0,
      y: 0,
      width: composition.canvas.width,
      height: composition.canvas.height,
    },
  });
}

function itemSpace(project: NleProject, item: NlePresentItem): LocalSpatialDomain {
  const layout = resolveNlePictureLayout(project, item.picture!.layout);
  return sealLocalSpatialDomain({
    id: `${item.id}:picture-space`,
    region: { x: 0, y: 0, width: layout.width, height: layout.height },
  });
}

function fitMap(project: NleProject, item: NlePresentItem,
  target: LocalSpatialDomain, source: LocalSpatialDomain): SpatialMap {
  const layout = resolveNlePictureLayout(project, item.picture!.layout);
  const content = fitNlePictureContent({ ...layout, x: 0, y: 0 }, source.region);
  const xx = source.region.width / content.width;
  const yy = source.region.height / content.height;
  return sealSpatialMap({
    target,
    source,
    transform: {
      kind: "affine",
      xx,
      xy: 0,
      yx: 0,
      yy,
      tx: source.region.x - content.x * xx,
      ty: source.region.y - content.y * yy,
    },
  });
}

function placementMap(
  project: NleProject,
  projectDomain: LocalSpatialDomain,
  itemDomain: LocalSpatialDomain,
  item: NlePresentItem,
): SpatialMap {
  const layout = resolveNlePictureLayout(project, item.picture!.layout);
  return sealSpatialMap({
    target: projectDomain,
    source: itemDomain,
    transform: {
      kind: "affine",
      xx: 1,
      xy: 0,
      yx: 0,
      yy: 1,
      tx: -layout.x,
      ty: -layout.y,
    },
  });
}

function resolveItem(
  project: NleProject,
  composition: NleComposition,
  track: NleTrack,
  item: NlePresentItem,
  host: NleRenderResolver,
): ResolvedSource {
  const context: NleRenderContext = { project, composition, track };
  if (item.source === "media") {
    return resolvedMediaSource(`${item.id}:source`, host.resolveMedia(item.asset));
  }
  assert(item.source === "component", `NLE Item ${item.id} is not a resolvable Media or Component source.`);
  const media = Object.fromEntries(Object.entries(item.media ?? {}).map(([input, asset]) => [
    input,
    host.resolveMedia(asset),
  ]));
  const values = Object.fromEntries((item.valueBindings ?? []).map((binding) => [
    binding.slot,
    resolveNleComponentValue(project, item.component, binding),
  ]));
  const requested = nleTimeMappingRequiredDuration(item.sourceTime);
  const sourceDuration = compareExactTemporalValues(requested, exactTemporalZero()) > 0 ? requested : item.duration;
  const { region, duration, visual, itemTimeControl } = host.resolveComponent(item, { ...context, item, media, values, sourceDuration });
  return {
    content: { kind: "visual", visual },
    picture: {
      spatialDomain: { id: `${item.id}:source-space`, region },
      ...(duration === undefined ? {} : { time: { id: `${item.id}:source-time`, duration } }),
      ...(itemTimeControl === undefined ? {} : { itemTimeControl }),
    },
  };
}

function sourceMap(item: NlePresentItem, local: LocalTemporalDomain, source: LocalTemporalDomain): TemporalMap {
  return sealTemporalMap({ stages: [{ target: local, source, pieces: item.sourceTime.pieces }] });
}

function pictureRead(
  item: NlePresentItem,
  domain: LocalTemporalDomain,
  picture: NonNullable<ResolvedSource["picture"]>,
  reconstruction: HtmlPictureReconstruction | undefined,
): PictureRead {
  const name = picture.itemTimeControl;
  const itemTime = name === undefined ? {} : { itemTime: {
    name,
    mapping: sealTemporalMap({ stages: [{ target: domain, source: domain,
      pieces: nleLinearTimeMapping(domain.duration).pieces }] }),
  } };
  if (picture.time === undefined) {
    assert(reconstruction === undefined, `NLE Item ${item.id} reconstruction requires a timed Picture.`);
    return { kind: "constant", spatialDomain: picture.spatialDomain, ...itemTime };
  }
  return {
    kind: "signal",
    spatialDomain: picture.spatialDomain,
    mapping: sourceMap(item, domain, picture.time),
    ...itemTime,
    ...(reconstruction === undefined ? {} : { reconstruction }),
  };
}

function bindControls(
  id: string,
  names: readonly string[] | undefined,
  duration: ExactTemporalValue,
  mapping: (domain: LocalTemporalDomain) => TemporalMap,
): Readonly<Record<string, TemporalMap>> {
  assert(names === undefined || (Array.isArray(names) && new Set(names).size === names.length),
    `NLE ${id} must declare distinct control names.`);
  return Object.fromEntries((names ?? []).map(name => {
    assertIdentity(name, `NLE ${id} control name`);
    return [name, mapping({ id: `${id}:${name}`, duration })];
  }));
}

function operatorControlMapping(
  mapping: NleTimeMapping,
  start: ExactTemporalValue,
  parent: LocalTemporalDomain,
  control: LocalTemporalDomain,
) {
  return sealTemporalMap({ stages: [{
    target: parent,
    source: control,
    pieces: mapping.pieces.map((piece) => ({
      ...structuredClone(piece),
      target: {
        start: addExactTemporalValues(start, piece.target.start),
        end: addExactTemporalValues(start, piece.target.end),
      },
    })),
  }] });
}

function processContext(
  project: NleProject,
  composition: NleComposition,
  track: NleTrack,
  process: NleProcess,
  scope: NleProcessRenderContext["scope"],
): NleProcessRenderContext {
  return {
    project,
    composition,
    track,
    process,
    parameters: resolveNleOperatorParameters(project, process.operator, process.parameters),
    scope,
    controlDuration: nleProcessControlDuration(process.controlTime),
  };
}

function pictureProcessNode(
  nodes: Record<string, PictureNode>,
  input: string,
  process: NleProcess,
  context: NleProcessRenderContext,
  host: NleRenderResolver,
  parent: LocalTemporalDomain,
): string {
  const effect = host.resolvePictureOperator(process, context);
  const mapping = resolveNleProcessTime(process.controlTime, context.scope.item.duration);
  const id = `${context.scope.item.id}:picture-operator:${process.id}`;
  nodes[id] = {
    kind: "apply",
    visual: effect.visual,
    inputs: { signal: input },
    controlMappings: bindControls(process.id, effect.controls, context.controlDuration,
      control => operatorControlMapping(mapping, context.scope.item.start, parent, control)),
  };
  return id;
}

function audioProcessNode(
  nodes: Record<string, AudioNode>,
  input: string,
  process: NleProcess,
  context: NleProcessRenderContext,
  host: NleRenderResolver,
  parent: LocalTemporalDomain,
): string {
  const effect = host.resolveAudioOperator(process, context);
  const mapping = resolveNleProcessTime(process.controlTime, context.scope.item.duration);
  const id = `${context.scope.item.id}:audio-operator:${process.id}`;
  nodes[id] = {
    kind: "apply",
    filter: effect.filter,
    input,
    controlMappings: bindControls(process.id, effect.controls, context.controlDuration,
      control => operatorControlMapping(mapping, context.scope.item.start, parent, control)),
  };
  return id;
}

function pictureAdjust(
  nodes: Record<string, PictureNode>,
  input: string,
  applied: string,
  item: NleAdjustItem,
  duration: ExactTemporalValue,
): string {
  const start = structuredClone(item.start);
  const end = addExactTemporalValues(item.start, item.duration);
  if (compareExactTemporalValues(start, exactTemporalZero()) === 0
    && compareExactTemporalValues(end, duration) === 0) return applied;
  const segments: string[] = [];
  if (compareExactTemporalValues(start, exactTemporalZero()) > 0) {
    const id = `${item.id}:picture-before`;
    nodes[id] = { kind: "restrict", input, range: { start: exactTemporalZero(), end: start } };
    segments.push(id);
  }
  const active = `${item.id}:picture-active`;
  nodes[active] = { kind: "restrict", input: applied, range: { start, end } };
  segments.push(active);
  if (compareExactTemporalValues(end, duration) < 0) {
    const id = `${item.id}:picture-after`;
    nodes[id] = { kind: "restrict", input, range: { start: end, end: structuredClone(duration) } };
    segments.push(id);
  }
  const root = `${item.id}:adjusted-picture`;
  nodes[root] = { kind: "over", inputs: segments };
  return root;
}

function audioAdjust(
  nodes: Record<string, AudioNode>,
  input: string,
  applied: string,
  item: NleAdjustItem,
  duration: ExactTemporalValue,
): string {
  const start = structuredClone(item.start);
  const end = addExactTemporalValues(item.start, item.duration);
  if (compareExactTemporalValues(start, exactTemporalZero()) === 0
    && compareExactTemporalValues(end, duration) === 0) return applied;
  const segments: string[] = [];
  if (compareExactTemporalValues(start, exactTemporalZero()) > 0) {
    const id = `${item.id}:audio-before`;
    nodes[id] = { kind: "restrict", input, range: { start: exactTemporalZero(), end: start } };
    segments.push(id);
  }
  const active = `${item.id}:audio-active`;
  nodes[active] = { kind: "restrict", input: applied, range: { start, end } };
  segments.push(active);
  if (compareExactTemporalValues(end, duration) < 0) {
    const id = `${item.id}:audio-after`;
    nodes[id] = { kind: "restrict", input, range: { start: end, end: structuredClone(duration) } };
    segments.push(id);
  }
  const root = `${item.id}:adjusted-audio`;
  nodes[root] = { kind: "mix", inputs: segments };
  return root;
}

function namespaced(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}

function shifted(value: ExactTemporalValue, offset: ExactTemporalValue): ExactTemporalValue {
  return addExactTemporalValues(value, offset);
}

function namespaceDomain(prefix: string, domain: LocalTemporalDomain): LocalTemporalDomain {
  return { id: namespaced(prefix, domain.id), duration: structuredClone(domain.duration) };
}

function namespaceSelectionMap(prefix: string, map: TemporalMap): TemporalMap {
  return sealTemporalMap({ stages: map.stages.map((stage) => ({
    target: namespaceDomain(prefix, stage.target),
    source: namespaceDomain(prefix, stage.source),
    pieces: structuredClone(stage.pieces),
  })) });
}

function compositionOccurrenceMap(
  item: Extract<NlePresentItem, { readonly source: "composition" }>,
  source: LocalTemporalDomain,
): TemporalMap {
  return sealTemporalMap({ stages: [{
    target: sealLocalTemporalDomain({ id: `${item.id}:time`, duration: structuredClone(item.duration) }),
    source: structuredClone(source),
    pieces: structuredClone(item.sourceTime.pieces),
  }] });
}

function liftedCompositionMap(
  item: Extract<NlePresentItem, { readonly source: "composition" }>,
  map: TemporalMap,
  parent: LocalTemporalDomain,
): TemporalMap {
  return sealTemporalMap({ stages: [{
    target: parent,
    source: structuredClone(map.stages[0]!.source),
    pieces: map.stages[0]!.pieces.map((piece) => ({
      ...structuredClone(piece),
      target: {
        start: shifted(piece.target.start, item.start),
        end: shifted(piece.target.end, item.start),
      },
    })),
  }] });
}

function retimeNestedControlMap(
  prefix: string,
  item: Extract<NlePresentItem, { readonly source: "composition" }>,
  occurrenceMap: TemporalMap,
  map: TemporalMap,
  parent: LocalTemporalDomain,
): TemporalMap {
  const composed = composeTemporalMaps(liftedCompositionMap(item, occurrenceMap, parent), map);
  return sealTemporalMap({ stages: composed.stages.map((stage, index) => ({
    target: index === 0 ? structuredClone(parent) : namespaceDomain(prefix, stage.target),
    source: namespaceDomain(prefix, stage.source),
    pieces: structuredClone(stage.pieces),
  })) });
}

function namespaceSpatialDomain(prefix: string, domain: LocalSpatialDomain): LocalSpatialDomain {
  return { ...structuredClone(domain), id: namespaced(prefix, domain.id) };
}

function namespaceSpatialMap(prefix: string, map: SpatialMap): SpatialMap {
  return {
    ...structuredClone(map),
    target: namespaceSpatialDomain(prefix, map.target),
    source: namespaceSpatialDomain(prefix, map.source),
  };
}

function preimageRanges(
  map: TemporalMap,
  source: LocalTemporalDomain,
  range: { readonly start: ExactTemporalValue; readonly end: ExactTemporalValue },
): readonly { readonly start: ExactTemporalValue; readonly end: ExactTemporalValue }[] {
  return preimageTemporalMapRegions(map, temporalRangeRegionSet(source, range)).regions.flatMap((region) =>
    compareExactTemporalValues(region.start.position, region.end.position) < 0
      ? [{ start: region.start.position, end: region.end.position }]
      : []);
}

function importNestedProgram(
  program: CompilationGraph,
  item: Extract<NlePresentItem, { readonly source: "composition" }>,
  parent: LocalTemporalDomain,
): {
  readonly occurrences: Readonly<Record<string, Occurrence>>;
  readonly pictureNodes: Readonly<Record<string, PictureNode>>;
  readonly pictureRoot?: string;
  readonly pictureDomain?: LocalSpatialDomain;
  readonly audioNodes: Readonly<Record<string, AudioNode>>;
  readonly audioRoot?: string;
} {
  const prefix = item.id;
  const occurrenceMap = compositionOccurrenceMap(item, program.domain);
  const occurrences: Record<string, Occurrence> = {};
  const occurrenceClones = new Map<string, readonly string[]>();
  for (const [id, occurrenceValue] of Object.entries(program.occurrences)) {
    const activeParentRange = occurrenceParentRange(occurrenceValue);
    const regions = preimageRanges(occurrenceMap, program.domain, activeParentRange);
    const cloneIds: string[] = [];
    for (const [index, region] of regions.entries()) {
      const cloneId = namespaced(prefix, `${id}:region:${index}`);
      const duration = subtractExactTemporalValues(region.end, region.start);
      const cloneDomain = sealLocalTemporalDomain({ id: `${cloneId}:time`, duration });
      const originalDomain = namespaceDomain(prefix, occurrenceValue.domain);
      const childDomain = namespaceDomain(prefix, program.domain);
      const selectedPieces = sliceTemporalMapPieces(occurrenceMap.stages[0]!.pieces, region);
      const childToOccurrence: TemporalMap = {
        stages: [{
          target: childDomain,
          source: originalDomain,
          pieces: [{
            target: structuredClone(activeParentRange),
            sourceAtStart: structuredClone(occurrenceValue.placement.active.start),
            rate: { numerator: 1, denominator: 1 },
          }],
        }],
      };
      const retimeSource = (mapping: TemporalMap): TemporalMap => sealTemporalMap({ stages: [
        { target: cloneDomain, source: childDomain, pieces: selectedPieces },
        ...childToOccurrence.stages,
        ...namespaceSelectionMap(prefix, mapping).stages,
      ] });
      const picture = occurrenceValue.picture;
      occurrences[cloneId] = {
        id: cloneId,
        content: occurrenceValue.content,
        domain: cloneDomain,
        placement: {
          parent,
          start: shifted(region.start, item.start),
          active: { start: exactTemporalZero(), end: structuredClone(duration) },
        },
        ...(picture === undefined ? {} : {
          picture: {
            ...picture,
            spatialDomain: namespaceSpatialDomain(prefix, picture.spatialDomain),
            ...(picture.kind === "constant" ? {} : { mapping: retimeSource(picture.mapping) }),
            ...(picture.itemTime === undefined ? {} : { itemTime: {
              name: picture.itemTime.name, mapping: retimeSource(picture.itemTime.mapping),
            } }),
          },
        }),
        ...(occurrenceValue.audio === undefined ? {} : { audio: retimeSource(occurrenceValue.audio) }),
      };
      cloneIds.push(cloneId);
    }
    occurrenceClones.set(id, cloneIds);
  }

  const pictureNodes: Record<string, PictureNode> = {};
  const space = program.picture === undefined ? undefined : pictureNodeSpatialDomains(program.picture, program);
  for (const [id, node] of Object.entries(program.picture?.nodes ?? {})) {
    const sourceDomain = space?.get(id);
    if (sourceDomain === undefined) continue;
    const importedId = namespaced(prefix, id);
    const imported: PictureNode = (() => {
      switch (node.kind) {
        case "transparent": return { kind: "transparent", spatialDomain: namespaceSpatialDomain(prefix, sourceDomain) };
        case "use": {
          const clones = occurrenceClones.get(node.occurrence) ?? [];
          if (clones.length === 0) return { kind: "transparent", spatialDomain: namespaceSpatialDomain(prefix, sourceDomain) };
          if (clones.length === 1) return { ...node, occurrence: clones[0]! };
          const uses = clones.map((occurrence, index) => {
            const use = `${importedId}:region:${index}`;
            pictureNodes[use] = { ...node, occurrence };
            return use;
          });
          return { kind: "over", inputs: uses };
        }
        case "restrict": {
          const ranges = preimageRanges(occurrenceMap, program.domain, node.range);
          if (ranges.length === 0) return { kind: "transparent", spatialDomain: namespaceSpatialDomain(prefix, sourceDomain) };
          if (ranges.length === 1) return {
            ...node,
            input: namespaced(prefix, node.input),
            range: {
              start: shifted(ranges[0]!.start, item.start),
              end: shifted(ranges[0]!.end, item.start),
            },
          };
          const restrictions = ranges.map((range, index) => {
            const restricted = `${importedId}:region:${index}`;
            pictureNodes[restricted] = {
              kind: "restrict",
              input: namespaced(prefix, node.input),
              range: { start: shifted(range.start, item.start), end: shifted(range.end, item.start) },
            };
            return restricted;
          });
          return { kind: "over", inputs: restrictions };
        }
        case "crop": return { ...structuredClone(node), input: namespaced(prefix, node.input) };
        case "remap": return {
          ...structuredClone(node),
          input: namespaced(prefix, node.input),
          mapping: namespaceSpatialMap(prefix, node.mapping),
        };
        case "over": return { kind: "over", inputs: node.inputs.map((input) => namespaced(prefix, input)) };
        case "apply": return {
          ...node,
          inputs: Object.fromEntries(Object.entries(node.inputs)
            .map(([name, input]) => [name, namespaced(prefix, input)])),
          controlMappings: Object.fromEntries(Object.entries(node.controlMappings)
            .map(([name, map]) => [name, retimeNestedControlMap(prefix, item, occurrenceMap, map, parent)])),
        };
      }
    })();
    pictureNodes[importedId] = imported;
  }

  const audioNodes: Record<string, AudioNode> = {};
  for (const [id, node] of Object.entries(program.audio?.nodes ?? {})) {
    const importedId = namespaced(prefix, id);
    const imported: AudioNode = (() => {
      switch (node.kind) {
        case "silence": return { kind: "silence" };
        case "use": {
          const clones = occurrenceClones.get(node.occurrence) ?? [];
          if (clones.length === 0) return { kind: "silence" };
          if (clones.length === 1) return { ...node, occurrence: clones[0]! };
          const uses = clones.map((occurrence, index) => {
            const use = `${importedId}:region:${index}`;
            audioNodes[use] = { ...node, occurrence };
            return use;
          });
          return { kind: "mix", inputs: uses };
        }
        case "restrict": {
          const ranges = preimageRanges(occurrenceMap, program.domain, node.range);
          if (ranges.length === 0) return { kind: "silence" };
          if (ranges.length === 1) return {
            ...node,
            input: namespaced(prefix, node.input),
            range: {
              start: shifted(ranges[0]!.start, item.start),
              end: shifted(ranges[0]!.end, item.start),
            },
          };
          const restrictions = ranges.map((range, index) => {
            const restricted = `${importedId}:region:${index}`;
            audioNodes[restricted] = {
              kind: "restrict",
              input: namespaced(prefix, node.input),
              range: { start: shifted(range.start, item.start), end: shifted(range.end, item.start) },
            };
            return restricted;
          });
          return { kind: "mix", inputs: restrictions };
        }
        case "mix": return { kind: "mix", inputs: node.inputs.map((input) => namespaced(prefix, input)) };
        case "apply": return {
          ...node,
          input: namespaced(prefix, node.input),
          controlMappings: Object.fromEntries(Object.entries(node.controlMappings)
            .map(([name, map]) => [name, retimeNestedControlMap(prefix, item, occurrenceMap, map, parent)])),
        };
      }
    })();
    audioNodes[importedId] = imported;
  }

  return {
    occurrences,
    pictureNodes,
    ...(program.picture === undefined ? {} : {
      pictureRoot: namespaced(prefix, program.picture.root),
      pictureDomain: namespaceSpatialDomain(prefix, program.pictureDomain!),
    }),
    audioNodes,
    ...(program.audio === undefined ? {} : { audioRoot: namespaced(prefix, program.audio.root) }),
  };
}

function lowerComposition(
  project: NleProject,
  composition: NleComposition,
  host: NleRenderResolver,
  outputs: { readonly picture: boolean; readonly audio: boolean },
): CompilationGraph {
  const duration = nleCompositionDuration(composition);
  assert(compareExactTemporalValues(duration, exactTemporalZero()) > 0,
    `NLE Composition ${composition.id} has no enabled Items to lower.`);
  const domain = sealLocalTemporalDomain({ id: `${composition.id}:time`, duration });
  const pictureDomain = programmeSpace(composition);
  const occurrences: Record<string, Occurrence> = {};
  const pictureNodes: Record<string, PictureNode> = {};
  const audioNodes: Record<string, AudioNode> = {};
  const located = new Map<string, { readonly item: NleItem; readonly track: NleTrack }>();
  const matteByContent = new Map(composition.mattes.map((value) => [value.content, value] as const));
  const matteSources = new Set(composition.mattes.map((value) => value.matte));
  const pictureOrder: string[] = [];
  const audioOrder: string[] = [];
  for (const track of composition.tracks) {
    for (const item of track.items) located.set(item.id, { item, track });
    if (!track.enabled) continue;
    for (const item of track.items) {
      if (!item.enabled) continue;
      if (track.kind === "picture") {
        if (outputs.picture && !matteSources.has(item.id)) pictureOrder.push(item.id);
        if (outputs.audio && item.kind === "present" && item.audio !== undefined) audioOrder.push(item.id);
      } else if (outputs.audio) audioOrder.push(item.id);
    }
  }

  const requiredPicture = new Set(pictureOrder.filter((id) => located.get(id)!.item.kind === "present"));
  const requireMatte = (id: string): void => {
    const relation = matteByContent.get(id);
    if (relation === undefined || requiredPicture.has(relation.matte)) return;
    requiredPicture.add(relation.matte);
    requireMatte(relation.matte);
  };
  for (const id of [...requiredPicture]) requireMatte(id);
  const requiredAudio = new Set(audioOrder.filter((id) => {
    const item = located.get(id)!.item;
    return item.kind === "present" && item.audio !== undefined;
  }));

  const itemPictureRoots = new Map<string, string>();
  const itemAudioRoots = new Map<string, string>();
  for (const [id, { item, track }] of located) {
    const needsPicture = requiredPicture.has(id);
    const needsAudio = requiredAudio.has(id);
    if (!needsPicture && !needsAudio) continue;
    assert(item.kind === "present", `NLE source Item ${item.id} is not a Present.`);
    const range = { start: structuredClone(item.start), end: addExactTemporalValues(item.start, item.duration) };
    if (item.source === "composition") {
      const sourceComposition = findNleComposition(project, item.composition);
      const nested = importNestedProgram(
        lowerComposition(project, sourceComposition, host, { picture: needsPicture, audio: needsAudio }),
        item,
        domain,
      );
      Object.assign(occurrences, nested.occurrences);
      Object.assign(pictureNodes, nested.pictureNodes);
      Object.assign(audioNodes, nested.audioNodes);

      if (needsPicture) {
        assert(nested.pictureRoot !== undefined && nested.pictureDomain !== undefined,
          `NLE Composition Item ${item.id} requests Picture but Composition ${item.composition} has none.`);
        const localPicture = itemSpace(project, item);
        const fitted = `${item.id}:composition-fitted`;
        const placed = `${item.id}:composition-placed`;
        const restricted = `${item.id}:picture-range`;
        pictureNodes[fitted] = {
          kind: "remap",
          input: nested.pictureRoot,
          mapping: fitMap(project, item, localPicture, nested.pictureDomain),
        };
        let localRoot = fitted;
        for (const process of item.picture!.processes ?? []) {
          if (!process.enabled) continue;
          localRoot = pictureProcessNode(
            pictureNodes,
            localRoot,
            process,
            processContext(project, composition, track, process, { kind: "occurrence", item }),
            host,
            domain,
          );
        }
        pictureNodes[placed] = {
          kind: "remap",
          input: localRoot,
          mapping: placementMap(project, pictureDomain, localPicture, item),
        };
        pictureNodes[restricted] = { kind: "restrict", input: placed, range };
        itemPictureRoots.set(id, restricted);
      }

      if (needsAudio) {
        assert(nested.audioRoot !== undefined,
          `NLE Composition Item ${item.id} requests Audio but Composition ${item.composition} has none.`);
        let localRoot = nested.audioRoot;
        for (const process of item.audio!.processes ?? []) {
          if (!process.enabled) continue;
          localRoot = audioProcessNode(
            audioNodes,
            localRoot,
            process,
            processContext(project, composition, track, process, { kind: "occurrence", item }),
            host,
            domain,
          );
        }
        const restricted = `${item.id}:audio-range`;
        audioNodes[restricted] = { kind: "restrict", input: localRoot, range };
        itemAudioRoots.set(id, restricted);
      }
      continue;
    }
    const resolved = resolveItem(project, composition, track, item, host);
    const picture = needsPicture ? resolved.picture : undefined;
    const audio = needsAudio ? resolved.audio : undefined;
    assert(!needsPicture || picture !== undefined, `NLE Item ${item.id} requires a Picture source.`);
    assert(!needsAudio || audio !== undefined, `NLE Item ${item.id} requires an Audio source.`);
    const reconstruction = item.source === "media" ? item.picture?.reconstruction : undefined;
    const localTime = sealLocalTemporalDomain({ id: `${item.id}:time`, duration: item.duration });
    occurrences[item.id] = {
      id: item.id,
      content: resolved.content,
      domain: localTime,
      placement: { parent: domain, start: item.start, active: { start: exactTemporalZero(), end: item.duration } },
      ...(picture === undefined ? {} : {
        picture: pictureRead(item, localTime, picture, reconstruction === undefined ? undefined
          : host.resolvePictureReconstruction(reconstruction, { project, composition, track, item })),
      }),
      ...(audio === undefined ? {} : { audio: sourceMap(item, localTime, audio) }),
    };
    if (picture !== undefined) {
      const localPicture = itemSpace(project, item);
      const use = `${item.id}:picture`;
      const fitted = `${item.id}:fitted`;
      const placed = `${item.id}:placed`;
      const restricted = `${item.id}:picture-range`;
      pictureNodes[use] = { kind: "use", occurrence: item.id };
      pictureNodes[fitted] = {
        kind: "remap", input: use, mapping: fitMap(project, item, localPicture, picture.spatialDomain),
      };
      let localRoot = fitted;
      for (const process of item.picture!.processes ?? []) {
        if (!process.enabled) continue;
        localRoot = pictureProcessNode(
          pictureNodes,
          localRoot,
          process,
          processContext(project, composition, track, process, { kind: "occurrence", item }),
          host,
          domain,
        );
      }
      pictureNodes[placed] = {
        kind: "remap",
        input: localRoot,
        mapping: placementMap(project, pictureDomain, localPicture, item),
      };
      pictureNodes[restricted] = { kind: "restrict", input: placed, range };
      itemPictureRoots.set(id, restricted);
    }

    if (audio !== undefined) {
      const use = `${item.id}:audio`;
      const restricted = `${item.id}:audio-range`;
      audioNodes[use] = { kind: "use", occurrence: item.id };
      let localRoot = use;
      for (const process of item.audio!.processes ?? []) {
        if (!process.enabled) continue;
        localRoot = audioProcessNode(
          audioNodes,
          localRoot,
          process,
          processContext(project, composition, track, process, { kind: "occurrence", item }),
          host,
          domain,
        );
      }
      audioNodes[restricted] = { kind: "restrict", input: localRoot, range };
      itemAudioRoots.set(id, restricted);
    }
  }

  const linearControlMappings = (
    id: string,
    names: readonly string[] | undefined,
    start: ExactTemporalValue,
    duration: ExactTemporalValue,
  ) => bindControls(id, names, duration, control => sealTemporalMap({ stages: [{
    target: domain,
    source: control,
    pieces: [{
      target: { start, end: addExactTemporalValues(start, duration) },
      sourceAtStart: exactTemporalZero(),
      rate: { numerator: 1, denominator: 1 },
    }],
  }] }));

  const matteRoots = new Map<string, string>();
  const resolveMatteRoot = (id: string): string => {
    const cached = matteRoots.get(id);
    if (cached !== undefined) return cached;
    const input = itemPictureRoots.get(id);
    assert(input !== undefined, `NLE Matte content ${id} has no Picture root.`);
    const relation = matteByContent.get(id);
    if (relation === undefined) {
      matteRoots.set(id, input);
      return input;
    }
    const source = resolveMatteRoot(relation.matte);
    const content = located.get(id)!;
    const matte = located.get(relation.matte)!;
    assert(content.item.kind === "present" && matte.item.kind === "present",
      `NLE Matte ${relation.id} requires Present Items.`);
    const effect = host.resolveMatte(relation, {
      project,
      composition,
      track: content.track,
      content: content.item,
      matte: matte.item,
    });
    const node = `${relation.content}:matte:${relation.id}`;
    pictureNodes[node] = {
      kind: "apply",
      visual: effect.visual,
      inputs: { content: input, matte: source },
      controlMappings: linearControlMappings(relation.id, effect.controls, content.item.start, content.item.duration),
    };
    matteRoots.set(id, node);
    return node;
  };
  for (const id of requiredPicture) resolveMatteRoot(id);

  const transitionByOutgoing = new Map(composition.transitions
    .filter((value) => requiredPicture.has(value.outgoing) && requiredPicture.has(value.incoming))
    .map((value) => [value.outgoing, value] as const));
  const transitionByIncoming = new Map([...transitionByOutgoing.values()]
    .map((value) => [value.incoming, value] as const));
  const transitionRoot = (value: NleTransition): string => {
    const outgoing = located.get(value.outgoing)!;
    const incoming = located.get(value.incoming)!;
    assert(outgoing.item.kind === "present" && incoming.item.kind === "present",
      `NLE Transition ${value.id} requires Present Items.`);
    const start = incoming.item.start;
    const end = addExactTemporalValues(outgoing.item.start, outgoing.item.duration);
    const transitionDomain = sealLocalTemporalDomain({
      id: `${value.id}:time`,
      duration: subtractExactTemporalValues(end, start),
    });
    const effect = host.resolveTransition(value, {
      project,
      composition,
      track: outgoing.track,
      outgoing: outgoing.item,
      incoming: incoming.item,
      domain: transitionDomain,
    });
    const applied = `${value.id}:apply`;
    const restricted = `${value.id}:range`;
    pictureNodes[applied] = {
      kind: "apply",
      visual: effect.visual,
      inputs: {
        outgoing: resolveMatteRoot(value.outgoing),
        incoming: resolveMatteRoot(value.incoming),
      },
      controlMappings: linearControlMappings(value.id, effect.controls, start, transitionDomain.duration),
    };
    pictureNodes[restricted] = {
      kind: "restrict",
      input: applied,
      range: { start: structuredClone(start), end: structuredClone(end) },
    };
    return restricted;
  };

  const chainByMember = new Map<string, { readonly root: string; readonly emit: string }>();
  for (const first of pictureOrder) {
    if (located.get(first)!.item.kind !== "present") continue;
    if (transitionByIncoming.has(first) || !transitionByOutgoing.has(first)) continue;
    const members: string[] = [];
    const segments: string[] = [];
    let current: string | undefined = first;
    let previous: NleTransition | undefined;
    while (current !== undefined) {
      members.push(current);
      const item = located.get(current)!.item;
      const next = transitionByOutgoing.get(current);
      const visibleStart = previous === undefined
        ? item.start
        : addExactTemporalValues(
          located.get(previous.outgoing)!.item.start,
          located.get(previous.outgoing)!.item.duration,
        );
      const visibleEnd = next === undefined
        ? addExactTemporalValues(item.start, item.duration)
        : located.get(next.incoming)!.item.start;
      assert(compareExactTemporalValues(visibleStart, visibleEnd) <= 0,
        `NLE Transition chain around Item ${current} overlaps itself.`);
      if (compareExactTemporalValues(visibleStart, visibleEnd) < 0) {
        const restricted = `${current}:transition-visible:${segments.length}`;
        pictureNodes[restricted] = {
          kind: "restrict",
          input: resolveMatteRoot(current),
          range: { start: structuredClone(visibleStart), end: structuredClone(visibleEnd) },
        };
        segments.push(restricted);
      }
      if (next === undefined) break;
      segments.push(transitionRoot(next));
      previous = next;
      current = next.incoming;
    }
    const root = `${first}:transition-chain`;
    pictureNodes[root] = { kind: "over", inputs: segments };
    const emit = members.reduce((latest, member) =>
      pictureOrder.indexOf(member) > pictureOrder.indexOf(latest) ? member : latest, members[0]!);
    for (const member of members) chainByMember.set(member, { root, emit });
  }

  let pictureRoot: string | undefined;
  for (const id of pictureOrder) {
    const { item, track } = located.get(id)!;
    if (item.kind === "present") {
      const chain = chainByMember.get(id);
      if (chain !== undefined && chain.emit !== id) continue;
      const contribution = chain?.root ?? resolveMatteRoot(id);
      if (pictureRoot === undefined) pictureRoot = contribution;
      else {
        const over = `${id}:over`;
        pictureNodes[over] = { kind: "over", inputs: [pictureRoot, contribution] };
        pictureRoot = over;
      }
      continue;
    }
    const input = pictureRoot ?? `${composition.id}:transparent`;
    if (pictureRoot === undefined) pictureNodes[input] = { kind: "transparent", spatialDomain: pictureDomain };
    const applied = pictureProcessNode(
      pictureNodes,
      input,
      item,
      processContext(project, composition, track, item, { kind: "adjust", item }),
      host,
      domain,
    );
    pictureRoot = pictureAdjust(pictureNodes, input, applied, item, duration);
  }

  let audioRoot: string | undefined;
  for (const id of audioOrder) {
    const { item, track } = located.get(id)!;
    if (item.kind === "present") {
      const contribution = itemAudioRoots.get(id);
      if (contribution === undefined) continue;
      if (audioRoot === undefined) audioRoot = contribution;
      else {
        const mix = `${id}:mix`;
        audioNodes[mix] = { kind: "mix", inputs: [audioRoot, contribution] };
        audioRoot = mix;
      }
      continue;
    }
    const input = audioRoot ?? `${composition.id}:silence`;
    if (audioRoot === undefined) audioNodes[input] = { kind: "silence" };
    const applied = audioProcessNode(
      audioNodes,
      input,
      item,
      processContext(project, composition, track, item, { kind: "adjust", item }),
      host,
      domain,
    );
    audioRoot = audioAdjust(audioNodes, input, applied, item, duration);
  }

  assert(pictureRoot !== undefined || audioRoot !== undefined,
    `NLE Composition ${composition.id} contains no active Picture or Audio output.`);
  return {
    id: `${project.id}:${composition.id}`,
    domain,
    occurrences,
    ...(pictureRoot === undefined ? {} : {
      pictureDomain,
      picture: { nodes: pictureNodes, root: pictureRoot },
    }),
    ...(audioRoot === undefined ? {} : { audio: { nodes: audioNodes, root: audioRoot } }),
  };
}

/** Deterministically project the Root Composition into one closed compilation graph. */
export function lowerNleProject(project: NleProject, host: NleRenderResolver): CompilationGraph {
  assertNleProject(project);
  return sealCompilationGraph(lowerComposition(project, rootNleComposition(project), host, { picture: true, audio: true }));
}
