import { createReadStream } from "node:fs";

import type { AudioProgram } from "@hypit/audio-program";
import { outputFrameCount } from "@hypit/audiovisual-execution";
import type { Facet } from "@hypit/facet";
import { compileGpuCompositionProgramToWebGpuHtmlProgram } from "@hypit/gpu-composition-webgpu-html";
import type { HtmlProgram } from "@hypit/html-program";
import type { MediaDeliverySpec, VisualDeliverySpec } from "@hypit/media";
import { resolveMediaAssetMediaFile } from "@hypit/media-asset/node";
import type { CreateMediaExecutionEnvironmentOptions } from "@hypit/media-local/execution";
import type { NleComposition, NleProject } from "@hypit/nle";
import { createNodeNleMediaResolver } from "@hypit/nle/node";
import {
  createNleAudiovisualLinkHostFromFacets,
  createNleScaledPictureOutput,
  executeNleAudiovisualPictureToHtmlProgram,
  linkNleProjectAudiovisual,
  lowerNleAudiovisualToAudioProgram,
  nleAudiovisualPackagesFromFacets,
  type NleAudiovisualLink,
} from "@hypit/nle-audiovisual";
import { createLocalNlePictureTerminalRuntimes } from "@hypit/nle-audiovisual-local";
import { htmlVideoDeliverySpec } from "@hypit/html-video";
import type { ChromiumHtmlRasterOptions } from "@hypit/html-chromium-local";
import type { BlobRef } from "@hypit/protocol";
import type { ResourceStore, StreamingResourceStore } from "@hypit/resource-store";
import type { FrameSpan, TemporalRange } from "@hypit/temporal";
import { assertFrameSpan, exactTemporalValueFromFrames } from "@hypit/temporal";
import type { TemporalRate } from "@hypit/temporal/algebra";

import { executeLocalNlePictureToGpuCompositionProgram } from "./gpu-picture-execution.js";

export type NodeNleProgrammeResources = {
  /** Stable input/resource domain retained for the lifetime of this prepared Programme. */
  readonly store: ResourceStore;
  /** Bind one project-owned file without making file-system identity part of the AVIR graph. */
  readonly bindFile: (file: string, mediaType: string, signal?: AbortSignal) => Promise<BlobRef>;
  /** Retain a package-declared resource under its declared opaque ResourceId. */
  readonly write: (resource: BlobRef, bytes: Uint8Array, signal?: AbortSignal) => Promise<void>;
};

export type PrepareNodeNleProgrammeRequest = {
  readonly projectRoot: string;
  readonly projectFile: string;
  readonly project: NleProject;
  readonly facets: readonly Facet[];
  readonly resources: NodeNleProgrammeResources;
  readonly signal?: AbortSignal;
  readonly onMediaProgress?: (completed: number, total: number) => void;
};

/**
 * One Programme generation after package resources, Media bindings and NLE→AVIR linking.
 *
 * It deliberately contains no output range, frame rate, pixel extent, Terminal choice or
 * destination. Preview, evidence and delivery close the same live graph differently.
 */
export type PreparedNodeNleProgramme = {
  readonly projectRoot: string;
  readonly projectFile: string;
  readonly project: NleProject;
  readonly facets: readonly Facet[];
  readonly linked: NleAudiovisualLink;
  readonly resources: ResourceStore;
};

export type ClosePreparedNleProgrammeRequest = {
  readonly programme: PreparedNodeNleProgramme;
  /** Request-owned writable resources; defaults to the prepared input resource domain. */
  readonly resources?: ResourceStore;
  readonly pictureTarget?: "html" | "gpu-composition";
  readonly quality?: VisualDeliverySpec["encoding"]["quality"];
  readonly frameRate?: TemporalRate;
  readonly resolution?: { readonly width: number; readonly height: number };
  readonly range?: FrameSpan;
  readonly signal?: AbortSignal;
  readonly html?: Omit<ChromiumHtmlRasterOptions, "resources" | "signal" | "onProgress">;
  readonly media?: Omit<CreateMediaExecutionEnvironmentOptions, "signal">;
};

export type ClosedPreparedNleProgramme = {
  readonly visual: HtmlProgram;
  readonly audio: AudioProgram;
  readonly delivery: MediaDeliverySpec;
  readonly programmeFrameCount: number;
  readonly audioRange?: TemporalRange;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function uniqueMediaAssetCount(project: NleComposition): number {
  const paths = new Set<string>();
  const visit = (composition: NleComposition): void => {
    for (const track of composition.tracks) for (const item of track.items) {
      if (item.kind === "present" && item.source === "media") paths.add(item.asset.path);
      if (item.kind === "present" && item.source === "composition") visit(item.composition);
    }
  };
  visit(project);
  return paths.size;
}

async function bindPackageResources(
  facets: readonly Facet[],
  resources: NodeNleProgrammeResources,
  signal?: AbortSignal,
): Promise<void> {
  const providers = new Set<string>();
  for (const pack of nleAudiovisualPackagesFromFacets(facets)) {
    for (const resource of pack.resources ?? []) {
      signal?.throwIfAborted();
      assert(!providers.has(resource.artifact.resource),
        `NLE Programme resource ${resource.artifact.resource} has multiple package providers.`);
      providers.add(resource.artifact.resource);
      const bytes = await resource.open();
      assert(bytes instanceof Uint8Array && bytes.byteLength === resource.artifact.size,
        `NLE Programme resource ${resource.artifact.resource} returned unexpected bytes.`);
      await resources.write(resource.artifact, bytes, signal);
    }
  }
}

export async function prepareNodeNleProgramme(
  request: PrepareNodeNleProgrammeRequest,
): Promise<PreparedNodeNleProgramme> {
  request.signal?.throwIfAborted();
  await bindPackageResources(request.facets, request.resources, request.signal);

  const total = uniqueMediaAssetCount(request.project);
  let completed = 0;
  request.onMediaProgress?.(completed, total);
  const resolveMedia = await createNodeNleMediaResolver(
    request.projectRoot,
    request.projectFile,
    request.project,
    async manifest => {
      const resolved = await resolveMediaAssetMediaFile(
        manifest,
        async (file, mediaType) => await request.resources.bindFile(file, mediaType, request.signal),
      );
      completed += 1;
      request.onMediaProgress?.(completed, total);
      return resolved;
    },
  );
  request.signal?.throwIfAborted();
  const host = createNleAudiovisualLinkHostFromFacets(request.facets, resolveMedia);
  return {
    projectRoot: request.projectRoot,
    projectFile: request.projectFile,
    project: structuredClone(request.project),
    facets: request.facets,
    linked: linkNleProjectAudiovisual(request.project, host),
    resources: request.resources.store,
  };
}

function temporalRange(span: FrameSpan, frameRate: TemporalRate): TemporalRange {
  return {
    start: exactTemporalValueFromFrames(span.startFrame, { frameRate }),
    end: exactTemporalValueFromFrames(span.endFrameExclusive, { frameRate }),
  };
}

/** Close one prepared Programme for a particular projection or delivery request. */
export async function closePreparedNleProgramme(
  request: ClosePreparedNleProgrammeRequest,
): Promise<ClosedPreparedNleProgramme> {
  const { programme } = request;
  const resources = request.resources ?? programme.resources;
  const output = createNleScaledPictureOutput(
    programme.project,
    request.frameRate ?? { numerator: 30, denominator: 1 },
    request.resolution === undefined
      ? programme.project.canvas
      : { ...request.resolution, clearColor: programme.project.canvas.clearColor },
  );
  const programmeFrameCount = outputFrameCount(programme.linked.program.domain.duration, output.sampling);
  if (request.range !== undefined) assertFrameSpan(request.range, programmeFrameCount);
  const selectedRange = request.range === undefined
    ? undefined
    : temporalRange(request.range, output.sampling.frameRate);
  const delivery = htmlVideoDeliverySpec(request.quality ?? "standard");
  const runtimes = createLocalNlePictureTerminalRuntimes(
    programme.facets,
    programme.linked,
    resources,
    {
      ...(request.media === undefined ? {} : { media: request.media }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    },
  );
  const visual = request.pictureTarget === "gpu-composition"
    ? compileGpuCompositionProgramToWebGpuHtmlProgram(
      await executeLocalNlePictureToGpuCompositionProgram(programme.linked, output, runtimes, {
        resources,
        ...(request.html === undefined ? {} : { html: request.html }),
        ...(request.media?.ffmpegPath === undefined ? {} : { ffmpegPath: request.media.ffmpegPath }),
        ...(request.media?.ffprobePath === undefined ? {} : { ffprobePath: request.media.ffprobePath }),
        ...(request.media?.sharedLibraryPath === undefined
          ? {} : { sharedLibraryPath: request.media.sharedLibraryPath }),
        ...(request.media?.processTimeoutMs === undefined
          ? {} : { processTimeoutMs: request.media.processTimeoutMs }),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      }, selectedRange),
    )
    : await executeNleAudiovisualPictureToHtmlProgram(programme.linked, output, runtimes, selectedRange);
  const audio = lowerNleAudiovisualToAudioProgram(
    programme.linked,
    { sampleRate: delivery.audio.sampleRate },
    { silenceWhenAbsent: true },
  );
  return {
    visual,
    audio,
    delivery,
    programmeFrameCount,
    ...(selectedRange === undefined ? {} : { audioRange: selectedRange }),
  };
}

/** FileResourceStore adapter used by standalone CLI/application actions. */
export function nodeFileProgrammeResources(store: StreamingResourceStore): NodeNleProgrammeResources {
  return {
    store,
    bindFile: async (file, mediaType, signal) => await store.putStream(
      createReadStream(file, signal === undefined ? {} : { signal }),
      mediaType,
      signal === undefined ? {} : { signal },
    ),
    write: async (resource, bytes, signal) => await store.write(
      resource,
      bytes,
      signal === undefined ? {} : { signal },
    ),
  };
}
