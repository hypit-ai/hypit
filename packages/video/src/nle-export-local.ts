import { createReadStream } from "node:fs";
import { link, mkdir, mkdtemp, open as openFile, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import type { Facet } from "@hypit/hypit/facet";
import { loadNodePackageSelection } from "@hypit/hypit/loader/node";
import { moduleKey, modulePackageAbi } from "@hypit/hypit/protocol";
import type { ModuleRef } from "@hypit/hypit/protocol";
import type { ResourceStore } from "@hypit/hypit/runtime";
import {
  createNleTerminalLinkHostFromFacets,
  executeHtmlVideoDeliveryPlan,
  htmlVideoDeliverySpec,
  lowerNleProjectToHtmlVideoDeliveryPlan,
} from "@hypit/html-video";
import type { HtmlVideoDeliveryExecutor } from "@hypit/html-video";
import { resolveMediaAssetMediaFile } from "@hypit/media-asset/node";
import type { MuxedMedia, VisualDeliverySpec } from "@hypit/media";
import type { CreateMediaExecutionEnvironmentOptions } from "@hypit/media-local";
import type { NleItem, NleProject } from "@hypit/nle";
import { createNodeNleMediaResolver, readNleProjectFile } from "@hypit/nle/node";
import type {
  ChromiumHtmlRasterOptions,
  HtmlRasterProgress,
} from "@hypit/provider-html-local";
import { FileResourceStore } from "@hypit/runtime-local/resource-store";

export type LocalNleExportProgress =
  | { readonly phase: "open" | "load-packages" | "lower" | "publish"; readonly state: "start" | "complete" }
  | { readonly phase: "media"; readonly completed: number; readonly total: number }
  | { readonly phase: "picture"; readonly state: "start" | "progress" | "complete"; readonly detail?: HtmlRasterProgress }
  | { readonly phase: "audio" | "mux"; readonly state: "start" | "complete" }
  | { readonly phase: "complete"; readonly outputFile: string };

export type LocalNleExportRequest = {
  readonly projectFile: string;
  readonly outputFile: string;
  /** Package-manager resolution root. Defaults to the NLE file's directory. */
  readonly packageRoot?: string;
  /** Read-only application Distribution used only as an installed-package fallback. */
  readonly distributionPackageRoot?: string;
  readonly quality?: VisualDeliverySpec["encoding"]["quality"];
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: LocalNleExportProgress) => void;
  readonly html?: Omit<ChromiumHtmlRasterOptions, "resources" | "signal" | "onProgress">;
  readonly media?: Omit<CreateMediaExecutionEnvironmentOptions, "signal">;
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function visitProjectModules(project: NleProject, accept: (module: ModuleRef) => void): void {
  const visitEffects = (item: NleItem): void => {
    for (const effect of item.picture?.effects ?? []) accept(effect.effect.module);
    for (const effect of item.audio?.effects ?? []) accept(effect.effect.module);
    if (item.kind === "component") accept(item.component.module);
    if (item.kind === "compound") visitProjectModules(item.project, accept);
  };
  for (const track of project.tracks) for (const item of track.items) visitEffects(item);
  for (const transition of project.transitions) accept(transition.operator.module);
  for (const matte of project.mattes) accept(matte.operator.module);
}

export function nleProjectModuleKeys(project: NleProject): readonly string[] {
  const values = new Set<string>();
  visitProjectModules(project, module => values.add(moduleKey(module)));
  return [...values].sort();
}

function uniqueMediaAssetCount(project: NleProject): number {
  const paths = new Set<string>();
  const visit = (current: NleProject): void => {
    for (const media of current.media) paths.add(media.asset.path);
    for (const track of current.tracks) for (const item of track.items) {
      if (item.kind === "compound") visit(item.project);
    }
  };
  visit(project);
  return paths.size;
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
    logical: names.map(name => ({ abi: modulePackageAbi, name })),
  }, packageRoot, distributionPackageRoot === undefined ? {} : {
    fallbackRoots: [distributionPackageRoot],
  });
  return packages.flatMap(pack => pack.contribution.facets ?? []);
}

async function publishArtifact(
  resources: FileResourceStore,
  media: MuxedMedia,
  temporaryDirectory: string,
  outputFile: string,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const source = await resources.open(media.artifact.resource, signal === undefined ? {} : { signal });
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

/**
 * Export one persistent NLE snapshot as a whole local MP4.
 *
 * Opening, package activation and byte staging are Host work. NLE→AVIR→terminal lowering remains
 * deterministic and in-memory; the temporary ResourceStore and rendered products are discarded
 * after the final file is atomically linked into place.
 */
export async function exportLocalNleProject(
  request: LocalNleExportRequest,
  environment: LocalNleExportEnvironment = {},
): Promise<LocalNleExportResult> {
  const projectFile = resolve(request.projectFile);
  const outputFile = resolve(request.outputFile);
  assert(extname(outputFile).toLowerCase() === ".mp4", "Local NLE export currently requires an .mp4 output file.");
  assert(!(await stat(outputFile).then(() => true, () => false)), `Output ${outputFile} already exists.`);
  request.signal?.throwIfAborted();
  const report = (progress: LocalNleExportProgress): void => request.onProgress?.(progress);

  report({ phase: "open", state: "start" });
  const project = (await readNleProjectFile(projectFile)).current;
  report({ phase: "open", state: "complete" });

  const packageRoot = resolve(request.packageRoot ?? dirname(projectFile));
  report({ phase: "load-packages", state: "start" });
  const facets = await selectedFacets(project, packageRoot, request.distributionPackageRoot);
  report({ phase: "load-packages", state: "complete" });

  await mkdir(dirname(outputFile), { recursive: true });
  const temporaryDirectory = await mkdtemp(join(dirname(outputFile), ".hypit-nle-export-"));
  const resources = new FileResourceStore(join(temporaryDirectory, "resources"));
  try {
    const totalMedia = uniqueMediaAssetCount(project);
    let completedMedia = 0;
    report({ phase: "media", completed: 0, total: totalMedia });
    const resolveMedia = await createNodeNleMediaResolver(projectFile, project, async path => {
      const resolved = await resolveMediaAssetMediaFile(path, async (file, mediaType) => {
        request.signal?.throwIfAborted();
        return await resources.putStream(
          createReadStream(file, request.signal === undefined ? {} : { signal: request.signal }),
          mediaType,
          request.signal === undefined ? {} : { signal: request.signal },
        );
      });
      completedMedia += 1;
      report({ phase: "media", completed: completedMedia, total: totalMedia });
      return resolved;
    });

    request.signal?.throwIfAborted();
    report({ phase: "lower", state: "start" });
    const host = createNleTerminalLinkHostFromFacets(facets, resolveMedia);
    const plan = lowerNleProjectToHtmlVideoDeliveryPlan(
      project,
      host,
      htmlVideoDeliverySpec(request.quality ?? "standard"),
    );
    report({ phase: "lower", state: "complete" });

    const onPictureProgress = (detail: HtmlRasterProgress): void => {
      report({ phase: "picture", state: "progress", detail });
    };
    const injected = environment.createExecutor?.(resources, {
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      onPictureProgress,
    });
    const executor = injected ?? (await import("@hypit/provider-html-local"))
      .createLocalHtmlVideoDeliveryExecutor({
        resources,
        html: {
          ...request.html,
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
      projectFile,
      outputFile,
      frameRate: structuredClone(rendered.frameRate),
      frameCount: rendered.frameCount,
      canvas: structuredClone(rendered.canvas),
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
