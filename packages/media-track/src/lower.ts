import type {
  VisualAnimation,
  VisualElement,
  VisualStyleDeclaration,
  VisualTimedSampling,
} from "@hypit/composition";
import type { ProgramSpace } from "@hypit/program-space";
import { fitContent } from "@hypit/spatial";
import type { SpatialFrame, SpatialPath } from "@hypit/spatial";

import { lifecycleAnimation, samplingAnimation, sustainAnimation } from "./motion.js";
import { resolveVisualSampling } from "./sampling.js";
import type {
  MediaFramePresentation,
  MediaGradientStop,
  MediaItemProgram,
  MediaLayerProgram,
  MediaPaint,
  MediaSampleLayerProgram,
} from "./types.js";

function px(value: number): string { return `${value}px`; }

function box(id: string, order: number, parent: string | undefined, animation?: VisualAnimation): VisualElement {
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
      { name: "transform-origin", value: "center center" },
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
 * A Path is drawn in Canvas pixels, and the element it clips is the Frame's own box — positioned at
 * the Frame's origin, so its coordinates start there. Handed the Canvas numbers unchanged, the clip
 * region lands one Frame origin down and to the right of where it was drawn, which for any Frame away
 * from the corner is entirely outside the box: the Item renders blank.
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

function frameStyles(value: MediaFramePresentation, frame: SpatialFrame): VisualStyleDeclaration[] {
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

/**
 * The box a layer is fitted into: the Frame less its border and its padding.
 *
 * The border was left out, and it is drawn inward — `box-sizing: border-box` puts it inside the
 * Frame's own rectangle — so a fitted picture was sized against a box wider and taller than the one
 * it had to sit in. What that looks like is the picture offset by the border width down and to the
 * right, with the same amount cut off its far edges, and a `contain` fit that no longer contains.
 */
function innerFrame(item: MediaItemProgram): SpatialFrame {
  const { border, padding } = item.presentation;
  const edge = border?.widthPx ?? 0;
  return {
    xPx: item.frame.xPx + edge + padding.leftPx,
    yPx: item.frame.yPx + edge + padding.topPx,
    widthPx: item.frame.widthPx - edge * 2 - padding.leftPx - padding.rightPx,
    heightPx: item.frame.heightPx - edge * 2 - padding.topPx - padding.bottomPx,
  };
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
  item: MediaItemProgram,
  parent: string,
  order: { value: number },
  space: ProgramSpace,
  samplingOverrides: Readonly<Record<string, VisualTimedSampling>>,
  samplingAnimationOverrides: Readonly<Record<string, VisualAnimation | null>>,
): VisualElement[] {
  const content = fitContent(innerFrame(item), layer.source.extent, layer.fit).contentFrame;
  const wrapper = `${layer.id}:sampling`;
  const durationFrames = item.span.endFrameExclusive - item.span.startFrame;
  const wrapperStyle: VisualStyleDeclaration[] = [
    { name: "height", value: px(content.heightPx) },
    { name: "left", value: px(content.xPx - item.frame.xPx) },
    { name: "position", value: "absolute" },
    { name: "top", value: px(content.yPx - item.frame.yPx) },
    { name: "transform-origin", value: "center center" },
    { name: "width", value: px(content.widthPx) },
  ];
  // A blur reads across the box and paints past it — roughly twice its radius — so a `contain` fit
  // that was letterboxed on purpose had its blurred copy spilling into the letterbox it was fitted
  // away from. Clipping the wrapper ends the overscan at the fitted rectangle; the Gaussian still
  // reads real content across the whole box, so only the spill goes.
  if (layer.appearance.filter.blurPx > 0) wrapperStyle.push({ name: "overflow", value: "hidden" });
  const wrapperElement: VisualElement = {
    id: wrapper,
    parent,
    order: order.value++,
    kind: "box",
    style: wrapperStyle,
    ...(() => {
      const override = samplingAnimationOverrides[layer.id];
      if (override === null) return {};
      if (override !== undefined) return { animation: override };
      return layer.samplingMotion === undefined ? {} : {
        animation: samplingAnimation(layer.samplingMotion, durationFrames),
      };
    })(),
  };
  // Blur samples are overscanned inside the owned frame before clipping. The
  // Gaussian kernel therefore never invents a transparent/dark border and still
  // cannot observe any pixel from a sibling Track.
  const overscanPx = layer.appearance.filter.blurPx === 0
    ? 0 : Math.ceil(layer.appearance.filter.blurPx * 2);
  const mediaStyle: VisualStyleDeclaration[] = [
    { name: "filter", value: filter(layer) },
    { name: "height", value: overscanPx === 0 ? "100%" : px(content.heightPx + (overscanPx * 2)) },
    { name: "left", value: overscanPx === 0 ? 0 : px(-overscanPx) },
    { name: "opacity", value: layer.appearance.opacity },
    { name: "position", value: "absolute" },
    { name: "top", value: overscanPx === 0 ? 0 : px(-overscanPx) },
    { name: "width", value: overscanPx === 0 ? "100%" : px(content.widthPx + (overscanPx * 2)) },
  ];
  if (layer.source.kind === "still") {
    return [wrapperElement, {
      id: layer.id,
      parent: wrapper,
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
    return [wrapperElement, {
      id: layer.id,
      parent: wrapper,
      order: order.value++,
      kind: "surface",
      surface: structuredClone(layer.source.surface),
      style: mediaStyle,
    }];
  }
  const sampling = samplingOverrides[layer.id] ?? layer.sampling ?? resolveVisualSampling({
      space,
      sourceFrameRate: sourceTiming.frameRate,
      sourceFrameCount: sourceTiming.frameCount,
      targetFrameCount: durationFrames,
      ...(layer.trim === undefined ? {} : { trim: layer.trim }),
      occupancy: layer.occupancy!,
    });
  if (layer.source.kind === "timed") {
    return [wrapperElement, {
      id: layer.id,
      parent: wrapper,
      order: order.value++,
      kind: "video",
      artifact: structuredClone(layer.source.artifact),
      sampling,
      muted: true,
      style: mediaStyle,
    }];
  }
  return [wrapperElement, {
    id: layer.id,
    parent: wrapper,
    order: order.value++,
    kind: "surface",
    surface: structuredClone(layer.source.surface),
    sampling,
    style: mediaStyle,
  }];
}

function layerElements(
  layer: MediaLayerProgram,
  item: MediaItemProgram,
  parent: string,
  order: { value: number },
  space: ProgramSpace,
  samplingOverrides: Readonly<Record<string, VisualTimedSampling>>,
  samplingAnimationOverrides: Readonly<Record<string, VisualAnimation | null>>,
): VisualElement[] {
  if (layer.kind === "sample") {
    return sampleElements(layer, item, parent, order, space, samplingOverrides, samplingAnimationOverrides);
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

/** Lower one independent Item through the fixed wrapper stack from the Media spec. */
export function lowerMediaItemElements(
  item: MediaItemProgram,
  space: ProgramSpace,
  options: {
    readonly includeHandoffWrapper?: boolean;
    readonly handoffAnimation?: VisualAnimation;
    readonly lifecycleAnimationOverride?: VisualAnimation | null;
    readonly sustainAnimationsOverride?: readonly (VisualAnimation | null)[];
    /** Implementation-level reuse hook for collection components with their own explicit clock. */
    readonly samplingOverrides?: Readonly<Record<string, VisualTimedSampling>>;
    readonly samplingAnimationOverrides?: Readonly<Record<string, VisualAnimation | null>>;
    /** Attach the Media placement subtree below another component-owned wrapper. */
    readonly placementParent?: string;
  } = {},
): readonly VisualElement[] {
  const durationFrames = item.span.endFrameExclusive - item.span.startFrame;
  const order = { value: 0 };
  const root = `${item.id}:placement`;
  const elements: VisualElement[] = [{
    id: root,
    ...(options.placementParent === undefined ? {} : { parent: options.placementParent }),
    order: order.value++,
    kind: "box",
    style: [
      { name: "height", value: px(item.frame.heightPx) },
      { name: "left", value: px(item.frame.xPx) },
      { name: "position", value: "absolute" },
      { name: "top", value: px(item.frame.yPx) },
      { name: "width", value: px(item.frame.widthPx) },
    ],
  }];
  let parent = `${item.id}:lifecycle`;
  const lifecycle = options.lifecycleAnimationOverride === undefined
    ? lifecycleAnimation(item.motion, durationFrames)
    : options.lifecycleAnimationOverride ?? undefined;
  elements.push(box(parent, order.value++, root, lifecycle));
  for (const [index, sustain] of item.motion.sustain.entries()) {
    const id = `${item.id}:sustain:${index + 1}`;
    const animation = options.sustainAnimationsOverride === undefined
      ? sustainAnimation(sustain, durationFrames)
      : options.sustainAnimationsOverride[index] ?? undefined;
    elements.push(box(id, order.value++, parent, animation ?? undefined));
    parent = id;
  }
  if (options.includeHandoffWrapper === true) {
    const handoff = `${item.id}:handoff`;
    elements.push(box(handoff, order.value++, parent, options.handoffAnimation));
    parent = handoff;
  }
  const frame = `${item.id}:frame`;
  elements.push({ id: frame, parent, order: order.value++, kind: "box", style: frameStyles(item.presentation, item.frame) });
  for (const layer of item.layers) {
    elements.push(...layerElements(
      layer,
      item,
      frame,
      order,
      space,
      options.samplingOverrides ?? {},
      options.samplingAnimationOverrides ?? {},
    ));
  }
  return elements;
}
