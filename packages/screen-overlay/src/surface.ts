import { narrativeTypes } from "@narratage/narrative";
import { programSpaceTypes } from "@narratage/program-space";
import { semanticMapTypes } from "@narratage/semantic-map";
import { spatialTypes } from "@narratage/spatial";
import type { StructuredElement, StructuredSurfaceHandler, SurfaceRecordDraft, SurfaceResolvedReference, MarkupAttributeValue } from "@narratage/markup";
import type { TemporalDuration, TemporalPointExpression } from "@narratage/temporal";
import { createScreenOverlayFragment } from "./fragment.js";
import { screenOverlayTypes } from "./manifest.js";
import { sealScreenOverlayHeader, sealScreenOverlayItemSpec } from "./program.js";
import type { ScreenOverlayComponent, ScreenOverlayItemSpec } from "./types.js";

const TIMING = ["during", "at", "for", "start", "end", "selection", "moment", "map", "occurrences"] as const;
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
function gcd(left: number, right: number): number { let a = Math.abs(left); let b = Math.abs(right); while (b !== 0) [a, b] = [b, a % b]; return a; }
function duration(value: string, label: string): TemporalDuration {
  const match = /^(\d+)(?:\.(\d+))?(f|ms|s)$/u.exec(value.trim());
  if (!match) throw new Error(`${label} must be an exact duration.`);
  const whole = Number(match[1]); const fraction = match[2] ?? ""; const unit = match[3];
  if (unit === "f" || unit === "ms") {
    if (fraction) throw new Error(`${label} ${unit} duration must be integral.`);
    return { unit: unit === "f" ? "frames" : "milliseconds", value: whole };
  }
  const scale = 10 ** fraction.length; const numerator = whole * scale + (fraction ? Number(fraction) : 0); const divisor = gcd(numerator, scale);
  return { unit: "seconds", numerator: numerator / divisor, denominator: scale / divisor };
}
function negate(value: TemporalDuration): TemporalDuration { return value.unit === "seconds" ? { ...value, numerator: -value.numerator } : { ...value, value: -value.value }; }
function point(value: string, label: string): TemporalPointExpression {
  const trimmed = value.trim(); const refs = ["program.start", "program.end", "selection.start", "selection.end", "moment.cue"] as const;
  for (const reference of refs) {
    if (trimmed === reference) return { ref: reference };
    const match = new RegExp(`^${reference.replace(".", "\\.")}\\s*([+-])\\s*(.+)$`, "u").exec(trimmed);
    if (match) { const offset = duration(match[2]!, `${label} offset`); return { ref: reference, offset: match[1] === "-" ? negate(offset) : offset }; }
  }
  return { ref: "absolute", at: duration(trimmed, label) };
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
type Binding = { readonly kind: "program" | "selection" | "moment"; readonly projection: ScreenOverlayItemSpec["projection"]; readonly source?: SurfaceResolvedReference; readonly map?: SurfaceResolvedReference };
function binding(element: StructuredElement, resolve: (path: string) => SurfaceResolvedReference | undefined): Binding {
  const during = element.attributes.during; const at = element.attributes.at;
  const start = optionalText(element, "start"); const end = optionalText(element, "end");
  const forms = Number(during !== undefined) + Number(at !== undefined) + Number(start !== undefined || end !== undefined);
  if (forms !== 1) throw new Error(`${element.name} requires exactly one temporal form.`);
  if (during !== undefined) {
    if (typeof during === "string") {
      if (during.trim() !== "program") throw new Error(`${element.name}.during text must be program.`);
      return { kind: "program", projection: { start: { ref: "program.start" }, end: { ref: "program.end" } } };
    }
    return { kind: "selection", source: ref(during, `${element.name}.during`, narrativeTypes.selection, resolve),
      map: ref(element.attributes.map, `${element.name}.map`, semanticMapTypes.complete, resolve),
      projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } } };
  }
  if (at !== undefined) return { kind: "moment", source: ref(at, `${element.name}.at`, narrativeTypes.moment, resolve),
    map: ref(element.attributes.map, `${element.name}.map`, semanticMapTypes.complete, resolve),
    projection: { start: { ref: "moment.cue" }, end: { ref: "moment.cue", offset: duration(text(element, "for"), `${element.name}.for`) } } };
  if (start === undefined || end === undefined) throw new Error(`${element.name} explicit timing requires start and end.`);
  const selection = element.attributes.selection; const moment = element.attributes.moment;
  if (selection !== undefined && moment !== undefined) throw new Error(`${element.name} cannot bind Selection and Moment together.`);
  const projection = { start: point(start, `${element.name}.start`), end: point(end, `${element.name}.end`) };
  if (selection !== undefined) return { kind: "selection", source: ref(selection, `${element.name}.selection`, narrativeTypes.selection, resolve), map: ref(element.attributes.map, `${element.name}.map`, semanticMapTypes.complete, resolve), projection };
  if (moment !== undefined) return { kind: "moment", source: ref(moment, `${element.name}.moment`, narrativeTypes.moment, resolve), map: ref(element.attributes.map, `${element.name}.map`, semanticMapTypes.complete, resolve), projection };
  if (element.attributes.map !== undefined) throw new Error(`${element.name}.map requires a temporal source.`);
  return { kind: "program", projection };
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
  allowed(element, ["id", "canvas", "space"]); const id = text(element, "id");
  const canvas = ref(element.attributes.canvas, `${element.name}.canvas`, spatialTypes.canvas, resolveReference);
  const space = ref(element.attributes.space, `${element.name}.space`, programSpaceTypes.programSpace, resolveReference);
  const headerId = `${id}.header`; const records: SurfaceRecordDraft[] = [{ id: headerId, type: screenOverlayTypes.header,
    value: { kind: "inline", value: sealScreenOverlayHeader({ id }) }, range: element.range }];
  const fragmentItems: Parameters<typeof createScreenOverlayFragment>[0][number][] = [];
  const inputs: Record<string, typeof canvas.ref> = { canvas: canvas.ref, header: { kind: "record", id: headerId }, space: space.ref };
  let index = 0;
  for (const child of element.children) {
    if (child.kind === "text") { if (child.value.trim()) throw new Error(`${element.name} accepts only component children.`); continue; }
    if (child.children.some((node) => node.kind === "element" || node.value.trim())) throw new Error(`${child.name} must be empty.`);
    index += 1; const suffix = String(index).padStart(4, "0"); const decoded = content(child);
    allowed(child, ["id", "z", ...TIMING, ...decoded.attributes]); const temporal = binding(child, resolveReference);
    const occurrences = text(child, "occurrences", "one"); if (occurrences !== "one" && occurrences !== "each") throw new Error(`${child.name}.occurrences is invalid.`);
    const itemSpec = sealScreenOverlayItemSpec({
      id: optionalText(child, "id") ?? `${id}.${decoded.value.kind}.${suffix}`, content: decoded.value,
      projection: temporal.projection, expansion: { kind: occurrences }, stackingOrder: integer(child, "z") });
    const specId = `${id}.item.${suffix}.spec`; const specName = `item-${suffix}-spec`;
    records.push({ id: specId, type: screenOverlayTypes.itemSpec, value: { kind: "inline", value: itemSpec }, range: child.range });
    inputs[specName] = { kind: "record", id: specId };
    if (temporal.kind === "program") fragmentItems.push({ kind: "program", specName });
    else {
      const mapName = `item-${suffix}-map`; const sourceName = `item-${suffix}-${temporal.kind}`;
      inputs[mapName] = temporal.map!.ref; inputs[sourceName] = temporal.source!.ref;
      fragmentItems.push({ kind: temporal.kind, specName, mapName, sourceName });
    }
  }
  if (fragmentItems.length === 0) throw new Error(`${element.name} requires at least one component.`);
  const fragment = createScreenOverlayFragment(fragmentItems);
  return { records, components: [{ id, fragment: fragment.id, inputs, outputs: { program: `${id}.program`, track: `${id}.track` }, range: element.range }], fragments: [fragment] };
};
