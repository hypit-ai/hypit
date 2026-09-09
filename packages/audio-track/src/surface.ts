import { createTemporalSpace, resolveTemporalContext } from "@hypit/temporal-markup";
import { mediaTypes } from "@hypit/media";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceComponentDraft,
  SurfaceRecordDraft,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@hypit/markup";
import type { TemporalDuration } from "@hypit/temporal";
import { createTemporalWindowProjection, temporalWindowAttributeNames } from "@hypit/temporal-markup";

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

export const decodeAudioTrackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "semantic", "space"]);
  const id = text(element, "id");
  const context = resolveTemporalContext({ element, resolveReference });
  const time = createTemporalSpace({ id: id, element, ...context });
  const headerId = `${id}.header`;
  const records: SurfaceRecordDraft[] = [{
    id: headerId,
    type: audioTrackTypes.header,
    value: { kind: "inline", value: sealAudioTrackHeader({ id }) },
    range: element.range,
  }];
  const temporalComponents: SurfaceComponentDraft[] = [...time.components];
  const temporalFragments: ReturnType<typeof createTemporalWindowProjection>["fragments"][number][] = [...time.fragments];
  const fragmentItems: Parameters<typeof createAudioTrackFragment>[0][number][] = [];
  const inputs: Record<string, { kind: "record"; id: string } | { kind: "component-output"; component: string; output: string }> = {
    header: { kind: "record", id: headerId },
    space: time.space.ref,
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
      "id", "source", ...temporalWindowAttributeNames,
      "trim-start", "trim-end", "playback", "min-rate", "max-rate", "gain", "fade-in", "fade-out",
    ]);
    itemIndex += 1;
    const suffix = String(itemIndex).padStart(4, "0");
    const clipId = optionalText(child, "id") ?? `${id}.clip.${suffix}`;
    const source = resolved(child.attributes.source, `${child.name}.source`, mediaTypes.synchronized, resolveReference);
    const temporal = createTemporalWindowProjection({ id: clipId, element: child, ...context, space: time.space, resolveReference });
    records.push(...temporal.records);
    temporalComponents.push(...temporal.components);
    temporalFragments.push(...temporal.fragments);
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
    const windowName = `item-${suffix}-window`;
    inputs[windowName] = temporal.ref;
    const mediaName = `item-${suffix}-media`;
    const specName = `item-${suffix}-spec`;
    const specId = `${id}.clip.${suffix}.spec`;
    records.push({ id: specId, type: audioTrackTypes.clipSpec, value: { kind: "inline", value: clipSpec }, range: child.range });
    inputs[mediaName] = source.ref;
    inputs[specName] = { kind: "record", id: specId };
    fragmentItems.push({ mediaName, specName, windowName });
  }
  if (fragmentItems.length === 0) throw new Error(`${element.name} requires at least one Clip.`);
  const fragment = createAudioTrackFragment(fragmentItems);
  return {
    records,
    components: [...temporalComponents, {
      id,
      fragment: fragment.id,
      inputs,
      outputs: { program: `${id}.program`, track: `${id}.track` },
      range: element.range,
    }],
    fragments: [...temporalFragments, fragment],
    exports: [`${id}.program`, `${id}.track`],
  };
};
