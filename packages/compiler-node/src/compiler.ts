import { dirname, resolve } from "node:path";

import {
  compileBuild,
  sealBuildRequest,
} from "@svml/core";
import {
  compileSourceClosure,
  resolveCompiledSourceExport,
} from "@svml/elaborator";
import type {
  AuthorFrontendRegistryLike,
  AuthorSourceDiscovery,
  AuthorSourceUnit,
  CompiledSourceClosure,
  AuthorRecordAdmitter,
} from "@svml/elaborator";
import type {
  BuildPlan,
  CandidateBinding,
  NeedAcceptance,
} from "@svml/protocol";
import {
  TypeValidatorRegistry,
  createRecordAdmitter,
} from "@svml/validation";
import type { TypeValidatorRegistryLike } from "@svml/validation";

import { NodeCompilerError } from "./error.js";
import type { ModulePackageRegistryLike } from "./modules.js";
import { NodeSourceHost } from "./source.js";

type DiscoveredUnit = {
  readonly source: AuthorSourceUnit;
  readonly frontend: string;
  readonly discovery: AuthorSourceDiscovery;
};

async function discoverClosure(
  entry: AuthorSourceUnit,
  frontendId: string,
  frontends: AuthorFrontendRegistryLike,
  sources: NodeSourceHost,
): Promise<readonly DiscoveredUnit[]> {
  const units = new Map<string, DiscoveredUnit>();
  const visiting = new Set<string>();
  const visit = async (source: AuthorSourceUnit, selectedFrontend: string): Promise<void> => {
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
    const discovery = await frontend.discover(source);
    for (const request of discovery.sources) {
      await visit(await sources.resolveSource(source, request), request.frontend);
    }
    visiting.delete(key);
    units.set(key, { source, frontend: selectedFrontend, discovery });
  };
  await visit(entry, frontendId);
  return [...units.values()];
}

export type NodeCompilerOptions = {
  readonly modules: ModulePackageRegistryLike;
  readonly frontends: AuthorFrontendRegistryLike;
  readonly entryFrontend: string;
  /** Files reachable through source imports must resolve inside this root. Defaults to entry dirname. */
  readonly root?: string;
  /** Trusted Type-owner validators used to admit authored Records before linking. */
  readonly validators?: TypeValidatorRegistryLike;
  /** Low-level Host hook for a sandboxed or remote admission implementation. */
  readonly admitRecord?: AuthorRecordAdmitter;
};

export type PlanFileOptions = {
  readonly targets: readonly string[];
  readonly accepts?: NeedAcceptance;
  readonly bindings?: readonly CandidateBinding[];
};

export type PlannedSource = {
  readonly compilation: CompiledSourceClosure;
  readonly plan: BuildPlan;
};

/** Domain-neutral Node facade from a real source file to a verified Source Closure or BuildPlan. */
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

  async compileFile(file: string): Promise<CompiledSourceClosure> {
    const entryPath = resolve(file);
    const sources = await NodeSourceHost.create(this.#options.root ?? dirname(entryPath));
    const entry = await sources.load(entryPath);
    const discovered = await discoverClosure(
      entry,
      this.#options.entryFrontend,
      this.#options.frontends,
      sources,
    );
    const closure = this.#options.modules.createClosure(
      discovered.flatMap((unit) => unit.discovery.modules),
    );
    return await compileSourceClosure({
      entry,
      frontend: this.#options.entryFrontend,
      closure,
      frontends: this.#options.frontends,
      resolveSource: sources.resolveSource,
      admitRecord: this.#admitRecord,
    });
  }

  async planFile(file: string, options: PlanFileOptions): Promise<PlannedSource> {
    if (options.targets.length === 0) {
      throw new NodeCompilerError("EMPTY_BUILD_TARGETS", "plan requires at least one public source export");
    }
    const compilation = await this.compileFile(file);
    const targets = options.targets.map((name) => {
      const exported = resolveCompiledSourceExport(compilation, name);
      if (exported.ref.kind !== "logical-output") {
        throw new NodeCompilerError(
          "TARGET_IS_AUTHORED_RECORD",
          `${name} is an authored Record, not a realizable component output`,
          name,
        );
      }
      return { output: exported.ref.id, accepts: options.accepts ?? "exact" } as const;
    });
    const request = sealBuildRequest({
      graph: compilation.elaboration.graph.id,
      targets,
      bindings: options.bindings ?? [],
    });
    return {
      compilation,
      plan: compileBuild(
        compilation.program,
        compilation.elaboration.graph,
        request,
      ),
    };
  }
}
