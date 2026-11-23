import { mediaPreviewSampleRate, waveformPeaksPerBlock, type MediaAudioPeaks, type MediaSourcePreviewRequest } from "@hypit/media";
import type { ProjectMediaPreviewResource } from "@hypit/media-asset/service";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import { useCallback, useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import type { NleStudioRenderedPictureTarget } from "../protocol.js";
import { readAction, startAction } from "./api.js";

export const mediaSeconds = (time: ExactTemporalValue): number => Number(time.ticks) * time.timeBase.numerator / time.timeBase.denominator;
export const sampleTime = (seconds: number): ExactTemporalValue => ({ ticks: String(Math.round(seconds * 1_000_000)),
  timeBase: { numerator: 1, denominator: 1_000_000 } });

export type SourcePreviewBlock = Omit<ProjectMediaPreviewResource, "resource"> & {
  readonly image?: HTMLImageElement;
  readonly envelope?: MediaAudioPeaks;
  readonly start: number;
  readonly end: number;
};

type Selection = DistributiveOmit<MediaSourcePreviewRequest, "kind">;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type PreviewSource =
  | { readonly media: string | undefined; readonly generation: number | undefined; readonly version?: string | undefined; readonly target?: never }
  | { readonly target: NleStudioRenderedPictureTarget; readonly version: string; readonly media?: never; readonly generation?: never };
type Request = PreviewSource & { readonly key: string; readonly selection: Selection };
const empty: readonly SourcePreviewBlock[] = [];
const cache = new Map<string, readonly SourcePreviewBlock[]>();
const listeners = new Map<string, Set<() => void>>();
const queued = new Map<string, Map<symbol, Request>>();
const running = new Set<string>();
const visibleFilmstrips = new Map<string, Set<{ readonly positions: readonly ExactTemporalValue[] }>>();
const retainedBlocks = 192;
const blockBytes = ({ image, envelope }: SourcePreviewBlock) =>
  (image === undefined ? 0 : image.naturalWidth * image.naturalHeight * 4) + (envelope?.peaks.length ?? 0) * 8;

export function sourceBlock(blocks: readonly SourcePreviewBlock[], seconds: number): SourcePreviewBlock | undefined {
  return blocks.find(block => seconds >= block.start && seconds < block.end);
}

function trim(): void {
  let bytes = [...cache.values()].flat().reduce((size, block) => size + blockBytes(block), 0);
  for (const [key, blocks] of cache) {
    if (bytes <= 128 * 1024 * 1024 && cache.size <= 48) break;
    if (listeners.has(key)) continue;
    cache.delete(key);
    for (const block of blocks) bytes -= blockBytes(block);
  }
}

async function loadResource(resource: string, waveform: boolean): Promise<Pick<SourcePreviewBlock, "image" | "envelope">> {
  const response = await fetch(resource);
  if (!response.ok) throw new Error("Source preview resource is unavailable.");
  if (waveform) return { envelope: await response.json() as MediaAudioPeaks };
  const url = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { image };
  } finally { URL.revokeObjectURL(url); }
}

function merge(previous: Selection | undefined, next: Selection): Selection {
  if (previous?.preset === "filmstrip" && next.preset === "filmstrip") {
    const times = new Map([...previous.positions, ...next.positions].map(position => [mediaSeconds(position), position]));
    return { ...next, positions: [...times.values()] };
  }
  if (previous?.preset === "waveform" && next.preset === "waveform") {
    return { ...next, blocks: [...new Set([...previous.blocks, ...next.blocks])] };
  }
  return next;
}

function missing(selection: Selection, current: readonly SourcePreviewBlock[]): Selection | undefined {
  if (selection.preset === "filmstrip") {
    const positions = selection.positions.filter(position => sourceBlock(current, mediaSeconds(position)) === undefined);
    return positions.length === 0 ? undefined : { ...selection, positions };
  }
  const blockSeconds = selection.samplesPerPeak * waveformPeaksPerBlock / mediaPreviewSampleRate;
  const indices = new Set(current.filter(block => block.samplesPerPeak === selection.samplesPerPeak)
    .map(block => Math.round(block.start / blockSeconds)));
  const blocks = selection.blocks.filter(index => !indices.has(index));
  return blocks.length === 0 ? undefined : { ...selection, blocks };
}

async function load({ key, media, generation, target, version, selection }: Request): Promise<void> {
  const needed = missing(selection, cache.get(key) ?? empty);
  if (needed === undefined) return;
  let action;
  if (target !== undefined) {
    if (needed.preset === "filmstrip") {
      action = await startAction({ kind: "picture.source-preview", target, version, positions: needed.positions.slice(0, 24),
        ...(needed.samplesPerSecond === undefined ? {} : { samplesPerSecond: needed.samplesPerSecond }) });
    } else {
      if (target.kind !== "composition") return;
      action = await startAction({ kind: "audio.source-preview", target, version,
        samplesPerPeak: needed.samplesPerPeak, blocks: needed.blocks.slice(0, 64) });
    }
  } else {
    if (media === undefined || generation === undefined) return;
    const request = needed.preset === "filmstrip" ? { ...needed, positions: needed.positions.slice(0, 64) }
      : { ...needed, blocks: needed.blocks.slice(0, 64) };
    action = await startAction({ kind: "media.source-preview", media, expectedMediaGeneration: generation, ...request });
  }
  while (action.state === "queued" || action.state === "running") {
    await new Promise<void>(resolve => window.setTimeout(resolve, 80));
    action = await readAction(action.handle);
  }
  if (action.state === "failed") throw new Error(action.diagnostic);
  if (action.state !== "complete" || action.result.blocks === undefined || action.result.blocks.length === 0) return;
  const waveform = needed.preset === "waveform";
  const decoded: SourcePreviewBlock[] = [];
  const publish = () => publishPreviewBlocks(key, decoded.splice(0));
  await Promise.all(action.result.blocks.map(async ({ resource, ...block }) => {
    try {
      decoded.push({ ...block,
        start: block.range === undefined ? -Infinity : mediaSeconds(block.range.start),
        end: block.range === undefined ? Infinity : mediaSeconds(block.range.end),
        ...(resource === undefined ? {} : await loadResource(resource, waveform)),
      });
      if (!waveform && decoded.length === 1) queueMicrotask(publish);
    } catch (error) { console.warn("Source preview resource could not be read.", error); }
  }));
  publish();
}

function publishPreviewBlocks(key: string, blocks: readonly SourcePreviewBlock[]): void {
  if (blocks.length === 0) return;
  const previous = cache.get(key) ?? empty;
  cache.delete(key);
  const updated = [...previous.filter(old => !blocks.some(block => block.start === old.start
    && block.samplesPerPeak === old.samplesPerPeak)), ...blocks];
  const oldest = Math.max(0, updated.length - retainedBlocks);
  // The history limit can evict old blocks while a large visible window is still filling.
  const demanded = new Set<SourcePreviewBlock>();
  if (oldest > 0) {
    for (const demand of visibleFilmstrips.get(key) ?? []) for (const position of demand.positions) {
      const block = sourceBlock(updated, mediaSeconds(position));
      if (block !== undefined) demanded.add(block);
    }
  }
  cache.set(key, oldest === 0 ? updated : updated.filter((block, index) => index >= oldest || demanded.has(block)));
  listeners.get(key)?.forEach(listener => listener());
  trim();
}

function pump(): void {
  // Serve newly visible coarse strips before starting another refinement.
  const priority = (demands: ReadonlyMap<symbol, Request>) => {
    const selection = demands.values().next().value?.selection;
    return selection?.preset === "filmstrip" ? selection.samplesPerSecond ?? 2 : 2;
  };
  for (const [job, demands] of [...queued].sort((left, right) => priority(left[1]) - priority(right[1]))) {
    if (running.size >= 2) break;
    if (running.has(job)) continue;
    queued.delete(job);
    let request: Request | undefined;
    for (const demand of demands.values()) {
      if (listeners.has(demand.key)) request = { ...demand, selection: merge(request?.selection, demand.selection) };
    }
    if (request === undefined) continue;
    running.add(job);
    void load(request).catch(error => console.warn("Source preview request failed.", error)).finally(() => { running.delete(job); pump(); });
  }
}

export function useSourcePreview(source: PreviewSource, selection: Selection | undefined, active: boolean): readonly SourcePreviewBlock[] {
  const { media, generation, target, version } = source;
  const density = selection?.preset === "filmstrip" ? selection.samplesPerSecond ?? 2 : undefined;
  const key = selection === undefined ? undefined : target !== undefined
    ? JSON.stringify([selection.preset, target, version, density])
    : media === undefined || generation === undefined ? undefined : JSON.stringify(["media", media, version ?? generation, selection.preset, density]);
  const positions = selection?.preset === "filmstrip" ? selection.positions : undefined;
  useLayoutEffect(() => {
    if (!active || key === undefined || positions === undefined) return;
    const demands = visibleFilmstrips.get(key) ?? new Set();
    const demand = { positions };
    demands.add(demand);
    visibleFilmstrips.set(key, demands);
    return () => {
      demands.delete(demand);
      if (demands.size === 0) visibleFilmstrips.delete(key);
    };
  }, [active, key, positions]);
  const subscribe = useCallback((listener: () => void) => {
    if (key === undefined || !active) return () => {};
    const owners = listeners.get(key) ?? new Set<() => void>();
    listeners.set(key, owners);
    owners.add(listener);
    const held = cache.get(key);
    if (held !== undefined) { cache.delete(key); cache.set(key, held); }
    return () => {
      owners.delete(listener);
      if (owners.size > 0) return;
      listeners.delete(key);
      trim();
    };
  }, [active, key]);
  const snapshot = useCallback(() => key === undefined ? empty : cache.get(key) ?? empty, [key]);
  const blocks = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => {
    if (!active || key === undefined || selection === undefined) return;
    const needed = missing(selection, blocks);
    if (needed === undefined) return;
    const job = JSON.stringify([key, needed.preset === "waveform" ? needed.samplesPerPeak : null]);
    const demands = queued.get(job) ?? new Map<symbol, Request>();
    const owner = Symbol();
    demands.set(owner, target === undefined ? { key, media, generation, selection: needed }
      : { key, target, version, selection: needed });
    queued.set(job, demands);
    queueMicrotask(pump);
    return () => {
      demands.delete(owner);
      if (queued.get(job) === demands && demands.size === 0) queued.delete(job);
    };
  }, [active, blocks, target, generation, key, media, selection, version]);
  return blocks;
}
