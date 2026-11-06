import {
  assertAudiovisualProgram,
  evaluateAudiovisualProgramAt,
  isPointwiseOperatorTemporalSupport,
  type AudiovisualProgram,
  type EvaluatedPictureGraph,
  type EvaluatedPictureNode,
  type PictureGraph,
} from "@hypit/audiovisual";
import {
  assertHtmlProgram,
  compileHtmlPictureProgram,
  htmlVisual,
  readHtmlPictureReconstruction,
  type HtmlPictureElement,
  type HtmlProgram,
} from "@hypit/html-program";
import { preparedPictureExtent, preparedSignalPictureSource, verifyPreparedMedia } from "@hypit/media";
import {
  assertLocalSpatialDomain,
  assertSpatialRegion,
  invertSpatialMap,
  sameSpatialDomain,
  type LocalSpatialDomain,
  type SpatialMap,
  type SpatialRegion,
} from "@hypit/spatial/algebra";
import {
  composeTemporalMaps,
  exactTemporalValueFromFrames,
  sealLocalTemporalDomain,
  sealTemporalMap,
  temporalValueInFrames,
  type ExactTemporalValue,
  type FrameSpan,
  type LocalTemporalDomain,
  type TemporalMap,
  type TemporalSamplingGrid,
} from "@hypit/temporal";
import type { Rational } from "@hypit/temporal/algebra";

import { assertAudiovisualHtmlOutput, resolveAudiovisualHtmlSource } from "./source.js";
import type { AudiovisualHtmlOutput, AudiovisualHtmlSourceSet } from "./source.js";
import { evaluateAudiovisualProgramFrame, outputFrameCount } from "./sampling.js";

export type AudiovisualHtmlLowering = {
  readonly program: AudiovisualProgram;
  readonly output: AudiovisualHtmlOutput;
  readonly sources: AudiovisualHtmlSourceSet;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pixelDomain(value: LocalSpatialDomain, label: string): void {
  assertLocalSpatialDomain(value);
  assert(value.region.x === 0 && value.region.y === 0,
    `${label} ${value.id} must have a zero origin for HTML lowering.`);
}

function regionInside(region: SpatialRegion, domain: LocalSpatialDomain): boolean {
  return region.x >= domain.region.x
    && region.y >= domain.region.y
    && region.x + region.width <= domain.region.x + domain.region.width
    && region.y + region.height <= domain.region.y + domain.region.height;
}

function commonDomain(domains: readonly LocalSpatialDomain[], label: string): LocalSpatialDomain {
  const [first, ...rest] = domains;
  assert(first !== undefined, `${label} has no Picture inputs.`);
  for (const domain of rest) assert(sameSpatialDomain(first, domain),
    `${label} mixes spatial domains ${first.id} and ${domain.id}.`);
  return first;
}

function pictureNodeDomains(graph: PictureGraph, program: AudiovisualProgram): ReadonlyMap<string, LocalSpatialDomain> {
  const rootDomain = program.pictureDomain!;
  pixelDomain(rootDomain, "Picture root domain");
  const cache = new Map<string, LocalSpatialDomain>();
  const domainOf = (id: string): LocalSpatialDomain => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const node = graph.nodes[id]!;
    let domain: LocalSpatialDomain;
    switch (node.kind) {
      case "transparent": domain = rootDomain; break;
      case "use": domain = program.occurrences[node.occurrence]!.source.outputs[node.output]!.spatialDomain!; break;
      case "restrict": domain = domainOf(node.input); break;
      case "crop": {
        domain = domainOf(node.input);
        assertSpatialRegion(node.region, `Picture crop ${id}`);
        assert(regionInside(node.region, domain), `Picture crop ${id} lies outside domain ${domain.id}.`);
        break;
      }
      case "remap": {
        const input = domainOf(node.input);
        assert(sameSpatialDomain(input, node.mapping.source),
          `Picture remap ${id} reads ${input.id}, not ${node.mapping.source.id}.`);
        domain = node.mapping.target;
        break;
      }
      case "remap-control": {
        domainOf(node.input);
        domain = node.control.segments[0]!.from.target;
        break;
      }
      case "over": domain = commonDomain(node.inputs.map(domainOf), `Picture over ${id}`); break;
      case "apply": domain = commonDomain(node.operator.inputs.map((name) => domainOf(node.inputs[name]!)),
        `Picture apply ${id}`); break;
    }
    pixelDomain(domain, `Picture node ${id} domain`);
    cache.set(id, domain);
    return domain;
  };
  assert(sameSpatialDomain(domainOf(graph.root), rootDomain), "Picture graph does not close its output Space.");
  return cache;
}

function cssNumber(value: number): string {
  assert(Number.isFinite(value), "HTML spatial transform contains a non-finite coefficient.");
  return String(Math.round((Object.is(value, -0) ? 0 : value) * 1_000_000_000) / 1_000_000_000);
}

function placementTransform(value: SpatialMap): string {
  const transform = invertSpatialMap(value).transform;
  if (transform.kind === "affine") return `matrix(${cssNumber(transform.xx)},${cssNumber(transform.yx)},${cssNumber(transform.xy)},${cssNumber(transform.yy)},${cssNumber(transform.tx)},${cssNumber(transform.ty)})`;
  return `matrix3d(${[
    transform.xx, transform.yx, 0, transform.wx,
    transform.xy, transform.yy, 0, transform.wy,
    0, 0, 1, 0,
    transform.tx, transform.ty, 0, transform.ww,
  ].map(cssNumber).join(",")})`;
}

function sizeStyle(domain: LocalSpatialDomain) {
  return [
    { name: "position", value: "absolute" },
    { name: "left", value: 0 },
    { name: "top", value: 0 },
    { name: "width", value: `${cssNumber(domain.region.width)}px` },
    { name: "height", value: `${cssNumber(domain.region.height)}px` },
  ] as const;
}

function spans(flags: readonly boolean[]): FrameSpan[] {
  const result: FrameSpan[] = [];
  for (let frame = 0; frame < flags.length; frame += 1) {
    if (!flags[frame]) continue;
    const previous = result.at(-1);
    if (previous?.endFrameExclusive === frame) {
      result[result.length - 1] = { startFrame: previous.startFrame, endFrameExclusive: frame + 1 };
    } else result.push({ startFrame: frame, endFrameExclusive: frame + 1 });
  }
  return result;
}

function bounds(flags: readonly boolean[]): { start: number; end: number } | undefined {
  const start = flags.findIndex(Boolean);
  if (start < 0) return undefined;
  return { start, end: flags.findLastIndex(Boolean) + 1 };
}

function and(left: readonly boolean[], right: readonly boolean[]): boolean[] {
  return left.map((value, index) => value && right[index] === true);
}

function rationalNumber(value: Rational): number {
  return Number(value.numerator) / Number(value.denominator);
}

function sampledTemporalMap(
  id: string,
  flags: readonly boolean[],
  positions: readonly (ExactTemporalValue | undefined)[],
  sampling: TemporalSamplingGrid,
  source: LocalTemporalDomain,
): TemporalMap {
  const extent = bounds(flags);
  assert(extent !== undefined, `Picture sample ${id} has no active output frames.`);
  const target = sealLocalTemporalDomain({
    id: `${id}:output-time`,
    duration: exactTemporalValueFromFrames(extent.end - extent.start, sampling),
  });
  const pieces = positions.slice(extent.start, extent.end).flatMap((position, index) => {
    if (position === undefined || !flags[extent.start + index]) return [];
    return [{
      target: {
        start: exactTemporalValueFromFrames(index, sampling),
        end: exactTemporalValueFromFrames(index + 1, sampling),
      },
      sourceAtStart: structuredClone(position),
      rate: { numerator: 0, denominator: 1 },
    }];
  });
  return sealTemporalMap({ stages: [{ target, source: structuredClone(source), pieces }] });
}

function dynamicSpatialProgram(maps: readonly (SpatialMap | undefined)[]) {
  return htmlVisual({
    html: '<div data-hypit-spatial-map>{{picture}}</div>',
    css: ":scope,[data-hypit-spatial-map]{position:absolute;inset:0;overflow:hidden}:scope>[data-hypit-spatial-map]{transform-origin:0 0}",
    data: { transforms: maps.map((map) => map === undefined ? null : invertSpatialMap(map).transform) },
    setup: `const layer = root.querySelector('[data-hypit-spatial-map]');
if (layer === null) throw new Error('Spatial Mapping requires its Picture input.');
return localFrame => {
  const value = data.transforms[Math.max(0, Math.min(data.transforms.length - 1, Math.floor(localFrame)))];
  layer.style.display = value === null ? 'none' : '';
  if (value !== null) layer.style.transform = \`matrix(\${value.xx},\${value.yx},\${value.xy},\${value.yy},\${value.tx},\${value.ty})\`;
};`,
  });
}

type PictureSequence = readonly (EvaluatedPictureGraph | undefined)[];

function lowerGraph(
  program: AudiovisualProgram,
  graph: PictureGraph,
  sequence: PictureSequence,
  sampling: TemporalSamplingGrid,
  sources: AudiovisualHtmlSourceSet,
  prefix: string,
  available: readonly boolean[],
): HtmlPictureElement {
  const domains = pictureNodeDomains(graph, program);
  const nodesAt = (id: string) => sequence.map((value) => value?.nodes[id]);
  const lower = (nodeId: string, path: readonly string[], mask: readonly boolean[]): HtmlPictureElement => {
    const node = graph.nodes[nodeId]!;
    const evaluated = nodesAt(nodeId);
    const id = `${prefix}:${path.join(":")}`;
    const domain = domains.get(nodeId)!;
    const own = evaluated.map((value) => value !== undefined && value.kind !== "transparent");
    const active = and(mask, own);
    const activeSpans = spans(active);
    switch (node.kind) {
      case "transparent": return { id, kind: "box", spans: [], style: sizeStyle(domain), children: [] };
      case "use": {
        const samples = evaluated.map((value) => value?.kind === "sample" ? value : undefined);
        const source = resolveAudiovisualHtmlSource(sources,
          program.occurrences[node.occurrence]!.source.id, node.output);
        const selection = program.occurrences[node.occurrence]!.selections[node.output]!;
        const reconstruction = selection.kind === "signal" && selection.reconstruction !== undefined
          ? readHtmlPictureReconstruction(selection.reconstruction.program) : undefined;
        const common = { id, spans: activeSpans, style: [
          { name: "position", value: "absolute" }, { name: "inset", value: 0 },
          { name: "width", value: "100%" }, { name: "height", value: "100%" },
        ] } as const;
        if (source.implementation.kind === "program") {
          assert(reconstruction === undefined,
            `Picture reconstruction on programme Source ${source.source}.${source.output} is unsupported by the HTML terminal.`);
          const extent = bounds(active);
          const renderFrames = extent === undefined ? [] : samples.slice(extent.start, extent.end).map((sample, index) => {
            if (sample === undefined || !active[extent.start + index]) return null;
            if (sample.temporal.kind === "constant") return 0;
            return rationalNumber(temporalValueInFrames(sample.temporal.at, sampling));
          });
          return { ...common, kind: "program", program: structuredClone(source.implementation.program),
            slots: [], renderFrames };
        }
        if (source.implementation.kind === "prepared-media") {
          const media = source.implementation.media;
          verifyPreparedMedia(media);
          assert(media.picture !== undefined, `Prepared Media ${media.id} has no selected Picture member.`);
          const extent = preparedPictureExtent(media);
          assert(extent.widthPx === domain.region.width && extent.heightPx === domain.region.height,
            `Prepared Picture extent does not match Source Space ${domain.id}.`);
          if (media.picture.kind === "constant") {
            assert(reconstruction === undefined,
              `Constant Picture ${media.id} cannot select signal reconstruction.`);
            assert(samples.every((sample) => sample === undefined || sample.temporal.kind === "constant"),
              `Constant Picture ${media.id} cannot implement a signal Source output.`);
            return { ...common, kind: "image", artifact: structuredClone(media.source),
              picture: structuredClone(media.picture.interpretation.picture) };
          }
          assert(media.domain !== undefined, `Signal Picture ${media.id} has no temporal domain.`);
          const positions = samples.map((sample) => sample?.temporal.kind === "signal"
            ? sample.temporal.at : undefined);
          return { ...common, kind: "video", source: preparedSignalPictureSource(media), muted: true,
            ...(reconstruction === undefined ? {} : { reconstruction }),
            sampling: composeTemporalMaps(
              sampledTemporalMap(id, active, positions, sampling, media.domain), media.picture.map,
            ) };
        }
        const child = source.implementation.program;
        assert(reconstruction === undefined,
          `Picture reconstruction on nested Programme ${child.id} is unsupported by the HTML terminal.`);
        assert(child.picture !== undefined, `Nested Programme ${child.id} has no Picture output.`);
        const childSequence = samples.map((sample, frame) => !active[frame] || sample?.temporal.kind !== "signal"
          ? undefined : evaluateAudiovisualProgramAt(child, sample.temporal.at).picture);
        return { ...common, kind: "box", style: sizeStyle(domain), children: [lowerGraph(
          child, child.picture, childSequence, sampling, source.implementation.sources,
          `${id}:nested`, active,
        )] };
      }
      case "restrict": return lower(node.input, [...path, "restrict", node.input], active);
      case "crop": {
        const child = lower(node.input, [...path, "crop-input", node.input], active);
        return { id, kind: "box", spans: activeSpans, style: [
          { name: "position", value: "absolute" }, { name: "left", value: `${cssNumber(node.region.x)}px` },
          { name: "top", value: `${cssNumber(node.region.y)}px` }, { name: "width", value: `${cssNumber(node.region.width)}px` },
          { name: "height", value: `${cssNumber(node.region.height)}px` }, { name: "overflow", value: "hidden" },
        ], children: [{ id: `${id}:inner`, kind: "box", spans: activeSpans, style: [
          { name: "position", value: "absolute" }, { name: "left", value: `${cssNumber(-node.region.x)}px` },
          { name: "top", value: `${cssNumber(-node.region.y)}px` }, { name: "width", value: `${cssNumber(domain.region.width)}px` },
          { name: "height", value: `${cssNumber(domain.region.height)}px` },
        ], children: [child] }] };
      }
      case "remap": {
        const child = lower(node.input, [...path, "remap-input", node.input], active);
        return { id, kind: "box", spans: activeSpans, style: [...sizeStyle(domain), { name: "overflow", value: "hidden" }],
          children: [{ id: `${id}:placed`, kind: "box", spans: activeSpans, style: [
            ...sizeStyle(node.mapping.source), { name: "transform-origin", value: "0 0" },
            { name: "transform", value: placementTransform(node.mapping) },
          ], children: [child] }] };
      }
      case "remap-control": {
        const child = lower(node.input, [...path, "remap-control-input", node.input], active);
        const extent = bounds(active);
        const maps = extent === undefined ? [] : evaluated.slice(extent.start, extent.end).map((value) =>
          value?.kind === "remap" ? value.mapping : undefined);
        return { id, kind: "program", spans: activeSpans, style: sizeStyle(domain),
          program: dynamicSpatialProgram(maps), slots: [{ name: "picture", element: child }] };
      }
      case "over": return { id, kind: "box", spans: activeSpans, style: sizeStyle(domain),
        children: node.inputs.map((child, index) => lower(child, [...path, `over-${index + 1}`, child], active)) };
      case "apply": {
        assert(isPointwiseOperatorTemporalSupport(node.operator.temporalSupport),
          `HTML Picture Operator ${node.operator.id} requires non-pointwise temporal support.`);
        const extent = bounds(active);
        const positions = Object.fromEntries(Object.keys(node.operator.temporalControls).map((name) => [name,
          extent === undefined ? [] : evaluated.slice(extent.start, extent.end).map((value) =>
            value?.kind === "apply" ? value.controlPositions[name] ?? null : null),
        ]));
        return { id, kind: "program", spans: activeSpans, program: structuredClone(node.operator.program),
          controlPositions: positions,
          slots: node.operator.inputs.map((name, index) => ({ name, element: lower(node.inputs[name]!,
            [...path, `input-${index + 1}-${name}`, node.inputs[name]!], active) })),
          style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 },
            { name: "width", value: "100%" }, { name: "height", value: "100%" }] };
      }
    }
  };
  return lower(graph.root, ["root", graph.root], available);
}

/** Lower one resolved finite AVIR Picture Programme into one stable HTML Picture Programme. */
export function lowerAudiovisualPictureProgramToHtmlProgram(input: AudiovisualHtmlLowering): HtmlProgram {
  assertAudiovisualProgram(input.program);
  assertAudiovisualHtmlOutput(input.output);
  const graph = input.program.picture;
  assert(graph !== undefined, `Audiovisual Programme ${input.program.id} has no Picture output.`);
  assert(sameSpatialDomain(input.output.pictureMapping.source, input.program.pictureDomain!),
    `Audiovisual HTML Picture Mapping does not read Programme Space ${input.program.pictureDomain!.id}.`);
  const frameCount = outputFrameCount(input.program.domain.duration, input.output.sampling);
  const sequence = Array.from({ length: frameCount }, (_, frame) =>
    evaluateAudiovisualProgramFrame(input.program, input.output.sampling, frame).evaluation.picture);
  const picture = lowerGraph(input.program, graph, sequence, input.output.sampling, input.sources,
    input.output.id, Array.from({ length: frameCount }, () => true));
  const full = [{ startFrame: 0, endFrameExclusive: frameCount }];
  const root: HtmlPictureElement = {
    id: `${input.output.id}:viewport`,
    kind: "box",
    spans: full,
    style: [...sizeStyle(input.output.pictureMapping.target), { name: "overflow", value: "hidden" }],
    children: [{
      id: `${input.output.id}:viewport-picture`,
      kind: "box",
      spans: full,
      style: [
        ...sizeStyle(input.output.pictureMapping.source),
        { name: "transform-origin", value: "0 0" },
        { name: "transform", value: placementTransform(input.output.pictureMapping) },
      ],
      children: [picture],
    }],
  };
  const document = compileHtmlPictureProgram({
    id: input.output.id,
    frameRate: { ...input.output.sampling.frameRate },
    frameCount,
    canvas: { ...input.output.canvas },
    root,
  });
  assertHtmlProgram(document);
  return document;
}
