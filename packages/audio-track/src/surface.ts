import { mediaTypes } from "@hypit/media";
import { narrativeTypes } from "@hypit/narrative";
import { semanticTrackTypes } from "@hypit/semantic-track";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceRecordDraft,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@hypit/markup";
import type { TemporalDuration, TemporalPointExpression, TemporalWindowProjection } from "@hypit/temporal";
import { temporalTypes } from "@hypit/temporal";

import { createAudioTrackFragment } from "./fragment.js";
import { audioTrackTypes } from "./manifest.js";
import { sealAudioClipSpec, sealAudioTrackHeader } from "./program.js";
import type { AudioOccupancy } from "./types.js";

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}

function allowed(element: StructuredElement, names: readonly string[]): void {
  const permit = new Set(names);
  const unexpected = Object.keys(element.attributes).filter((name) => !permit.has(name));
  if (unexpected.length > 0) throw new Error(`${element.name} has unsupported attributes ${unexpected.join(", ")}.`);
}

function text(element: StructuredElement, name: string, fallback?: string): string {
  const value = element.attributes[name];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be text.`);
  return value.trim();
}

function optionalText(element: StructuredElement, name: string): string | undefined {
  const value = element.attributes[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be text.`);
  return value.trim();
}

function resolved(
  raw: MarkupAttributeValue | undefined,
  label: string,
  expected: SurfaceResolvedReference["type"],
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const value = resolve(raw.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`${label} has the wrong Type.`);
  return value;
}

function divisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function duration(value: string, label: string): TemporalDuration {
  const match = /^(\d+)(?:\.(\d+))?(f|ms|s)$/u.exec(value.trim());
  if (!match) throw new Error(`${label} must be an exact duration such as 12f, 250ms or 1.5s.`);
  const whole = Number(match[1]);
  const fraction = match[2] ?? "";
  const unit = match[3];
  if (!Number.isSafeInteger(whole)) throw new Error(`${label} is outside safe arithmetic.`);
  if (unit === "f" || unit === "ms") {
    if (fraction.length > 0) throw new Error(`${label} ${unit} duration must be an integer.`);
    return { unit: unit === "f" ? "frames" : "milliseconds", value: whole };
  }
  const scale = 10 ** fraction.length;
  const numerator = whole * scale + (fraction.length === 0 ? 0 : Number(fraction));
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(scale)) throw new Error(`${label} is outside safe arithmetic.`);
  const gcd = divisor(numerator, scale);
  return { unit: "seconds", numerator: numerator / gcd, denominator: scale / gcd };
}

function negate(value: TemporalDuration): TemporalDuration {
  return value.unit === "seconds"
    ? { ...value, numerator: -value.numerator }
    : { ...value, value: -value.value };
}

function point(value: string, label: string): TemporalPointExpression {
  const trimmed = value.trim();
  const refs = ["program.start", "program.end", "selection.start", "selection.end", "moment.cue"] as const;
  for (const ref of refs) {
    if (trimmed === ref) return { ref };
    const escaped = ref.replace(".", "\\.");
    const match = new RegExp(`^${escaped}\\s*([+-])\\s*(.+)$`, "u").exec(trimmed);
    if (match !== null) {
      const offset = duration(match[2]!, `${label} offset`);
      return { ref, offset: match[1] === "-" ? negate(offset) : offset };
    }
  }
  return { ref: "absolute", at: duration(trimmed, label) };
}

function numeric(element: StructuredElement, name: string, fallback?: number): number {
  const raw = optionalText(element, name);
  if (raw === undefined && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${element.name}.${name} must be a finite number.`);
  return value;
}

function occupancy(element: StructuredElement): AudioOccupancy {
  switch (text(element, "playback", "once")) {
    case "once":
    case "once-start": return { mode: "once", align: "start" };
    case "once-end": return { mode: "once", align: "end" };
    case "loop":
    case "loop-start": return { mode: "loop", align: "start" };
    case "loop-end": return { mode: "loop", align: "end" };
    case "stretch": return {
      mode: "stretch",
      minRate: numeric(element, "min-rate"),
      maxRate: numeric(element, "max-rate"),
      pitch: "preserve",
    };
    default: throw new Error(`${element.name}.playback is unsupported.`);
  }
}

type TemporalBinding = {
  readonly kind: "program" | "selection" | "moment";
  readonly projection: TemporalWindowProjection;
  readonly source?: SurfaceResolvedReference;
};

function temporalBinding(
  element: StructuredElement,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): TemporalBinding {
  const during = element.attributes.during;
  const at = element.attributes.at;
  const explicitStart = optionalText(element, "start");
  const explicitEnd = optionalText(element, "end");
  const selection = element.attributes.selection;
  const moment = element.attributes.moment;
  const forms = Number(during !== undefined) + Number(at !== undefined) + Number(explicitStart !== undefined || explicitEnd !== undefined);
  if (forms !== 1) throw new Error(`${element.name} requires exactly one of during, at/for, or start/end.`);
  if (during !== undefined) {
    if (typeof during === "string") {
      if (during.trim() !== "program") throw new Error(`${element.name}.during text must be program.`);
      return { kind: "program", projection: { start: { ref: "program.start" }, end: { ref: "program.end" } } };
    }
    const source = resolved(during, `${element.name}.during`, narrativeTypes.selection, resolve);
    return { kind: "selection", source, projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } } };
  }
  if (at !== undefined) {
    const source = resolved(at, `${element.name}.at`, narrativeTypes.moment, resolve);
    const forDuration = duration(text(element, "for"), `${element.name}.for`);
    return { kind: "moment", source, projection: {
      start: { ref: "moment.cue" }, end: { ref: "moment.cue", offset: forDuration },
    } };
  }
  if (explicitStart === undefined || explicitEnd === undefined) throw new Error(`${element.name} explicit timing requires start and end.`);
  if (selection !== undefined && moment !== undefined) throw new Error(`${element.name} cannot bind Selection and Moment together.`);
  if (selection !== undefined) return {
    kind: "selection",
    source: resolved(selection, `${element.name}.selection`, narrativeTypes.selection, resolve),
    projection: { start: point(explicitStart, `${element.name}.start`), end: point(explicitEnd, `${element.name}.end`) },
  };
  if (moment !== undefined) return {
    kind: "moment",
    source: resolved(moment, `${element.name}.moment`, narrativeTypes.moment, resolve),
    projection: { start: point(explicitStart, `${element.name}.start`), end: point(explicitEnd, `${element.name}.end`) },
  };
  return {
    kind: "program",
    projection: { start: point(explicitStart, `${element.name}.start`), end: point(explicitEnd, `${element.name}.end`) },
  };
}

export const decodeAudioTrackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "semantic"]);
  const id = text(element, "id");
  const semantic = resolved(element.attributes.semantic, `${element.name}.semantic`, semanticTrackTypes.track, resolveReference);
  const headerId = `${id}.header`;
  const records: SurfaceRecordDraft[] = [{
    id: headerId,
    type: audioTrackTypes.header,
    value: { kind: "inline", value: sealAudioTrackHeader({ id }) },
    range: element.range,
  }];
  const fragmentItems: Parameters<typeof createAudioTrackFragment>[0][number][] = [];
  const inputs: Record<string, { kind: "record"; id: string } | { kind: "component-output"; component: string; output: string }> = {
    header: { kind: "record", id: headerId },
    semantic: semantic.ref,
  };
  let itemIndex = 0;
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Clip children.`);
      continue;
    }
    if (!child.name.endsWith(":Clip") && child.name !== "Clip") throw new Error(`${element.name} accepts only Clip children.`);
    if (child.children.some((node) => node.kind === "element" || node.value.trim())) throw new Error(`${child.name} must be empty.`);
    allowed(child, [
      "id", "source", "during", "at", "for", "start", "end", "selection", "moment",
      "trim-start", "trim-end", "playback", "min-rate", "max-rate", "gain", "fade-in", "fade-out",
    ]);
    itemIndex += 1;
    const suffix = String(itemIndex).padStart(4, "0");
    const clipId = optionalText(child, "id") ?? `${id}.clip.${suffix}`;
    const source = resolved(child.attributes.source, `${child.name}.source`, mediaTypes.synchronized, resolveReference);
    const binding = temporalBinding(child, resolveReference);
    const playback = occupancy(child);
    if (playback.mode !== "stretch" && (child.attributes["min-rate"] !== undefined || child.attributes["max-rate"] !== undefined)) {
      throw new Error(`${child.name} rate bounds require stretch playback.`);
    }
    const clipSpec = sealAudioClipSpec({

      id: clipId,
      trim: {
        ...(optionalText(child, "trim-start") === undefined ? {} : { start: duration(optionalText(child, "trim-start")!, `${child.name}.trim-start`) }),
        ...(optionalText(child, "trim-end") === undefined ? {} : { end: duration(optionalText(child, "trim-end")!, `${child.name}.trim-end`) }),
      },
      occupancy: playback,
      mix: {
        gain: numeric(child, "gain", 1),
        fadeIn: duration(text(child, "fade-in", "0f"), `${child.name}.fade-in`),
        fadeOut: duration(text(child, "fade-out", "0f"), `${child.name}.fade-out`),
      },
    });
    const windowSpecName = `item-${suffix}-window-spec`;
    records.push({ id: `${id}.clip.${suffix}.window`, type: temporalTypes.windowSpec,
      value: { kind: "inline", value: { id: clipId, projection: binding.projection } }, range: child.range });
    inputs[windowSpecName] = { kind: "record", id: `${id}.clip.${suffix}.window` };
    const mediaName = `item-${suffix}-media`;
    const specName = `item-${suffix}-spec`;
    const specId = `${id}.clip.${suffix}.spec`;
    records.push({ id: specId, type: audioTrackTypes.clipSpec, value: { kind: "inline", value: clipSpec }, range: child.range });
    inputs[mediaName] = source.ref;
    inputs[specName] = { kind: "record", id: specId };
    if (binding.kind === "program") {
      fragmentItems.push({ kind: "program", mediaName, specName, windowSpecName });
    } else {
      const sourceName = `item-${suffix}-${binding.kind}`;
      inputs[sourceName] = binding.source!.ref;
      fragmentItems.push({ kind: binding.kind, mediaName, specName, sourceName, windowSpecName });
    }
  }
  if (fragmentItems.length === 0) throw new Error(`${element.name} requires at least one Clip.`);
  const fragment = createAudioTrackFragment(fragmentItems);
  return {
    records,
    components: [{
      id,
      fragment: fragment.id,
      inputs,
      outputs: { program: `${id}.program`, track: `${id}.track` },
      range: element.range,
    }],
    fragments: [fragment],
  };
};
