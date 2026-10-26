import { sameType } from "@hypit/hypit/protocol";
import { mediaTypes } from "@hypit/media";
import type { MarkupAttributeValue, StructuredElement, StructuredSurfaceHandler, SurfaceRecordDraft, SurfaceResolvedReference } from "@hypit/hypit/markup";
import {
  parseInlineTemporalRelation,
  parseTemporalDuration,
  resolveTemporalWindowReference,
  resolveTemporalContext,
  temporalWindowAttributeNames,
} from "@hypit/temporal/markup";

import { createAudioTrackFragment } from "./fragment.js";
import { audioTrackTypes } from "./manifest.js";
import { sealAudioClipSpec, sealAudioTrackHeader } from "./program.js";

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

function numeric(element: StructuredElement, name: string, fallback?: number): number {
  const raw = optionalText(element, name);
  if (raw === undefined && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${element.name}.${name} must be a finite number.`);
  return value;
}

export const audioClipDefaults = { gain: 1, "fade-in": "0f", "fade-out": "0f" } as const;

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
      "id", "source", ...temporalWindowAttributeNames, "gain", "fade-in", "fade-out",
    ]);
    clipIndex += 1;
    const suffix = String(clipIndex).padStart(4, "0");
    const clipId = optionalText(child, "id") ?? `${id}.clip.${suffix}`;
    const source = resolved(child.attributes.source, `${child.name}.source`, mediaTypes.prepared, resolveReference);
    const window = resolveTemporalWindowReference({ element: child, resolveReference });
    const sampling = parseInlineTemporalRelation(child);
    const spec = sealAudioClipSpec({
      id: clipId,
      ...(sampling === undefined ? {} : { sampling }),
      mix: {
        gain: numeric(child, "gain", audioClipDefaults.gain),
        fadeIn: parseTemporalDuration(text(child, "fade-in", audioClipDefaults["fade-in"]), `${child.name}.fade-in`),
        fadeOut: parseTemporalDuration(text(child, "fade-out", audioClipDefaults["fade-out"]), `${child.name}.fade-out`),
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
