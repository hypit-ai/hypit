import { occurrenceParentRange } from "./occurrence.js";
import { pictureFramePositions } from "./output.js";
import { pictureNodeSpatialDomains } from "./picture.js";
import { invertSpatialMap, type LocalSpatialDomain, type SpatialMap } from "./spatial.js";
import type { CompilationGraph, Occurrence } from "./types.js";
import {
  compileHtmlPictureProgram,
  type HtmlCanvas,
  type HtmlFrameRate,
  type HtmlFrameSpan,
  type HtmlPictureElement,
  type HtmlPictureReconstruction,
  type HtmlPictureStyle,
  type HtmlProgram,
  type HtmlVisual,
} from "@hypit/html-program";
import {
  addExactTemporalValues, compareExactTemporalValues, createTemporalMapEvaluator, subtractExactTemporalValues,
  type ExactTemporalValue, type TemporalMapEvaluation, type TemporalRange,
} from "@hypit/temporal/algebra";
import type { ResolvedMedia } from "@hypit/media";

const seconds = (value: ExactTemporalValue): number => Number(BigInt(value.ticks))
  * value.timeBase.numerator / value.timeBase.denominator;

function domainStyle(domain: LocalSpatialDomain): readonly HtmlPictureStyle[] {
  return [
    { name: "position", value: "absolute" },
    { name: "left", value: "0" },
    { name: "top", value: "0" },
    { name: "width", value: `${domain.region.width}px` },
    { name: "height", value: `${domain.region.height}px` },
    { name: "transform-origin", value: "0 0" },
  ];
}

function cssTransform(value: SpatialMap): string {
  const inverted = invertSpatialMap(value);
  const transform = inverted.transform;
  const source = value.source.region;
  const target = value.target.region;
  const x = transform.xx * source.x + transform.xy * source.y + transform.tx - target.x;
  const y = transform.yx * source.x + transform.yy * source.y + transform.ty - target.y;
  return `matrix(${transform.xx},${transform.yx},${transform.xy},${transform.yy},${x},${y})`;
}

function activeSpans(active: readonly boolean[]): readonly { readonly startFrame: number; readonly endFrameExclusive: number }[] {
  const spans: { startFrame: number; endFrameExclusive: number }[] = [];
  for (const [frame, value] of active.entries()) {
    if (!value) continue;
    const previous = spans.at(-1);
    if (previous?.endFrameExclusive === frame) previous.endFrameExclusive += 1;
    else spans.push({ startFrame: frame, endFrameExclusive: frame + 1 });
  }
  return spans;
}

export function compilePicture(
  program: CompilationGraph,
  output: { readonly frameRate: HtmlFrameRate; readonly canvas: HtmlCanvas;
    readonly range?: TemporalRange; readonly frames?: readonly number[] },
): HtmlProgram {
  if (program.picture === undefined || program.pictureDomain === undefined) {
    throw new Error("HTML compilation requires Picture output.");
  }
  const rate = output.frameRate.numerator / output.frameRate.denominator;
  const positions = pictureFramePositions(program, output.frameRate, output.range, output.frames);
  const frameCount = positions.length;
  if (!Number.isSafeInteger(frameCount) || frameCount <= 0) throw new Error("HTML output frame count is invalid.");
  const domains = pictureNodeSpatialDomains(program.picture, program);
  let serial = 0;
  const id = (kind: string): string => `${kind}-${++serial}`;
  const whole: readonly HtmlFrameSpan[] = [{ startFrame: 0, endFrameExclusive: frameCount }];
  const firstFrameAt = (time: ExactTemporalValue): number => {
    let low = 0;
    let high = frameCount;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (compareExactTemporalValues(positions[middle]!, time) < 0) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const spansForRange = (range: TemporalRange): readonly HtmlFrameSpan[] => {
    const startFrame = firstFrameAt(range.start);
    const endFrameExclusive = firstFrameAt(range.end);
    return startFrame === endFrameExclusive ? [] : [{ startFrame, endFrameExclusive }];
  };
  type PictureFrames = {
    readonly spans: readonly HtmlFrameSpan[];
    readonly samples?: readonly (TemporalMapEvaluation | null)[];
  };
  const occurrencePosition = (occurrence: Occurrence, frame: number) => addExactTemporalValues(
    occurrence.placement.active.start, subtractExactTemporalValues(positions[frame]!, occurrence.placement.start),
  );
  const pictureReads = new Map<string, PictureFrames>();
  const readPicture = (occurrence: Occurrence): PictureFrames => {
    const cached = pictureReads.get(occurrence.id);
    if (cached !== undefined) return cached;
    const range = spansForRange(occurrenceParentRange(occurrence));
    const picture = occurrence.picture!;
    if (picture.kind === "constant") {
      const read = { spans: range };
      pictureReads.set(occurrence.id, read);
      return read;
    }
    const evaluate = createTemporalMapEvaluator(picture.mapping);
    const samples = Array<TemporalMapEvaluation | null>(frameCount).fill(null);
    for (const { startFrame, endFrameExclusive } of range) {
      for (let frame = startFrame; frame < endFrameExclusive; frame++) {
        const local = occurrencePosition(occurrence, frame);
        samples[frame] = evaluate(local, "after") ?? null;
      }
    }
    const read = { spans: activeSpans(samples.map(sample => sample !== null)), samples };
    pictureReads.set(occurrence.id, read);
    return read;
  };
  const visualElement = (
    elementId: string,
    visual: HtmlVisual,
    domain: LocalSpatialDomain,
    spans: readonly HtmlFrameSpan[],
    slots: readonly { readonly name: string; readonly element: HtmlPictureElement }[] = [],
    controls?: Readonly<Record<string, readonly (ExactTemporalValue | null)[]>>,
    frames?: readonly (number | null)[],
  ): HtmlPictureElement => {
    return {
      kind: "program",
      id: elementId,
      spans,
      style: domainStyle(domain),
      program: visual,
      slots,
      ...(frames === undefined ? {} : { renderFrames: frames }),
      ...(controls === undefined ? {} : { controlPositions: controls }),
    };
  };
  const mediaElement = (
    media: ResolvedMedia,
    elementId: string,
    domain: LocalSpatialDomain,
    read: ReturnType<typeof readPicture>,
    reconstruction: HtmlPictureReconstruction | undefined,
  ): HtmlPictureElement => {
    const picture = media.interpretation.picture;
    if (picture === undefined) throw new Error(`Media Picture ${elementId} has no selected stream.`);
    const { spans } = read;
    if (picture.kind === "constant") return {
      kind: "image",
      id: elementId,
      spans,
      style: [...domainStyle(domain), { name: "object-fit", value: "fill" }],
      resource: media.resource,
      picture: picture.interpretation.picture,
    };
    const evaluateMedia = createTemporalMapEvaluator(picture.map);
    return {
      kind: "video",
      id: elementId,
      spans,
      style: [...domainStyle(domain), { name: "object-fit", value: "fill" }],
      resource: media.resource,
      streamIndex: picture.streamIndex,
      presentationStart: structuredClone(picture.presentationStart),
      interpretation: structuredClone(picture.interpretation),
      ...(reconstruction === undefined ? {} : { reconstruction: structuredClone(reconstruction) }),
      sourceFrames: read.samples!.map(source => {
        if (source === null) return null;
        const sample = evaluateMedia(source.position, source.sourceSide);
        return sample === undefined ? null : { position: sample.position, side: sample.sourceSide };
      }),
    };
  };
  const graph = program.picture;
  const build = (nodeId: string): HtmlPictureElement => {
    const node = graph.nodes[nodeId]!;
    const domain = domains.get(nodeId)!;
    const elementId = id(`picture-${node.kind}`);
    if (node.kind === "transparent") return { kind: "box", id: elementId, spans: [], style: domainStyle(domain), children: [] };
    if (node.kind === "use") {
      const occurrence = program.occurrences[node.occurrence]!;
      const { content, picture } = occurrence;
      const read = readPicture(occurrence);
      if (content.kind === "media") {
        return mediaElement(content.media, elementId, domain, read,
          picture?.kind === "signal" ? picture.reconstruction : undefined);
      }
      const itemTime = content.visual.setup === undefined ? undefined : picture?.itemTime;
      let itemPositions: (ExactTemporalValue | null)[] | undefined;
      if (itemTime !== undefined) {
        const evaluate = createTemporalMapEvaluator(itemTime.mapping);
        itemPositions = Array<ExactTemporalValue | null>(frameCount).fill(null);
        for (const { startFrame, endFrameExclusive } of read.spans) {
          for (let frame = startFrame; frame < endFrameExclusive; frame++) {
            itemPositions[frame] = evaluate(occurrencePosition(occurrence, frame), "after")?.position ?? null;
          }
        }
      }
      const frames = content.visual.setup === undefined ? undefined : read.samples === undefined
        ? itemPositions?.map(at => at === null ? null : 0) ?? Array<number>(frameCount).fill(0)
        : read.samples.map(sample => sample === null ? null : seconds(sample.position) * rate);
      return visualElement(elementId, content.visual, domain, read.spans, [],
        itemTime === undefined ? undefined : { [itemTime.name]: itemPositions! }, frames);
    }
    if (node.kind === "over") return {
      kind: "box", id: elementId, spans: whole, style: domainStyle(domain), children: node.inputs.map(build),
    };
    if (node.kind === "restrict") return {
      kind: "box", id: elementId, spans: spansForRange(node.range), style: domainStyle(domain), children: [build(node.input)],
    };
    if (node.kind === "crop") {
      const source = domains.get(node.input)!.region;
      const x = node.region.x - source.x;
      const y = node.region.y - source.y;
      return {
        kind: "box", id: elementId, spans: whole,
        style: [...domainStyle(domain), { name: "overflow", value: "hidden" }],
        children: [{
          kind: "box", id: id("crop-offset"), spans: whole,
          style: [
            { name: "position", value: "absolute" }, { name: "left", value: `${x}px` }, { name: "top", value: `${y}px` },
            { name: "width", value: `${node.region.width}px` }, { name: "height", value: `${node.region.height}px` },
            { name: "overflow", value: "hidden" },
          ],
          children: [{
            kind: "box", id: id("crop-source"), spans: whole,
            style: [
              { name: "position", value: "absolute" }, { name: "left", value: `${-x}px` }, { name: "top", value: `${-y}px` },
              { name: "width", value: `${source.width}px` }, { name: "height", value: `${source.height}px` },
            ], children: [build(node.input)],
          }],
        }],
      };
    }
    if (node.kind === "remap") return {
      kind: "box", id: elementId, spans: whole, style: domainStyle(domain),
      children: [{
        kind: "box", id: `${elementId}:transform`, spans: whole,
        style: [
          { name: "position", value: "absolute" },
          { name: "left", value: "0" },
          { name: "top", value: "0" },
          { name: "transform-origin", value: "0 0" },
          { name: "transform", value: cssTransform(node.mapping) },
        ],
        children: [build(node.input)],
      }],
    };
    const controls = Object.entries(node.controlMappings).map(([name, mapping]) => ({
      name, evaluate: createTemporalMapEvaluator(mapping), positions: Array<ExactTemporalValue | null>(frameCount).fill(null),
    }));
    if (controls.length > 0) {
      for (const [frame, at] of positions.entries()) {
        const observed = controls.map(control => control.evaluate(at, "after")?.position);
        if (observed.some(position => position === undefined)) continue;
        for (const [index, control] of controls.entries()) control.positions[frame] = observed[index]!;
      }
    }
    return visualElement(elementId, node.visual, domain, whole,
      Object.entries(node.inputs).map(([name, input]) => ({ name, element: build(input) })),
      Object.fromEntries(controls.map(control => [control.name, control.positions])));
  };
  const root = build(program.picture.root);
  const { width, height } = program.pictureDomain.region;
  const scale = Math.min(output.canvas.width / width, output.canvas.height / height);
  const left = (output.canvas.width - width * scale) / 2;
  const top = (output.canvas.height - height * scale) / 2;
  const fitted: HtmlPictureElement = scale === 1 && left === 0 && top === 0 ? root : {
    kind: "box", id: id("output"), spans: whole,
    style: [
      { name: "position", value: "absolute" },
      { name: "left", value: `${left}px` },
      { name: "top", value: `${top}px` },
      { name: "width", value: `${width}px` },
      { name: "height", value: `${height}px` },
      { name: "overflow", value: "hidden" },
      { name: "transform-origin", value: "0 0" },
      { name: "transform", value: `scale(${scale})` },
    ],
    children: [root],
  };
  return compileHtmlPictureProgram({
    id: program.id,
    frameRate: output.frameRate,
    frameCount,
    ...(output.frames === undefined ? {} : { outputFrames: output.frames }),
    canvas: output.canvas,
    root: fitted,
  });
}
