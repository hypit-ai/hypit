import type { GraphFragment } from "@hypit/author";
import type {
  BlobRef,
  CanonicalValue,
  LinkedProgram,
  ModuleRef,
  TypedRecord,
} from "@hypit/protocol";

export type Awaitable<T> = T | Promise<T>;

export type GenerationComponentRef = {
  readonly module: ModuleRef;
  readonly name: string;
};

export type GenerationGraphInput =
  | { readonly value: CanonicalValue }
  | { readonly node: string };

export type GenerationGraphNode = {
  readonly id: string;
  readonly using: GenerationComponentRef;
  /** The saved recipe. Selection changes do not rewrite these inputs. */
  readonly inputs: Readonly<Record<string, GenerationGraphInput>>;
  /** Portable paths to tiny Product reference documents, relative to the project file. */
  readonly products: readonly string[];
  /** Generate this recipe, or truncate at one exact Product reference document. */
  readonly selected: "generate" | string;
};

export type GenerationGraphNodeLayout = {
  readonly node: string;
  readonly x: number;
  readonly y: number;
};

export type GenerationGraphProject = {
  readonly format: "hypit.generation-graph@1";
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly nodes: readonly GenerationGraphNode[];
  /** Canvas presentation only. It never changes production dependencies. */
  readonly layout: readonly GenerationGraphNodeLayout[];
};

/** A durable, lightweight pointer to one Build output. It contains no copied execution state. */
export type GenerationNodeProduct = {
  readonly format: "hypit.node-product@1";
  readonly build: string;
  readonly output: string;
};

export type GenerationNodeImplementation = {
  readonly using: GenerationComponentRef;
  /** First generation-graph revision deliberately requires one public result per node. */
  readonly fragment: GraphFragment;
  /** Installed package specifier whose Producer/Refinement facets execute this node, when needed. */
  readonly executionPackage?: string;
};

export type GenerationGraphResourceAttachment = {
  readonly blob: BlobRef;
  open(): Promise<AsyncIterable<Uint8Array>>;
};

export type GenerationGraphResolvedProduct = {
  readonly record: TypedRecord;
  readonly attachments: readonly GenerationGraphResourceAttachment[];
};

/** All package behavior and Product access stay outside the project document. */
export type GenerationGraphLoweringHost = {
  readonly resolveImplementation: (
    node: GenerationGraphNode,
    project: GenerationGraphProject,
  ) => Awaitable<GenerationNodeImplementation>;
  readonly resolveProduct: (
    path: string,
    node: GenerationGraphNode,
    project: GenerationGraphProject,
  ) => Awaitable<GenerationGraphResolvedProduct>;
};

export type LoweredGenerationGraph = {
  readonly program: LinkedProgram;
  readonly graph: import("@hypit/protocol").AuthorGraph;
  readonly attachments: readonly GenerationGraphResourceAttachment[];
  readonly executionPackages: readonly string[];
};
