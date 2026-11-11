import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type { MediaAssetDocument } from "@hypit/media-asset";
import { readMediaAssetDocumentFile } from "@hypit/media-asset/node";
import { renderStoryboardAtlas, renderWaveform } from "@hypit/media-file-local";
import type { NleItem, NleMediaItem, NleProject, NleTrack } from "@hypit/nle";
import type { NleTimelineItemObservation } from "@hypit/nle-view";
import {
  composeTemporalMaps,
  evaluateTemporalMap,
  exactTemporalZero,
  isAffineTemporalMapPiece,
  type ExactTemporalValue,
  type LocalTemporalDomain,
  type TemporalMap,
} from "@hypit/temporal/algebra";
import { projectReference } from "./project-path.js";

type PreviewDescriptor = {
  readonly item: NleMediaItem;
  readonly track: NleTrack;
  readonly file: string;
  readonly mediaType: string;
  readonly document: MediaAssetDocument;
  readonly kind: "image" | "storyboard" | "waveform";
  readonly map?: TemporalMap;
  readonly direction?: "forward" | "reverse";
};

type PreviewKind = PreviewDescriptor["kind"];

export type NleItemPreview = {
  readonly bytes: Buffer;
  readonly mediaType: string;
  readonly storyboard?: {
    readonly count: number;
    readonly columns: number;
    readonly rows: number;
    readonly tileWidth: number;
    readonly tileHeight: number;
    readonly sampleFps: number;
  };
};

function seconds(value: ExactTemporalValue): number {
  return Number(BigInt(value.ticks)) * value.timeBase.numerator / value.timeBase.denominator;
}

function inside(base: string, path: string, label: string): string {
  const target = resolve(base, path);
  const local = relative(base, target);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`)
    || isAbsolute(local) || resolve(base, local) !== target) {
    throw new Error(`${label} ${path} leaves ${base}.`);
  }
  return target;
}

function itemMap(item: NleMediaItem, source: LocalTemporalDomain): TemporalMap {
  return {
    stages: [{
      target: { id: `${item.id}:timeline-preview`, duration: structuredClone(item.duration) },
      source: structuredClone(source),
      pieces: structuredClone(item.sourceTime.pieces),
    }],
  };
}

function simpleDirection(map: TemporalMap): "forward" | "reverse" | undefined {
  let direction = 1;
  for (const stage of map.stages) {
    if (stage.pieces.length !== 1) return undefined;
    const piece = stage.pieces[0]!;
    if (!isAffineTemporalMapPiece(piece) || piece.wrap !== undefined || piece.rate.numerator === 0) return undefined;
    direction *= Math.sign(piece.rate.numerator);
  }
  return direction < 0 ? "reverse" : "forward";
}

function sourceMap(item: NleMediaItem, document: MediaAssetDocument, medium: "picture" | "audio"): TemporalMap | undefined {
  const media = document.media.interpretation;
  if (media.domain === undefined) return undefined;
  if (medium === "picture") {
    if (media.picture === undefined || media.picture.kind === "constant") return undefined;
    return composeTemporalMaps(itemMap(item, media.domain), media.picture.map);
  }
  if (media.audio === undefined) return undefined;
  return composeTemporalMaps(itemMap(item, media.domain), media.audio.map);
}

function previewUrl(item: string, revision: number, kind: PreviewKind): string {
  return `/api/nle/item-preview/${encodeURIComponent(item)}?revision=${revision}&kind=${kind}`;
}

function mediaItem(project: NleProject, id: string): { readonly track: NleTrack; readonly item: NleMediaItem } | undefined {
  for (const track of project.tracks) {
    const item = track.items.find((candidate): candidate is NleMediaItem =>
      candidate.id === id && candidate.kind === "present" && candidate.source === "media");
    if (item !== undefined) return { track, item };
  }
  return undefined;
}

export class NlePreviewCache {
  private revision = -1;
  private descriptors = new Map<string, PreviewDescriptor>();
  private generated = new Map<string, Promise<NleItemPreview>>();

  constructor(private readonly projectRoot: string, private readonly projectFile: string) {}

  invalidate(): void {
    this.revision = -1;
    this.descriptors.clear();
    this.generated.clear();
  }

  private async descriptorsFor(
    project: NleProject,
    track: NleTrack,
    item: NleMediaItem,
  ): Promise<readonly PreviewDescriptor[]> {
    const manifest = projectReference(
      this.projectRoot, this.projectFile, item.asset.path, `NLE Item ${item.id} Media Asset`,
    );
    const document = await readMediaAssetDocumentFile(manifest);
    const file = inside(dirname(manifest), document.media.file.path, `Media Asset ${document.id} file`);
    const picture = document.media.interpretation.picture;
    const audio = document.media.interpretation.audio;
    const descriptors: PreviewDescriptor[] = [];
    if (track.kind === "picture" && picture?.kind === "constant") {
      descriptors.push({ item, track, file, mediaType: document.media.file.mediaType, document, kind: "image" });
    } else if (track.kind === "picture" && picture !== undefined) {
      const map = sourceMap(item, document, "picture");
      if (map !== undefined) {
        const direction = simpleDirection(map);
        descriptors.push(direction === undefined
          ? { item, track, file, mediaType: document.media.file.mediaType, document, kind: "storyboard", map }
          : { item, track, file, mediaType: document.media.file.mediaType, document, kind: "storyboard", map, direction });
      }
    }
    if (item.audio !== undefined && audio !== undefined) {
      const map = sourceMap(item, document, "audio");
      if (map !== undefined) {
        const direction = simpleDirection(map);
        descriptors.push(direction === undefined
          ? { item, track, file, mediaType: document.media.file.mediaType, document, kind: "waveform", map }
          : { item, track, file, mediaType: document.media.file.mediaType, document, kind: "waveform", map, direction });
      }
    }
    return descriptors;
  }

  async observations(project: NleProject): Promise<readonly NleTimelineItemObservation[]> {
    if (project.revision !== this.revision) {
      this.revision = project.revision;
      this.descriptors.clear();
      this.generated.clear();
    }
    const observations = await Promise.all(project.tracks.flatMap((track) => track.items.map(async (
      item,
    ): Promise<NleTimelineItemObservation | undefined> => {
      if (item.kind !== "present" || item.source !== "media") return undefined;
      try {
        const descriptors = await this.descriptorsFor(project, track, item);
        if (descriptors.length === 0) return undefined;
        for (const descriptor of descriptors) this.descriptors.set(`${item.id}:${descriptor.kind}`, descriptor);
        return {
          item: item.id,
          layers: descriptors.map((descriptor) => {
            const previewKind: "image" | "video" | "audio" = descriptor.kind === "waveform" ? "audio"
              : descriptor.kind === "storyboard" ? "video" : "image";
            const supported = descriptor.kind === "image" || descriptor.direction !== undefined;
            return {
              kind: "preview" as const,
              role: descriptor.kind === "waveform" && track.kind === "picture" ? "decoration" as const : "content" as const,
              preview: supported
                ? { kind: previewKind, state: "ready" as const, resource: previewUrl(item.id, project.revision, descriptor.kind) }
                : { kind: previewKind, state: "unavailable" as const },
              layout: descriptor.kind === "image" || descriptor.kind === "storyboard"
                ? "filmstrip" as const : descriptor.kind,
              ...(descriptor.direction === undefined ? {} : { direction: descriptor.direction }),
            };
          }),
        };
      } catch {
        return undefined;
      }
    })));
    return observations.filter((value): value is NleTimelineItemObservation => value !== undefined);
  }

  async read(project: NleProject, itemId: string, kind: PreviewKind): Promise<NleItemPreview> {
    const key = `${itemId}:${kind}`;
    if (project.revision !== this.revision || !this.descriptors.has(key)) await this.observations(project);
    const descriptor = this.descriptors.get(key);
    if (descriptor === undefined || mediaItem(project, itemId) === undefined) {
      throw new Error(`NLE Item ${itemId} has no available ${kind} preview.`);
    }
    const generatedKey = `${project.revision}:${itemId}:${kind}`;
    const held = this.generated.get(generatedKey);
    if (held !== undefined) return await held;
    const pending = this.generate(descriptor);
    this.generated.set(generatedKey, pending);
    try {
      return await pending;
    } catch (error) {
      this.generated.delete(generatedKey);
      throw error;
    }
  }

  private async generate(descriptor: PreviewDescriptor): Promise<NleItemPreview> {
    if (descriptor.kind === "image") {
      return { bytes: await readFile(descriptor.file), mediaType: descriptor.mediaType };
    }
    if (descriptor.map === undefined) throw new Error(`NLE Item ${descriptor.item.id} preview has no source map.`);
    if (descriptor.kind === "waveform") {
      if (descriptor.direction === undefined) {
        throw new Error(`NLE Item ${descriptor.item.id} waveform requires a single monotone affine source map.`);
      }
      const start = evaluateTemporalMap(descriptor.map, exactTemporalZero(), "after")?.position;
      const end = evaluateTemporalMap(descriptor.map, descriptor.item.duration, "before")?.position;
      if (start === undefined || end === undefined) throw new Error(`NLE Item ${descriptor.item.id} waveform has a source-time gap.`);
      const from = Math.min(seconds(start), seconds(end));
      const until = Math.max(seconds(start), seconds(end));
      if (!(until > from)) throw new Error(`NLE Item ${descriptor.item.id} waveform has no source interval.`);
      const member = descriptor.document.media.interpretation.audio;
      if (member === undefined) throw new Error(`NLE Item ${descriptor.item.id} has no selected audio member.`);
      return {
        bytes: await renderWaveform(descriptor.file, {
          start: from,
          end: until,
          audioStream: member.streamIndex,
          width: 2048,
          height: 96,
          scale: "cbrt",
          filter: "average",
          color: "white",
        }),
        mediaType: "image/png",
      };
    }
    if (descriptor.direction === undefined) {
      throw new Error(`NLE Item ${descriptor.item.id} storyboard requires a single monotone affine source map.`);
    }
    const start = evaluateTemporalMap(descriptor.map, exactTemporalZero(), "after")?.position;
    const end = evaluateTemporalMap(descriptor.map, descriptor.item.duration, "before")?.position;
    if (start === undefined || end === undefined) throw new Error(`NLE Item ${descriptor.item.id} storyboard has a source-time gap.`);
    const from = Math.min(seconds(start), seconds(end));
    const until = Math.max(seconds(start), seconds(end));
    if (!(until > from)) throw new Error(`NLE Item ${descriptor.item.id} storyboard has no source interval.`);
    const atlas = await renderStoryboardAtlas(descriptor.file, { start: from, end: until });
    return {
      bytes: atlas.bytes,
      mediaType: "image/png",
      storyboard: {
        count: atlas.count,
        columns: atlas.columns,
        rows: atlas.rows,
        tileWidth: atlas.tileWidth,
        tileHeight: atlas.tileHeight,
        sampleFps: atlas.sampleFps,
      },
    };
  }
}
