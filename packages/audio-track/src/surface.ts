import { sameType } from "@hypit/hypit/protocol";
import { mediaTypes } from "@hypit/media";
import type { MarkupAttributeValue, StructuredElement, StructuredSurfaceHandler, SurfaceRecordDraft, SurfaceResolvedReference } from "@hypit/hypit/markup";
import type { TemporalDuration } from "@hypit/temporal";
import {
  resolveTemporalWindowReference,
  resolveTemporalContext,
  temporalWindowAttributeNames,
} from "@hypit/temporal/markup";

import { createAudioTrackFragment } from "./fragment.js";
import { audioTrackTypes } from "./manifest.js";
import { sealAudioClipSpec, sealAudioTrackHeader } from "./program.js";
import { assertAudioSourceTimeSpec } from "./source-time.js";
import type {
  AudioSourceTimeBounds,
  AudioSourceTimePoint,
  AudioSourceTimeRelation,
  AudioSourceTimeSpec,
} from "./types.js";

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

function numeric(element: StructuredElement, name: string, fallback?: number): number {
  const raw = optionalText(element, name);
  if (raw === undefined && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${element.name}.${name} must be a finite number.`);
  return value;
}

export const audioClipDefaults = { gain: 1, "fade-in": "0f", "fade-out": "0f" } as const;

const MAP_ATTRIBUTES = [
  "target-from", "target-until", "target-at", "source-at", "rate",
  "source-from", "source-until", "wrap-from", "wrap-until", "min-rate", "max-rate",
] as const;

function sourceTimePoint(raw: string | undefined, fallback: "start" | "end", label: string): AudioSourceTimePoint {
  const value = raw ?? fallback;
  if (value === "start" || value === "end") return { edge: value, offset: duration("0f", label) };
  const fromStart = /^(?:start\+)?(.+)$/u.exec(value);
  if (fromStart !== null && !value.startsWith("end-")) {
    return { edge: "start", offset: duration(fromStart[1]!, label) };
  }
  const fromEnd = /^end-(.+)$/u.exec(value);
  if (fromEnd !== null) return { edge: "end", offset: duration(fromEnd[1]!, label) };
  throw new Error(`${label} must be start, end, a duration from start, start+duration or end-duration.`);
}

function sourceTimeBounds(element: StructuredElement, prefix: "target" | "source" | "wrap", required = false): AudioSourceTimeBounds | undefined {
  const from = optionalText(element, `${prefix}-from`);
  const until = optionalText(element, `${prefix}-until`);
  if (!required && from === undefined && until === undefined) return undefined;
  return {
    from: sourceTimePoint(from, "start", `${element.name}.${prefix}-from`),
    until: sourceTimePoint(until, "end", `${element.name}.${prefix}-until`),
  };
}

function rate(raw: string, label: string): { readonly numerator: number; readonly denominator: number } {
  const fraction = /^(\d+)\/([1-9]\d*)$/u.exec(raw);
  if (fraction !== null) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (!Number.isSafeInteger(numerator) || numerator <= 0 || !Number.isSafeInteger(denominator)) {
      throw new Error(`${label} is outside safe arithmetic.`);
    }
    const common = divisor(numerator, denominator);
    return { numerator: numerator / common, denominator: denominator / common };
  }
  const decimal = /^(\d+)(?:\.(\d+))?$/u.exec(raw);
  if (decimal === null) throw new Error(`${label} must be an exact positive integer, decimal or fraction.`);
  const fractional = decimal[2] ?? "";
  const denominator = 10 ** fractional.length;
  const numerator = Number(decimal[1]) * denominator + (fractional.length === 0 ? 0 : Number(fractional));
  if (!Number.isSafeInteger(numerator) || numerator <= 0 || !Number.isSafeInteger(denominator)) {
    throw new Error(`${label} is outside safe arithmetic.`);
  }
  const common = divisor(numerator, denominator);
  return { numerator: numerator / common, denominator: denominator / common };
}

export function decodeAudioSourceTimeRelation(element: StructuredElement): AudioSourceTimeRelation {
  allowed(element, MAP_ATTRIBUTES);
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) throw new Error(`${element.name} must be empty.`);
  const target = sourceTimeBounds(element, "target", true)!;
  const source = sourceTimeBounds(element, "source", true)!;
  const hasRate = element.attributes.rate !== undefined || element.attributes["target-at"] !== undefined
    || element.attributes["source-at"] !== undefined || element.attributes["wrap-from"] !== undefined
    || element.attributes["wrap-until"] !== undefined;
  if (!hasRate) return {
    kind: "fit", target, source,
    ...(element.attributes["min-rate"] === undefined ? {} : { minRate: numeric(element, "min-rate") }),
    ...(element.attributes["max-rate"] === undefined ? {} : { maxRate: numeric(element, "max-rate") }),
  };
  if (element.attributes["min-rate"] !== undefined || element.attributes["max-rate"] !== undefined) {
    throw new Error(`${element.name} rate bounds belong to a fitted Map without rate, anchors or wrap.`);
  }
  const wrap = sourceTimeBounds(element, "wrap");
  return {
    kind: "rate",
    target,
    targetAt: sourceTimePoint(optionalText(element, "target-at"), "start", `${element.name}.target-at`),
    sourceAt: sourceTimePoint(optionalText(element, "source-at"), "start", `${element.name}.source-at`),
    rate: rate(optionalText(element, "rate") ?? "1", `${element.name}.rate`),
    source,
    ...(wrap === undefined ? {} : { wrap }),
  };
}

function sourceTimeFrom(element: StructuredElement,
  resolve: (path: string) => SurfaceResolvedReference | undefined): AudioSourceTimeSpec | undefined {
  const relations = element.children.flatMap((child) => child.kind === "element"
    && (child.name.endsWith(":Map") || child.name === "Map") ? [decodeAudioSourceTimeRelation(child)] : []);
  const inline = relations.length === 0 ? undefined : { relations };
  if (inline !== undefined) assertAudioSourceTimeSpec(inline);
  if (element.attributes["source-time"] === undefined) return inline;
  if (inline !== undefined) throw new Error(`${element.name} cannot combine source-time={AudioSourceTime} with inline Map children.`);
  const value = resolved(element.attributes["source-time"], `${element.name}.source-time`, audioTrackTypes.sourceTime, resolve);
  if (value.record === undefined) throw new Error(`${element.name}.source-time must resolve to an authored value.`);
  const spec = value.record.value as unknown as AudioSourceTimeSpec;
  assertAudioSourceTimeSpec(spec);
  return spec;
}

export const decodeAudioSourceTimeSurface: StructuredSurfaceHandler = ({ element }) => {
  allowed(element, ["id"]);
  const id = text(element, "id");
  const relations: AudioSourceTimeRelation[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Map children.`);
      continue;
    }
    if (!child.name.endsWith(":Map") && child.name !== "Map") throw new Error(`${element.name} accepts only Map children.`);
    relations.push(decodeAudioSourceTimeRelation(child));
  }
  const value = { relations };
  assertAudioSourceTimeSpec(value);
  return { records: [{ id, type: audioTrackTypes.sourceTime, value: (value as never), range: element.range }],
    components: [], exports: [id] };
};

export const decodeAudioTrackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "timeline"]);
  const id = text(element, "id");
  const context = resolveTemporalContext({ element, resolveReference });
  const headerId = `${id}.header`;
  const records: SurfaceRecordDraft[] = [{
    id: headerId,
    type: audioTrackTypes.header,
    value: (sealAudioTrackHeader({ id })),
    range: element.range,
  }];
  const clips: Parameters<typeof createAudioTrackFragment>[0][number][] = [];
  const inputs: Record<string, SurfaceResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {
    header: { kind: "record", id: headerId },
    timeline: context.timeline.ref,
  };
  let clipIndex = 0;
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Clip children.`);
      continue;
    }
    if (!child.name.endsWith(":Clip") && child.name !== "Clip") {
      throw new Error(`${element.name} accepts only Clip children.`);
    }
    for (const node of child.children) {
      if (node.kind === "text") {
        if (node.value.trim()) throw new Error(`${child.name} accepts only Map children.`);
      } else if (!node.name.endsWith(":Map") && node.name !== "Map") throw new Error(`${child.name} accepts only Map children.`);
    }
    allowed(child, [
      "id", "source", "source-time", ...temporalWindowAttributeNames, "gain", "fade-in", "fade-out",
    ]);
    clipIndex += 1;
    const suffix = String(clipIndex).padStart(4, "0");
    const clipId = optionalText(child, "id") ?? `${id}.clip.${suffix}`;
    const source = resolved(child.attributes.source, `${child.name}.source`, mediaTypes.synchronized, resolveReference);
    const window = resolveTemporalWindowReference({ element: child, resolveReference });
    const sourceTime = sourceTimeFrom(child, resolveReference);
    const spec = sealAudioClipSpec({
      id: clipId,
      ...(sourceTime === undefined ? {} : { sourceTime }),
      mix: {
        gain: numeric(child, "gain", audioClipDefaults.gain),
        fadeIn: duration(text(child, "fade-in", audioClipDefaults["fade-in"]), `${child.name}.fade-in`),
        fadeOut: duration(text(child, "fade-out", audioClipDefaults["fade-out"]), `${child.name}.fade-out`),
      },
    });
    const windowName = `clip-${suffix}-window`;
    const mediaName = `clip-${suffix}-media`;
    const specName = `clip-${suffix}-spec`;
    const specId = `${id}.clip.${suffix}.spec`;
    records.push({ id: specId, type: audioTrackTypes.clipSpec, value: (spec), range: child.range });
    inputs[windowName] = window.ref;
    inputs[mediaName] = source.ref;
    inputs[specName] = { kind: "record", id: specId };
    clips.push({ mediaName, specName, windowName });
  }
  if (clips.length === 0) throw new Error(`${element.name} requires at least one Clip.`);
  const fragment = createAudioTrackFragment(clips);
  return {
    records,
    components: [{
      id,
      fragment,
      inputs,
      outputs: { program: `${id}.program`, audio: `${id}.audio` },
      range: element.range,
    }],
    exports: [`${id}.audio`, `${id}.program`],
  };
};
