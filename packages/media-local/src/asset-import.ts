import { extname, parse } from "node:path";

import {
  pictureInterpretationProfile,
  selectVideoStream,
  verifyPictureInterpretation,
} from "@hypit/media";
import type {
  MediaInspection,
  MediaSelectionRequest,
  MediaVideoSelector,
} from "@hypit/media";
import type { MediaAssetImportTaskContext } from "@hypit/media-asset";
import {
  importMediaAssetFile,
  type NodeMediaAssetImportResult,
} from "@hypit/media-asset/node";

import { inspectMediaFile } from "./execute.js";

const mediaTypesByExtension: Readonly<Record<string, string>> = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime",
  ".webm": "video/webm", ".mkv": "video/x-matroska",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
  ".aac": "audio/aac", ".flac": "audio/flac", ".ogg": "audio/ogg",
};

export type LocalMediaImportSelection = {
  readonly videoStream?: number | false;
  readonly audioStream?: number | false;
  readonly picture?: "source" | "srgb" | "sdr-bt709";
  readonly spanAuthority?: "video" | "audio";
};

export type LocalMediaAssetImportRequest = LocalMediaImportSelection & {
  readonly sourcePath: string;
  readonly assetPath: string;
  readonly id?: string;
  readonly mediaType?: string;
  readonly filePolicy?: "copy" | "link";
  readonly mediaFile?: string;
  readonly ffprobePath?: string;
  readonly timeoutMs?: number;
  readonly maxProbeOutputBytes?: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function mediaTypeFromFile(path: string): string {
  const mediaType = mediaTypesByExtension[extname(path).toLowerCase()];
  assert(mediaType !== undefined, `Cannot infer a media type for ${path}; provide mediaType explicitly.`);
  return mediaType;
}

/** Canonical local filename extension for one media type supported by direct import. */
export function mediaFileExtension(mediaType: string): string {
  const entry = Object.entries(mediaTypesByExtension).find((item) => item[1] === mediaType);
  assert(entry !== undefined, `Cannot choose a local media filename for ${mediaType}.`);
  return entry[0];
}

export function mediaAssetIdFromFile(path: string): string {
  const normalized = parse(path).name.normalize("NFKD")
    .replace(/[^A-Za-z0-9_.:#-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  const prefixed = /^[A-Za-z]/u.test(normalized) ? normalized : `media-${normalized}`;
  return (prefixed === "media-" ? "media" : prefixed).slice(0, 192);
}

function videoSelector(
  inspection: MediaInspection,
  requested: LocalMediaImportSelection["videoStream"],
): MediaVideoSelector {
  if (requested === false) return { mode: "none" };
  if (requested !== undefined) return { mode: "stream-index", streamIndex: requested };
  const moving = inspection.streams.some((stream) => stream.kind === "video"
    && !stream.disposition.attachedPicture && stream.decodedUnitCount >= 2
    && stream.startPts !== undefined && stream.endPts !== undefined);
  if (moving) return { mode: "primary-moving" };
  const picture = inspection.streams.some((stream) => stream.kind === "video"
    && !stream.disposition.attachedPicture && stream.decodedUnitCount === 1);
  return picture ? { mode: "primary-picture" } : { mode: "none" };
}

/** Default local policy is explicit and replaceable; Media Asset Core owns no stream guesses. */
export function localMediaImportSelection(
  inspection: MediaInspection,
  mediaType: string,
  options: LocalMediaImportSelection = {},
): MediaSelectionRequest {
  const video = videoSelector(inspection, options.videoStream);
  const audio = options.audioStream === false ? { mode: "none" as const }
    : options.audioStream === undefined ? { mode: "default-if-present" as const }
    : { mode: "stream-index" as const, streamIndex: options.audioStream };
  const hasAudio = audio.mode === "stream-index" || (audio.mode === "default-if-present"
    && inspection.streams.some((stream) => stream.kind === "audio"
      && stream.startPts !== undefined && stream.endPts !== undefined));
  if (video.mode === "none") {
    const authority = options.spanAuthority ?? (hasAudio ? "audio" : undefined);
    return {
      video,
      audio,
      picture: { mode: "none" },
      ...(authority === undefined ? {} : { spanAuthority: authority }),
    };
  }
  const selected = selectVideoStream(inspection, video);
  let picture: MediaSelectionRequest["picture"];
  if (options.picture === "source") picture = { mode: "source" };
  else if (options.picture === "srgb" || options.picture === "sdr-bt709") {
    picture = { mode: "explicit", interpretation: pictureInterpretationProfile(options.picture) };
  } else {
    try {
      verifyPictureInterpretation(selected.picture, `Video stream ${selected.index} observed picture`);
      picture = { mode: "source" };
    } catch {
      picture = { mode: "explicit", interpretation: pictureInterpretationProfile(
        mediaType.startsWith("image/") ? "srgb" : "sdr-bt709",
      ) };
    }
  }
  const authority = options.spanAuthority
    ?? (selected.decodedUnitCount >= 2 ? "video" : hasAudio ? "audio" : undefined);
  return { video, audio, picture, ...(authority === undefined ? {} : { spanAuthority: authority }) };
}

export async function importLocalMediaAsset(
  request: LocalMediaAssetImportRequest,
  context: MediaAssetImportTaskContext = {},
): Promise<NodeMediaAssetImportResult> {
  const mediaType = request.mediaType ?? mediaTypeFromFile(request.sourcePath);
  return await importMediaAssetFile({
    sourcePath: request.sourcePath,
    assetPath: request.assetPath,
    id: request.id ?? mediaAssetIdFromFile(request.sourcePath),
    mediaType,
    filePolicy: request.filePolicy ?? "copy",
    ...(request.mediaFile === undefined ? {} : { mediaFile: request.mediaFile }),
  }, {
    inspect: async (path, task) => await inspectMediaFile(path, {
      ...(request.ffprobePath === undefined ? {} : { ffprobePath: request.ffprobePath }),
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      ...(request.maxProbeOutputBytes === undefined ? {} : {
        maxProbeOutputBytes: request.maxProbeOutputBytes,
      }),
      ...(task.signal === undefined ? {} : { signal: task.signal }),
    }),
    select: (inspection) => localMediaImportSelection(inspection, mediaType, {
      ...(request.videoStream === undefined ? {} : { videoStream: request.videoStream }),
      ...(request.audioStream === undefined ? {} : { audioStream: request.audioStream }),
      ...(request.picture === undefined ? {} : { picture: request.picture }),
      ...(request.spanAuthority === undefined ? {} : { spanAuthority: request.spanAuthority }),
    }),
  }, context);
}
