import { isAbsolute, join, relative, resolve, sep } from "node:path";

import type { BuildCatalogEntry } from "@hypit/runtime";
import type { NodeRuntimeHost, RuntimeHostStatus } from "@hypit/runtime-host-node";
import type { StoredValue, TypeRef } from "@hypit/protocol";
import { FileBuildResultRepository } from "@hypit/build-result";
import type {
  BuildResultFileRef,
  BuildResultJsonValue,
  BuildResultRepository,
  RepositoryBuildResultOutput,
} from "@hypit/build-result";

import { resolveBuildResultRecord } from "@hypit/cli";
import { videoCliDistribution } from "@hypit/video-cli";

import type { StudioArtifactView, StudioLibraryView, StudioTaskView } from "./shared.js";

type RuntimeArchive = Awaited<ReturnType<NodeRuntimeHost["openArchive"]>>;

export type StudioArchive = {
  readonly profile?: string;
  readonly runtime?: Pick<RuntimeArchive, "status">;
  readonly library: () => Promise<StudioLibraryView>;
  readonly resolveBuildRecord: (
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
  ) => Promise<{ readonly mediaType: string; readonly bytes: Uint8Array } | undefined>;
  readonly close: () => Promise<void>;
};

function isWithin(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * A path inside the project reads the same on every platform, so the Studio library shows one Run
 * under one name wherever it is opened. A path outside the project is the machine's own, and stays
 * in that machine's form.
 */
function presentedPath(root: string, path: string): string {
  if (!isWithin(root, path)) return resolve(path);
  return (relative(resolve(root), resolve(path)) || ".").split(sep).join("/");
}

function buildBelongsTo(root: string, entry: BuildCatalogEntry): boolean {
  return isWithin(root, entry.run?.path ?? entry.source.path) || isWithin(root, entry.source.path);
}

function taskStatus(status: RuntimeHostStatus): StudioTaskView["status"] {
  if (status.dispatch !== undefined) {
    if (status.dispatch.phase === "terminal") return status.dispatch.terminal ?? "unknown";
    return status.dispatch.phase;
  }
  return status.build?.state.status ?? "unknown";
}

function targetNames(entry: BuildCatalogEntry, status: RuntimeHostStatus): readonly string[] {
  const state = status.build?.state;
  if (state === undefined) return [];
  const names = new Map(entry.aliases.flatMap((alias) => alias.ref.kind === "logical-output"
    ? [[alias.ref.id, alias.name] as const]
    : []));
  return state.request.targets.map((target) => names.get(target.output) ?? target.output);
}

function taskView(root: string, entry: BuildCatalogEntry, status: RuntimeHostStatus): StudioTaskView {
  const state = status.build?.state;
  return {
    id: entry.build,
    createdAt: entry.createdAt,
    status: taskStatus(status),
    source: presentedPath(root, entry.source.path),
    ...(entry.run === undefined ? {} : { run: presentedPath(root, entry.run.path) }),
    targets: targetNames(entry, status),
    acceptedRecords: state?.records.length ?? 0,
    outstandingCommands: state?.outstanding.length ?? 0,
    operations: status.operations.map((operation) => ({
      status: operation.status,
      ...(operation.progress?.phase === undefined ? {} : { phase: operation.progress.phase }),
      ...(operation.progress?.completed === undefined ? {} : { completed: operation.progress.completed }),
      ...(operation.progress?.total === undefined ? {} : { total: operation.progress.total }),
      ...(operation.progress?.unit === undefined ? {} : { unit: operation.progress.unit }),
    })),
  };
}

function isResultFile(value: BuildResultJsonValue): value is BuildResultFileRef {
  if (value === null || Array.isArray(value) || typeof value !== "object") return false;
  const item = value as Readonly<Record<string, unknown>>;
  return item.kind === "build-file" && typeof item.path === "string"
    && typeof item.size === "number" && typeof item.mediaType === "string";
}

function filesInResultValue(
  value: BuildResultJsonValue,
  valuePath = "$",
): readonly { readonly valuePath: string; readonly file: BuildResultFileRef }[] {
  if (isResultFile(value)) {
    return [{ valuePath, file: value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => filesInResultValue(item, `${valuePath}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => filesInResultValue(item, `${valuePath}.${key}`));
  }
  return [];
}

function filesInResolvedOutput(resolved: RepositoryBuildResultOutput): readonly {
  readonly valuePath: string;
  readonly file: BuildResultFileRef;
}[] {
  if (resolved.value.kind === "build-file") return [{ valuePath: "$", file: resolved.value }];
  if (resolved.value.kind === "json") return filesInResultValue(resolved.value.value);
  return [];
}

async function artifactsForResults(
  root: string,
  repository: BuildResultRepository,
): Promise<readonly StudioArtifactView[]> {
  const manifests = (await repository.list()).filter((manifest) =>
    isWithin(root, manifest.run?.path ?? manifest.source.path) || isWithin(root, manifest.source.path));
  const nested = await Promise.all(manifests.flatMap((manifest) =>
    Object.keys(manifest.outputs).map(async (output) => {
      const resolved = await repository.resolve(manifest.id, output);
      if (resolved === undefined) return [];
      return filesInResolvedOutput(resolved).map(({ valuePath, file }) => ({
        id: `${manifest.id}:${output}:${valuePath}`,
        build: manifest.id,
        createdAt: manifest.startedAt,
        output,
        valuePath,
        ownerBuild: file.build ?? resolved.build,
        ownerOutput: resolved.output,
        filePath: file.path,
        size: file.size,
        mediaType: file.mediaType,
        source: presentedPath(root, manifest.source.path),
        ...(manifest.run === undefined ? {} : { run: presentedPath(root, manifest.run.path) }),
      }));
    })));
  return nested.flat().sort((left, right) =>
    right.createdAt - left.createdAt
      || left.output.localeCompare(right.output)
      || left.valuePath.localeCompare(right.valuePath));
}

/** Build the Studio library from execution status and project-owned Build Results. */
export async function readStudioLibrary(input: {
  readonly profile?: string;
  readonly workspaceRoot: string;
  readonly runtime?: Pick<RuntimeArchive, "builds" | "status">;
  readonly results: BuildResultRepository;
}): Promise<StudioLibraryView> {
  const entries = (await input.runtime?.builds() ?? [])
    .filter((entry) => buildBelongsTo(input.workspaceRoot, entry));
  const statuses = await Promise.all(entries.map(async (entry) => ({
    entry,
    status: await input.runtime!.status(entry.build),
  })));
  return {
    environment: resolve(input.workspaceRoot),
    ...(input.profile === undefined ? {} : { runtime: resolve(input.profile) }),
    tasks: statuses.map(({ entry, status }) => taskView(input.workspaceRoot, entry, status)),
    artifacts: await artifactsForResults(input.workspaceRoot, input.results),
  };
}

/** Open a Runtime profile read-only; Studio never creates or mutates a Build. */
export async function openStudioArchive(
  profile: string | undefined,
  packageRoot: string,
  workspaceRoot: string,
  distributionPackageRoot?: string,
): Promise<StudioArchive | undefined> {
  const resolvedProfile = profile === undefined ? undefined : resolve(profile);
  const host = resolvedProfile === undefined
    ? undefined
    : await videoCliDistribution.openRuntimeHost(resolvedProfile, {
        packageRoot,
        ...(distributionPackageRoot === undefined ? {} : { distributionPackageRoot }),
      });
  const runtime = await host?.openArchive({ readOnly: true });
  const defaultResultRoot = join(workspaceRoot, ".hypit", "results");
  const openedResults = host?.openResults === undefined
    ? undefined
    : await host.openResults(defaultResultRoot);
  const results = openedResults?.repository ?? new FileBuildResultRepository(defaultResultRoot);
  return {
    ...(resolvedProfile === undefined ? {} : { profile: resolvedProfile }),
    ...(runtime === undefined ? {} : { runtime }),
    async library() {
      return await readStudioLibrary({
        ...(resolvedProfile === undefined ? {} : { profile: resolvedProfile }),
        workspaceRoot,
        ...(runtime === undefined ? {} : { runtime }),
        results,
      });
    },
    async resolveBuildRecord(build, output) {
      return await resolveBuildResultRecord(results, build, output);
    },
    async openArtifact(build, output, valuePath) {
      const resolved = await results.resolve(build, output);
      if (resolved === undefined) return undefined;
      const match = filesInResolvedOutput(resolved).find((item) => item.valuePath === valuePath);
      if (match === undefined) return undefined;
      const stream = await results.openFile(resolved.build, match.file);
      if (stream === undefined) return undefined;
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of stream) {
        const copy = Uint8Array.from(chunk);
        chunks.push(copy);
        size += copy.byteLength;
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { mediaType: match.file.mediaType, bytes };
    },
    async close() {
      await openedResults?.close();
      await runtime?.close();
    },
  };
}
