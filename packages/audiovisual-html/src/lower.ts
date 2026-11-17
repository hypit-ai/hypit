import {
  createAudiovisualPictureDemand,
  evaluateAudiovisualProgramAt,
  invertSpatialMap,
  planAudiovisualDemand,
  pictureNodeSpatialDomains,
  type AudiovisualEvaluation,
  type EvaluatedPictureNode,
  type LocalSpatialDomain,
  type PictureNode,
  type SpatialMap,
} from "@hypit/audiovisual";
import {
  assertHtmlVisual,
  compileHtmlPictureProgram,
  type HtmlPictureElement,
  type HtmlPictureStyle,
  type HtmlProgram,
  type HtmlVisual,
} from "@hypit/html-program";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import { evaluateTemporalMap } from "@hypit/temporal/algebra";
import type { AudiovisualHtmlLink, AudiovisualHtmlOutput, AudiovisualHtmlSource } from "./types.js";

const seconds = (value: ExactTemporalValue): number => Number(BigInt(value.ticks))
  * value.timeBase.numerator / value.timeBase.denominator;

function sourceKey(source: string, output: string): string {
  return `${source}\u0000${output}`;
}

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
  if (transform.kind === "affine") {
    const x = transform.xx * source.x + transform.xy * source.y + transform.tx - target.x;
    const y = transform.yx * source.x + transform.yy * source.y + transform.ty - target.y;
    return `matrix(${transform.xx},${transform.yx},${transform.xy},${transform.yy},${x},${y})`;
  }
  return `matrix3d(${[
    transform.xx, transform.yx, 0, transform.wx,
    transform.xy, transform.yy, 0, transform.wy,
    0, 0, 1, 0,
    transform.tx - target.x, transform.ty - target.y, 0, transform.ww,
  ].join(",")})`;
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

/** Lower a closed AVIR Picture to the portable HTML terminal programme. */
export function lowerAudiovisualPictureToHtmlProgram(
  link: AudiovisualHtmlLink,
  output: AudiovisualHtmlOutput,
): HtmlProgram {
  const { program } = link;
  if (program.picture === undefined || program.pictureDomain === undefined) throw new Error("HTML lowering requires AVIR Picture output.");
  const rate = output.frameRate.numerator / output.frameRate.denominator;
  const demand = createAudiovisualPictureDemand(program, output.frameRate, output.range);
  planAudiovisualDemand(program, { picture: demand });
  const frameCount = demand.samples.length;
  if (!Number.isSafeInteger(frameCount) || frameCount <= 0) throw new Error("HTML output frame count is invalid.");
  const evaluations: AudiovisualEvaluation[] = demand.samples.map((sample) =>
    evaluateAudiovisualProgramAt(program, sample.position));
  const domains = pictureNodeSpatialDomains(program.picture, program);
  const sources = new Map(link.sources.map((source) => [sourceKey(source.source, source.output), source]));
  const operators = new Map(link.operators.map((operator) => [operator.operator, operator.visual]));
  const reconstructions = new Map(link.reconstructions.map((entry) =>
    [sourceKey(entry.occurrence, entry.output), entry.reconstruction]));
  let serial = 0;
  const id = (kind: string): string => `${kind}-${++serial}`;
  const evaluatedNode = (frame: number, nodeId: string): EvaluatedPictureNode => evaluations[frame]!.picture!.nodes[nodeId]!;
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
    binding: AudiovisualHtmlSource,
    elementId: string,
    domain: LocalSpatialDomain,
    nodeId: string,
    reconstruction: ReturnType<typeof reconstructions.get>,
  ): HtmlPictureElement => {
    if (binding.implementation.kind !== "media") throw new Error("HTML media binding is invalid.");
    const media = binding.implementation.media;
    const picture = media.interpretation.picture;
    if (picture === undefined) throw new Error(`HTML Media Source ${binding.source}.${binding.output} has no Picture.`);
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
      const binding = sources.get(sourceKey(occurrence.source.id, node.output));
      if (binding === undefined) throw new Error(`HTML lowering has no Source ${occurrence.source.id}.${node.output}.`);
      const reconstruction = reconstructions.get(sourceKey(occurrence.id, node.output));
      if (binding.implementation.kind === "visual" && reconstruction !== undefined) {
        throw new Error(`HTML visual Source ${occurrence.source.id}.${node.output} cannot apply a Picture Reconstruction.`);
      }
      return binding.implementation.kind === "media"
        ? mediaElement(binding, elementId, domain, nodeId, reconstruction)
        : visualElement(elementId, binding.implementation.visual, domain, renderFrames(nodeId));
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
    if (node.kind === "remap" || node.kind === "remap-control") {
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
      const visual = operators.get(node.operator.id);
      if (visual === undefined) throw new Error(`HTML lowering has no Operator ${node.operator.id}.`);
      const controls: Record<string, readonly (ExactTemporalValue | null)[]> = {};
      for (const name of Object.keys(node.operator.temporalControls)) controls[name] = evaluations.map((_evaluation, frame) => {
        const value = evaluatedNode(frame, nodeId);
        return value.kind === "apply" ? value.controlPositions[name] ?? null : null;
      });
      return visualElement(elementId, visual, domain, evaluations.map((_value, frame) => frame),
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
