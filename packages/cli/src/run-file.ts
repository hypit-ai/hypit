import { randomUUID } from "node:crypto";
import type {
  BuildResultRepository,
  BuildResultFileRef,
  BuildResultValuePath,
  RepositoryBuildResultOutput,
} from "@hypit/build-result";
import { NodeRunCompiler } from "@hypit/compiler-node";
import type {
  NodeCompiledRun,
  NodeCompiler,
} from "@hypit/compiler-node";
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

export type LoadedRunFile = NodeCompiledRun & {
  readonly path: string;
  readonly compiler: NodeRunCompiler;
};

type BuildResultResolutionSession = {
  readonly files: Map<string, ArtifactAttachment>;
  readonly outputs: Map<string, Promise<RepositoryBuildResultOutput | undefined>>;
};

function createBuildResultResolutionSession(): BuildResultResolutionSession {
  return { files: new Map(), outputs: new Map() };
}

export async function checkRunFile(options: {
  readonly workspace: WorkspaceSession;
  readonly authorCompiler: NodeCompiler;
  readonly frontends: readonly RunFrontend[];
  readonly packageContributions: readonly NodePackageContribution[];
}) {
  const compiler = createRunCompiler(options);
  return await compiler.checkSource(options.workspace.entry, options.workspace);
}

function replaceValueAtPath(
  value: CanonicalValue,
  path: BuildResultValuePath,
  replacement: BlobRef,
): CanonicalValue {
  if (path.length === 0) return replacement;
  const segment = path[0]!;
  const rest = path.slice(1);
  if (typeof segment === "number") {
    if (!Array.isArray(value) || segment < 0 || segment >= value.length) {
      throw new Error(`Result Resource path ${JSON.stringify(path)} does not address an array item`);
    }
    return value.map((item, index) => index === segment
      ? replaceValueAtPath(item, rest, replacement)
      : item);
  }
  if (value === null || Array.isArray(value) || typeof value !== "object" || !Object.hasOwn(value, segment)) {
    throw new Error(`Result Resource path ${JSON.stringify(path)} does not address an object property`);
  }
  return {
    ...value,
    [segment]: replaceValueAtPath(
      (value as Readonly<Record<string, CanonicalValue>>)[segment]!,
      rest,
      replacement,
    ),
  };
}

/** Resolve one historical public Output into an ordinary Run value plus lazy file attachments. */
export async function resolveBuildResultValue(
  repository: BuildResultRepository,
  build: string,
  output: string,
  session: BuildResultResolutionSession = createBuildResultResolutionSession(),
): Promise<{
  readonly type: RepositoryBuildResultOutput["type"];
  readonly value: StoredValue;
  readonly attachments?: readonly ArtifactAttachment[];
  } | undefined> {
  const resultAttachment = async (owner: string, file: BuildResultFileRef): Promise<ArtifactAttachment> => {
    const address = `${owner}\u0000${file.path}`;
    const existing = session.files.get(address);
    if (existing !== undefined) return existing;
    const artifact: BlobRef = {
      kind: "blob",
      resource: `res_${randomUUID()}`,
      size: file.size,
      mediaType: file.mediaType,
    };
    const attachment = {
      artifact,
      async open() {
        const stream = await repository.openFile(owner, file);
        if (stream === undefined) throw new Error(`Build ${owner} file ${file.path} is unavailable`);
        return stream;
      },
    };
    session.files.set(address, attachment);
    return attachment;
  };
  const attachments = new Map<string, ArtifactAttachment>();
  const address = `${build}\u0000${output}`;
  let pending = session.outputs.get(address);
  if (pending === undefined) {
    pending = repository.resolve(build, output);
    session.outputs.set(address, pending);
  }
  const resolved = await pending;
  if (resolved === undefined) return undefined;
  let value: StoredValue;
  if (resolved.value.kind === "build-file") {
    const attachment = await resultAttachment(resolved.build, resolved.value);
    attachments.set(attachment.artifact.resource, attachment);
    value = attachment.artifact;
  } else if (resolved.value.kind === "inline") {
    value = { kind: "inline", value: resolved.value.value };
  } else {
    let composite = resolved.value.document.value;
    for (const binding of resolved.value.document.resources) {
      const attachment = await resultAttachment(resolved.build, binding.file);
      attachments.set(attachment.artifact.resource, attachment);
      composite = replaceValueAtPath(composite, binding.at, attachment.artifact);
    }
    value = { kind: "inline", value: composite };
  }
  return {
    type: resolved.type,
    value,
    ...(attachments.size === 0 ? {} : { attachments: [...attachments.values()] }),
  };
}

function createRunCompiler(options: {
  readonly authorCompiler: NodeCompiler;
  readonly frontends: readonly RunFrontend[];
  readonly packageContributions: readonly NodePackageContribution[];
  readonly results?: BuildResultRepository;
}): NodeRunCompiler {
  const resultSession = createBuildResultResolutionSession();
  const fragments = new RunFragmentRegistry();
  for (const item of options.packageContributions) {
    installRunFragmentHostFacets(item.hostFacets ?? [], fragments);
  }
  const frontends = new RunFrontendRegistry();
  for (const frontend of options.frontends) frontends.register(frontend);
  return new NodeRunCompiler({
    authorCompiler: options.authorCompiler,
    frontends,
    fragments,
    ...(options.results === undefined ? {} : {
      async resolveHistoricalOutput(id: string, output: string) {
        return await resolveBuildResultValue(options.results!, id, output, resultSession);
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
  readonly results?: BuildResultRepository;
}): Promise<LoadedRunFile> {
  const compiler = createRunCompiler(options);
  const compiled = await compiler.compileSource(options.workspace.entry, options.workspace);
  return { path: options.workspace.entry.id, compiler, ...compiled };
}
