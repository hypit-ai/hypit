import { createHash } from "node:crypto";
import type { ProjectMediaCatalog } from "@hypit/media-asset/service";
import { nleCompositionDuration, nleItemEnd, nleTimeMappingRequiredDuration,
  type NleComposition, type NlePresentItem, type NleProject } from "@hypit/nle";
import { compareExactTemporalValues, type ExactTemporalValue, type TemporalMap } from "@hypit/temporal/algebra";
import type { NleStudioRenderedPictureTarget, NleStudioTimelinePreview } from "./protocol.js";

function sourceClock(item: NlePresentItem, duration: ExactTemporalValue): TemporalMap {
  const required = nleTimeMappingRequiredDuration(item.sourceTime);
  return { stages: [{
    target: { id: "item", duration: item.duration },
    source: { id: "source", duration: compareExactTemporalValues(required, duration) > 0 ? required : duration },
    pieces: item.sourceTime.pieces,
  }] };
}

type MediaIdentity = (path: string, item: string) => string;

/** Snapshot freshness. Sample reuse is decided using the compiled program. */
export function renderedPreviewVersion(revision: number, generation: number, target: NleStudioRenderedPictureTarget): string {
  return createHash("sha256").update(JSON.stringify([revision, generation, target])).digest("hex");
}

export function timelinePreviewSources(
  project: NleProject,
  composition: NleComposition,
  catalog: ProjectMediaCatalog,
  mediaIdentity: MediaIdentity,
  options: {
    readonly media: boolean; readonly renderedPicture: boolean; readonly renderedAudio: boolean; readonly revision: number;
  },
): Readonly<Record<string, NleStudioTimelinePreview>> {
  const entries = new Map(catalog.entries.map(entry => [entry.reference.path, entry]));
  const children = new Map(project.compositions.map(child => [child.id, child]));
  const versions = new Map<string, string>();
  const audioOutputs = new Map<string, boolean>();
  const hasAudio = (child: NleComposition): boolean => {
    const cached = audioOutputs.get(child.id);
    if (cached !== undefined) return cached;
    const audible = child.tracks.some(track => track.enabled && track.items.some(item => {
      if (!item.enabled) return false;
      if (item.kind === "adjust") return track.kind === "audio";
      if (item.audio === undefined) return false;
      return item.source !== "composition" || hasAudio(children.get(item.composition)!)
        || item.audio.processes?.some(process => process.enabled) === true;
    }));
    audioOutputs.set(child.id, audible);
    return audible;
  };
  const result: [string, NleStudioTimelinePreview][] = [];
  for (const track of composition.tracks) {
    if (track.role !== "picture" && track.role !== "audio") continue;
    for (const item of track.items) {
      if (item.kind !== "present") continue;
      if (item.source === "composition") {
        const child = children.get(item.composition)!;
        const duration = nleCompositionDuration(child);
        if (duration.ticks === "0") continue;
        const target = { kind: "composition", composition: child.id } as const;
        const version = versions.get(child.id) ?? renderedPreviewVersion(options.revision, catalog.generation, target);
        versions.set(child.id, version);
        const clock = { duration, sourceTime: sourceClock(item, duration) };
        const picture = options.renderedPicture && item.picture !== undefined
          ? { target, version, ...clock, displayAspectRatio: child.canvas.width / child.canvas.height } : undefined;
        const audio = options.renderedAudio && item.audio !== undefined && hasAudio(child)
          ? { target, version, ...clock } : undefined;
        if (picture !== undefined || audio !== undefined) result.push([item.id, {
          ...(picture === undefined ? {} : { picture }), ...(audio === undefined ? {} : { audio }),
        }]);
        continue;
      }
      if (item.source === "component" && options.renderedPicture && track.role === "picture" && item.picture !== undefined) {
        const target = { kind: "component", composition: composition.id, item: item.id } as const;
        result.push([item.id, { picture: { target,
          version: renderedPreviewVersion(options.revision, catalog.generation, target),
          range: { start: item.start, end: nleItemEnd(item) } } }]);
        continue;
      }
      if (!options.media || item.source !== "media") continue;
      const media = mediaIdentity(item.asset.path, item.id);
      const entry = entries.get(media);
      if (entry?.state !== "available") continue;
      const { picture, duration } = entry;
      const clock = duration === undefined ? undefined : { duration, sourceTime: sourceClock(item, duration) };
      const picturePreview = item.picture !== undefined && picture !== undefined && (picture.kind === "constant" || clock !== undefined)
        ? { media, displayAspectRatio: picture.displayAspectRatio,
          ...(picture.version === undefined ? {} : { version: picture.version }),
          ...(picture.kind === "constant" ? {} : clock) }
        : undefined;
      const audioPreview = item.audio !== undefined && entry.audio && clock !== undefined ? {
        media, ...clock, ...(entry.audioVersion === undefined ? {} : { version: entry.audioVersion }),
      } : undefined;
      if (picturePreview !== undefined || audioPreview !== undefined) result.push([item.id, {
        ...(picturePreview === undefined ? {} : { picture: picturePreview }),
        ...(audioPreview === undefined ? {} : { audio: audioPreview }),
      }]);
    }
  }
  return Object.fromEntries(result);
}
