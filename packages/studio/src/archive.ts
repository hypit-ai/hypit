import { isAbsolute, relative, resolve, sep } from "node:path";

import type { BuildCatalogEntry } from "@hypit/runtime";
import type { NodeRuntimeHost, RuntimeHostStatus } from "@hypit/runtime-host-node";
import type { Digest, StoredValue, TypeRef } from "@hypit/protocol";

import { collectArtifacts, selectArchivedRecord } from "@hypit/cli";
import { videoCliDistribution } from "@hypit/video-cli";

import type { StudioArtifactView, StudioLibraryView, StudioTaskView } from "./shared.js";

type RuntimeArchive = Awaited<ReturnType<NodeRuntimeHost["openArchive"]>>;

export type StudioArchive = {
  readonly profile: string;
  readonly runtime: Pick<RuntimeArchive, "status">;
  readonly library: () => Promise<StudioLibraryView>;
  readonly resolveBuildRecord: (
    build: string,
    output: string,
  ) => Promise<{ readonly type: TypeRef; readonly value: StoredValue } | undefined>;
  readonly read: (digest: Digest) => Promise<Uint8Array | undefined>;
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

function artifactsForBuild(
  root: string,
  entry: BuildCatalogEntry,
  status: RuntimeHostStatus,
): readonly StudioArtifactView[] {
  const state = status.build?.state;
  if (state === undefined) return [];
  const outputsByRecord = new Map<string, Set<string>>();
  const recordForOutput = new Map(state.plan.selections.map((selection) => [selection.output, selection.record]));
  for (const alias of entry.aliases) {
    const record = alias.ref.kind === "record" ? alias.ref.id : recordForOutput.get(alias.ref.id);
    if (record === undefined) continue;
    const names = outputsByRecord.get(record) ?? new Set<string>();
    names.add(alias.name);
    outputsByRecord.set(record, names);
  }

  type Held = {
    readonly digest: Digest;
    readonly size: number;
    readonly mediaType: string;
    readonly records: Set<string>;
    readonly outputs: Set<string>;
    readonly paths: Set<string>;
  };
  const found = new Map<Digest, Held>();
  for (const record of state.records) {
    const value = record.value.kind === "blob" ? record.value : record.value.value;
    for (const artifact of collectArtifacts(value)) {
      const held = found.get(artifact.digest) ?? {
        digest: artifact.digest,
        size: artifact.size,
        mediaType: artifact.mediaType,
        records: new Set<string>(),
        outputs: new Set<string>(),
        paths: new Set<string>(),
      };
      held.records.add(record.id);
      for (const output of outputsByRecord.get(record.id) ?? []) held.outputs.add(output);
      held.paths.add(`${record.id}${artifact.path === "$" ? "" : artifact.path.slice(1)}`);
      found.set(artifact.digest, held);
    }
  }
  return [...found.values()].map((artifact) => ({
    id: `${entry.build}:${artifact.digest}`,
    build: entry.build,
    createdAt: entry.createdAt,
    digest: artifact.digest,
    size: artifact.size,
    mediaType: artifact.mediaType,
    records: [...artifact.records],
    outputs: [...artifact.outputs],
    paths: [...artifact.paths],
    source: presentedPath(root, entry.source.path),
    ...(entry.run === undefined ? {} : { run: presentedPath(root, entry.run.path) }),
  })).sort((left, right) =>
    (left.outputs[0] ?? left.records[0] ?? left.digest)
      .localeCompare(right.outputs[0] ?? right.records[0] ?? right.digest));
}

/** Build the Studio library from the existing Catalog, Archive and Artifact references. */
export async function readStudioLibrary(input: {
  readonly profile: string;
  readonly workspaceRoot: string;
  readonly runtime: Pick<RuntimeArchive, "builds" | "status">;
}): Promise<StudioLibraryView> {
  const entries = (await input.runtime.builds())
    .filter((entry) => buildBelongsTo(input.workspaceRoot, entry));
  const statuses = await Promise.all(entries.map(async (entry) => ({
    entry,
    status: await input.runtime.status(entry.build),
  })));
  return {
    environment: resolve(input.workspaceRoot),
    runtime: resolve(input.profile),
    tasks: statuses.map(({ entry, status }) => taskView(input.workspaceRoot, entry, status)),
    artifacts: statuses.flatMap(({ entry, status }) => artifactsForBuild(input.workspaceRoot, entry, status)),
  };
}

/** Open a Runtime profile read-only; Studio never creates or mutates a Build. */
export async function openStudioArchive(
  profile: string | undefined,
  packageRoot: string,
  workspaceRoot: string,
  distributionPackageRoot?: string,
): Promise<StudioArchive | undefined> {
  if (profile === undefined) return undefined;
  const resolvedProfile = resolve(profile);
  const host = await videoCliDistribution.openRuntimeHost(resolvedProfile, {
    packageRoot,
    ...(distributionPackageRoot === undefined ? {} : { distributionPackageRoot }),
  });
  const runtime = await host.openArchive({ readOnly: true });
  const artifacts = await host.openArtifacts();
  return {
    profile: resolvedProfile,
    runtime,
    async library() {
      return await readStudioLibrary({ profile: resolvedProfile, workspaceRoot, runtime });
    },
    async resolveBuildRecord(build, output) {
      const held = await runtime.status(build);
      const state = held.build?.state;
      if (state === undefined) return undefined;
      const alias = held.catalog?.aliases.find((item) => item.name === output);
      if (alias !== undefined && alias.ref.kind !== "logical-output") {
        throw new Error(`Build ${build} alias ${output} is an authored Record, not a Logical Output`);
      }
      const record = alias === undefined
        ? selectArchivedRecord(state, { output })
        : selectArchivedRecord(state, {
            name: output,
            catalog: held.catalog as NonNullable<typeof held.catalog>,
          });
      return { type: record.type, value: record.value };
    },
    async read(digest) { return await artifacts.readArtifact(digest) ?? undefined; },
    async close() {
      await artifacts.close();
      await runtime.close();
    },
  };
}
