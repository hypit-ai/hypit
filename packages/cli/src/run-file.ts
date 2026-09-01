import { randomUUID } from "node:crypto";
import type {
  BuildResultRepository,
  BuildResultFileRef,
  BuildResultJsonValue,
  RepositoryBuildResultOutput,
} from "@hypit/build-result";
import { NodeRunCompiler } from "@hypit/compiler-node";
import type {
  NodeCompiledRun,
  NodeCompiler,
} from "@hypit/compiler-node";
import type { CliRuntime } from "./runtime-port.js";
import type { NodePackageContribution } from "@hypit/package-loader-node";
import type { ArtifactAttachment, WorkspaceSession } from "@hypit/workspace";
import type { BlobRef, CanonicalValue, StoredValue } from "@hypit/protocol";
import {
  installRunFragmentHostFacets,
  runFrontendsFromHostFacets,
  RunFragmentRegistry,
  RunFrontendRegistry,
} from "@hypit/run";
import type { RunFrontend } from "@hypit/run";
import { selectArchivedRecord } from "./archive.js";

export type LoadedRunFile = NodeCompiledRun & {
  readonly path: string;
  readonly compiler: NodeRunCompiler;
};

export async function checkRunFile(options: {
  readonly workspace: WorkspaceSession;
  readonly authorCompiler: NodeCompiler;
  readonly frontends: readonly RunFrontend[];
  readonly packageContributions: readonly NodePackageContribution[];
}) {
  const compiler = createRunCompiler(options);
  return await compiler.checkSource(options.workspace.entry, options.workspace);
}

function isResultFile(value: unknown): value is BuildResultFileRef {
  if (value === null || Array.isArray(value) || typeof value !== "object") return false;
  const item = value as Readonly<Record<string, unknown>>;
  return item.kind === "build-file" && typeof item.path === "string"
    && typeof item.size === "number" && typeof item.mediaType === "string";
}

function isResultOutput(value: unknown): value is {
  readonly kind: "build-output";
  readonly build: string;
  readonly output: string;
} {
  if (value === null || Array.isArray(value) || typeof value !== "object") return false;
  const item = value as Readonly<Record<string, unknown>>;
  return item.kind === "build-output" && typeof item.build === "string" && typeof item.output === "string";
}

function isBlob(value: unknown): value is BlobRef {
  if (value === null || Array.isArray(value) || typeof value !== "object") return false;
  const item = value as Readonly<Record<string, unknown>>;
  return item.kind === "blob" && typeof item.resource === "string"
    && typeof item.size === "number" && typeof item.mediaType === "string";
}

/** Resolve one historical public Output into an ordinary Run value plus lazy file attachments. */
export async function resolveBuildResultRecord(
  repository: BuildResultRepository,
  build: string,
  output: string,
): Promise<{
  readonly type: RepositoryBuildResultOutput["type"];
  readonly value: StoredValue;
  readonly attachments?: readonly ArtifactAttachment[];
} | undefined> {
  const resultAttachment = async (owner: string, file: BuildResultFileRef): Promise<ArtifactAttachment> => {
    const fileBuild = file.build ?? owner;
    const artifact: BlobRef = {
      kind: "blob",
      resource: `res_${randomUUID()}`,
      size: file.size,
      mediaType: file.mediaType,
      origin: { kind: "build-file", build: fileBuild, path: file.path },
    };
    return {
      artifact,
      async open() {
        const stream = await repository.openFile(fileBuild, file);
        if (stream === undefined) throw new Error(`Build ${fileBuild} file ${file.path} is unavailable`);
        return stream;
      },
    };
  };
  const attachments: ArtifactAttachment[] = [];
  const resultValue = async (
    value: BuildResultJsonValue,
    owner: string,
  ): Promise<CanonicalValue | BlobRef> => {
    if (isResultFile(value)) {
      const attachment = await resultAttachment(owner, value);
      attachments.push(attachment);
      return attachment.artifact;
    }
    if (isResultOutput(value)) {
      const forwarded = await repository.resolve(value.build, value.output);
      if (forwarded === undefined) throw new Error(`Build ${value.build} has no Output ${value.output}`);
      return await resolvedValue(forwarded);
    }
    if (Array.isArray(value)) {
      return await Promise.all(value.map(async (item) => await resultValue(item, owner))) as CanonicalValue;
    }
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(await Promise.all(Object.entries(value)
        .map(async ([key, item]) => [key, await resultValue(item, owner)] as const))) as CanonicalValue;
    }
    return value;
  };
  const resolvedValue = async (resolved: RepositoryBuildResultOutput): Promise<BlobRef | CanonicalValue> => {
    if (resolved.value.kind === "build-file") return await resultValue(resolved.value, resolved.build);
    if (resolved.value.kind === "inline") return resolved.value.value;
    return await resultValue(resolved.value.value, resolved.build);
  };
  const resolved = await repository.resolve(build, output);
  if (resolved === undefined) return undefined;
  const value = await resolvedValue(resolved);
  return {
    type: resolved.type,
    value: isBlob(value) ? value : { kind: "inline", value },
    ...(attachments.length === 0 ? {} : { attachments }),
  };
}

function createRunCompiler(options: {
  readonly authorCompiler: NodeCompiler;
  readonly frontends: readonly RunFrontend[];
  readonly packageContributions: readonly NodePackageContribution[];
  readonly runtime?: Pick<CliRuntime, "status">;
  readonly results?: BuildResultRepository;
}): NodeRunCompiler {
  const fragments = new RunFragmentRegistry();
  for (const item of options.packageContributions) {
    installRunFragmentHostFacets(item.hostFacets ?? [], fragments);
  }
  const frontends = new RunFrontendRegistry();
  for (const frontend of options.frontends) frontends.register(frontend);
  const archive = new Map<string, Awaited<ReturnType<CliRuntime["status"]>>>();
  const archived = async (id: string) => {
    const existing = archive.get(id);
    if (existing !== undefined) return existing;
    const status = await options.runtime!.status(id);
    archive.set(id, status);
    return status;
  };
  return new NodeRunCompiler({
    authorCompiler: options.authorCompiler,
    frontends,
    fragments,
    ...(options.results !== undefined ? {
      async resolveBuildRecord(id: string, output: string) {
        return await resolveBuildResultRecord(options.results!, id, output);
      },
    } : options.runtime === undefined ? {} : {
      async resolveBuildRecord(id: string, output: string) {
        const status = await archived(id);
        if (status.build === undefined) return undefined;
        const catalog = status.catalog;
        const alias = catalog?.aliases.find((item) => item.name === output);
        if (alias !== undefined && alias.ref.kind !== "logical-output") {
          throw new Error(`Build ${id} alias ${output} is an authored Record, not a Logical Output`);
        }
        const record = alias === undefined
          ? selectArchivedRecord(status.build.state, { output })
          : selectArchivedRecord(status.build.state, {
              name: output,
              catalog: catalog as NonNullable<typeof catalog>,
            });
        return { type: record.type, value: record.value };
      },
    }),
  });
}

export function collectRunFrontends(
  packages: readonly NodePackageContribution[],
): readonly RunFrontend[] {
  return packages.flatMap((item) => runFrontendsFromHostFacets(item.hostFacets ?? []));
}

export async function loadRunFile(options: {
  readonly workspace: WorkspaceSession;
  readonly authorCompiler: NodeCompiler;
  readonly frontends: readonly RunFrontend[];
  readonly packageContributions: readonly NodePackageContribution[];
  readonly runtime?: Pick<CliRuntime, "status">;
  readonly results?: BuildResultRepository;
}): Promise<LoadedRunFile> {
  const compiler = createRunCompiler(options);
  const compiled = await compiler.compileSource(options.workspace.entry, options.workspace);
  return { path: options.workspace.entry.id, compiler, ...compiled };
}
