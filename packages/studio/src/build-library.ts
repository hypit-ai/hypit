import { buildResultOutput, fileReferenceIdentity } from "@hypit/hypit/result/node";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { buildIdCreatedAt } from "@hypit/hypit/protocol";
import type {
  BuildResultFileRange,
  BuildResultManifest,
  BuildResultRepository,
  FinishedBuildResultManifest,
} from "@hypit/hypit/result/node";

import type { CliBuildView as BuildView, CliDistribution, CliRuntimeHost, CliTransientExecution } from "@hypit/hypit/cli";

import type { StudioArtifactView, StudioLibraryRequest, StudioLibraryView, StudioTaskView } from "./shared.js";
import { mergeStudioArtifacts } from "./library-media.js";

type RuntimeControl = Awaited<ReturnType<CliRuntimeHost["openControl"]>>;

export type StudioBuildLibrary = {
  readonly profile?: string;
  readonly runtime?: Pick<RuntimeControl, "activity">;
  /** Runtime-owned, disposable execution for the current authoring session. */
  readonly transientExecution?: CliTransientExecution;
  readonly library: (request: StudioLibraryRequest) => Promise<StudioLibraryView>;
  readonly renameArtifact: (build: string, output: string, displayName: string | null) => Promise<string | undefined>;
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
 * A path inside the project reads the same on every platform, so the Studio library shows one Invocation Source
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
  if (view.sourcePath === undefined) throw new Error(`Active Build ${view.id} has no source`);
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
    source: presentedPath(root, view.sourcePath),
    ...(view.invocationSourcePath === undefined
      ? {}
      : { invocationSource: presentedPath(root, view.invocationSourcePath) }),
    targets: result?.targets ?? view.targets,
    operations: view.operations.map((operation) => ({
      status: operation.status === "received" ? "pending" : operation.status,
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
    source: presentedPath(root, result.sourceId),
    ...(result.invocationSourceId === undefined
      ? {}
      : { invocationSource: presentedPath(root, result.invocationSourceId) }),
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
      // Value-document Outputs remain intact. Listing media never opens their documents.
      if (entry.value.kind !== "build-file") return [];
      const description = { representation: "file" as const, mediaType: entry.value.mediaType, size: entry.value.size };
      if (description?.representation !== "file" || !isMedia(description.mediaType)) return [];
      if (media !== undefined && !description.mediaType.startsWith(`${media}/`)) return [];
      const file = entry.value;
      const source = presentedPath(root, manifest.sourceId);
      const invocationSource = manifest.invocationSourceId === undefined
        ? undefined
        : presentedPath(root, manifest.invocationSourceId);
      return [{
        id: fileReferenceIdentity(manifest.id, file),
        build: manifest.id,
        createdAt: buildIdCreatedAt(manifest.id)!,
        output,
        nameEditable: manifest.outcome !== undefined,
        ...(entry.displayName === undefined ? {} : { displayName: entry.displayName }),
        highlighted: manifest.highlightedOutputs?.includes(output) === true,
        ...(manifest.title === undefined ? {} : { buildTitle: manifest.title }),
        ...(manifest.note === undefined ? {} : { buildNote: manifest.note }),
        filePath: file.path,
        size: file.size,
        mediaType: file.mediaType,
        source,
        ...(invocationSource === undefined ? {} : { invocationSource }),
        origins: [{
          build: manifest.id,
          output,
          source,
          ...(invocationSource === undefined ? {} : { invocationSource }),
        }],
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
  const matches = (item: { readonly id: string; readonly source: string; readonly invocationSource?: string }) =>
    (isWithin(input.workspaceRoot, item.invocationSource ?? item.source) || isWithin(input.workspaceRoot, item.source))
    && (input.build === undefined || item.id === input.build)
    && (input.invocationSource === undefined || (item.invocationSource !== undefined
      && projectPath(input.workspaceRoot, item.invocationSource)
        === projectPath(input.workspaceRoot, input.invocationSource)));
  // Read activity before Results so a Build that finishes during this query is still represented.
  const active = input.runtime === undefined || input.before !== undefined
    ? [] : (await input.runtime.activity()).builds;
  const views = active.filter((view) => view.sourcePath !== undefined && matches({
    id: view.id,
    source: view.sourcePath,
    ...(view.invocationSourcePath === undefined ? {} : { invocationSource: view.invocationSourcePath }),
  }));
  let page = input.build === undefined
    ? await input.results.browse({ limit: 25, ...(input.before === undefined ? {} : { before: input.before }) })
    : { results: [await input.results.read(input.build)].filter((item): item is BuildResultManifest => item !== undefined) };
  const manifests = page.results.filter((manifest) => matches({
    id: manifest.id,
    source: manifest.sourceId,
    ...(manifest.invocationSourceId === undefined ? {} : { invocationSource: manifest.invocationSourceId }),
  }));
  const resultsByBuild = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  await Promise.all(views.filter((view) => !resultsByBuild.has(view.id)).map(async (view) => {
    const result = await input.results.read(view.id);
    if (result !== undefined && matches({ id: result.id, source: result.sourceId,
      ...(result.invocationSourceId === undefined
        ? {}
        : { invocationSource: result.invocationSourceId }) })) resultsByBuild.set(view.id, result);
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
        ...await artifactsForResults(input.workspaceRoot, input.results, page.results.filter((manifest) => matches({
          id: manifest.id,
          source: manifest.sourceId,
          ...(manifest.invocationSourceId === undefined
            ? {}
            : { invocationSource: manifest.invocationSourceId }),
        })), input.media)]);
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
  distribution: CliDistribution,
  profile: string | undefined,
  packageRoot: string,
  workspaceRoot: string,
  distributionPackageRoot?: string,
): Promise<StudioBuildLibrary> {
  const resolvedProfile = profile === undefined ? undefined : resolve(profile);
  const host = resolvedProfile === undefined
    ? undefined
    : await distribution.openRuntimeHost(resolvedProfile, {
        packageRoot,
        ...(distributionPackageRoot === undefined ? {} : { distributionPackageRoot }),
      });
  const runtime = await host?.openControl({ readOnly: true });
  let transientExecution: CliTransientExecution | undefined;
  let openedResults: Awaited<ReturnType<CliDistribution["openProjectResults"]>>;
  try {
    transientExecution = await host?.openTransientExecution();
    openedResults = await distribution.openProjectResults(workspaceRoot, {
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
        return buildResultOutput(updated, output)?.displayName;
      });
      presentationWrite = saved.catch(() => undefined);
      return await saved;
    },
    async openArtifact(build, output) {
      const resolved = await results.resolve(build, output);
      if (resolved === undefined) return undefined;
      if (resolved.value.kind !== "build-file" || !isMedia(resolved.value.mediaType)) return undefined;
      const file = resolved.value;
      return {
        mediaType: file.mediaType,
        size: file.size,
        open: async (range) => await results.openFile(build, file, range),
      };
    },
    async close() {
      await openedResults.close();
      await transientExecution?.close();
      await runtime?.close();
    },
  };
}
