import { resolve } from "node:path";

import {
  compileSourceClosure,
  prepareAuthorSource,
} from "@svml/elaborator";
import {
  link,
  sealTypedModule,
} from "@svml/core";
import type {
  AuthorFrontendRegistryLike,
  AuthorSourceDiscovery,
  AuthorSourceUnit,
  CompiledSourceClosure,
  AuthorRecordAdmitter,
} from "@svml/elaborator";
import type { ArtifactAttachment, Workspace, WorkspaceSession } from "@svml/host";
import type { LinkedProgram } from "@svml/protocol";
import {
  TypeValidatorRegistry,
  createRecordAdmitter,
} from "@svml/validation";
import type { TypeValidatorRegistryLike } from "@svml/validation";
import { NodeFilesystemWorkspace } from "@svml/workspace-fs-node";

import { NodeCompilerError } from "./error.js";
import type { ModulePackageRegistryLike } from "./modules.js";

type DiscoveredUnit = {
  readonly source: AuthorSourceUnit;
  readonly frontend: string;
  readonly discovery: AuthorSourceDiscovery;
};

async function discoverClosure(
  entry: AuthorSourceUnit,
  frontends: AuthorFrontendRegistryLike,
  workspace: WorkspaceSession,
): Promise<readonly DiscoveredUnit[]> {
  const units = new Map<string, DiscoveredUnit>();
  const visiting = new Set<string>();
  const visit = async (source: AuthorSourceUnit): Promise<void> => {
    const prepared = prepareAuthorSource(source);
    const selectedFrontend = prepared.header.using;
    const key = `${source.id}\u0000${selectedFrontend}`;
    if (units.has(key)) return;
    if (visiting.has(key)) {
      throw new NodeCompilerError("SOURCE_IMPORT_CYCLE", `Source imports cycle through ${source.name}`, source.id);
    }
    const frontend = frontends.resolve(selectedFrontend);
    if (frontend === undefined) {
      throw new NodeCompilerError("UNKNOWN_FRONTEND", `Frontend ${selectedFrontend} is not registered`, selectedFrontend);
    }
    visiting.add(key);
    const discovery = await frontend.discover(prepared);
    for (const request of discovery.sources) {
      await visit(await workspace.resolveSource(source, request));
    }
    visiting.delete(key);
    units.set(key, { source, frontend: selectedFrontend, discovery });
  };
  await visit(entry);
  return [...units.values()];
}

export type NodeCompilerOptions = {
  readonly modules: ModulePackageRegistryLike;
  readonly frontends: AuthorFrontendRegistryLike;
  /** Files reachable through source imports must resolve inside this root. Defaults to entry dirname. */
  readonly root?: string;
  /** Replaces the default Node filesystem definition environment. */
  readonly workspace?: Workspace;
  /** Trusted Type-owner validators used to admit authored Records before linking. */
  readonly validators?: TypeValidatorRegistryLike;
  /** Low-level Host hook for a sandboxed or remote admission implementation. */
  readonly admitRecord?: AuthorRecordAdmitter;
};

export type NodeCompiledSourceClosure = CompiledSourceClosure & {
  /** Host-side transfer bundle; bytes are not serialized into Core BuildState. */
  readonly attachments: readonly ArtifactAttachment[];
};

/** Domain-neutral Node facade from a real Author Source to a verified Source Closure and Graph. */
export class NodeCompiler {
  readonly #options: NodeCompilerOptions;
  readonly #admitRecord: AuthorRecordAdmitter;

  constructor(options: NodeCompilerOptions) {
    if (options.validators !== undefined && options.admitRecord !== undefined) {
      throw new NodeCompilerError(
        "AMBIGUOUS_RECORD_ADMISSION",
        "NodeCompiler accepts validators or a custom Record admitter, not both",
      );
    }
    if (options.workspace !== undefined && options.root !== undefined) {
      throw new NodeCompilerError(
        "AMBIGUOUS_WORKSPACE",
        "NodeCompiler accepts a Workspace or the root option for its default filesystem Workspace, not both",
      );
    }
    this.#options = options;
    this.#admitRecord = options.admitRecord
      ?? createRecordAdmitter(options.validators ?? new TypeValidatorRegistry());
  }

  supportsFrontend(id: string): boolean {
    return this.#options.frontends.resolve(id) !== undefined;
  }

  /** Open one read-once Workspace session so a Host can inspect the Source Header and compile it once. */
  async openFile(file: string): Promise<WorkspaceSession> {
    return this.#options.workspace === undefined
      ? await new NodeFilesystemWorkspace({
          ...(this.#options.root === undefined ? {} : { root: this.#options.root }),
        }).open(resolve(file))
      : await this.#options.workspace.open(file);
  }

  async compileFile(file: string): Promise<NodeCompiledSourceClosure> {
    const workspace = await this.openFile(file);
    return await this.compileSource(workspace.entry, workspace);
  }

  /** Compile an explicitly resolved self-describing SourceUnit inside one already isolated Workspace. */
  async compileSource(entry: AuthorSourceUnit, workspace: WorkspaceSession): Promise<NodeCompiledSourceClosure> {
    const discovered = await discoverClosure(
      entry,
      this.#options.frontends,
      workspace,
    );
    const closure = this.#options.modules.createClosure(
      discovered.flatMap((unit) => unit.discovery.modules),
    );
    const compilation = await compileSourceClosure({
      entry,
      closure,
      frontends: this.#options.frontends,
      resolveSource: workspace.resolveSource,
      resolveAsset: workspace.resolveAsset,
      admitRecord: this.#admitRecord,
    });
    return { ...compilation, attachments: await workspace.attachments() };
  }

  /**
   * Add modules used only by Run implementations without changing Author records or Author Graph
   * identity. Typed Modules are rebound to the larger verified closure before Core sees Run code.
   */
  extendExecutionProgram(program: LinkedProgram, requests: readonly string[]): LinkedProgram {
    const existing = program.closure.modules.map((item) => `${item.ref.name}@${item.ref.version}`);
    const closure = this.#options.modules.createClosure([...existing, ...requests]);
    if (closure.digest === program.closure.digest) return program;
    const rebound = program.modules.map((module) => sealTypedModule({
      id: module.id,
      closureDigest: closure.digest,
      records: module.records,
    }));
    const extended = link(closure, rebound);
    if (extended.semanticDigest !== program.semanticDigest) {
      throw new NodeCompilerError(
        "EXECUTION_PROGRAM_SEMANTIC_DRIFT",
        "Run-only Module closure extension changed Author program semantics",
      );
    }
    return extended;
  }

}
