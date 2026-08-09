import { createHash } from "node:crypto";
import { resolve } from "node:path";

import {
  compileSourceClosure,
  prepareAuthorSource,
} from "@narratage/elaborator";
import {
  link,
  sealTypedModule,
} from "@narratage/core";
import type {
  AuthorFrontendRegistryLike,
  AuthorSourceDiscovery,
  AuthorSourceUnit,
  CompiledSourceClosure,
  AuthorRecordAdmitter,
} from "@narratage/elaborator";
import type { ArtifactAttachment, Workspace, WorkspaceSession } from "@narratage/host";
import type { BlobRef, LinkedProgram } from "@narratage/protocol";
import {
  TypeValidatorRegistry,
  createRecordAdmitter,
} from "@narratage/validation";
import type { TypeValidatorRegistryLike } from "@narratage/validation";
import { NodeFilesystemWorkspace } from "@narratage/workspace-fs-node";

import { NodeCompilerError } from "./error.js";
import type { ModulePackageRegistryLike } from "./modules.js";

type DiscoveredUnit = {
  readonly source: AuthorSourceUnit;
  readonly frontend: string;
  readonly discovery: AuthorSourceDiscovery;
};

function attachmentKey(artifact: BlobRef): string {
  return `${artifact.digest}\u0000${artifact.mediaType}`;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function mergeAttachments(groups: readonly (readonly ArtifactAttachment[])[]): readonly ArtifactAttachment[] {
  const merged = new Map<string, ArtifactAttachment>();
  for (const item of groups.flat()) {
    const key = attachmentKey(item.artifact);
    const existing = merged.get(key);
    if (existing !== undefined) {
      if (existing.artifact.size !== item.artifact.size || !sameBytes(existing.bytes, item.bytes)) {
        throw new NodeCompilerError(
          "SOURCE_ATTACHMENT_CONFLICT",
          `Artifact attachment ${item.artifact.digest} carries conflicting bytes`,
          item.artifact.digest,
        );
      }
      continue;
    }
    merged.set(key, {
      artifact: { ...item.artifact },
      bytes: Uint8Array.from(item.bytes),
    });
  }
  return [...merged.values()]
    .sort((left, right) => attachmentKey(left.artifact).localeCompare(attachmentKey(right.artifact)));
}

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
    const embeddedAttachments = new Map<string, ArtifactAttachment>();
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
      async resolveAsset(importer, request) {
        if (request.bytes === undefined) return await workspace.resolveAsset(importer, request);
        const bytes = Uint8Array.from(request.bytes);
        const artifact: BlobRef = {
          kind: "blob",
          digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
          size: bytes.byteLength,
          mediaType: request.mediaType,
        };
        const key = attachmentKey(artifact);
        const existing = embeddedAttachments.get(key);
        if (existing !== undefined && !sameBytes(existing.bytes, bytes)) {
          throw new NodeCompilerError(
            "SOURCE_ATTACHMENT_CONFLICT",
            `Embedded asset ${request.from} conflicts with ${artifact.digest}`,
            request.from,
          );
        }
        embeddedAttachments.set(key, { artifact, bytes });
        return { artifact: { ...artifact } };
      },
      admitRecord: this.#admitRecord,
    });
    return {
      ...compilation,
      attachments: mergeAttachments([await workspace.attachments(), [...embeddedAttachments.values()]]),
    };
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
