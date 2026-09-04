import { isAbsolute, relative, resolve, sep } from "node:path";

import { buildIdCreatedAt } from "@hypit/protocol";
import type { BuildView, NodeRuntimeHost } from "@hypit/runtime-host-node";
import type { StoredValue, TypeRef } from "@hypit/protocol";
import type {
  BuildResultFileRange,
  BuildResultFileRef,
  BuildResultManifest,
  BuildResultRepository,
  FinishedBuildResultManifest,
  RepositoryBuildResultOutput,
} from "@hypit/build-result";

import { resolveBuildResultValue } from "@hypit/cli";
import { videoCliDistribution } from "@hypit/video-cli";

import type { StudioArtifactView, StudioLibraryView, StudioTaskView } from "./shared.js";

type RuntimeControl = Awaited<ReturnType<NodeRuntimeHost["openControl"]>>;

export type StudioBuildLibrary = {
  readonly profile?: string;
  readonly runtime?: Pick<RuntimeControl, "activity">;
  readonly library: (before?: string) => Promise<StudioLibraryView>;
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
    valuePath: string,
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
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
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

function buildBelongsTo(root: string, view: BuildView): boolean {
  return view.source !== undefined
    && (isWithin(root, view.run?.path ?? view.source.path) || isWithin(root, view.source.path));
}

function taskStatus(view: BuildView): StudioTaskView["status"] {
  if (view.issue !== undefined) return "blocked";
  if (view.activity === "submitting" || view.activity === "ready") return "queued";
  if (view.activity === "saving-result") return "active";
  return view.activity;
}

function taskView(
  root: string,
  view: BuildView,
  result?: BuildResultManifest,
): StudioTaskView {
  if (view.source === undefined) throw new Error(`Active Build ${view.id} has no source`);
  return {
    id: view.id,
    ...(result?.title === undefined ? {} : { title: result.title }),
    ...(result?.note === undefined ? {} : { note: result.note }),
    ...(result?.highlightedOutputs === undefined ? {} : { highlightedOutputs: result.highlightedOutputs }),
    createdAt: view.createdAt,
    status: taskStatus(view),
    source: presentedPath(root, view.source.path),
    ...(view.run === undefined ? {} : { run: presentedPath(root, view.run.path) }),
    targets: result?.targets ?? view.targets,
    acceptedRecords: view.acceptedRecords,
    outstandingCommands: view.outstandingCommands,
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
    status: result.outcome,
    source: presentedPath(root, result.source.path),
    ...(result.run === undefined ? {} : { run: presentedPath(root, result.run.path) }),
    targets: result.targets,
    acceptedRecords: Object.keys(result.outputs).length,
    outstandingCommands: 0,
    operations: [],
  };
}

function presentedValuePath(path: readonly (string | number)[]): string {
  return path.reduce<string>((current, segment) => typeof segment === "number"
    ? `${current}[${segment}]`
    : /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(segment)
      ? `${current}.${segment}`
      : `${current}[${JSON.stringify(segment)}]`, "$");
}

function filesInResolvedOutput(resolved: RepositoryBuildResultOutput): readonly {
  readonly valuePath: string;
  readonly file: BuildResultFileRef;
}[] {
  if (resolved.value.kind === "build-file") return [{ valuePath: "$", file: resolved.value }];
  if (resolved.value.kind === "value") {
    return resolved.value.document.resources.map((binding) => ({
      valuePath: presentedValuePath(binding.at),
      file: binding.file,
    }));
  }
  return [];
}

async function artifactsForResults(
  root: string,
  repository: BuildResultRepository,
  manifests: readonly BuildResultManifest[],
): Promise<readonly StudioArtifactView[]> {
  const nested = await Promise.all(manifests.flatMap((manifest) =>
    Object.keys(manifest.outputs).map(async (output) => {
      const resolved = await repository.resolve(manifest.id, output);
      if (resolved === undefined) return [];
      return filesInResolvedOutput(resolved).map(({ valuePath, file }) => ({
        id: `${manifest.id}:${output}:${valuePath}`,
        build: manifest.id,
        createdAt: buildIdCreatedAt(manifest.id)!,
        output,
        highlighted: manifest.highlightedOutputs?.includes(output) === true,
        ...(manifest.title === undefined ? {} : { buildTitle: manifest.title }),
        ...(manifest.note === undefined ? {} : { buildNote: manifest.note }),
        valuePath,
        ownerBuild: resolved.build,
        ownerOutput: resolved.output,
        filePath: file.path,
        size: file.size,
        mediaType: file.mediaType,
        source: presentedPath(root, manifest.source.path),
        ...(manifest.run === undefined ? {} : { run: presentedPath(root, manifest.run.path) }),
      }));
    })));
  return nested.flat().sort((left, right) =>
    Number(right.highlighted) - Number(left.highlighted)
      || right.createdAt - left.createdAt
      || left.output.localeCompare(right.output)
      || left.valuePath.localeCompare(right.valuePath));
}

/** Build the Studio library from execution status and project-owned Build Results. */
export async function readStudioLibrary(input: {
  readonly profile?: string;
  readonly workspaceRoot: string;
  readonly runtime?: Pick<RuntimeControl, "activity">;
  readonly results: BuildResultRepository;
  readonly before?: string;
}): Promise<StudioLibraryView> {
  const page = await input.results.browse({
    limit: 25,
    ...(input.before === undefined ? {} : { before: input.before }),
  });
  const manifests = page.results.filter((manifest) =>
    isWithin(input.workspaceRoot, manifest.run?.path ?? manifest.source.path)
      || isWithin(input.workspaceRoot, manifest.source.path));
  const resultsByBuild = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  const active = input.runtime === undefined || input.before !== undefined
    ? []
    : (await input.runtime.activity()).builds;
  const views = active.filter((view) => buildBelongsTo(input.workspaceRoot, view));
  return {
    environment: resolve(input.workspaceRoot),
    ...(input.profile === undefined ? {} : { runtime: resolve(input.profile) }),
    ...(page.next === undefined ? {} : { next: page.next }),
    tasks: [
      ...views.map((view) => taskView(
        input.workspaceRoot,
        view,
        resultsByBuild.get(view.id),
      )),
      ...manifests
        .filter((manifest) => !views.some((view) => view.id === manifest.id))
        .map((manifest) => resultTaskView(input.workspaceRoot, manifest)),
    ].sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id)),
    artifacts: await artifactsForResults(input.workspaceRoot, input.results, manifests),
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
  let openedResults: Awaited<ReturnType<typeof videoCliDistribution.openProjectResults>>;
  try {
    openedResults = await videoCliDistribution.openProjectResults(workspaceRoot, {
      packageRoot,
      ...(distributionPackageRoot === undefined ? {} : { distributionPackageRoot }),
    });
  } catch (error) {
    await runtime?.close();
    throw error;
  }
  const results = openedResults.repository;
  return {
    ...(resolvedProfile === undefined ? {} : { profile: resolvedProfile }),
    ...(runtime === undefined ? {} : { runtime }),
    async library(before) {
      return await readStudioLibrary({
        ...(resolvedProfile === undefined ? {} : { profile: resolvedProfile }),
        workspaceRoot,
        ...(runtime === undefined ? {} : { runtime }),
        results,
        ...(before === undefined ? {} : { before }),
      });
    },
    async resolveHistoricalOutput(build, output) {
      return await resolveBuildResultValue(results, build, output);
    },
    async openArtifact(build, output, valuePath) {
      const resolved = await results.resolve(build, output);
      if (resolved === undefined) return undefined;
      const match = filesInResolvedOutput(resolved).find((item) => item.valuePath === valuePath);
      if (match === undefined) return undefined;
      return {
        mediaType: match.file.mediaType,
        size: match.file.size,
        open: async (range) => await results.openFile(resolved.build, match.file, range),
      };
    },
    async close() {
      await openedResults.close();
      await runtime?.close();
    },
  };
}
