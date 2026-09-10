import { fileReferenceIdentity } from "@hypit/build-result";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { buildIdCreatedAt } from "@hypit/protocol";
import type { BuildView, NodeRuntimeHost, RuntimeHostTransientExecution } from "@hypit/runtime-host-node";
import type { StoredValue, TypeRef } from "@hypit/protocol";
import type {
  BuildResultFileRange,
  BuildResultManifest,
  BuildResultRepository,
  FinishedBuildResultManifest,
} from "@hypit/build-result";

import { resolveBuildResultValue } from "@hypit/cli";
import { videoCliDistribution } from "@hypit/video-cli";

import type { StudioArtifactView, StudioLibraryRequest, StudioLibraryView, StudioTaskView } from "./shared.js";
import { mergeStudioArtifacts } from "./library-media.js";

type RuntimeControl = Awaited<ReturnType<NodeRuntimeHost["openControl"]>>;

export type StudioBuildLibrary = {
  readonly profile?: string;
  readonly runtime?: Pick<RuntimeControl, "activity">;
  /** Runtime-owned, disposable execution for the current authoring session. */
  readonly transientExecution?: RuntimeHostTransientExecution;
  readonly library: (request: StudioLibraryRequest) => Promise<StudioLibraryView>;
  readonly renameArtifact: (build: string, output: string, displayName: string | null) => Promise<string | undefined>;
  readonly resolveHistoricalOutput: (
    build: string,
    output: string,
  ) => Promise<{
    readonly type: TypeRef;
    readonly value: StoredValue;
    readonly attachments?: readonly import("@hypit/workspace").ArtifactAttachment[];
  } | undefined>;
  readonly openArtifact: (
    build: string,
    output: string,
  ) => Promise<{
    readonly mediaType: string;
    readonly size: number;
    open(range?: BuildResultFileRange): Promise<AsyncIterable<Uint8Array> | undefined>;
  } | undefined>;
  readonly close: () => Promise<void>;
};

function projectPath(root: string, path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(root, path);
}

function isWithin(root: string, path: string): boolean {
  const rel = relative(resolve(root), projectPath(root, path));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * A path inside the project reads the same on every platform, so the Studio library shows one Run
 * under one name wherever it is opened. A path outside the project is the machine's own, and stays
 * in that machine's form.
 */
function presentedPath(root: string, path: string): string {
  const absolute = projectPath(root, path);
  if (!isWithin(root, path)) return absolute;
  return (relative(resolve(root), absolute) || ".").split(sep).join("/");
}

function taskStatus(view: BuildView): StudioTaskView["status"] {
  if (view.issue !== undefined) return "attention";
  if (view.activity === "submitting" || view.activity === "ready") return "queued";
  return view.activity;
}

function taskView(
  root: string,
  view: BuildView,
  result?: BuildResultManifest,
): StudioTaskView {
  if (view.source === undefined) throw new Error(`Active Build ${view.id} has no source`);
  const detail = view.issue?.message ?? view.stop?.reason;
  return {
    id: view.id,
    ...(result?.title === undefined ? {} : { title: result.title }),
    ...(result?.note === undefined ? {} : { note: result.note }),
    ...(result?.highlightedOutputs === undefined ? {} : { highlightedOutputs: result.highlightedOutputs }),
    createdAt: view.createdAt,
    ongoing: true,
    status: taskStatus(view),
    ...(detail === undefined ? {} : { detail }),
    ...(view.requests === undefined ? {} : { requests: view.requests }),
    source: presentedPath(root, view.source.path),
    ...(view.run === undefined ? {} : { run: presentedPath(root, view.run.path) }),
    targets: result?.targets ?? view.targets,
    operations: view.operations.map((operation) => ({
      status: operation.status,
      ...(operation.progress?.phase === undefined ? {} : { phase: operation.progress.phase }),
      ...(operation.progress?.completed === undefined ? {} : { completed: operation.progress.completed }),
      ...(operation.progress?.total === undefined ? {} : { total: operation.progress.total }),
      ...(operation.progress?.unit === undefined ? {} : { unit: operation.progress.unit }),
    })),
  };
}

function resultTaskView(root: string, result: FinishedBuildResultManifest): StudioTaskView {
  return {
    id: result.id,
    ...(result.title === undefined ? {} : { title: result.title }),
    ...(result.note === undefined ? {} : { note: result.note }),
    ...(result.highlightedOutputs === undefined ? {} : { highlightedOutputs: result.highlightedOutputs }),
    createdAt: buildIdCreatedAt(result.id)!,
    finishedAt: result.finishedAt,
    ongoing: false,
    status: result.outcome,
    ...(result.failure === undefined ? {} : { detail: result.failure }),
    source: presentedPath(root, result.source.path),
    ...(result.run === undefined ? {} : { run: presentedPath(root, result.run.path) }),
    targets: result.targets,
    operations: [],
  };
}

function isMedia(mediaType: string): boolean {
  return /^(image|video|audio)\//u.test(mediaType);
}

async function artifactsForResults(
  root: string,
  repository: BuildResultRepository,
  manifests: readonly BuildResultManifest[],
  media?: StudioLibraryRequest["media"],
): Promise<readonly StudioArtifactView[]> {
  const nested = await Promise.all(manifests.flatMap((manifest) =>
    Object.entries(manifest.outputs).map(async ([output, entry]): Promise<StudioArtifactView[]> => {
      // Composite Outputs remain intact. Listing media never opens their Value Documents.
      if (entry.value.kind !== "build-file" && entry.value.kind !== "external-file" && entry.value.kind !== "build-output") return [];
      const description = entry.value.kind === "build-file" || entry.value.kind === "external-file"
        ? { kind: "resource", mediaType: entry.value.mediaType }
        : await repository.describeOutput(manifest.id, output);
      if (description?.kind !== "resource" || (description.mediaType === undefined || !isMedia(description.mediaType))) return [];
      if (media !== undefined && !description.mediaType.startsWith(`${media}/`)) return [];
      const resolved = entry.value.kind === "build-file"
        ? { build: manifest.id, output, value: entry.value }
        : await repository.resolve(manifest.id, output);
      if (resolved === undefined || (resolved.value.kind !== "build-file" && resolved.value.kind !== "external-file")) return [];
      const file = resolved.value;
      const source = presentedPath(root, manifest.source.path);
      const run = manifest.run === undefined ? undefined : presentedPath(root, manifest.run.path);
      return [{
        id: fileReferenceIdentity(resolved.build, file),
        build: manifest.id,
        createdAt: buildIdCreatedAt(manifest.id)!,
        output,
        nameEditable: manifest.outcome !== undefined,
        ...(entry.displayName === undefined ? {} : { displayName: entry.displayName }),
        highlighted: manifest.highlightedOutputs?.includes(output) === true,
        ...(manifest.title === undefined ? {} : { buildTitle: manifest.title }),
        ...(manifest.note === undefined ? {} : { buildNote: manifest.note }),
        ...(file.kind === "external-file" ? {} : { ownerBuild: file.build ?? resolved.build }),
        ownerOutput: resolved.output,
        filePath: file.kind === "external-file" ? file.uri : file.path,
        size: file.size,
        mediaType: file.mediaType,
        source,
        ...(run === undefined ? {} : { run }),
        origins: [{ build: manifest.id, output, source, ...(run === undefined ? {} : { run }) }],
      }];
    })));
  return mergeStudioArtifacts(nested.flat());
}

/** Query only the selected library view, through Runtime and Repository interfaces. */
export async function readStudioLibrary(input: StudioLibraryRequest & {
  readonly profile?: string;
  readonly workspaceRoot: string;
  readonly runtime?: Pick<RuntimeControl, "activity">;
  readonly results: BuildResultRepository;
}): Promise<StudioLibraryView> {
  const matches = (item: { readonly id: string; readonly source: { readonly path: string }; readonly run?: { readonly path: string } }) =>
    (isWithin(input.workspaceRoot, item.run?.path ?? item.source.path) || isWithin(input.workspaceRoot, item.source.path))
    && (input.build === undefined || item.id === input.build)
    && (input.run === undefined || (item.run !== undefined
      && projectPath(input.workspaceRoot, item.run.path) === projectPath(input.workspaceRoot, input.run)));
  // Read activity before Results so a Build that finishes during this query is still represented.
  const active = input.runtime === undefined || input.before !== undefined
    ? [] : (await input.runtime.activity()).builds;
  const views = active.filter((view) => view.source !== undefined && matches({ ...view, source: view.source }));
  let page = input.build === undefined
    ? await input.results.browse({ limit: 25, ...(input.before === undefined ? {} : { before: input.before }) })
    : { results: [await input.results.read(input.build)].filter((item): item is BuildResultManifest => item !== undefined) };
  const manifests = page.results.filter(matches);
  const resultsByBuild = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  await Promise.all(views.filter((view) => !resultsByBuild.has(view.id)).map(async (view) => {
    const result = await input.results.read(view.id);
    if (result !== undefined && matches(result)) resultsByBuild.set(view.id, result);
  }));
  let artifacts: readonly StudioArtifactView[] = [];
  if (input.section === "artifacts") {
    artifacts = await artifactsForResults(input.workspaceRoot, input.results, [...resultsByBuild.values()], input.media);
    // Page through Result metadata until there is a useful media page. The repository still
    // owns Build order and cursors; no media directory or secondary persistent index is needed.
    while (artifacts.length < 25 && "next" in page && page.next !== undefined) {
      const cursor = page.next;
      page = await input.results.browse({ limit: 25, before: cursor });
      if ("next" in page && page.next === cursor) throw new Error("Result pagination did not advance");
      artifacts = mergeStudioArtifacts([...artifacts,
        ...await artifactsForResults(input.workspaceRoot, input.results, page.results.filter(matches), input.media)]);
    }
  }
  return {
    section: input.section,
    environment: resolve(input.workspaceRoot),
    ...(input.profile === undefined ? {} : { runtime: resolve(input.profile) }),
    ...("next" in page && page.next !== undefined ? { next: page.next } : {}),
    tasks: input.section !== "tasks" ? [] : [
      ...views.map((view) => taskView(input.workspaceRoot, view, resultsByBuild.get(view.id))),
      ...manifests
        .filter((manifest): manifest is FinishedBuildResultManifest => manifest.outcome !== undefined
          && !views.some((view) => view.id === manifest.id))
        .map((manifest) => resultTaskView(input.workspaceRoot, manifest)),
    ].sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id)),
    artifacts,
  };
}

/** Open a Runtime profile read-only; Studio never creates or mutates a Build. */
export async function openStudioBuildLibrary(
  profile: string | undefined,
  packageRoot: string,
  workspaceRoot: string,
  distributionPackageRoot?: string,
): Promise<StudioBuildLibrary> {
  const resolvedProfile = profile === undefined ? undefined : resolve(profile);
  const host = resolvedProfile === undefined
    ? undefined
    : await videoCliDistribution.openRuntimeHost(resolvedProfile, {
        packageRoot,
        ...(distributionPackageRoot === undefined ? {} : { distributionPackageRoot }),
      });
  const runtime = await host?.openControl({ readOnly: true });
  let transientExecution: RuntimeHostTransientExecution | undefined;
  let openedResults: Awaited<ReturnType<typeof videoCliDistribution.openProjectResults>>;
  try {
    transientExecution = await host?.openTransientExecution();
    openedResults = await videoCliDistribution.openProjectResults(workspaceRoot, {
      packageRoot,
      ...(distributionPackageRoot === undefined ? {} : { distributionPackageRoot }),
    });
  } catch (error) {
    await transientExecution?.close();
    await runtime?.close();
    throw error;
  }
  const results = openedResults.repository;
  let presentationWrite: Promise<unknown> = Promise.resolve();
  return {
    ...(resolvedProfile === undefined ? {} : { profile: resolvedProfile }),
    ...(runtime === undefined ? {} : { runtime }),
    ...(transientExecution === undefined ? {} : { transientExecution }),
    async library(request) {
      return await readStudioLibrary({
        ...(resolvedProfile === undefined ? {} : { profile: resolvedProfile }),
        workspaceRoot,
        ...(runtime === undefined ? {} : { runtime }),
        results,
        ...request,
      });
    },
    async renameArtifact(build, output, displayName) {
      const saved = presentationWrite.then(async () => {
        const updated = await results.updatePresentation(build, { outputDisplayNames: { [output]: displayName } });
        return updated.outputs[output]?.displayName;
      });
      presentationWrite = saved.catch(() => undefined);
      return await saved;
    },
    async resolveHistoricalOutput(build, output) {
      return await resolveBuildResultValue(results, build, output);
    },
    async openArtifact(build, output) {
      const resolved = await results.resolve(build, output);
      if (resolved === undefined) return undefined;
      if ((resolved.value.kind !== "build-file" && resolved.value.kind !== "external-file") || !isMedia(resolved.value.mediaType)) return undefined;
      const file = resolved.value;
      return {
        mediaType: file.mediaType,
        size: file.size,
        open: async (range) => await results.openFile(resolved.build, file, range),
      };
    },
    async close() {
      await openedResults.close();
      await transientExecution?.close();
      await runtime?.close();
    },
  };
}
