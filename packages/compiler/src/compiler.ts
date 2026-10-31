import { verifyRecordStructure } from "@hypit/kernel";
import type {
  AuthorDocument,
  AuthorFrontendRegistryLike,
  AuthorSourceDiscovery,
  CompiledSourceClosure,
  ProjectedCompiledSourceClosure,
  AuthorRecordRefiner,
} from "@hypit/author";
import type { ResolvedSource } from "@hypit/source";
import type { BlobAttachment, Workspace, WorkspaceSession } from "@hypit/workspace";
import type { BlobRef, LinkedProgram } from "@hypit/protocol";
import { compareCodeUnits } from "@hypit/protocol";
import { refineRecord } from "@hypit/refinement";
import type { RefinementRegistryLike } from "@hypit/refinement";

import { CompilerError } from "./error.js";
import type { ModulePackageRegistryLike } from "./modules.js";
import { compileSourceClosure, sourceCompilationLimits } from "./source.js";
import type { CompileSourceClosureRequest, SourceCompilationLimits } from "./source.js";

type DiscoveredUnit = {
  readonly source: ResolvedSource;
  readonly frontend: string;
  readonly discovery: AuthorSourceDiscovery;
};

function attachmentKey(blob: BlobRef): string {
  return JSON.stringify([blob.resource, blob.mediaType]);
}

export function mergeAttachments(groups: readonly (readonly BlobAttachment[])[]): readonly BlobAttachment[] {
  const merged = new Map<string, BlobAttachment>();
  for (const item of groups.flat()) {
    const key = attachmentKey(item.blob);
    const existing = merged.get(key);
    if (existing !== undefined) {
      if (existing.blob.size !== item.blob.size) {
        throw new CompilerError(
          "SOURCE_ATTACHMENT_CONFLICT",
          `Blob attachment ${item.blob.resource} carries conflicting sizes`,
          item.blob.resource,
        );
      }
      continue;
    }
    merged.set(key, {
      blob: { ...item.blob },
      open: item.open,
      ...(item.openRange === undefined ? {} : { openRange: item.openRange }),
    });
  }
  return [...merged.values()]
    .sort((left, right) => compareCodeUnits(attachmentKey(left.blob), attachmentKey(right.blob)));
}

async function discoverClosure(
  entry: ResolvedSource,
  frontends: AuthorFrontendRegistryLike,
  workspace: WorkspaceSession,
  limits: SourceCompilationLimits,
): Promise<readonly DiscoveredUnit[]> {
  const units = new Map<string, DiscoveredUnit>();
  const visiting = new Set<string>();
  const accepted = new Set<string>();
  let importEdges = 0;
  const visit = async (source: ResolvedSource, depth: number): Promise<void> => {
    if (depth > limits.maxImportDepth) {
      throw new CompilerError("SOURCE_IMPORT_DEPTH_LIMIT",
        `Source import depth exceeds Host limit ${limits.maxImportDepth}`, source.unit.id);
    }
    const selectedFrontend = source.frontend;
    const key = `${source.unit.id}\u0000${selectedFrontend}`;
    if (units.has(key)) return;
    if (visiting.has(key)) {
      throw new CompilerError("SOURCE_IMPORT_CYCLE", `Source imports cycle through ${source.unit.name}`, source.unit.id);
    }
    const frontend = frontends.resolve(selectedFrontend);
    if (frontend === undefined) {
      throw new CompilerError("UNKNOWN_FRONTEND", `Frontend ${selectedFrontend} is not registered`, selectedFrontend);
    }
    if (!accepted.has(key)) {
      accepted.add(key);
      if (accepted.size > limits.maxSources) {
        throw new CompilerError("SOURCE_COUNT_LIMIT",
          `Source closure exceeds Host limit ${limits.maxSources}`, source.unit.id);
      }
    }
    visiting.add(key);
    const discovery = await frontend.discover(source.unit);
    for (const request of discovery.sources) {
      importEdges += 1;
      if (importEdges > limits.maxImportEdges) {
        throw new CompilerError("SOURCE_IMPORT_EDGE_LIMIT",
          `Source imports exceed Host limit ${limits.maxImportEdges}`, source.unit.id);
      }
      await visit(await workspace.resolveSource(source.unit, request), depth + 1);
    }
    visiting.delete(key);
    units.set(key, { source, frontend: selectedFrontend, discovery });
  };
  await visit(entry, 1);
  return [...units.values()];
}

export type CompilerOptions = {
  readonly modules: ModulePackageRegistryLike;
  readonly frontends: AuthorFrontendRegistryLike;
  /** Explicit definition environment selected by the Host. */
  readonly workspace: Workspace;
  /** Trusted Type-owner refinements applied to authored Records before linking. */
  readonly refinements: RefinementRegistryLike;
  /** Host-owned finite-work policy; it is never serialized into authored or compiled values. */
  readonly limits?: SourceCompilationLimits;
};

export type CompiledAuthorSource = CompiledSourceClosure & {
  /** Host-side transfer bundle; bytes are not serialized into Core BuildView. */
  readonly attachments: readonly BlobAttachment[];
};

export type ProjectedCompiledAuthorSource = ProjectedCompiledSourceClosure & {
  readonly attachments: readonly BlobAttachment[];
};

export type CompileAuthorSourceOptions = {
  readonly authorProjection?: boolean;
};

/** Domain-neutral compiler from a resolved Author Source to a verified Source Closure and Graph. */
export class Compiler {
  readonly #options: CompilerOptions;
  readonly #refineRecord: AuthorRecordRefiner;
  readonly #limits: SourceCompilationLimits;

  constructor(options: CompilerOptions) {
    this.#options = options;
    this.#limits = sourceCompilationLimits(options.limits);
    this.#refineRecord = async (record) => await refineRecord(record, options.refinements);
  }

  supportsFrontend(id: string): boolean {
    return this.#options.frontends.resolve(id) !== undefined;
  }

  /** Open one read-once Workspace session for an explicitly selected entry locator. */
  async openEntry(locator: string): Promise<WorkspaceSession> {
    return await this.#options.workspace.open(locator);
  }

  async compileEntry(
    locator: string,
    options: CompileAuthorSourceOptions & { readonly authorProjection: true },
  ): Promise<ProjectedCompiledAuthorSource>;
  async compileEntry(locator: string, options?: CompileAuthorSourceOptions): Promise<CompiledAuthorSource>;
  async compileEntry(
    locator: string,
    options: CompileAuthorSourceOptions = {},
  ): Promise<CompiledAuthorSource | ProjectedCompiledAuthorSource> {
    const workspace = await this.openEntry(locator);
    return options.authorProjection === true
      ? await this.compileResolvedSource(workspace.entry, workspace, { authorProjection: true })
      : await this.compileResolvedSource(workspace.entry, workspace);
  }

  /** Open the editable author projection of one already resolved Source revision. */
  async openAuthorDocument(source: ResolvedSource): Promise<AuthorDocument> {
    const frontend = this.#options.frontends.resolve(source.frontend);
    if (frontend === undefined) {
      throw new CompilerError("UNKNOWN_FRONTEND", `Frontend ${source.frontend} is not registered`, source.frontend);
    }
    if (frontend.document === undefined) {
      throw new CompilerError(
        "AUTHOR_DOCUMENT_UNAVAILABLE",
        `Frontend ${source.frontend} does not expose an editable author document`,
        source.frontend,
      );
    }
    return await frontend.document.openDocument(source.unit);
  }

  /** Compile an explicitly resolved Source inside one already isolated Workspace. */
  async compileResolvedSource(
    entry: ResolvedSource,
    workspace: WorkspaceSession,
    options: CompileAuthorSourceOptions & { readonly authorProjection: true },
  ): Promise<ProjectedCompiledAuthorSource>;
  async compileResolvedSource(
    entry: ResolvedSource,
    workspace: WorkspaceSession,
    options?: CompileAuthorSourceOptions,
  ): Promise<CompiledAuthorSource>;
  async compileResolvedSource(
    entry: ResolvedSource,
    workspace: WorkspaceSession,
    options: CompileAuthorSourceOptions = {},
  ): Promise<CompiledAuthorSource | ProjectedCompiledAuthorSource> {
    const discovered = await discoverClosure(
      entry,
      this.#options.frontends,
      workspace,
      this.#limits,
    );
    const closure = this.#options.modules.createClosure(
      discovered.flatMap((unit) => unit.discovery.modules),
    );
    const discoveries = new Map(discovered.map((unit) => [
      `${unit.source.unit.id}\u0000${unit.frontend}`,
      unit.discovery,
    ]));
    const request: CompileSourceClosureRequest = {
      entry,
      closure,
      frontends: this.#options.frontends,
      discover(source, frontend) {
        const discovery = discoveries.get(`${source.id}\u0000${frontend.id}`);
        if (discovery === undefined) {
          throw new CompilerError(
            "SOURCE_DISCOVERY_MISSING",
            `Source ${source.name} was not present in the frozen discovery closure`,
            source.id,
          );
        }
        return discovery;
      },
      resolveSource: workspace.resolveSource,
      resolveAsset: workspace.resolveAsset,
      ...(workspace.readAsset === undefined ? {} : { readAsset: workspace.readAsset }),
      refineRecord: this.#refineRecord,
      limits: this.#limits,
    };
    const compilation = options.authorProjection === true
      ? await compileSourceClosure({ ...request, authorProjection: true })
      : await compileSourceClosure(request);
    return {
      ...compilation,
      attachments: mergeAttachments([await workspace.attachments()]),
    };
  }

  /** Validate one selected Build value through the same Type-owner boundary as authored Records. */
  async refineRecord(program: LinkedProgram, record: import("@hypit/protocol").TypedRecord): Promise<void> {
    verifyRecordStructure(program.closure, record);
    await this.#refineRecord(record);
  }

}
