import { fileReferenceIdentity, locateRepositoryBuildResultOutput, ownedFileReference } from "@hypit/result/node";
import { randomUUID } from "node:crypto";
import type {
  BuildResultRepository,
  BuildResultFileRef,
  BuildResultValuePath,
  RepositoryBuildResultOutput,
} from "@hypit/result/node";
import { RunCompiler } from "@hypit/compiler";
import type {
  CompiledRun,
  RunAuthorCompiler,
} from "@hypit/compiler";
import type { PackageContribution } from "@hypit/loader";
import type { BlobAttachment, WorkspaceSession } from "@hypit/workspace";
import type { BlobRef, CanonicalValue, Value } from "@hypit/protocol";
import {
  installRunFragmentFacets,
  runFrontendsFromFacets,
  RunFragmentRegistry,
  RunFrontendRegistry,
} from "@hypit/run";
import type { RunFrontend } from "@hypit/run";

export type LoadedRunFile = CompiledRun & {
  readonly path: string;
  readonly compiler: RunCompiler;
  readonly resultResourceReferences: Readonly<Record<string, BuildResultFileRef>>;
};

type BuildResultResolutionSession = {
  readonly files: Map<string, BlobAttachment>;
  readonly references: Map<string, BuildResultFileRef>;
  readonly outputs: Map<string, Promise<RepositoryBuildResultOutput | undefined>>;
};

function createBuildResultResolutionSession(): BuildResultResolutionSession {
  return { files: new Map(), outputs: new Map(), references: new Map() };
}

export async function checkRunFile(options: {
  readonly workspace: WorkspaceSession;
  readonly authorCompiler: RunAuthorCompiler;
  readonly frontends: readonly RunFrontend[];
  readonly packageContributions: readonly PackageContribution[];
}) {
  const compiler = createRunCompiler(options);
  return await compiler.checkResolvedSource(options.workspace.entry, options.workspace);
}

type ResultValueBindingTree = {
  replacement?: BlobRef;
  readonly children: Map<string | number, ResultValueBindingTree>;
};

function bindResultResources(
  value: CanonicalValue,
  bindings: readonly { readonly at: BuildResultValuePath; readonly replacement: BlobRef }[],
): CanonicalValue {
  const root: ResultValueBindingTree = { children: new Map() };
  for (const binding of bindings) {
    let node = root;
    for (const segment of binding.at) {
      let child = node.children.get(segment);
      if (child === undefined) {
        child = { children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    if (node.replacement !== undefined) {
      throw new Error(`Result Resource path ${JSON.stringify(binding.at)} is bound more than once`);
    }
    node.replacement = binding.replacement;
  }
  const rebuild = (current: CanonicalValue, node: ResultValueBindingTree, path: BuildResultValuePath): CanonicalValue => {
    if (node.replacement !== undefined) {
      if (node.children.size > 0 || current !== null) {
        throw new Error(`Result Resource path ${JSON.stringify(path)} does not address a null Resource slot`);
      }
      return node.replacement;
    }
    if (node.children.size === 0) return current;
    if (Array.isArray(current)) {
      for (const segment of node.children.keys()) {
        if (typeof segment !== "number" || segment < 0 || segment >= current.length) {
          throw new Error(`Result Resource path ${JSON.stringify([...path, segment])} does not address an array item`);
        }
      }
      return current.map((item, index) => {
        const child = node.children.get(index);
        return child === undefined ? item : rebuild(item, child, [...path, index]);
      });
    }
    if (current === null || typeof current !== "object") {
      throw new Error(`Result Resource path ${JSON.stringify(path)} does not address a container`);
    }
    const record = current as Readonly<Record<string, CanonicalValue>>;
    const result: Record<string, CanonicalValue> = { ...record };
    for (const [segment, child] of node.children) {
      if (typeof segment !== "string" || !Object.hasOwn(record, segment)) {
        throw new Error(`Result Resource path ${JSON.stringify([...path, segment])} does not address an object property`);
      }
      result[segment] = rebuild(record[segment]!, child, [...path, segment]);
    }
    return result;
  };
  return rebuild(value, root, []);
}

/** Resolve one historical public Output into an ordinary Run value plus lazy file attachments. */
export async function resolveBuildResultValue(
  repository: BuildResultValueRepository,
  build: string,
  output: string,
  session: BuildResultResolutionSession = createBuildResultResolutionSession(),
): Promise<{
  readonly type: RepositoryBuildResultOutput["type"];
  readonly value: Value;
  readonly attachments?: readonly BlobAttachment[];
  } | undefined> {
  const manifest = await repository.read(build);
  if (manifest?.outcome === undefined) return undefined;
  const resultAttachment = async (owner: string, file: BuildResultFileRef): Promise<BlobAttachment> => {
    const address = fileReferenceIdentity(owner, file);
    const existing = session.files.get(address);
    if (existing !== undefined) return existing;
    file = await repository.describeFile(owner, file);
    const blob: BlobRef = {
      kind: "blob",
      resource: `res_${randomUUID()}`,
      size: file.size,
      mediaType: file.mediaType,
    };
    const attachment = {
      blob,
      async open() {
        const stream = await repository.openFile(owner, file);
        if (stream === undefined) throw new Error(`File ${address} is unavailable`);
        return stream;
      },
      async openRange(range: { readonly start: number; readonly endExclusive: number }) {
        const stream = await repository.openFile(owner, file, range);
        if (stream === undefined) throw new Error(`File ${address} is unavailable`);
        return stream;
      },
    };
    session.files.set(address, attachment);
    session.references.set(blob.resource, ownedFileReference(owner, file));
    return attachment;
  };
  const attachments = new Map<string, BlobAttachment>();
  const address = `${build}\u0000${output}`;
  let pending = session.outputs.get(address);
  if (pending === undefined) {
    pending = repository.resolve(build, output);
    session.outputs.set(address, pending);
  }
  const resolved = await pending;
  if (resolved === undefined) return undefined;
  const owner = resolved.build === build ? manifest : await repository.read(resolved.build);
  if (owner?.outcome === undefined) return undefined;
  let value: Value;
  if (resolved.value.kind === "build-file" || resolved.value.kind === "external-file") {
    const attachment = await resultAttachment(resolved.build, resolved.value);
    attachments.set(attachment.blob.resource, attachment);
    value = attachment.blob;
  } else if (resolved.value.kind === "inline") {
    value = resolved.value.value;
  } else {
    const bindings: Array<{ readonly at: BuildResultValuePath; readonly replacement: BlobRef }> = [];
    for (const binding of resolved.value.document.resources) {
      const attachment = await resultAttachment(resolved.build, binding.file);
      attachments.set(attachment.blob.resource, attachment);
      bindings.push({ at: binding.at, replacement: attachment.blob });
    }
    const structuredValue = bindResultResources(resolved.value.document.value, bindings);
    value = structuredValue;
  }
  return {
    type: resolved.type,
    value,
    ...(attachments.size === 0 ? {} : { attachments: [...attachments.values()] }),
  };
}

/** Result capabilities needed to turn one historical Output back into a Run value. */
export type BuildResultValueRepository = Pick<BuildResultRepository,
  "read" | "resolve" | "describeFile" | "openFile">;

function createRunCompiler(options: {
  readonly authorCompiler: RunAuthorCompiler;
  readonly frontends: readonly RunFrontend[];
  readonly packageContributions: readonly PackageContribution[];
  readonly results?: BuildResultRepository;
}, resultSession = createBuildResultResolutionSession()): RunCompiler {
  const fragments = new RunFragmentRegistry();
  for (const item of options.packageContributions) {
    installRunFragmentFacets(item.facets ?? [], fragments);
  }
  const frontends = new RunFrontendRegistry();
  for (const frontend of options.frontends) frontends.register(frontend);
  return new RunCompiler({
    authorCompiler: options.authorCompiler,
    frontends,
    fragments,
    ...(options.results === undefined ? {} : {
      async locateHistoricalOutput(id: string, output: string) {
        return await locateRepositoryBuildResultOutput(options.results!, id, output);
      },
      async resolveHistoricalOutput(id: string, output: string) {
        return await resolveBuildResultValue(options.results!, id, output, resultSession);
      },
    }),
  });
}

export function collectRunFrontends(
  packages: readonly PackageContribution[],
): readonly RunFrontend[] {
  return packages.flatMap((item) => runFrontendsFromFacets(item.facets ?? []));
}

export async function loadRunFile(options: {
  readonly workspace: WorkspaceSession;
  readonly authorCompiler: RunAuthorCompiler;
  readonly frontends: readonly RunFrontend[];
  readonly packageContributions: readonly PackageContribution[];
  readonly results?: BuildResultRepository;
}): Promise<LoadedRunFile> {
  const resultSession = createBuildResultResolutionSession();
  const compiler = createRunCompiler(options, resultSession);
  const compiled = await compiler.compileResolvedSource(options.workspace.entry, options.workspace);
  const references = new Map<string, BuildResultFileRef>(compiled.attachments.flatMap((attachment) =>
    attachment.location === undefined ? [] : [[attachment.blob.resource, {
      kind: "external-file" as const, uri: attachment.location,
      size: attachment.blob.size, mediaType: attachment.blob.mediaType,
    }]]));
  for (const [resource, file] of resultSession.references) references.set(resource, file);
  return { path: options.workspace.entry.unit.id, compiler, ...compiled, resultResourceReferences: Object.fromEntries(references) };
}
