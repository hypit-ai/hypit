import { createHash } from "node:crypto";

import {
  compileSourceClosure,
  prepareAuthorSource,
} from "@narratage/elaborator";
import { link } from "@narratage/core";
import type {
  AuthorFrontendRegistryLike,
  AuthorSourceDiscovery,
  CompiledSourceClosure,
  AuthorRecordAdmitter,
} from "@narratage/elaborator";
import type { SourceUnit } from "@narratage/source";
import type { ArtifactAttachment, Workspace, WorkspaceSession } from "@narratage/workspace";
import type { BlobRef, LinkedProgram } from "@narratage/protocol";
import {
  TypeValidatorRegistry,
  createRecordAdmitter,
} from "@narratage/validation";
import type { TypeValidatorRegistryLike } from "@narratage/validation";

import { NodeCompilerError } from "./error.js";
import type { ModulePackageRegistryLike } from "./modules.js";

type DiscoveredUnit = {
  readonly source: SourceUnit;
  readonly frontend: string;
  readonly discovery: AuthorSourceDiscovery;
};

function attachmentKey(artifact: BlobRef): string {
  return `${artifact.digest}\u0000${artifact.mediaType}`;
}

export function mergeAttachments(groups: readonly (readonly ArtifactAttachment[])[]): readonly ArtifactAttachment[] {
  const merged = new Map<string, ArtifactAttachment>();
  for (const item of groups.flat()) {
    const key = attachmentKey(item.artifact);
    const existing = merged.get(key);
    if (existing !== undefined) {
      if (existing.artifact.size !== item.artifact.size) {
        throw new NodeCompilerError(
          "SOURCE_ATTACHMENT_CONFLICT",
          `Artifact attachment ${item.artifact.digest} carries conflicting sizes`,
          item.artifact.digest,
        );
      }
      continue;
    }
    merged.set(key, {
      artifact: { ...item.artifact },
      open: item.open,
    });
  }
  return [...merged.values()]
    .sort((left, right) => attachmentKey(left.artifact).localeCompare(attachmentKey(right.artifact)));
}

async function discoverClosure(
  entry: SourceUnit,
  frontends: AuthorFrontendRegistryLike,
  workspace: WorkspaceSession,
): Promise<readonly DiscoveredUnit[]> {
  const units = new Map<string, DiscoveredUnit>();
  const visiting = new Set<string>();
  const visit = async (source: SourceUnit): Promise<void> => {
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
  /** Explicit definition environment selected by the Host. */
  readonly workspace: Workspace;
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
    this.#options = options;
    this.#admitRecord = options.admitRecord
      ?? createRecordAdmitter(options.validators ?? new TypeValidatorRegistry());
  }

  supportsFrontend(id: string): boolean {
    return this.#options.frontends.resolve(id) !== undefined;
  }

  /** Open one read-once Workspace session so a Host can inspect the Source Header and compile it once. */
  async openFile(file: string): Promise<WorkspaceSession> {
    return await this.#options.workspace.open(file);
  }

  async compileFile(file: string): Promise<NodeCompiledSourceClosure> {
    const workspace = await this.openFile(file);
    return await this.compileSource(workspace.entry, workspace);
  }

  /** Compile an explicitly resolved self-describing SourceUnit inside one already isolated Workspace. */
  async compileSource(entry: SourceUnit, workspace: WorkspaceSession): Promise<NodeCompiledSourceClosure> {
    const embeddedAttachments = new Map<string, ArtifactAttachment>();
    const discovered = await discoverClosure(
      entry,
      this.#options.frontends,
      workspace,
    );
    const closure = this.#options.modules.createClosure(
      discovered.flatMap((unit) => unit.discovery.modules),
    );
    const discoveries = new Map(discovered.map((unit) => [
      `${unit.source.id}\u0000${unit.frontend}`,
      unit.discovery,
    ]));
    const compilation = await compileSourceClosure({
      entry,
      closure,
      frontends: this.#options.frontends,
      discover(source, frontend) {
        const discovery = discoveries.get(`${source.id}\u0000${frontend.id}`);
        if (discovery === undefined) {
          throw new NodeCompilerError(
            "SOURCE_DISCOVERY_MISSING",
            `Source ${source.name} was not present in the frozen discovery closure`,
            source.id,
          );
        }
        return discovery;
      },
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
        if (existing !== undefined && existing.artifact.size !== bytes.byteLength) {
          throw new NodeCompilerError(
            "SOURCE_ATTACHMENT_CONFLICT",
            `Embedded asset ${request.from} conflicts with ${artifact.digest}`,
            request.from,
          );
        }
        embeddedAttachments.set(key, {
          artifact,
          open: async () => (async function* () { yield Uint8Array.from(bytes); })(),
        });
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
   * Add modules used only by Run implementations. Author records stay unchanged.
   */
  extendExecutionProgram(program: LinkedProgram, requests: readonly string[]): LinkedProgram {
    const existing = program.closure.modules.map((item) => `${item.manifest.name}@${item.manifest.version}`);
    if (requests.every((request) => existing.includes(request))) return program;
    const closure = this.#options.modules.createClosure([...existing, ...requests]);
    return link(closure, program.records);
  }

}
