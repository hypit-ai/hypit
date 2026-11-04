import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { StudioSnapshot, StudioTrack, TemporalDomainView } from "./shared.js";

type ResultOutput = {
  readonly type: { readonly name: string };
  readonly value: { readonly kind: string; readonly path?: string };
};

type ResultManifest = {
  readonly format: string;
  readonly sourceId: string;
  readonly outputs: Readonly<Record<string, ResultOutput>>;
};

export type ResultMaterial = {
  readonly path: string;
  readonly mediaType: string;
  readonly size: number;
  readonly previewSpan?: { readonly startSec: number; readonly durationSec: number };
};

type LoadedResource = {
  readonly id: string;
  readonly at: readonly (string | number)[];
  readonly mediaType: string;
};

type LoadedOutput = {
  readonly name: string;
  readonly type: string;
  readonly value: unknown;
  readonly resources: readonly LoadedResource[];
};
type Span = { readonly id: string; readonly subjectId?: string; readonly startFrame: number; readonly endFrameExclusive: number };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function objects(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const result: Record<string, unknown>[] = [];
  for (const item of value) {
    const object = record(item);
    if (object !== undefined) result.push(object);
  }
  return result;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function outputs(path: string): Promise<{
  readonly manifest: ResultManifest;
  readonly values: readonly LoadedOutput[];
  readonly materials: ReadonlyMap<string, ResultMaterial>;
}> {
  const manifest = JSON.parse(await readFile(path, "utf8")) as ResultManifest;
  if (manifest.format !== "hypit.build-result@1" || typeof manifest.sourceId !== "string"
    || record(manifest.outputs) === undefined) throw new Error(`${path} is not a Hypit Build Result.`);
  const values: LoadedOutput[] = [];
  const materials = new Map<string, ResultMaterial>();
  for (const [name, output] of Object.entries(manifest.outputs)) {
    if (output.value.kind !== "value" || output.value.path === undefined) continue;
    const resultDirectory = dirname(path);
    const stored = JSON.parse(await readFile(resolve(resultDirectory, output.value.path), "utf8")) as {
      readonly value?: unknown;
      readonly resources?: readonly unknown[];
    };
    if (!("value" in stored)) throw new Error(`Result value ${output.value.path} has no value.`);
    const resources: LoadedResource[] = [];
    for (const candidate of stored.resources ?? []) {
      const resource = record(candidate), file = record(resource?.file);
      const at = resource?.at;
      const mediaType = string(file?.mediaType), size = number(file?.size), kind = string(file?.kind);
      const materialPath = kind === "build-file" && string(file?.path) !== undefined
        ? resolve(resultDirectory, string(file?.path)!)
        : kind === "external-file" && string(file?.uri) !== undefined
          ? fileURLToPath(string(file?.uri)!)
          : undefined;
      if (!Array.isArray(at) || !at.every((part) => typeof part === "string" || typeof part === "number")
        || materialPath === undefined || mediaType === undefined || size === undefined) continue;
      const id = `res_result_${materials.size + 1}`;
      materials.set(id, { path: materialPath, mediaType, size });
      resources.push({ id, at: at as readonly (string | number)[], mediaType });
    }
    values.push({ name, type: output.type.name, value: stored.value, resources });
  }
  attachAudioPreviewSpans(values, materials);
  return { manifest, values, materials };
}

function exactSeconds(value: unknown): number | undefined {
  const input = record(value);
  const base = record(input?.timeBase);
  const ticks = Number(input?.ticks);
  const numerator = number(base?.numerator);
  const denominator = number(base?.denominator);
  return Number.isFinite(ticks) && numerator !== undefined && denominator !== undefined && denominator > 0
    ? ticks * numerator / denominator
    : undefined;
}

function resultSpans(type: string, value: unknown, fps: number): readonly Span[] {
  const track = record(value);
  if (track === undefined) return [];
  if (type === "VisualTrack") {
    const candidates = [...objects(track.items), ...objects(track.presents), ...objects(track.processes), ...objects(track.adjustments)];
    return candidates.flatMap((item, index): Span[] => {
      const span = record(item.span);
      const startFrame = number(span?.startFrame);
      const endFrameExclusive = number(span?.endFrameExclusive);
      if (startFrame === undefined || endFrameExclusive === undefined || endFrameExclusive <= startFrame) return [];
      const subjectId = string(item.subjectId);
      return [{
        id: string(item.id) ?? `${string(track.id) ?? "visual"}-${index + 1}`,
        ...(subjectId === undefined ? {} : { subjectId }),
        startFrame,
        endFrameExclusive,
      }];
    });
  }
  const oldClips = objects(track.clips).flatMap((clip, index): Span[] => {
    const target = record(clip.target);
    const startSample = number(target?.startSample);
    const endSampleExclusive = number(target?.endSampleExclusive);
    if (startSample === undefined || endSampleExclusive === undefined || endSampleExclusive <= startSample) return [];
    return [{
      id: string(clip.id) ?? `${string(track.id) ?? "audio"}-${index + 1}`,
      ...(string(clip.subjectId) === undefined ? {} : { subjectId: string(clip.subjectId)! }),
      startFrame: Math.floor(startSample * fps / 48_000),
      endFrameExclusive: Math.max(1, Math.ceil(endSampleExclusive * fps / 48_000)),
    }];
  });
  const graph = record(track.graph);
  const currentClips = objects(graph?.nodes).flatMap((node, index): Span[] => {
    const clip = record(node.clip);
    const target = record(clip?.target);
    const start = exactSeconds(target?.start);
    const end = exactSeconds(target?.end);
    if (clip === undefined || start === undefined || end === undefined || end <= start) return [];
    return [{
      id: string(clip.id) ?? `${string(track.id) ?? "audio"}-${index + 1}`,
      ...(string(clip.subjectId) === undefined ? {} : { subjectId: string(clip.subjectId)! }),
      startFrame: Math.floor(start * fps),
      endFrameExclusive: Math.max(1, Math.ceil(end * fps)),
    }];
  });
  return oldClips.length > 0 ? oldClips : currentClips;
}

function sourceRange(text: string, id: string): { readonly start: number; readonly end: number } | undefined {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`<[A-Za-z_][A-Za-z0-9_.:-]*\\b[^>]*\\bid\\s*=\\s*["']${escaped}["'][^>]*>`, "u").exec(text)
    ?? new RegExp(`<[A-Za-z_][A-Za-z0-9_.:-]*\\b[^>]*\\bid\\s*=\\s*["']${escaped}["'][^>]*/>`, "u").exec(text);
  return match === null || match.index === undefined ? undefined : { start: match.index, end: match.index + match[0].length };
}

function itemResource(output: LoadedOutput, index: number): LoadedResource | undefined {
  const belongsToItem = (resource: LoadedResource): boolean => {
    const at = resource.at;
    if (output.type === "VisualTrack") {
      return (at[0] === "items" || at[0] === "presents") && at[1] === index;
    }
    return (at[0] === "clips" && at[1] === index)
      || (at[0] === "graph" && at[1] === "nodes" && at[2] === index);
  };
  const candidates = output.resources.filter(belongsToItem);
  return output.type === "AudioTrack"
    ? candidates.find((resource) => resource.mediaType.startsWith("audio/"))
      ?? candidates.find((resource) => resource.mediaType.startsWith("video/"))
    : candidates.find((resource) => resource.mediaType.startsWith("video/"))
      ?? candidates.find((resource) => resource.mediaType.startsWith("image/"));
}

function audioSourceSpan(output: LoadedOutput, index: number): { readonly startSec: number; readonly durationSec: number } | undefined {
  const track = record(output.value);
  if (track === undefined) return undefined;
  const oldClip = objects(track.clips)[index];
  if (oldClip !== undefined) {
    const source = record(oldClip.source);
    const start = number(source?.startSample), end = number(source?.endSampleExclusive);
    return start === undefined || end === undefined || end <= start
      ? undefined : { startSec: start / 48_000, durationSec: (end - start) / 48_000 };
  }
  const graph = record(track.graph), node = objects(graph?.nodes)[index], clip = record(node?.clip);
  const sampling = record(clip?.sampling), stage = objects(sampling?.stages)[0];
  const pieces = objects(stage?.pieces);
  if (clip === undefined || pieces.length !== 1) return undefined;
  const piece = pieces[0]!, target = record(piece.target), rate = record(piece.rate);
  const targetStart = exactSeconds(target?.start), targetEnd = exactSeconds(target?.end);
  const sourceAtStart = exactSeconds(piece.sourceAtStart);
  const rateNumerator = number(rate?.numerator), rateDenominator = number(rate?.denominator);
  const audio = record(record(clip.source)?.audio);
  const presentationStart = exactSeconds(audio?.presentationStart) ?? 0;
  if (targetStart === undefined || targetEnd === undefined || sourceAtStart === undefined
    || rateNumerator === undefined || rateDenominator === undefined || rateDenominator <= 0 || targetEnd <= targetStart) return undefined;
  return {
    startSec: presentationStart + sourceAtStart,
    durationSec: (targetEnd - targetStart) * rateNumerator / rateDenominator,
  };
}

function attachAudioPreviewSpans(values: readonly LoadedOutput[], materials: Map<string, ResultMaterial>): void {
  for (const output of values.filter((candidate) => candidate.type === "AudioTrack")) {
    const track = record(output.value);
    const count = objects(track?.clips).length || objects(record(track?.graph)?.nodes).length;
    for (let index = 0; index < count; index += 1) {
      const resource = itemResource(output, index), span = audioSourceSpan(output, index);
      const material = resource === undefined ? undefined : materials.get(resource.id);
      if (resource !== undefined && span !== undefined && material !== undefined) {
        materials.set(resource.id, { ...material, previewSpan: span });
      }
    }
  }
}

function tracks(values: readonly LoadedOutput[], sourcePath: string, sourceText: string, fps: number): readonly StudioTrack[] {
  const tones = ["blue", "violet", "magenta", "orange", "green", "teal"] as const;
  return values.filter((output) => output.type === "VisualTrack" || output.type === "AudioTrack")
    .map((output, row): StudioTrack => {
      const facet = output.type === "AudioTrack" ? "audio" as const : "visual" as const;
      const address = { output: output.name };
      const spans = resultSpans(output.type, output.value, fps);
      return {
        address,
        label: output.name,
        row,
        items: spans.map((span, index) => {
          const authoredId = span.subjectId ?? span.id;
          const range = sourceRange(sourceText, authoredId) ?? sourceRange(sourceText, output.name.split(".")[0]!);
          const resource = itemResource(output, index);
          const previewKind = facet === "audio" ? "audio" as const
            : resource?.mediaType.startsWith("image/") === true ? "image" as const : "video" as const;
          return {
            id: span.id,
            address: { track: address, item: span.id },
            authoredId,
            display: {
              title: authoredId,
              layers: resource === undefined
                ? [{ kind: "text" as const, role: "content" as const, text: authoredId }]
                : [{ kind: "preview" as const, role: "content" as const,
                  preview: { kind: previewKind, source: { kind: "artifact" as const, resource: resource.id } },
                  layout: facet === "audio" ? "waveform" as const
                    : previewKind === "video" ? "storyboard" as const : "repeat-x" as const }],
            },
            ...(range === undefined ? {} : { elementLocation: { path: sourcePath, range } }),
            startFrame: span.startFrame,
            endFrameExclusive: span.endFrameExclusive,
            stackOrder: index,
            presentation: { kind: "result", chrome: "standard" },
            terminalTargets: [],
            inspector: [],
            editHandles: [],
          };
        }),
        inspectorObjects: [],
        binding: {
          family: "result",
          tone: facet === "audio" ? "green-muted" : tones[row % tones.length]!,
          facet,
          group: { kind: "output", output: output.name },
          icon: facet === "audio" ? "waveform" : "video",
          companion: "studio#result",
          // Keep the established Studio geometry: terminal visual media has room
          // for a filmstrip, while audio remains a shorter waveform lane.
          lane: { heightPx: facet === "audio" ? 48 : 76 },
        },
      };
    });
}

function durationFrames(value: string, fps: number, frameCount: number): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "start" || trimmed === "timeline.start") return 0;
  if (trimmed === "end" || trimmed === "timeline.end") return frameCount;
  const match = /^(\d+(?:\.\d+)?)(f|ms|s)$/u.exec(trimmed);
  if (match === null) return undefined;
  const amount = Number(match[1]);
  return match[2] === "f" ? Math.round(amount) : match[2] === "ms" ? Math.round(amount / 1_000 * fps) : Math.round(amount * fps);
}

function sourceTemporalItems(text: string, fps: number, frameCount: number) {
  const points: { id: string; frame: number; range: { start: number; end: number } }[] = [];
  const spans: { id: string; startFrame: number; endFrameExclusive: number; range: { start: number; end: number } }[] = [];
  const expression = /<([A-Za-z_][A-Za-z0-9_.-]*):(?:Instant|Window)\b([^>]*?)\/?\s*>/gu;
  for (const match of text.matchAll(expression)) {
    const attributes = match[2] ?? "";
    const read = (name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "u").exec(attributes)?.[1];
    const id = read("id");
    if (id === undefined || match.index === undefined) continue;
    const range = { start: match.index, end: match.index + match[0].length };
    const at = read("at");
    if (at !== undefined) {
      const frame = durationFrames(at, fps, frameCount);
      if (frame !== undefined) points.push({ id, frame, range });
      continue;
    }
    const from = read("from"), until = read("until"), length = read("for");
    const start = from === undefined ? undefined : durationFrames(from, fps, frameCount);
    const end = until === undefined ? undefined : durationFrames(until, fps, frameCount);
    const extent = length === undefined ? undefined : durationFrames(length, fps, frameCount);
    const startFrame = start ?? (end !== undefined && extent !== undefined ? end - extent : undefined);
    const endFrameExclusive = end ?? (start !== undefined && extent !== undefined ? start + extent : undefined);
    if (startFrame !== undefined && endFrameExclusive !== undefined && endFrameExclusive > startFrame) {
      spans.push({ id, startFrame, endFrameExclusive, range });
    }
  }
  return { points, spans };
}

function temporalDomain(values: readonly LoadedOutput[], sourcePath: string, sourceText: string,
  timelineId: string, fps: number, frameCount: number): TemporalDomainView {
  const resultPoints = values.filter((output) => output.type === "TemporalInstant").flatMap((output) => {
    const value = record(output.value), frame = number(value?.frame);
    return frame === undefined ? [] : [{ id: output.name, frame, range: sourceRange(sourceText, output.name) }];
  });
  const resultSpans = values.filter((output) => output.type === "TemporalWindow").flatMap((output) => {
    const value = record(output.value), span = record(value?.span);
    const startFrame = number(span?.startFrame), endFrameExclusive = number(span?.endFrameExclusive);
    return startFrame === undefined || endFrameExclusive === undefined ? []
      : [{ id: output.name, startFrame, endFrameExclusive, range: sourceRange(sourceText, output.name) }];
  });
  const source = sourceTemporalItems(sourceText, fps, frameCount);
  const points = resultPoints.length > 0 ? resultPoints : source.points;
  const spans = resultSpans.length > 0 ? resultSpans : source.spans;
  const narrative = record(values.find((output) => output.type === "NarrativeProjection")?.value);
  const narrativeBoundaries = new Map(objects(narrative?.boundaries).flatMap((boundary) => {
    const id = string(boundary.id), frame = number(boundary.frame);
    return id === undefined || frame === undefined ? [] : [[id, frame] as const];
  }));
  const words = objects(narrative?.tokens).flatMap((token) => {
    const id = string(token.tokenId), text = string(token.text);
    const start = narrativeBoundaries.get(string(token.startBoundaryId) ?? "");
    const end = narrativeBoundaries.get(string(token.endBoundaryId) ?? "");
    return id === undefined || text === undefined || start === undefined || end === undefined || end <= start
      ? [] : [{ id, text, startFrame: start, endFrameExclusive: end }];
  });
  const anchors = [
    ...points.map((item) => ({ id: `${item.id}:point`, kind: "instant", frame: item.frame, label: item.id,
      ...(item.range === undefined ? {} : { range: item.range }) })),
    ...spans.flatMap((item) => [
      { id: `${item.id}:start`, kind: "start", frame: item.startFrame },
      { id: `${item.id}:end`, kind: "end", frame: item.endFrameExclusive },
    ]),
    ...words.flatMap((item) => [
      { id: `${item.id}:start`, kind: "word-start", frame: item.startFrame },
      { id: `${item.id}:end`, kind: "word-end", frame: item.endFrameExclusive },
    ]),
  ];
  return {
    id: "result-time",
    companion: "studio#result-time",
    timelineId,
    presentation: { family: "temporal", tone: "teal", label: "Time", icon: "timeline" },
    lanes: [
      ...(spans.length === 0 ? [] : [{ id: "windows", label: "Windows", heightPx: 15 }]),
      ...(points.length === 0 ? [] : [{ id: "instants", label: "Instants", heightPx: 15 }]),
      ...(words.length === 0 ? [] : [{ id: "words", label: "Words", heightPx: 15 }]),
    ],
    anchors,
    items: [
      ...spans.map((item) => ({ kind: "span" as const, appearance: "block" as const, id: item.id, laneId: "windows",
        label: item.id, startAnchorId: `${item.id}:start`, endAnchorId: `${item.id}:end`,
        startFrame: item.startFrame, endFrameExclusive: item.endFrameExclusive,
        ...(item.range === undefined ? {} : { range: item.range }) })),
      ...points.map((item) => ({ kind: "point" as const, appearance: "marker" as const, id: item.id, laneId: "instants",
        label: item.id, anchorId: `${item.id}:point`, frame: item.frame,
        ...(item.range === undefined ? {} : { range: item.range }) })),
      ...words.map((item) => ({ kind: "span" as const, appearance: "compact" as const, id: item.id, laneId: "words",
        label: item.text, startAnchorId: `${item.id}:start`, endAnchorId: `${item.id}:end`,
        startFrame: item.startFrame, endFrameExclusive: item.endFrameExclusive })),
    ],
    editItems: [],
    source: { path: sourcePath, content: { start: 0, end: sourceText.length } },
  };
}

export async function readResultProjection(input: {
  readonly path: string;
  readonly sourcePath: string;
  readonly sourceText: string;
  readonly workspaceRoot: string;
}): Promise<Pick<StudioSnapshot, "canvas" | "timeline" | "tracks" | "temporalDomains"> & {
  readonly materials: ReadonlyMap<string, ResultMaterial>;
}> {
  const loaded = await outputs(input.path);
  const expectedSource = relative(input.workspaceRoot, input.sourcePath).replaceAll("\\", "/");
  if (loaded.manifest.sourceId.replaceAll("\\", "/") !== expectedSource) {
    throw new Error(`Result Source ${loaded.manifest.sourceId} does not match ${expectedSource}.`);
  }
  const timelineOutput = loaded.values.find((output) => output.type === "Timeline");
  const timelineValue = record(timelineOutput?.value);
  const rate = record(timelineValue?.frameRate);
  const numerator = number(rate?.numerator), denominator = number(rate?.denominator);
  if (timelineOutput === undefined || numerator === undefined || denominator === undefined || denominator <= 0) {
    throw new Error("Result has no valid Timeline.");
  }
  const fps = numerator / denominator;
  const frameCount = number(timelineValue?.frameCount)
    ?? Math.round((number(timelineValue?.durationSec) ?? 0) * fps);
  if (!Number.isSafeInteger(frameCount) || frameCount <= 0) throw new Error("Result Timeline has no finite extent.");
  const composition = record(loaded.values.find((output) => output.type === "Composition")?.value);
  const canvas = record(composition?.canvas);
  const width = number(canvas?.width), height = number(canvas?.height);
  if (width === undefined || height === undefined) throw new Error("Result Composition has no Canvas.");
  const sourcePath = relative(input.workspaceRoot, input.sourcePath);
  return {
    canvas: { width, height, clearColor: string(canvas?.clearColor) ?? "#000000" },
    timeline: { frameRate: { numerator, denominator }, frameCount, durationSec: frameCount / fps },
    tracks: tracks(loaded.values, sourcePath, input.sourceText, fps),
    temporalDomains: [temporalDomain(loaded.values, sourcePath, input.sourceText,
      string(timelineValue?.id) ?? timelineOutput.name, fps, frameCount)],
    materials: loaded.materials,
  };
}
