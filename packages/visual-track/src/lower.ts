import type { Timeline } from "@hypit/timeline";
import type {
  VisualAnimation,
  VisualElement,
  VisualStyleDeclaration,
  VisualSourceTimeMap,
} from "@hypit/composition";
import { mapSpatialPoint } from "@hypit/spatial";
import type { SpatialFrame, SpatialPath } from "@hypit/spatial";

import { poseAnimation, samplingAnimation } from "./motion.js";
import { resolveVisualSourceTime } from "./source-time.js";
import type {
  VisualFrameTreatment,
  MediaGradientStop,
  VisualClipProgram,
  MediaLayerProgram,
  MediaPaint,
  MediaSampleLayerProgram,
} from "./types.js";

function px(value: number): string { return `${value}px`; }

function box(id: string, order: number, parent: string | undefined, animation?: VisualAnimation, transformOrigin = "center center"): VisualElement {
  return {
    id,
    ...(parent === undefined ? {} : { parent }),
    order,
    kind: "box",
    style: [
      { name: "height", value: "100%" },
      { name: "left", value: 0 },
      { name: "position", value: "absolute" },
      { name: "top", value: 0 },
      { name: "transform-origin", value: transformOrigin },
      { name: "width", value: "100%" },
    ],
    ...(animation === undefined ? {} : { animation }),
  };
}

function stop(stopValue: MediaGradientStop): string {
  return `${stopValue.color} ${stopValue.offset * 100}%`;
}

function paint(value: MediaPaint): string {
  if (value.kind === "solid") return value.color;
  if (value.kind === "linear-gradient") {
    return `linear-gradient(${value.angleDeg}deg,${value.stops.map(stop).join(",")})`;
  }
  return `radial-gradient(circle at ${value.center.x * 100}% ${value.center.y * 100}%,${value.stops.map(stop).join(",")})`;
}

/**
 * A Path is drawn in program picture-plane pixels, and the element it clips is the Frame's own box — positioned at
 * the Frame's origin, so its coordinates start there. Handed the absolute picture-plane numbers unchanged, the clip
 * region lands one Frame origin down and to the right of where it was drawn, which for any Frame away
 * from the corner is entirely outside the box: the Clip renders blank.
 */
function pathData(path: SpatialPath, origin: SpatialFrame): string {
  const x = (value: number): number => value - origin.xPx;
  const y = (value: number): number => value - origin.yPx;
  return path.commands.map((command) => {
    switch (command.kind) {
      case "move": return `M ${x(command.xPx)} ${y(command.yPx)}`;
      case "line": return `L ${x(command.xPx)} ${y(command.yPx)}`;
      case "quadratic": return `Q ${x(command.controlX)} ${y(command.controlY)} ${x(command.xPx)} ${y(command.yPx)}`;
      case "cubic": return `C ${x(command.control1X)} ${y(command.control1Y)} ${x(command.control2X)} ${y(command.control2Y)} ${x(command.xPx)} ${y(command.yPx)}`;
      case "close": return "Z";
    }
  }).join(" ");
}

function frameStyles(value: VisualFrameTreatment, frame: SpatialFrame): VisualStyleDeclaration[] {
  const styles: VisualStyleDeclaration[] = [
    { name: "box-sizing", value: "border-box" },
    { name: "height", value: "100%" },
    { name: "left", value: 0 },
    { name: "position", value: "absolute" },
    { name: "top", value: 0 },
    { name: "width", value: "100%" },
  ];
  if (value.clip.kind === "none") styles.push({ name: "overflow", value: "visible" });
  else {
    styles.push({ name: "overflow", value: "hidden" });
    if (value.clip.kind === "rounded") styles.push({ name: "border-radius", value: px(value.clip.radiusPx) });
    if (value.clip.kind === "path") styles.push({ name: "clip-path", value: `path("${pathData(value.clip.path, frame)}")` });
  }
  if (value.border !== undefined) {
    styles.push({ name: "border", value: `${value.border.widthPx}px ${value.border.style} ${value.border.color}` });
  }
  if (value.shadows.length > 0) {
    styles.push({
      name: "box-shadow",
      value: value.shadows.map((shadow) =>
        `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blurPx}px ${shadow.spreadPx}px ${shadow.color}`).join(","),
    });
  }
  return styles;
}

function filter(layer: MediaSampleLayerProgram): string {
  const value = layer.appearance.filter;
  return [
    value.blurPx === 0 ? "" : `blur(${value.blurPx}px)`,
    value.brightness === 1 ? "" : `brightness(${value.brightness})`,
    value.contrast === 1 ? "" : `contrast(${value.contrast})`,
    value.saturation === 1 ? "" : `saturate(${value.saturation})`,
  ].filter(Boolean).join(" ") || "none";
}

function sampleElements(
  layer: MediaSampleLayerProgram,
  clip: VisualClipProgram,
  parent: string,
  order: { value: number },
  timeline: Timeline,
  sourceTimeOverrides: Readonly<Record<string, VisualSourceTimeMap>>,
  samplingAnimationOverrides: Readonly<Record<string, VisualAnimation | null>>,
): VisualElement[] {
  const sourceCenter = mapSpatialPoint({
    xPx: layer.source.extent.widthPx / 2,
    yPx: layer.source.extent.heightPx / 2,
  }, layer.mapping);
  // Layers are absolutely positioned inside the bordered frame element, so CSS places them from
  // its padding edge. The mapping is already inset by the border; measure from that edge too.
  const border = clip.treatment.border?.widthPx ?? 0;
  const originX = clip.frame.xPx + border;
  const originY = clip.frame.yPx + border;
  const sampling = `${layer.id}:sampling`;
  const appearance = `${layer.id}:appearance`;
  const mapping = `${layer.id}:mapping`;
  const durationFrames = clip.span.endFrameExclusive - clip.span.startFrame;
  const samplingElement: VisualElement = {
    id: sampling,
    parent,
    order: order.value++,
    kind: "box",
    style: [
      { name: "height", value: "100%" },
      { name: "left", value: 0 },
      { name: "position", value: "absolute" },
      { name: "top", value: 0 },
      { name: "transform-origin", value: `${px(sourceCenter.xPx - originX)} ${px(sourceCenter.yPx - originY)}` },
      { name: "width", value: "100%" },
    ],
    ...(() => {
      const override = samplingAnimationOverrides[layer.id];
      if (override === null) return {};
      if (override !== undefined) return { animation: override };
      return layer.samplingMotion === undefined ? {} : {
        animation: samplingAnimation(layer.samplingMotion, durationFrames),
      };
    })(),
  };
  const localTx = layer.mapping.tx - originX;
  const localTy = layer.mapping.ty - originY;
  const corners = [
    { xPx: 0, yPx: 0 },
    { xPx: layer.source.extent.widthPx, yPx: 0 },
    { xPx: layer.source.extent.widthPx, yPx: layer.source.extent.heightPx },
    { xPx: 0, yPx: layer.source.extent.heightPx },
  ].map((point) => mapSpatialPoint(point, layer.mapping))
    .map((point) => `${px(point.xPx - originX)} ${px(point.yPx - originY)}`);
  const appearanceStyle: VisualStyleDeclaration[] = [
    { name: "filter", value: filter(layer) },
    { name: "height", value: "100%" },
    { name: "left", value: 0 },
    { name: "opacity", value: layer.appearance.opacity },
    { name: "position", value: "absolute" },
    { name: "top", value: 0 },
    { name: "width", value: "100%" },
  ];
  if (layer.appearance.filter.blurPx > 0) {
    appearanceStyle.push({ name: "clip-path", value: `polygon(${corners.join(",")})` });
  }
  const appearanceElement: VisualElement = {
    id: appearance,
    parent: sampling,
    order: order.value++,
    kind: "box",
    style: appearanceStyle,
  };
  const mappingStyle: VisualStyleDeclaration[] = [
    { name: "height", value: px(layer.source.extent.heightPx) },
    { name: "left", value: 0 },
    { name: "position", value: "absolute" },
    { name: "top", value: 0 },
    { name: "transform", value: `matrix(${layer.mapping.xx},${layer.mapping.yx},${layer.mapping.xy},${layer.mapping.yy},${localTx},${localTy})` },
    { name: "transform-origin", value: "0 0" },
    { name: "width", value: px(layer.source.extent.widthPx) },
  ];
  const mappingElement: VisualElement = {
    id: mapping,
    parent: appearance,
    order: order.value++,
    kind: "box",
    style: mappingStyle,
  };
  // Filter lives after source mapping, so blur remains measured in program-picture pixels. The
  // source is extended underneath the mapped outline before that outline clips the result; this
  // keeps a blur from sampling transparent siblings or fading its own edge.
  const xScale = Math.hypot(layer.mapping.xx, layer.mapping.yx);
  const yScale = Math.hypot(layer.mapping.xy, layer.mapping.yy);
  const positiveScales = [xScale, yScale].filter((value) => value > 0);
  const minimumScale = positiveScales.length === 0 ? 1 : Math.min(...positiveScales);
  const overscanPx = layer.appearance.filter.blurPx === 0
    ? 0 : Math.ceil(layer.appearance.filter.blurPx * 2 / minimumScale);
  const mediaStyle: VisualStyleDeclaration[] = [
    { name: "height", value: overscanPx === 0 ? "100%" : px(layer.source.extent.heightPx + (overscanPx * 2)) },
    { name: "left", value: overscanPx === 0 ? 0 : px(-overscanPx) },
    { name: "position", value: "absolute" },
    { name: "top", value: overscanPx === 0 ? 0 : px(-overscanPx) },
    { name: "width", value: overscanPx === 0 ? "100%" : px(layer.source.extent.widthPx + (overscanPx * 2)) },
  ];
  if (layer.source.kind === "still") {
    return [samplingElement, appearanceElement, mappingElement, {
      id: layer.id,
      parent: mapping,
      order: order.value++,
      kind: "image",
      artifact: structuredClone(layer.source.artifact),
      style: mediaStyle,
    }];
  }
  const sourceTiming = layer.source.kind === "timed"
    ? { frameRate: layer.source.frameRate, frameCount: layer.source.frameCount }
    : layer.source.kind === "surface" && layer.source.surface.timing.kind === "frames"
      ? { frameRate: layer.source.surface.timing.frameRate, frameCount: layer.source.surface.timing.frameCount }
      : undefined;
  if (sourceTiming === undefined) {
    if (layer.source.kind !== "surface") throw new Error(`Timed Media layer ${layer.id} has no timing.`);
    return [samplingElement, appearanceElement, mappingElement, {
      id: layer.id,
      parent: mapping,
      order: order.value++,
      kind: "surface",
      surface: structuredClone(layer.source.surface),
      style: mediaStyle,
    }];
  }
  const sourceTime = sourceTimeOverrides[layer.id]
    ?? (layer.sourceTime?.kind === "map" ? layer.sourceTime.value : resolveVisualSourceTime({
      timeline,
      sourceFrameRate: sourceTiming.frameRate,
      sourceFrameCount: sourceTiming.frameCount,
      targetFrameCount: durationFrames,
      ...(layer.sourceTime?.kind !== "spec" ? {} : { spec: layer.sourceTime.value }),
    }));
  if (layer.source.kind === "timed") {
    return [samplingElement, appearanceElement, mappingElement, {
      id: layer.id,
      parent: mapping,
      order: order.value++,
      kind: "video",
      artifact: structuredClone(layer.source.artifact),
      sourceTime,
      muted: true,
      style: mediaStyle,
    }];
  }
  return [samplingElement, appearanceElement, mappingElement, {
    id: layer.id,
    parent: mapping,
    order: order.value++,
    kind: "surface",
    surface: structuredClone(layer.source.surface),
    sourceTime,
    style: mediaStyle,
  }];
}

function layerElements(
  layer: MediaLayerProgram,
  clip: VisualClipProgram,
  parent: string,
  order: { value: number },
  timeline: Timeline,
  sourceTimeOverrides: Readonly<Record<string, VisualSourceTimeMap>>,
  samplingAnimationOverrides: Readonly<Record<string, VisualAnimation | null>>,
): VisualElement[] {
  if (layer.kind === "sample") {
    return sampleElements(layer, clip, parent, order, timeline, sourceTimeOverrides, samplingAnimationOverrides);
  }
  return [{
    id: layer.id,
    parent,
    order: order.value++,
    kind: "box",
    style: [
      { name: "background", value: paint(layer.paint) },
      { name: "height", value: "100%" },
      { name: "left", value: 0 },
      { name: "opacity", value: layer.opacity },
      { name: "position", value: "absolute" },
      { name: "top", value: 0 },
      { name: "width", value: "100%" },
    ],
  }];
}

/** Lower one independent Clip through the fixed wrapper stack from the visual spec. */
export function lowerVisualClipElements(
  clip: VisualClipProgram,
  timeline: Timeline,
  options: {
    readonly poseAnimationOverride?: VisualAnimation | null;
    /** Implementation-level reuse hook for collection components with their own explicit clock. */
    readonly sourceTimeOverrides?: Readonly<Record<string, VisualSourceTimeMap>>;
    readonly samplingAnimationOverrides?: Readonly<Record<string, VisualAnimation | null>>;
    /** Attach the visual material subtree below another component-owned wrapper. */
    readonly placementParent?: string;
  } = {},
): readonly VisualElement[] {
  const durationFrames = clip.span.endFrameExclusive - clip.span.startFrame;
  const order = { value: 0 };
  const root = `${clip.id}:placement`;
  const elements: VisualElement[] = [{
    id: root,
    ...(options.placementParent === undefined ? {} : { parent: options.placementParent }),
    order: order.value++,
    kind: "box",
    style: [
      { name: "height", value: px(clip.frame.heightPx) },
      { name: "left", value: px(clip.frame.xPx) },
      { name: "position", value: "absolute" },
      { name: "top", value: px(clip.frame.yPx) },
      { name: "width", value: px(clip.frame.widthPx) },
    ],
  }];
  const parent = `${clip.id}:pose`;
  const motion = options.poseAnimationOverride === undefined
    ? poseAnimation(clip.motion, durationFrames)
    : options.poseAnimationOverride ?? undefined;
  const motionOrigin = clip.motion?.keyframes[0];
  elements.push(box(parent, order.value++, root, motion,
    motionOrigin === undefined ? "center center" : `${motionOrigin.originX * 100}% ${motionOrigin.originY * 100}%`));
  const frame = `${clip.id}:frame`;
  elements.push({ id: frame, parent, order: order.value++, kind: "box", style: frameStyles(clip.treatment, clip.frame) });
  for (const layer of clip.layers) {
    elements.push(...layerElements(
      layer,
      clip,
      frame,
      order,
      timeline,
      options.sourceTimeOverrides ?? {},
      options.samplingAnimationOverrides ?? {},
    ));
  }
  return elements;
}
