import { link, mkdir, mkdtemp, open as openFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import type { Facet } from "@hypit/facet";
import type { AudioProgram } from "@hypit/audio-program";
import { loadNodePackageSelection } from "@hypit/loader/node";
import { moduleKey } from "@hypit/module";
import { moduleFacetKind } from "@hypit/module";
import type { ModuleRef } from "@hypit/module";
import { isStreamingResourceStore, type ResourceStore } from "@hypit/resource-store";
import {
  createHtmlVideoDeliveryPlan,
  executeHtmlVideoDeliveryPlan,
  htmlVideoDeliverySpec,
} from "@hypit/html-video";
import type { HtmlVideoDeliveryExecutor } from "@hypit/html-video";
import type { HtmlProgram } from "@hypit/html-program";
import { rasterizeHtmlFrames } from "@hypit/html-chromium-local";
import type { MediaDeliverySpec, MuxedMedia, VisualDeliverySpec } from "@hypit/media";
import type { CreateMediaExecutionEnvironmentOptions } from "@hypit/media-local/execution";
import { assertNleProject, type NleComposition, type NleItem, type NleProject } from "@hypit/nle";
import type { TemporalRate } from "@hypit/temporal/algebra";
import { assertFrameSpan } from "@hypit/temporal";
import type { FrameSpan, TemporalRange } from "@hypit/temporal";
import { readNleProjectFile } from "@hypit/nle/node";
import type {
  ChromiumHtmlRasterOptions,
  HtmlRasterProgress,
} from "@hypit/html-chromium-local";
import { FileResourceStore } from "@hypit/resource-store/node";
import { createLocalNleDeliveryExecutor } from "./delivery.js";
import {
  closePreparedNleProgramme,
  nodeFileProgrammeResources,
  prepareNodeNleProgramme,
  type PreparedNodeNleProgramme,
} from "./programme.js";
import { createNleProgrammeResourceOverlay } from "./resource-overlay.js";

export type LocalNleExportProgress =
  | { readonly phase: "open" | "load-packages" | "lower" | "publish"; readonly state: "start" | "complete" }
  | { readonly phase: "media"; readonly completed: number; readonly total: number }
  | { readonly phase: "picture"; readonly state: "start" | "progress" | "complete"; readonly detail?: HtmlRasterProgress }
  | { readonly phase: "audio" | "mux"; readonly state: "start" | "complete" }
  | { readonly phase: "complete"; readonly outputFile: string };

export type LocalNleProgrammeRequest = {
  /** Application-owned Hypit Project Root used to resolve portable NLE asset references. */
  readonly projectRoot: string;
  readonly projectFile: string;
  /** Optional application-owned current edit snapshot. The Project file remains the base for portable references. */
  readonly project?: NleProject;
  /** Invocation-only Picture root selection. It is never persisted in the Project or AVIR. */
  readonly pictureTarget?: "html" | "gpu-composition";
  /** Package-manager resolution root. Defaults to the Hypit Project Root. */
  readonly packageRoot?: string;
  /** Read-only application Distribution used only as an installed-package fallback. */
  readonly distributionPackageRoot?: string;
  readonly quality?: VisualDeliverySpec["encoding"]["quality"];
  /** Output sampling only. Defaults to 30 fps; editor display rate belongs to the NLE View. */
  readonly frameRate?: TemporalRate;
  /** Same-aspect output pixel extent. Defaults to the Project Programme extent. */
  readonly resolution?: {
    readonly width: number;
    readonly height: number;
  };
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: LocalNleExportProgress) => void;
  readonly html?: Omit<ChromiumHtmlRasterOptions, "resources" | "signal" | "onProgress">;
  readonly media?: Omit<CreateMediaExecutionEnvironmentOptions, "signal">;
};

export type LocalNleExportRequest = LocalNleProgrammeRequest & {
  readonly outputFile: string;
  /** Optional absolute half-open interval on the selected output frame grid. */
  readonly range?: FrameSpan;
};

export type PreparedNleExportRequest = Omit<
  LocalNleExportRequest,
  "projectRoot" | "projectFile" | "project" | "packageRoot" | "distributionPackageRoot"
>;

export type LocalNleFrameCaptureRequest = LocalNleProgrammeRequest & {
  readonly frames: readonly number[];
  /** New directory receiving one full-size PNG per requested absolute frame. */
  readonly toDirectory: string;
};

export type PreparedNleFrameCaptureRequest = Omit<
  LocalNleFrameCaptureRequest,
  "projectRoot" | "projectFile" | "project" | "packageRoot" | "distributionPackageRoot"
>;

export type LocalNleReviewRequest = LocalNleProgrammeRequest & {
  /** Absolute half-open Programme interval used by both Picture and Audio review delivery. */
  readonly range: FrameSpan;
  /** Strictly increasing absolute Programme frames inside range. */
  readonly frames: readonly number[];
  /** New directory receiving review.mp4 and frames/*.png. */
  readonly toDirectory: string;
};

export type PreparedNleReviewRequest = Omit<
  LocalNleReviewRequest,
  "projectRoot" | "projectFile" | "project" | "packageRoot" | "distributionPackageRoot"
>;

export type LocalNleFrameCaptureResult = {
  readonly projectFile: string;
  readonly frameRate: TemporalRate;
  readonly frameCount: number;
  readonly canvas: HtmlProgram["canvas"];
  readonly frames: readonly { readonly frame: number; readonly file: string }[];
};

export type LocalNleFrameCaptureEnvironment = {
  /** Test and embedding seam; normal callers use the built-in Chromium frame rasterizer. */
  readonly rasterizeFrames?: typeof rasterizeHtmlFrames;
};

export type LocalNleReviewResult = {
  readonly projectFile: string;
  readonly toDirectory: string;
  readonly videoFile: string;
  readonly frameRate: TemporalRate;
  /** Full Programme frame count before review selection. */
  readonly programmeFrameCount: number;
  /** Frames delivered by review.mp4. */
  readonly reviewFrameCount: number;
  readonly range: FrameSpan;
  readonly canvas: HtmlProgram["canvas"];
  readonly frames: readonly { readonly frame: number; readonly file: string }[];
};

export type LocalNleExportResult = {
  readonly projectFile: string;
  readonly outputFile: string;
  readonly frameRate: MuxedMedia["frameRate"];
  readonly frameCount: number;
  readonly canvas: MuxedMedia["canvas"];
};

/** Test and embedding seam; normal callers use the built-in Chromium + FFmpeg executor. */
export type LocalNleExportExecutorFactory = (
  resources: ResourceStore,
  context: {
    readonly signal?: AbortSignal;
    readonly onPictureProgress: (progress: HtmlRasterProgress) => void;
  },
) => HtmlVideoDeliveryExecutor;

export type LocalNleExportEnvironment = {
  readonly createExecutor?: LocalNleExportExecutorFactory;
};

export type LocalNleReviewEnvironment = LocalNleExportEnvironment & LocalNleFrameCaptureEnvironment;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function visitProjectModules(project: NleComposition, accept: (module: ModuleRef) => void): void {
  const visitItem = (item: NleItem): void => {
    if (item.kind === "adjustment") accept(item.operator.module);
    if (item.kind === "present" && item.source === "component") accept(item.component.module);
    if (item.kind === "present") {
      for (const application of item.picture?.operators ?? []) accept(application.operator.module);
      for (const application of item.audio?.operators ?? []) accept(application.operator.module);
      if (item.audio?.reconstruction !== undefined) accept(item.audio.reconstruction.using.module);
    }
    if (item.kind === "present" && item.source === "composition") {
      visitProjectModules(item.composition, accept);
    }
  };
  for (const track of project.tracks) for (const item of track.items) visitItem(item);
  for (const transition of project.transitions) accept(transition.operator.module);
  for (const matte of project.mattes) accept(matte.operator.module);
}

export function nleProjectModuleKeys(project: NleComposition): readonly string[] {
  const values = new Set<string>();
  visitProjectModules(project, module => values.add(moduleKey(module)));
  return [...values].sort();
}

async function selectedFacets(
  project: NleProject,
  packageRoot: string,
  distributionPackageRoot?: string,
): Promise<readonly Facet[]> {
  const names = nleProjectModuleKeys(project);
  if (names.length === 0) return [];
  const packages = await loadNodePackageSelection({
    selected: [],
    logical: names.map(name => ({ kind: moduleFacetKind, name })),
  }, packageRoot, distributionPackageRoot === undefined ? {} : {
    fallbackRoots: [distributionPackageRoot],
  });
  return packages.flatMap(pack => pack.contribution.facets ?? []);
}

async function publishArtifact(
  resources: ResourceStore,
  media: MuxedMedia,
  temporaryDirectory: string,
  outputFile: string,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const source = isStreamingResourceStore(resources)
    ? await resources.open(media.artifact.resource, signal === undefined ? {} : { signal })
    : await resources.get(media.artifact.resource, signal === undefined ? {} : { signal })
      .then(bytes => bytes === undefined ? undefined : (async function* () { yield bytes; })());
  assert(source !== undefined, `Rendered resource ${media.artifact.resource} is unavailable.`);
  const temporary = join(temporaryDirectory, basename(outputFile));
  const file = await openFile(temporary, "wx");
  let size = 0;
  try {
    for await (const chunk of source) {
      signal?.throwIfAborted();
      await file.write(chunk);
      size += chunk.byteLength;
    }
  } finally {
    await file.close();
  }
  assert(size === media.artifact.size,
    `Rendered resource ${media.artifact.resource} has ${size} bytes, expected ${media.artifact.size}.`);
  signal?.throwIfAborted();
  await link(temporary, outputFile);
}

function observedExecutor(
  executor: HtmlVideoDeliveryExecutor,
  report: (progress: LocalNleExportProgress) => void,
  signal?: AbortSignal,
): HtmlVideoDeliveryExecutor {
  return {
    async renderVisual(request) {
      signal?.throwIfAborted();
      report({ phase: "picture", state: "start" });
      const result = await executor.renderVisual(request);
      report({ phase: "picture", state: "complete" });
      return result;
    },
    async renderAudio(request) {
      signal?.throwIfAborted();
      report({ phase: "audio", state: "start" });
      const result = await executor.renderAudio(request);
      report({ phase: "audio", state: "complete" });
      return result;
    },
    async mux(request) {
      signal?.throwIfAborted();
      report({ phase: "mux", state: "start" });
      const result = await executor.mux(request);
      report({ phase: "mux", state: "complete" });
      return result;
    },
  };
}

type PreparedLocalNleProgramme = {
  readonly projectFile: string;
  readonly visual: HtmlProgram;
  readonly audio: AudioProgram;
  readonly delivery: MediaDeliverySpec;
  readonly programmeFrameCount: number;
  readonly audioRange?: TemporalRange;
};

function sparseFrameSpan(frames: readonly number[]): FrameSpan {
  assert(frames.length > 0, "NLE frame capture needs at least one absolute frame.");
  for (const [index, frame] of frames.entries()) {
    assert(Number.isSafeInteger(frame) && frame >= 0
      && (index === 0 || frame > frames[index - 1]!),
    "NLE capture frames must be strictly increasing non-negative safe integers.");
  }
  const endFrameExclusive = frames.at(-1)! + 1;
  assert(Number.isSafeInteger(endFrameExclusive), "NLE capture frame exceeds safe arithmetic.");
  return { startFrame: frames[0]!, endFrameExclusive };
}

async function prepareLocalNleProgramme(
  request: LocalNleProgrammeRequest,
  resources: FileResourceStore,
  report: (progress: LocalNleExportProgress) => void,
  pictureRange?: FrameSpan,
): Promise<PreparedLocalNleProgramme> {
  const projectRoot = resolve(request.projectRoot);
  const projectFile = resolve(request.projectFile);
  request.signal?.throwIfAborted();

  report({ phase: "open", state: "start" });
  const project = request.project === undefined
    ? (await readNleProjectFile(projectFile)).current
    : structuredClone(request.project);
  assertNleProject(project);
  report({ phase: "open", state: "complete" });
  const packageRoot = resolve(request.packageRoot ?? projectRoot);
  report({ phase: "load-packages", state: "start" });
  const facets = await selectedFacets(project, packageRoot, request.distributionPackageRoot);
  report({ phase: "load-packages", state: "complete" });
  report({ phase: "lower", state: "start" });
  const programme = await prepareNodeNleProgramme({
    projectRoot,
    projectFile,
    project,
    facets,
    resources: nodeFileProgrammeResources(resources),
    ...(request.signal === undefined ? {} : { signal: request.signal }),
    onMediaProgress: (completed, total) => report({ phase: "media", completed, total }),
  });
  const closed = await closePreparedNleProgramme({
    programme,
    resources,
    ...(request.pictureTarget === undefined ? {} : { pictureTarget: request.pictureTarget }),
    ...(request.quality === undefined ? {} : { quality: request.quality }),
    ...(request.frameRate === undefined ? {} : { frameRate: request.frameRate }),
    ...(request.resolution === undefined ? {} : { resolution: request.resolution }),
    ...(pictureRange === undefined ? {} : { range: pictureRange }),
    ...(request.signal === undefined ? {} : { signal: request.signal }),
    ...(request.html === undefined ? {} : { html: request.html }),
    ...(request.media === undefined ? {} : { media: request.media }),
  });
  report({ phase: "lower", state: "complete" });
  return {
    projectFile,
    ...closed,
  };
}

/**
 * Export one persistent NLE snapshot as a whole local MP4.
 *
 * Opening, package activation and byte staging are Host work. NLE→AVIR→terminal lowering remains
 * deterministic and in-memory; the temporary ResourceStore and rendered products are discarded
 * after the final file is atomically linked into place.
 */
async function exportNleProgramme(
  request: LocalNleExportRequest,
  environment: LocalNleExportEnvironment = {},
  programme?: PreparedNodeNleProgramme,
): Promise<LocalNleExportResult> {
  const outputFile = resolve(request.outputFile);
  assert(extname(outputFile).toLowerCase() === ".mp4", "Local NLE export currently requires an .mp4 output file.");
  assert(request.pictureTarget === undefined || request.pictureTarget === "html"
    || request.pictureTarget === "gpu-composition",
  "Local NLE export Picture target must be html or gpu-composition.");
  assert(!(await stat(outputFile).then(() => true, () => false)), `Output ${outputFile} already exists.`);
  request.signal?.throwIfAborted();
  const report = (progress: LocalNleExportProgress): void => request.onProgress?.(progress);

  await mkdir(dirname(outputFile), { recursive: true });
  const temporaryDirectory = await mkdtemp(join(dirname(outputFile), ".hypit-nle-export-"));
  const products = new FileResourceStore(join(temporaryDirectory, "resources"));
  const resources = programme === undefined
    ? products
    : createNleProgrammeResourceOverlay(programme.resources, products);
  try {
    const prepared = programme === undefined
      ? await prepareLocalNleProgramme(request, products, report, request.range)
      : await (async (): Promise<PreparedLocalNleProgramme> => {
          report({ phase: "lower", state: "start" });
          const closed = await closePreparedNleProgramme({
            programme,
            resources,
            ...(request.pictureTarget === undefined ? {} : { pictureTarget: request.pictureTarget }),
            ...(request.quality === undefined ? {} : { quality: request.quality }),
            ...(request.frameRate === undefined ? {} : { frameRate: request.frameRate }),
            ...(request.resolution === undefined ? {} : { resolution: request.resolution }),
            ...(request.range === undefined ? {} : { range: request.range }),
            ...(request.signal === undefined ? {} : { signal: request.signal }),
            ...(request.html === undefined ? {} : { html: request.html }),
            ...(request.media === undefined ? {} : { media: request.media }),
          });
          report({ phase: "lower", state: "complete" });
          return { projectFile: programme.projectFile, ...closed };
        })();
    const plan = createHtmlVideoDeliveryPlan(prepared.visual, prepared.audio, prepared.delivery,
      prepared.audioRange === undefined ? {} : { audioRange: prepared.audioRange });

    const onPictureProgress = (detail: HtmlRasterProgress): void => {
      report({ phase: "picture", state: "progress", detail });
    };
    const injected = environment.createExecutor?.(resources, {
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      onPictureProgress,
    });
    const executor = injected ?? createLocalNleDeliveryExecutor({
        resources,
        html: {
          ...request.html,
          ...(request.pictureTarget === "gpu-composition" ? { webGpu: "required" as const } : {}),
          ...(request.signal === undefined ? {} : { signal: request.signal }),
          onProgress: onPictureProgress,
        },
        media: {
          ...request.media,
          ...(request.signal === undefined ? {} : { signal: request.signal }),
        },
      });
    const rendered = await executeHtmlVideoDeliveryPlan(
      plan,
      observedExecutor(executor, report, request.signal),
    );

    request.signal?.throwIfAborted();
    report({ phase: "publish", state: "start" });
    await publishArtifact(resources, rendered, temporaryDirectory, outputFile, request.signal);
    report({ phase: "publish", state: "complete" });
    report({ phase: "complete", outputFile });
    return {
      projectFile: prepared.projectFile,
      outputFile,
      frameRate: structuredClone(rendered.frameRate),
      frameCount: rendered.frameCount,
      canvas: structuredClone(rendered.canvas),
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 });
  }
}

export async function exportLocalNleProject(
  request: LocalNleExportRequest,
  environment: LocalNleExportEnvironment = {},
): Promise<LocalNleExportResult> {
  return await exportNleProgramme(request, environment);
}

/** Deliver one already linked Programme generation without reopening Project inputs. */
export async function exportPreparedNleProgramme(
  programme: PreparedNodeNleProgramme,
  request: PreparedNleExportRequest,
  environment: LocalNleExportEnvironment = {},
): Promise<LocalNleExportResult> {
  return await exportNleProgramme({
    ...request,
    projectRoot: programme.projectRoot,
    projectFile: programme.projectFile,
    project: programme.project,
  }, environment, programme);
}

/** Capture sparse absolute Programme frames without encoding an intermediate video. */
async function captureNleFrames(
  request: LocalNleFrameCaptureRequest,
  environment: LocalNleFrameCaptureEnvironment = {},
  programme?: PreparedNodeNleProgramme,
): Promise<LocalNleFrameCaptureResult> {
  const toDirectory = resolve(request.toDirectory);
  assert(request.pictureTarget === undefined || request.pictureTarget === "html"
    || request.pictureTarget === "gpu-composition",
  "Local NLE frame capture Picture target must be html or gpu-composition.");
  assert(!(await stat(toDirectory).then(() => true, () => false)),
    `Destination ${toDirectory} already exists.`);
  await mkdir(dirname(toDirectory), { recursive: true });
  const temporaryDirectory = await mkdtemp(join(dirname(toDirectory), ".hypit-nle-frames-"));
  const products = new FileResourceStore(join(temporaryDirectory, "resources"));
  const resources = programme === undefined
    ? products
    : createNleProgrammeResourceOverlay(programme.resources, products);
  const staging = join(temporaryDirectory, "output");
  const report = (progress: LocalNleExportProgress): void => request.onProgress?.(progress);
  const selection = sparseFrameSpan(request.frames);
  try {
    const prepared = programme === undefined
      ? await prepareLocalNleProgramme(request, products, report, selection)
      : await (async (): Promise<PreparedLocalNleProgramme> => {
          report({ phase: "lower", state: "start" });
          const closed = await closePreparedNleProgramme({
            programme,
            resources,
            ...(request.pictureTarget === undefined ? {} : { pictureTarget: request.pictureTarget }),
            ...(request.quality === undefined ? {} : { quality: request.quality }),
            ...(request.frameRate === undefined ? {} : { frameRate: request.frameRate }),
            ...(request.resolution === undefined ? {} : { resolution: request.resolution }),
            range: selection,
            ...(request.signal === undefined ? {} : { signal: request.signal }),
            ...(request.html === undefined ? {} : { html: request.html }),
            ...(request.media === undefined ? {} : { media: request.media }),
          });
          report({ phase: "lower", state: "complete" });
          return { projectFile: programme.projectFile, ...closed };
        })();
    const relativeFrames = request.frames.map(frame => frame - selection.startFrame);
    report({ phase: "picture", state: "start" });
    const frames = await (environment.rasterizeFrames ?? rasterizeHtmlFrames)({
      program: prepared.visual,
      picture: {
        colorPrimaries: "bt709",
        colorTransfer: "srgb",
        colorMatrix: "rgb",
        colorRange: "full",
        bitDepth: 8,
        alpha: { mode: "opaque", matte: "#000000" },
      },
      frames: relativeFrames,
    }, {
      resources,
      ...request.html,
      ...(request.pictureTarget === "gpu-composition" ? { webGpu: "required" as const } : {}),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      onProgress: detail => report({ phase: "picture", state: "progress", detail }),
    });
    report({ phase: "picture", state: "complete" });
    await mkdir(staging);
    const files: Array<{ readonly frame: number; readonly file: string }> = [];
    for (const image of frames.frames) {
      request.signal?.throwIfAborted();
      const bytes = await resources.get(image.artifact.resource,
        request.signal === undefined ? {} : { signal: request.signal });
      assert(bytes !== undefined,
        `Captured frame ${image.frame} resource ${image.artifact.resource} is unavailable.`);
      const absoluteFrame = image.frame + selection.startFrame;
      const name = `frame-${String(absoluteFrame).padStart(9, "0")}.png`;
      await writeFile(join(staging, name), bytes, { flag: "wx" });
      files.push({ frame: absoluteFrame, file: join(toDirectory, name) });
    }
    await rename(staging, toDirectory);
    return {
      projectFile: prepared.projectFile,
      frameRate: structuredClone(prepared.visual.frameRate),
      frameCount: prepared.programmeFrameCount,
      canvas: structuredClone(prepared.visual.canvas),
      frames: files,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 });
  }
}

export async function captureLocalNleFrames(
  request: LocalNleFrameCaptureRequest,
  environment: LocalNleFrameCaptureEnvironment = {},
): Promise<LocalNleFrameCaptureResult> {
  return await captureNleFrames(request, environment);
}

/** Capture sparse evidence from one already linked Programme generation. */
export async function capturePreparedNleFrames(
  programme: PreparedNodeNleProgramme,
  request: PreparedNleFrameCaptureRequest,
  environment: LocalNleFrameCaptureEnvironment = {},
): Promise<LocalNleFrameCaptureResult> {
  return await captureNleFrames({
    ...request,
    projectRoot: programme.projectRoot,
    projectFile: programme.projectFile,
    project: programme.project,
  }, environment, programme);
}

/**
 * Close one focused Programme once, then derive both a review clip and explicit frame evidence.
 *
 * Package loading, Media binding, NLE→AVIR lowering and Terminal acquisition are shared by both
 * products. The bundle is invocation-local review evidence: it never becomes an NLE fact, Media
 * Asset, Result or persistent cache entry.
 */
async function reviewNleProgramme(
  request: LocalNleReviewRequest,
  environment: LocalNleReviewEnvironment = {},
  programme?: PreparedNodeNleProgramme,
): Promise<LocalNleReviewResult> {
  const toDirectory = resolve(request.toDirectory);
  assert(request.pictureTarget === undefined || request.pictureTarget === "html"
    || request.pictureTarget === "gpu-composition",
  "Local NLE review Picture target must be html or gpu-composition.");
  assert(!(await stat(toDirectory).then(() => true, () => false)),
    `Destination ${toDirectory} already exists.`);
  assertFrameSpan(request.range);
  sparseFrameSpan(request.frames);
  assert(request.frames[0]! >= request.range.startFrame
    && request.frames.at(-1)! < request.range.endFrameExclusive,
  "NLE review frames must lie inside the selected review range.");

  await mkdir(dirname(toDirectory), { recursive: true });
  const temporaryDirectory = await mkdtemp(join(dirname(toDirectory), ".hypit-nle-review-"));
  const products = new FileResourceStore(join(temporaryDirectory, "resources"));
  const resources = programme === undefined
    ? products
    : createNleProgrammeResourceOverlay(programme.resources, products);
  const staging = join(temporaryDirectory, "bundle");
  const stagingFrames = join(staging, "frames");
  const report = (progress: LocalNleExportProgress): void => request.onProgress?.(progress);
  try {
    const prepared = programme === undefined
      ? await prepareLocalNleProgramme(request, products, report, request.range)
      : await (async (): Promise<PreparedLocalNleProgramme> => {
          report({ phase: "lower", state: "start" });
          const closed = await closePreparedNleProgramme({
            programme,
            resources,
            ...(request.pictureTarget === undefined ? {} : { pictureTarget: request.pictureTarget }),
            ...(request.quality === undefined ? {} : { quality: request.quality }),
            ...(request.frameRate === undefined ? {} : { frameRate: request.frameRate }),
            ...(request.resolution === undefined ? {} : { resolution: request.resolution }),
            range: request.range,
            ...(request.signal === undefined ? {} : { signal: request.signal }),
            ...(request.html === undefined ? {} : { html: request.html }),
            ...(request.media === undefined ? {} : { media: request.media }),
          });
          report({ phase: "lower", state: "complete" });
          return { projectFile: programme.projectFile, ...closed };
        })();
    const relativeFrames = request.frames.map(frame => frame - request.range.startFrame);

    report({ phase: "picture", state: "start" });
    const evidence = await (environment.rasterizeFrames ?? rasterizeHtmlFrames)({
      program: prepared.visual,
      picture: {
        colorPrimaries: "bt709",
        colorTransfer: "srgb",
        colorMatrix: "rgb",
        colorRange: "full",
        bitDepth: 8,
        alpha: { mode: "opaque", matte: "#000000" },
      },
      frames: relativeFrames,
    }, {
      resources,
      ...request.html,
      ...(request.pictureTarget === "gpu-composition" ? { webGpu: "required" as const } : {}),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      onProgress: detail => report({ phase: "picture", state: "progress", detail }),
    });
    report({ phase: "picture", state: "complete" });

    await mkdir(stagingFrames, { recursive: true });
    const files: Array<{ readonly frame: number; readonly file: string }> = [];
    for (const image of evidence.frames) {
      request.signal?.throwIfAborted();
      const bytes = await resources.get(image.artifact.resource,
        request.signal === undefined ? {} : { signal: request.signal });
      assert(bytes !== undefined,
        `Captured review frame ${image.frame} resource ${image.artifact.resource} is unavailable.`);
      const absoluteFrame = image.frame + request.range.startFrame;
      const name = `frame-${String(absoluteFrame).padStart(9, "0")}.png`;
      await writeFile(join(stagingFrames, name), bytes, { flag: "wx" });
      files.push({ frame: absoluteFrame, file: join(toDirectory, "frames", name) });
    }

    const plan = createHtmlVideoDeliveryPlan(prepared.visual, prepared.audio, prepared.delivery,
      prepared.audioRange === undefined ? {} : { audioRange: prepared.audioRange });
    const onPictureProgress = (detail: HtmlRasterProgress): void => {
      report({ phase: "picture", state: "progress", detail });
    };
    const injected = environment.createExecutor?.(resources, {
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      onPictureProgress,
    });
    const executor = injected ?? createLocalNleDeliveryExecutor({
      resources,
      html: {
        ...request.html,
        ...(request.pictureTarget === "gpu-composition" ? { webGpu: "required" as const } : {}),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        onProgress: onPictureProgress,
      },
      media: {
        ...request.media,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      },
    });
    const rendered = await executeHtmlVideoDeliveryPlan(
      plan,
      observedExecutor(executor, report, request.signal),
    );
    const videoFile = join(toDirectory, "review.mp4");
    await publishArtifact(resources, rendered, temporaryDirectory, join(staging, "review.mp4"), request.signal);
    await rename(staging, toDirectory);
    report({ phase: "complete", outputFile: videoFile });
    return {
      projectFile: prepared.projectFile,
      toDirectory,
      videoFile,
      frameRate: structuredClone(rendered.frameRate),
      programmeFrameCount: prepared.programmeFrameCount,
      reviewFrameCount: rendered.frameCount,
      range: structuredClone(request.range),
      canvas: structuredClone(rendered.canvas),
      frames: files,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 });
  }
}

export async function reviewLocalNleProject(
  request: LocalNleReviewRequest,
  environment: LocalNleReviewEnvironment = {},
): Promise<LocalNleReviewResult> {
  return await reviewNleProgramme(request, environment);
}

/** Derive focused review evidence from an already linked Programme generation. */
export async function reviewPreparedNleProgramme(
  programme: PreparedNodeNleProgramme,
  request: PreparedNleReviewRequest,
  environment: LocalNleReviewEnvironment = {},
): Promise<LocalNleReviewResult> {
  return await reviewNleProgramme({
    ...request,
    projectRoot: programme.projectRoot,
    projectFile: programme.projectFile,
    project: programme.project,
  }, environment, programme);
}
