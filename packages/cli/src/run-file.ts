import { createHash, randomUUID } from "node:crypto";
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
  const isResultFile = (value: unknown): value is BuildResultFileRef => {
    if (value === null || Array.isArray(value) || typeof value !== "object") return false;
    const item = value as Readonly<Record<string, unknown>>;
    return item.kind === "build-file" && typeof item.path === "string"
      && typeof item.size === "number" && typeof item.mediaType === "string";
  };
  const isResultOutput = (value: unknown): value is {
    readonly kind: "build-output";
    readonly build: string;
    readonly output: string;
  } => {
    if (value === null || Array.isArray(value) || typeof value !== "object") return false;
    const item = value as Readonly<Record<string, unknown>>;
    return item.kind === "build-output" && typeof item.build === "string" && typeof item.output === "string";
  };
  const resultAttachment = async (
    repository: BuildResultRepository,
    owner: string,
    file: BuildResultFileRef,
  ): Promise<ArtifactAttachment> => {
    const build = file.build ?? owner;
    const initial = await repository.openFile(build, file);
    if (initial === undefined) throw new Error(`Build ${build} file ${file.path} is unavailable`);
    const hash = createHash("sha256");
    let size = 0;
    for await (const value of initial) {
      const chunk = Uint8Array.from(value);
      hash.update(chunk);
      size += chunk.byteLength;
    }
    if (size !== file.size) throw new Error(`Build ${build} file ${file.path} has size ${size}, expected ${file.size}`);
    const artifact: BlobRef = {
      kind: "blob",
      resource: `res_${randomUUID()}`,
      digest: `sha256:${hash.digest("hex")}`,
      size,
      mediaType: file.mediaType,
      origin: { kind: "build-file", build, path: file.path },
    };
    return {
      artifact,
      async open() {
        const stream = await repository.openFile(build, file);
        if (stream === undefined) throw new Error(`Build ${build} file ${file.path} is unavailable`);
        return stream;
      },
    };
  };
  const isBlob = (value: unknown): value is BlobRef => {
    if (value === null || Array.isArray(value) || typeof value !== "object") return false;
    const item = value as Readonly<Record<string, unknown>>;
    return item.kind === "blob" && typeof item.digest === "string"
      && typeof item.size === "number" && typeof item.mediaType === "string";
  };
  const resultValue = async (
    value: BuildResultJsonValue,
    owner: string,
    attachments: ArtifactAttachment[],
  ): Promise<CanonicalValue | BlobRef> => {
    const repository = options.results;
    if (repository === undefined) throw new Error("Build Result resolution has no Repository");
    if (isResultFile(value)) {
      const attachment = await resultAttachment(repository, owner, value);
      attachments.push(attachment);
      return attachment.artifact;
    }
    if (isResultOutput(value)) {
      const forwarded = await repository.resolve(value.build, value.output);
      if (forwarded === undefined) throw new Error(`Build ${value.build} has no Output ${value.output}`);
      return await resolvedValue(forwarded, attachments);
    }
    if (Array.isArray(value)) {
      return await Promise.all(value.map(async (item) => await resultValue(item, owner, attachments))) as CanonicalValue;
    }
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(await Promise.all(Object.entries(value)
        .map(async ([key, item]) => [key, await resultValue(item, owner, attachments)] as const))) as CanonicalValue;
    }
    return value;
  };
  const resolvedValue = async (
    resolved: RepositoryBuildResultOutput,
    attachments: ArtifactAttachment[],
  ): Promise<BlobRef | CanonicalValue> => {
    if (resolved.value.kind === "build-file") return await resultValue(resolved.value, resolved.build, attachments);
    if (resolved.value.kind === "inline") return resolved.value.value;
    return await resultValue(resolved.value.value, resolved.build, attachments);
  };
  const storedResult = async (build: string, output: string): Promise<{
    readonly type: RepositoryBuildResultOutput["type"];
    readonly value: StoredValue;
    readonly attachments?: readonly ArtifactAttachment[];
  } | undefined> => {
    const repository = options.results;
    if (repository === undefined) return undefined;
    const resolved = await repository.resolve(build, output);
    if (resolved === undefined) return undefined;
    const attachments: ArtifactAttachment[] = [];
    const value = await resolvedValue(resolved, attachments);
    return {
      type: resolved.type,
      value: isBlob(value) ? value : { kind: "inline", value },
      ...(attachments.length === 0 ? {} : { attachments }),
    };
  };
  return new NodeRunCompiler({
    authorCompiler: options.authorCompiler,
    frontends,
    fragments,
    ...(options.results !== undefined ? {
      async resolveBuildRecord(id: string, output: string) {
        return await storedResult(id, output);
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
