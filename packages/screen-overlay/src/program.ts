import { assertVisualTrackIdentity, sealVisualTrack } from "@hypit/composition";
import type { VisualAnimation, VisualElement, VisualStyleDeclaration, VisualTrack } from "@hypit/composition";
import { assertProgramSpaceIdentity } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import { canonicalize } from "@hypit/protocol";
import { assertCanvasSpace } from "@hypit/spatial";
import type { CanvasSpace } from "@hypit/spatial";
import type { ProjectedWindow } from "@hypit/temporal";

import type {
  ScreenOverlayComponent,
  ScreenOverlayHeader,
  ScreenOverlayItemProgram,
  ScreenOverlayItemSpec,
  ScreenOverlayProgram,
  ScreenOverlaySet,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function identity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}
function finite(value: number, label: string): void { assert(Number.isFinite(value), `${label} is invalid.`); }
function range(value: number, minimum: number, maximum: number, label: string): void {
  finite(value, label); assert(value >= minimum && value <= maximum, `${label} is outside ${minimum}..${maximum}.`);
}
function positive(value: number, label: string): void { finite(value, label); assert(value > 0, `${label} must be positive.`); }
function nonNegativeInteger(value: number, label: string): void {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative integer.`);
}
function color(value: string, label: string): void {
  assert(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value), `${label} must be a hexadecimal color.`);
}
function colors(values: readonly string[], label: string): void {
  assert(values.length > 0, `${label} requires at least one color.`);
  values.forEach((value, index) => color(value, `${label}.${index + 1}`));
}

export function assertScreenOverlayComponent(value: ScreenOverlayComponent): void {
  switch (value.kind) {
    case "flash":
      color(value.color, "Flash color"); range(value.intensity, 0, 1, "Flash intensity");
      nonNegativeInteger(value.attackFrames, "Flash attack"); nonNegativeInteger(value.holdFrames, "Flash hold");
      nonNegativeInteger(value.decayFrames, "Flash decay"); return;
    case "color-wash": color(value.color, "ColorWash color"); range(value.opacity, 0, 1, "ColorWash opacity"); return;
    case "vignette":
      range(value.center.x, 0, 1, "Vignette center.x"); range(value.center.y, 0, 1, "Vignette center.y");
      positive(value.radius.x, "Vignette radius.x"); positive(value.radius.y, "Vignette radius.y");
      range(value.softness, 0, 1, "Vignette softness"); color(value.color, "Vignette color");
      range(value.opacity, 0, 1, "Vignette opacity"); return;
    case "scan-lines":
      positive(value.spacingPx, "ScanLines spacing"); positive(value.thicknessPx, "ScanLines thickness");
      assert(value.thicknessPx <= value.spacingPx, "ScanLines thickness exceeds spacing.");
      finite(value.angleDeg, "ScanLines angle"); range(value.opacity, 0, 1, "ScanLines opacity");
      finite(value.travelPx, "ScanLines travel"); return;
    case "directional-matte":
      finite(value.angleDeg, "DirectionalMatte angle"); range(value.coverage, 0, 1, "DirectionalMatte coverage");
      range(value.feather, 0, 1, "DirectionalMatte feather"); color(value.color, "DirectionalMatte color");
      range(value.opacity, 0, 1, "DirectionalMatte opacity"); range(value.progress.from, -1, 2, "DirectionalMatte progress.from");
      range(value.progress.to, -1, 2, "DirectionalMatte progress.to"); return;
    case "whip-veil":
      assert(["left", "right", "up", "down"].includes(value.direction), "WhipVeil direction is invalid.");
      positive(value.widthPx, "WhipVeil width"); assert(Number.isFinite(value.softnessPx) && value.softnessPx >= 0, "WhipVeil softness is invalid.");
      positive(value.travelPx, "WhipVeil travel"); range(value.opacity, 0, 1, "WhipVeil opacity"); return;
    case "glitch-veil":
      assert(Number.isSafeInteger(value.bars) && value.bars > 0 && value.bars <= 256, "GlitchVeil bars are invalid.");
      colors(value.colors, "GlitchVeil colors"); range(value.opacity, 0, 1, "GlitchVeil opacity");
      finite(value.travelPx, "GlitchVeil travel"); nonNegativeInteger(value.seed, "GlitchVeil seed"); return;
    case "grain":
      range(value.amount, 0, 1, "Grain amount"); positive(value.grainSizePx, "Grain size");
      assert(value.chroma === "monochrome" || value.chroma === "color", "Grain chroma is invalid.");
      finite(value.motionRatePxPerFrame, "Grain motion rate"); nonNegativeInteger(value.seed, "Grain seed"); return;
    case "light-leak":
      colors(value.colors, "LightLeak colors"); finite(value.angleDeg, "LightLeak angle");
      range(value.softness, 0, 1, "LightLeak softness"); finite(value.travelPx, "LightLeak travel");
      range(value.intensity, 0, 1, "LightLeak intensity"); nonNegativeInteger(value.seed, "LightLeak seed"); return;
    case "bokeh":
      range(value.amount, 0, 1, "Bokeh amount"); positive(value.sizeMinPx, "Bokeh minimum size");
      assert(Number.isFinite(value.sizeMaxPx) && value.sizeMaxPx >= value.sizeMinPx, "Bokeh size range is invalid.");
      color(value.color, "Bokeh color"); range(value.warmth, -1, 1, "Bokeh warmth"); finite(value.driftPx, "Bokeh drift");
      nonNegativeInteger(value.seed, "Bokeh seed"); return;
    case "tv-static":
      range(value.amount, 0, 1, "TVStatic amount"); positive(value.noiseSizePx, "TVStatic noise size");
      range(value.scanLineOpacity, 0, 1, "TVStatic scan-line opacity");
      finite(value.motionRatePxPerFrame, "TVStatic motion rate"); nonNegativeInteger(value.seed, "TVStatic seed"); return;
  }
  throw new Error("Screen Overlay component kind is unsupported.");
}

export function sealScreenOverlayHeader(value: ScreenOverlayHeader): ScreenOverlayHeader {
  assertScreenOverlayHeader(value); return canonicalize(value) as unknown as ScreenOverlayHeader;
}
export function assertScreenOverlayHeader(value: ScreenOverlayHeader): void {
  identity(value.id, "ScreenOverlayHeader.id");
}
export function sealScreenOverlayItemSpec(value: ScreenOverlayItemSpec): ScreenOverlayItemSpec {
  assertScreenOverlayItemSpec(value); return canonicalize(value) as unknown as ScreenOverlayItemSpec;
}
export function assertScreenOverlayItemSpec(value: ScreenOverlayItemSpec): void {
  identity(value.id, "ScreenOverlayItemSpec.id"); assertScreenOverlayComponent(value.content);
  assert(Number.isSafeInteger(value.stackingOrder), "ScreenOverlay stacking order must be an integer.");
}
export function createScreenOverlaySet(): ScreenOverlaySet { return { items: [] }; }
export function assertScreenOverlaySet(value: ScreenOverlaySet): void {
  assert(Array.isArray(value.items), "ScreenOverlaySet is invalid.");
}

function realized(
  set: ScreenOverlaySet, header: ScreenOverlayHeader, spec: ScreenOverlayItemSpec,
  window: ProjectedWindow,
): ScreenOverlaySet {
  assertScreenOverlaySet(set); assertScreenOverlayHeader(header); assertScreenOverlayItemSpec(spec);
  const addition = {
    id: window.id,
    span: { ...window.span },
    content: structuredClone(spec.content),
    stacking: { order: spec.stackingOrder, tieBreak: `${header.id}:${spec.id}` },
  } satisfies ScreenOverlayItemProgram;
  const ids = new Set(set.items.map((item) => item.id));
  assert(!ids.has(addition.id), `Screen Overlay already contains Item ${addition.id}.`);
  return { items: [...set.items, addition] };
}

/** Component entry point: timing has already been resolved into a TemporalWindow. */
export function appendProjectedScreenOverlay(
  set: ScreenOverlaySet,
  header: ScreenOverlayHeader,
  spec: ScreenOverlayItemSpec,
  window: ProjectedWindow,
): ScreenOverlaySet {
  return realized(set, header, spec, window);
}
export function sealScreenOverlayProgram(value: ScreenOverlayProgram): ScreenOverlayProgram {
  const normalized = { id: value.id,
    items: [...value.items].map((item) => structuredClone(item)).sort((a, b) => a.id.localeCompare(b.id)) };
  assertScreenOverlayProgram(normalized); return canonicalize(normalized) as unknown as ScreenOverlayProgram;
}
export function finalizeScreenOverlay(set: ScreenOverlaySet, header: ScreenOverlayHeader): ScreenOverlayProgram {
  assertScreenOverlaySet(set); assertScreenOverlayHeader(header); assert(set.items.length > 0, "Screen Overlay requires at least one Item.");
  return sealScreenOverlayProgram({ id: header.id, items: set.items });
}
export function assertScreenOverlayProgram(value: ScreenOverlayProgram): void {
  identity(value.id, "ScreenOverlayProgram.id"); assert(value.items.length > 0, "ScreenOverlayProgram requires Items.");
  const ids = new Set<string>();
  for (const item of value.items) {
    identity(item.id, "ScreenOverlayItemProgram.id"); assert(!ids.has(item.id), `Duplicate Screen Overlay Item ${item.id}.`); ids.add(item.id);
    assert(item.span.startFrame >= 0 && item.span.endFrameExclusive > item.span.startFrame,
      `Screen Overlay Item ${item.id} timing is invalid.`);
    assertScreenOverlayComponent(item.content); assert(Number.isSafeInteger(item.stacking.order) && item.stacking.tieBreak.length > 0,
      `Screen Overlay Item ${item.id} stacking is invalid.`);
  }
}

type Random = () => number;
function random(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}
function px(value: number): string { return `${Number(value.toFixed(6))}px`; }
function percent(value: number): string { return `${Number((value * 100).toFixed(6))}%`; }
function rootStyle(): VisualStyleDeclaration[] { return [
  { name: "inset", value: "0" }, { name: "overflow", value: "hidden" }, { name: "position", value: "absolute" },
]; }
function fullChild(
  id: string,
  style: readonly VisualStyleDeclaration[],
  animation?: VisualAnimation,
  order = 1,
): VisualElement {
  const names = new Set(style.map((item) => item.name));
  return { id, parent: "root", order, kind: "box", style: [
    ...(names.has("inset") ? [] : [{ name: "inset", value: "0" }]),
    ...(names.has("position") ? [] : [{ name: "position", value: "absolute" }]),
    ...style,
  ], ...(animation === undefined ? {} : { animation }) };
}
function animation(duration: number, start: readonly VisualStyleDeclaration[], end: readonly VisualStyleDeclaration[]): VisualAnimation {
  return { keyframes: [{ atFrame: 0, style: start }, { atFrame: duration, style: end }] };
}
function flashElements(content: Extract<ScreenOverlayComponent, { kind: "flash" }>, duration: number): readonly VisualElement[] {
  const total = content.attackFrames + content.holdFrames + content.decayFrames;
  if (total === 0) return [{ id: "root", order: 0, kind: "box", style: [...rootStyle(), { name: "background-color", value: content.color }, { name: "opacity", value: content.intensity }] }];
  const marks = new Map<number, number>();
  marks.set(0, content.attackFrames === 0 ? content.intensity : 0);
  marks.set(content.attackFrames, content.intensity);
  marks.set(content.attackFrames + content.holdFrames, content.intensity);
  marks.set(total, 0);
  marks.set(duration, 0);
  return [{ id: "root", order: 0, kind: "box", style: [...rootStyle(), { name: "background-color", value: content.color }],
    animation: { keyframes: [...marks].sort(([a], [b]) => a - b).map(([atFrame, opacity]) => ({ atFrame, style: [{ name: "opacity", value: opacity }] })) } }];
}

function overlayElements(content: ScreenOverlayComponent, canvas: CanvasSpace, duration: number): readonly VisualElement[] {
  if (content.kind === "flash") return flashElements(content, duration);
  const root: VisualElement = { id: "root", order: 0, kind: "box", style: rootStyle() };
  switch (content.kind) {
    case "color-wash": return [root, fullChild("wash", [{ name: "background-color", value: content.color }, { name: "opacity", value: content.opacity }])];
    case "vignette": {
      const inner = Math.max(0, 1 - content.softness) * 100;
      return [root, fullChild("vignette", [{ name: "background-image", value: `radial-gradient(ellipse ${percent(content.radius.x)} ${percent(content.radius.y)} at ${percent(content.center.x)} ${percent(content.center.y)},transparent ${inner}%,${content.color} 100%)` }, { name: "opacity", value: content.opacity }])];
    }
    case "scan-lines": {
      const travel = `translate3d(${px(content.travelPx * Math.cos(content.angleDeg * Math.PI / 180))},${px(content.travelPx * Math.sin(content.angleDeg * Math.PI / 180))},0)`;
      return [root, fullChild("scan-lines", [
        { name: "background-image", value: `repeating-linear-gradient(${content.angleDeg}deg,#ffffff 0 ${px(content.thicknessPx)},transparent ${px(content.thicknessPx)} ${px(content.spacingPx)})` },
        { name: "inset", value: "-20%" }, { name: "opacity", value: content.opacity },
      ], animation(duration, [{ name: "transform", value: "translate3d(0px,0px,0)" }], [{ name: "transform", value: travel }]))];
    }
    case "directional-matte": {
      const extent = Math.hypot(canvas.widthPx, canvas.heightPx) * 2;
      const move = (progress: number) => `rotate(${content.angleDeg}deg) translate3d(${px((progress - 0.5) * extent)},0px,0)`;
      const edge = Math.max(0.001, content.feather) * 100;
      return [root, fullChild("matte", [
        { name: "background-image", value: `linear-gradient(90deg,${content.color} 0 ${100 - edge}%,transparent 100%)` },
        { name: "height", value: "200%" }, { name: "left", value: "-50%" }, { name: "opacity", value: content.opacity },
        { name: "top", value: "-50%" }, { name: "width", value: `${200 * content.coverage}%` },
      ], animation(duration, [{ name: "transform", value: move(content.progress.from) }], [{ name: "transform", value: move(content.progress.to) }]))];
    }
    case "whip-veil": {
      const horizontal = content.direction === "left" || content.direction === "right";
      const sign = content.direction === "left" || content.direction === "up" ? -1 : 1;
      const gradient = horizontal ? "90deg" : "180deg";
      const transform = (distance: number) => horizontal ? `translate3d(${px(distance)},0px,0)` : `translate3d(0px,${px(distance)},0)`;
      return [root, fullChild("veil", [
        { name: "background-image", value: `linear-gradient(${gradient},transparent 0,#ffffff ${px(content.softnessPx)},#ffffff calc(100% - ${px(content.softnessPx)}),transparent 100%)` },
        { name: "height", value: horizontal ? "100%" : px(content.widthPx) }, { name: "opacity", value: content.opacity },
        { name: "width", value: horizontal ? px(content.widthPx) : "100%" },
      ], animation(duration, [{ name: "transform", value: transform(-sign * content.travelPx) }], [{ name: "transform", value: transform(sign * content.travelPx) }]))];
    }
    case "glitch-veil": {
      const rng = random(content.seed);
      return [root, ...Array.from({ length: content.bars }, (_, index): VisualElement => {
        const height = 1 + rng() * 12;
        const y = rng() * 100;
        const x = (rng() - 0.5) * 20;
        const colorValue = content.colors[index % content.colors.length]!;
        return { id: `bar-${index + 1}`, parent: "root", order: index + 1, kind: "box", style: [
          { name: "background-color", value: colorValue }, { name: "height", value: percent(height / 100) },
          { name: "left", value: percent(x / 100) }, { name: "opacity", value: content.opacity * (0.35 + rng() * 0.65) },
          { name: "position", value: "absolute" }, { name: "top", value: percent(y / 100) }, { name: "width", value: "120%" },
        ], animation: animation(duration, [{ name: "transform", value: "translate3d(0px,0px,0)" }], [{ name: "transform", value: `translate3d(${px(content.travelPx * (rng() < 0.5 ? -1 : 1))},0px,0)` }]) };
      })];
    }
    case "grain": {
      const rng = random(content.seed); const count = Math.max(1, Math.round(content.amount * 160));
      return [root, ...Array.from({ length: count }, (_, index): VisualElement => {
        const hue = content.chroma === "color" ? Math.round(rng() * 360) : 0;
        const shade = Math.round(rng() * 255);
        const background = content.chroma === "color" ? `hsl(${hue} 85% 60%)` : `rgb(${shade} ${shade} ${shade})`;
        const drift = content.motionRatePxPerFrame * duration * (rng() < 0.5 ? -1 : 1);
        return { id: `grain-${index + 1}`, parent: "root", order: index + 1, kind: "box", style: [
          { name: "background-color", value: background }, { name: "height", value: px(content.grainSizePx) },
          { name: "left", value: percent(rng()) }, { name: "opacity", value: 0.08 + content.amount * 0.42 },
          { name: "position", value: "absolute" }, { name: "top", value: percent(rng()) }, { name: "width", value: px(content.grainSizePx) },
        ], animation: animation(duration, [{ name: "transform", value: "translate3d(0px,0px,0)" }], [{ name: "transform", value: `translate3d(${px(drift)},${px(-drift)},0)` }]) };
      })];
    }
    case "light-leak": {
      const rng = random(content.seed); const offset = (rng() - 0.5) * 30;
      const stops = content.colors.map((entry, index) => `${entry} ${Number(index * 100 / Math.max(1, content.colors.length - 1)).toFixed(3)}%`).join(",");
      return [root, fullChild("light-leak", [
        { name: "background-image", value: `linear-gradient(${content.angleDeg + offset}deg,transparent 0,${stops},transparent 100%)` },
        { name: "filter", value: `blur(${px(content.softness * 80)})` }, { name: "inset", value: "-20%" },
        { name: "opacity", value: content.intensity },
      ], animation(duration, [{ name: "transform", value: `translate3d(${px(-content.travelPx)},0px,0)` }], [{ name: "transform", value: `translate3d(${px(content.travelPx)},0px,0)` }]))];
    }
    case "bokeh": {
      const rng = random(content.seed); const count = Math.max(1, Math.round(content.amount * 48));
      return [root, ...Array.from({ length: count }, (_, index): VisualElement => {
        const size = content.sizeMinPx + rng() * (content.sizeMaxPx - content.sizeMinPx);
        const warmthFilter = content.warmth === 0 ? "" : `sepia(${Math.abs(content.warmth)}) hue-rotate(${content.warmth < 0 ? 180 : 0}deg) `;
        return { id: `bokeh-${index + 1}`, parent: "root", order: index + 1, kind: "box", style: [
          { name: "background-color", value: content.color }, { name: "border-radius", value: "50%" },
          { name: "filter", value: `${warmthFilter}blur(${px(size * 0.08)})` }, { name: "height", value: px(size) },
          { name: "left", value: percent(rng()) }, { name: "opacity", value: 0.08 + rng() * 0.32 },
          { name: "position", value: "absolute" }, { name: "top", value: percent(rng()) }, { name: "width", value: px(size) },
        ], animation: animation(duration, [{ name: "transform", value: "translate3d(0px,0px,0)" }], [{ name: "transform", value: `translate3d(${px((rng() - 0.5) * content.driftPx)},${px((rng() - 0.5) * content.driftPx)},0)` }]) };
      })];
    }
    case "tv-static": {
      const rng = random(content.seed); const columns = Math.ceil(canvas.widthPx / content.noiseSizePx);
      const rows = Math.ceil(canvas.heightPx / content.noiseSizePx); const count = Math.min(512, Math.max(1, Math.round(columns * rows * content.amount)));
      const cells = Array.from({ length: count }, (_, index): VisualElement => {
        const shade = Math.round(rng() * 255); const drift = content.motionRatePxPerFrame * duration;
        return { id: `static-${index + 1}`, parent: "root", order: index + 1, kind: "box", style: [
          { name: "background-color", value: `rgb(${shade} ${shade} ${shade})` }, { name: "height", value: px(content.noiseSizePx) },
          { name: "left", value: percent(rng()) }, { name: "opacity", value: 0.2 + content.amount * 0.6 },
          { name: "position", value: "absolute" }, { name: "top", value: percent(rng()) }, { name: "width", value: px(content.noiseSizePx) },
        ], animation: animation(duration, [{ name: "transform", value: "translate3d(0px,0px,0)" }], [{ name: "transform", value: `translate3d(0px,${px(drift * (rng() < 0.5 ? -1 : 1))},0)` }]) };
      });
      return [root, ...cells, fullChild("static-scan-lines", [
        { name: "background-image", value: "repeating-linear-gradient(180deg,transparent 0 3px,#000000 3px 4px)" },
        { name: "opacity", value: content.scanLineOpacity },
      ], undefined, cells.length + 1)];
    }
  }
}

export function renderScreenOverlay(canvas: CanvasSpace, space: ProgramSpace, program: ScreenOverlayProgram): VisualTrack {
  assertCanvasSpace(canvas); assertProgramSpaceIdentity(space); assertScreenOverlayProgram(program);
  const track = sealVisualTrack({
    visualIr: "hypit.visual-ir@1", id: program.id,
    presents: program.items.map((item) => ({
      id: item.id, span: { ...item.span }, stacking: { ...item.stacking },
      elements: overlayElements(item.content, canvas, item.span.endFrameExclusive - item.span.startFrame),
    })),
  });
  assertVisualTrackIdentity(track, space);
  return track;
}
