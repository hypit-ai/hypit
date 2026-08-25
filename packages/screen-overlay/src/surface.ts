import { semanticTrackTypes } from "@hypit/semantic-track";
import { spatialTypes } from "@hypit/spatial";
import type { StructuredElement, StructuredSurfaceHandler, SurfaceComponentDraft, SurfaceRecordDraft, SurfaceResolvedReference, MarkupAttributeValue } from "@hypit/markup";
import { createTemporalWindowProjection, temporalWindowAttributeNames } from "@hypit/temporal-markup";
import { createScreenOverlayFragment } from "./fragment.js";
import { screenOverlayTypes } from "./manifest.js";
import { sealScreenOverlayHeader, sealScreenOverlayItemSpec } from "./program.js";
import type { ScreenOverlayComponent } from "./types.js";

const TIMING = temporalWindowAttributeNames;
function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}
function allowed(element: StructuredElement, names: readonly string[]): void {
  const permit = new Set(names); const unexpected = Object.keys(element.attributes).filter((name) => !permit.has(name));
  if (unexpected.length > 0) throw new Error(`${element.name} has unsupported attributes ${unexpected.join(", ")}.`);
}
function text(element: StructuredElement, name: string, fallback?: string): string {
  const value = element.attributes[name]; if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be text.`); return value.trim();
}
function optionalText(element: StructuredElement, name: string): string | undefined {
  const value = element.attributes[name]; if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be text.`); return value.trim();
}
function ref(raw: MarkupAttributeValue | undefined, label: string, expected: SurfaceResolvedReference["type"], resolve: (path: string) => SurfaceResolvedReference | undefined): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const value = resolve(raw.path); if (value === undefined || !sameType(value.type, expected)) throw new Error(`${label} has the wrong Type.`); return value;
}
function numeric(element: StructuredElement, name: string, fallback?: number): number {
  const raw = optionalText(element, name); if (raw === undefined && fallback !== undefined) return fallback;
  const value = Number(raw); if (!Number.isFinite(value)) throw new Error(`${element.name}.${name} must be numeric.`); return value;
}
function integer(element: StructuredElement, name: string, fallback?: number): number {
  const value = numeric(element, name, fallback); if (!Number.isSafeInteger(value)) throw new Error(`${element.name}.${name} must be an integer.`); return value;
}
function colors(element: StructuredElement, name: string): string[] {
  const values = text(element, name).split(",").map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) throw new Error(`${element.name}.${name} requires colors.`); return values;
}
function content(element: StructuredElement): { readonly value: ScreenOverlayComponent; readonly attributes: readonly string[] } {
  const name = element.name.split(":").at(-1);
  switch (name) {
    case "Flash": return { value: { kind: "flash", color: text(element, "color"), intensity: numeric(element, "intensity"), attackFrames: integer(element, "attack"), holdFrames: integer(element, "hold"), decayFrames: integer(element, "decay") }, attributes: ["color", "intensity", "attack", "hold", "decay"] };
    case "ColorWash": return { value: { kind: "color-wash", color: text(element, "color"), opacity: numeric(element, "opacity") }, attributes: ["color", "opacity"] };
    case "Vignette": return { value: { kind: "vignette", center: { x: numeric(element, "center-x"), y: numeric(element, "center-y") }, radius: { x: numeric(element, "radius-x"), y: numeric(element, "radius-y") }, softness: numeric(element, "softness"), color: text(element, "color"), opacity: numeric(element, "opacity") }, attributes: ["center-x", "center-y", "radius-x", "radius-y", "softness", "color", "opacity"] };
    case "ScanLines": return { value: { kind: "scan-lines", spacingPx: numeric(element, "spacing"), thicknessPx: numeric(element, "thickness"), angleDeg: numeric(element, "angle"), opacity: numeric(element, "opacity"), travelPx: numeric(element, "travel") }, attributes: ["spacing", "thickness", "angle", "opacity", "travel"] };
    case "DirectionalMatte": return { value: { kind: "directional-matte", angleDeg: numeric(element, "angle"), coverage: numeric(element, "coverage"), feather: numeric(element, "feather"), color: text(element, "color"), opacity: numeric(element, "opacity"), progress: { from: numeric(element, "from"), to: numeric(element, "to") } }, attributes: ["angle", "coverage", "feather", "color", "opacity", "from", "to"] };
    case "WhipVeil": return { value: { kind: "whip-veil", direction: text(element, "direction") as "left", widthPx: numeric(element, "width"), softnessPx: numeric(element, "softness"), travelPx: numeric(element, "travel"), opacity: numeric(element, "opacity") }, attributes: ["direction", "width", "softness", "travel", "opacity"] };
    case "GlitchVeil": return { value: { kind: "glitch-veil", bars: integer(element, "bars"), colors: colors(element, "colors"), opacity: numeric(element, "opacity"), travelPx: numeric(element, "travel"), seed: integer(element, "seed") }, attributes: ["bars", "colors", "opacity", "travel", "seed"] };
    case "Grain": return { value: { kind: "grain", amount: numeric(element, "amount"), grainSizePx: numeric(element, "size"), chroma: text(element, "chroma") as "monochrome", motionRatePxPerFrame: numeric(element, "motion-rate"), seed: integer(element, "seed") }, attributes: ["amount", "size", "chroma", "motion-rate", "seed"] };
    case "LightLeak": return { value: { kind: "light-leak", colors: colors(element, "colors"), angleDeg: numeric(element, "angle"), softness: numeric(element, "softness"), travelPx: numeric(element, "travel"), intensity: numeric(element, "intensity"), seed: integer(element, "seed") }, attributes: ["colors", "angle", "softness", "travel", "intensity", "seed"] };
    case "Bokeh": return { value: { kind: "bokeh", amount: numeric(element, "amount"), sizeMinPx: numeric(element, "min-size"), sizeMaxPx: numeric(element, "max-size"), color: text(element, "color"), warmth: numeric(element, "warmth"), driftPx: numeric(element, "drift"), seed: integer(element, "seed") }, attributes: ["amount", "min-size", "max-size", "color", "warmth", "drift", "seed"] };
    case "TVStatic": return { value: { kind: "tv-static", amount: numeric(element, "amount"), noiseSizePx: numeric(element, "size"), scanLineOpacity: numeric(element, "scan-lines"), motionRatePxPerFrame: numeric(element, "motion-rate"), seed: integer(element, "seed") }, attributes: ["amount", "size", "scan-lines", "motion-rate", "seed"] };
    default: throw new Error(`${element.name} is not an official self-contained Screen Overlay component.`);
  }
}

export const decodeScreenOverlaySurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "canvas", "semantic"]); const id = text(element, "id");
  const canvas = ref(element.attributes.canvas, `${element.name}.canvas`, spatialTypes.canvas, resolveReference);
  const semantic = ref(element.attributes.semantic, `${element.name}.semantic`, semanticTrackTypes.track, resolveReference);
  const headerId = `${id}.header`; const records: SurfaceRecordDraft[] = [{ id: headerId, type: screenOverlayTypes.header,
    value: { kind: "inline", value: sealScreenOverlayHeader({ id }) }, range: element.range }];
  const temporalComponents: SurfaceComponentDraft[] = [];
  const temporalFragments: ReturnType<typeof createTemporalWindowProjection>["fragments"][number][] = [];
  const fragmentItems: Parameters<typeof createScreenOverlayFragment>[0][number][] = [];
  const inputs: Record<string, typeof canvas.ref> = { canvas: canvas.ref, header: { kind: "record", id: headerId }, semantic: semantic.ref };
  let index = 0;
  for (const child of element.children) {
    if (child.kind === "text") { if (child.value.trim()) throw new Error(`${element.name} accepts only component children.`); continue; }
    if (child.children.some((node) => node.kind === "element" || node.value.trim())) throw new Error(`${child.name} must be empty.`);
    index += 1; const suffix = String(index).padStart(4, "0"); const decoded = content(child);
    allowed(child, ["id", "z", ...TIMING, ...decoded.attributes]);
    const itemSpec = sealScreenOverlayItemSpec({
      id: optionalText(child, "id") ?? `${id}.${decoded.value.kind}.${suffix}`, content: decoded.value,
      stackingOrder: integer(child, "z") });
    const temporal = createTemporalWindowProjection({ id: itemSpec.id, element: child, semantic, resolveReference });
    records.push(...temporal.records); temporalComponents.push(...temporal.components); temporalFragments.push(...temporal.fragments);
    const specId = `${id}.item.${suffix}.spec`; const specName = `item-${suffix}-spec`;
    records.push({ id: specId, type: screenOverlayTypes.itemSpec, value: { kind: "inline", value: itemSpec }, range: child.range });
    const windowName = `item-${suffix}-window`;
    inputs[specName] = { kind: "record", id: specId }; inputs[windowName] = temporal.ref;
    fragmentItems.push({ specName, windowName });
  }
  if (fragmentItems.length === 0) throw new Error(`${element.name} requires at least one component.`);
  const fragment = createScreenOverlayFragment(fragmentItems);
  return { records, components: [...temporalComponents, { id, fragment: fragment.id, inputs, outputs: { program: `${id}.program`, track: `${id}.track` }, range: element.range }], fragments: [...temporalFragments, fragment], exports: [`${id}.program`, `${id}.track`] };
};
