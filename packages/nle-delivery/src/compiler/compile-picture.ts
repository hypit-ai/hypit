import { createPictureEvaluator } from "./evaluation.js";
import { pictureFramePositions } from "./output.js";
import { pictureNodeSpatialDomains } from "./picture.js";
import { invertSpatialMap, type LocalSpatialDomain, type SpatialMap } from "./spatial.js";
import type { CompilationGraph, EvaluatedPictureNode, PictureNode } from "./types.js";
import {
  assertHtmlVisual,
  compileHtmlPictureProgram,
  type HtmlCanvas,
  type HtmlFrameRate,
  type HtmlPictureElement,
  type HtmlPictureReconstruction,
  type HtmlPictureStyle,
  type HtmlProgram,
  type HtmlVisual,
} from "@hypit/html-program";
import type { ExactTemporalValue, TemporalRange } from "@hypit/temporal/algebra";
import { evaluateTemporalMap } from "@hypit/temporal/algebra";
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
  output: { readonly frameRate: HtmlFrameRate; readonly canvas: HtmlCanvas; readonly range?: TemporalRange },
): HtmlProgram {
  if (program.picture === undefined || program.pictureDomain === undefined) {
    throw new Error("HTML compilation requires Picture output.");
  }
  const rate = output.frameRate.numerator / output.frameRate.denominator;
  const positions = pictureFramePositions(program, output.frameRate, output.range);
  const frameCount = positions.length;
  if (!Number.isSafeInteger(frameCount) || frameCount <= 0) throw new Error("HTML output frame count is invalid.");
  const evaluate = createPictureEvaluator(program);
  const evaluations = positions.map(evaluate);
  const domains = pictureNodeSpatialDomains(program.picture, program);
  let serial = 0;
  const id = (kind: string): string => `${kind}-${++serial}`;
  const evaluatedNode = (frame: number, nodeId: string): EvaluatedPictureNode => evaluations[frame]!.nodes[nodeId]!;
  const active = (nodeId: string): readonly boolean[] => evaluations.map((_evaluation, frame) =>
    evaluatedNode(frame, nodeId).kind !== "transparent");
  const renderFrames = (nodeId: string): readonly (number | null)[] => evaluations.map((_evaluation, frame) => {
    const node = evaluatedNode(frame, nodeId);
    if (node.kind !== "sample") return null;
    if (node.temporal.kind === "signal") return seconds(node.temporal.at) * rate;
    return 0;
  });
  const visualElement = (
    elementId: string,
    visual: HtmlVisual,
    domain: LocalSpatialDomain,
    frames: readonly (number | null)[],
    slots: readonly { readonly name: string; readonly element: HtmlPictureElement }[] = [],
    controls?: Readonly<Record<string, readonly (ExactTemporalValue | null)[]>>,
  ): HtmlPictureElement => {
    assertHtmlVisual(visual);
    return {
      kind: "program",
      id: elementId,
      spans: activeSpans(frames.map((frame) => frame !== null)),
      style: domainStyle(domain),
      program: visual,
      slots,
      renderFrames: frames,
      ...(controls === undefined ? {} : { controlPositions: controls }),
    };
  };
  const mediaElement = (
    media: ResolvedMedia,
    elementId: string,
    domain: LocalSpatialDomain,
    nodeId: string,
    reconstruction: HtmlPictureReconstruction | undefined,
  ): HtmlPictureElement => {
    const picture = media.interpretation.picture;
    if (picture === undefined) throw new Error(`Media Picture node ${nodeId} has no selected stream.`);
    const spans = activeSpans(active(nodeId));
    if (picture.kind === "constant") return {
      kind: "image",
      id: elementId,
      spans,
      style: [...domainStyle(domain), { name: "object-fit", value: "fill" }],
      resource: media.resource,
      picture: picture.interpretation.picture,
    };
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
      sourceFrames: evaluations.map((_evaluation, frame) => {
        const node = evaluatedNode(frame, nodeId);
        if (node.kind !== "sample" || node.temporal.kind !== "signal") return null;
        const sample = evaluateTemporalMap(picture.map, node.temporal.at, node.temporal.side);
        return sample === undefined ? null : {
          position: sample.position,
          side: sample.sourceSide,
        };
      }),
    };
  };
  const build = (nodeId: string): HtmlPictureElement => {
    const node: PictureNode = program.picture!.nodes[nodeId]!;
    const domain = domains.get(nodeId)!;
    const elementId = id(`picture-${node.kind}`);
    if (node.kind === "transparent") return { kind: "box", id: elementId, spans: [], style: domainStyle(domain), children: [] };
    if (node.kind === "use") {
      const occurrence = program.occurrences[node.occurrence]!;
      const content = occurrence.source.content;
      const selection = occurrence.selections[node.output];
      return content.kind === "media"
        ? mediaElement(content.media, elementId, domain, nodeId,
          selection?.kind === "signal" ? selection.reconstruction : undefined)
        : visualElement(elementId, content.visual, domain, renderFrames(nodeId));
    }
    if (node.kind === "over") return {
      kind: "box", id: elementId, spans: activeSpans(active(nodeId)), style: domainStyle(domain), children: node.inputs.map(build),
    };
    if (node.kind === "restrict") return {
      kind: "box", id: elementId, spans: activeSpans(active(nodeId)), style: domainStyle(domain), children: [build(node.input)],
    };
    if (node.kind === "crop") {
      const source = domains.get(node.input)!.region;
      const x = node.region.x - source.x;
      const y = node.region.y - source.y;
      return {
        kind: "box", id: elementId, spans: activeSpans(active(nodeId)),
        style: [...domainStyle(domain), { name: "overflow", value: "hidden" }],
        children: [{
          kind: "box", id: id("crop-offset"), spans: activeSpans(active(nodeId)),
          style: [
            { name: "position", value: "absolute" }, { name: "left", value: `${x}px` }, { name: "top", value: `${y}px` },
            { name: "width", value: `${node.region.width}px` }, { name: "height", value: `${node.region.height}px` },
            { name: "overflow", value: "hidden" },
          ],
          children: [{
            kind: "box", id: id("crop-source"), spans: activeSpans(active(nodeId)),
            style: [
              { name: "position", value: "absolute" }, { name: "left", value: `${-x}px` }, { name: "top", value: `${-y}px` },
              { name: "width", value: `${source.width}px` }, { name: "height", value: `${source.height}px` },
            ], children: [build(node.input)],
          }],
        }],
      };
    }
    if (node.kind === "remap") {
      const transforms = evaluations.map((_evaluation, frame) => {
        const value = evaluatedNode(frame, nodeId);
        return value.kind === "remap" ? cssTransform(value.mapping) : null;
      });
      const visual: HtmlVisual = {
        html: '<div data-hypit-remap>{{input:signal}}</div>',
        data: { transforms },
        css: ":scope>[data-hypit-remap]{position:absolute;left:0;top:0;transform-origin:0 0}",
        setup: "const child=root.querySelector(':scope>[data-hypit-remap]');return frame=>{const value=data.transforms[Math.max(0,Math.min(data.transforms.length-1,Math.floor(frame)))];root.style.display=value===null?'none':'block';if(value!==null)child.style.transform=value;};",
      };
      return visualElement(elementId, visual, domain,
        evaluations.map((_value, frame) => frame), [{ name: "signal", element: build(node.input) }]);
    }
    if (node.kind === "apply") {
      const controls: Record<string, readonly (ExactTemporalValue | null)[]> = {};
      for (const name of Object.keys(node.operator.temporalControls)) controls[name] = evaluations.map((_evaluation, frame) => {
        const value = evaluatedNode(frame, nodeId);
        return value.kind === "apply" ? value.controlPositions[name] ?? null : null;
      });
      return visualElement(elementId, node.operator.visual, domain, evaluations.map((_value, frame) => frame),
        Object.entries(node.inputs).map(([name, input]) => ({ name, element: build(input) })), controls);
    }
    throw new Error(`HTML lowering cannot compile Picture node ${nodeId}.`);
  };
  return compileHtmlPictureProgram({
    id: program.id,
    frameRate: output.frameRate,
    frameCount,
    canvas: output.canvas,
    root: build(program.picture.root),
  });
}
