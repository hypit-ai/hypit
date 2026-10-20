import { link, verifyRecordStructure } from "@hypit/kernel";
import type {
  AuthorFrontendRegistryLike,
  AuthorSourceDiscovery,
  CompiledSourceClosure,
  AuthorRecordValidator,
} from "@hypit/author";
import type { ResolvedSource, SourceUnit } from "@hypit/source";
import type { BlobAttachment, Workspace, WorkspaceSession } from "@hypit/workspace";
import type { BlobRef, LinkedProgram } from "@hypit/protocol";
import {
  RefinementRegistry,
  createRecordValidator,
} from "@hypit/refinement";
import type { RefinementRegistryLike } from "@hypit/refinement";

import { CompilerError } from "./error.js";
import type { ModulePackageRegistryLike } from "./modules.js";
import { compileSourceClosure } from "./source.js";

type DiscoveredUnit = {
  readonly source: ResolvedSource;
  readonly frontend: string;
  readonly discovery: AuthorSourceDiscovery;
};

function attachmentKey(blob: BlobRef): string {
  return `${blob.resource}\u0000${blob.mediaType}`;
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
      ...(item.location === undefined ? {} : { location: item.location }),
    });
  }
  return [...merged.values()]
    .sort((left, right) => attachmentKey(left.blob).localeCompare(attachmentKey(right.blob)));
}

async function discoverClosure(
  entry: ResolvedSource,
  frontends: AuthorFrontendRegistryLike,
  workspace: WorkspaceSession,
): Promise<readonly DiscoveredUnit[]> {
  const units = new Map<string, DiscoveredUnit>();
  const visiting = new Set<string>();
  const visit = async (source: ResolvedSource): Promise<void> => {
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
    visiting.add(key);
    const discovery = await frontend.discover(source.unit);
    for (const request of discovery.sources) {
      await visit(await workspace.resolveSource(source.unit, request));
    }
    visiting.delete(key);
    units.set(key, { source, frontend: selectedFrontend, discovery });
  };
  await visit(entry);
  return [...units.values()];
}

export type CompilerOptions = {
  readonly modules: ModulePackageRegistryLike;
  readonly frontends: AuthorFrontendRegistryLike;
  /** Explicit definition environment selected by the Host. */
  readonly workspace: Workspace;
  /** Trusted Type-owner refinements applied to authored Records before linking. */
  readonly refinements?: RefinementRegistryLike;
};

export type CompiledAuthorSource = CompiledSourceClosure & {
  /** Host-side transfer bundle; bytes are not serialized into Core BuildState. */
  readonly attachments: readonly BlobAttachment[];
};

/** Domain-neutral compiler from a resolved Author Source to a verified Source Closure and Graph. */
export class Compiler {
  readonly #options: CompilerOptions;
  readonly #validateRecord: AuthorRecordValidator;

  constructor(options: CompilerOptions) {
    this.#options = options;
    this.#validateRecord = createRecordValidator(options.refinements ?? new RefinementRegistry());
  }

  supportsFrontend(id: string): boolean {
    return this.#options.frontends.resolve(id) !== undefined;
  }

  /** Open one read-once Workspace session for an explicitly selected entry locator. */
  async openEntry(locator: string): Promise<WorkspaceSession> {
    return await this.#options.workspace.open(locator);
  }

  async compileEntry(locator: string): Promise<CompiledAuthorSource> {
    const workspace = await this.openEntry(locator);
    return await this.compileResolvedSource(workspace.entry, workspace);
  }

  /** Compile an explicitly resolved Source inside one already isolated Workspace. */
  async compileResolvedSource(entry: ResolvedSource, workspace: WorkspaceSession): Promise<CompiledAuthorSource> {
    const discovered = await discoverClosure(
      entry,
      this.#options.frontends,
      workspace,
    );
    const closure = this.#options.modules.createClosure(
      discovered.flatMap((unit) => unit.discovery.modules),
    );
    const discoveries = new Map(discovered.map((unit) => [
      `${unit.source.unit.id}\u0000${unit.frontend}`,
      unit.discovery,
    ]));
    const compilation = await compileSourceClosure({
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
      validateRecord: this.#validateRecord,
    });
    return {
      ...compilation,
      attachments: mergeAttachments([await workspace.attachments()]),
    };
  }

  /**
   * Add modules used only by Run implementations. Author records stay unchanged.
   */
  extendExecutionProgram(program: LinkedProgram, requests: readonly string[]): LinkedProgram {
    const existing = program.closure.modules.map((item) => `${item.manifest.name}@${item.manifest.version}`);
    if (requests.every((request) => existing.includes(request))) return program;
    const closure = this.#options.modules.createClosure([...existing, ...requests]);
    return link(closure, program.records);
  }

  /** Validate one selected Run value through the same Type-owner boundary as authored Records. */
  async validateRecord(program: LinkedProgram, record: import("@hypit/protocol").TypedRecord): Promise<void> {
    verifyRecordStructure(program.closure, record);
    await this.#validateRecord(record);
  }

}
