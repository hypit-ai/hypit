import type { GraphFragment } from "@hypit/author";
import type {
  BlobRef,
  CanonicalValue,
  LinkedProgram,
  ModuleRef,
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
  /** The saved recipe. Running the graph never rewrites these inputs. */
  readonly inputs: Readonly<Record<string, GenerationGraphInput>>;
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

export type GenerationNodeImplementation = {
  readonly using: GenerationComponentRef;
  /** First generation-graph revision deliberately requires one public result per node. */
  readonly fragment: GraphFragment;
  /** Installed package specifier whose Producer/Refinement facets execute this node, when needed. */
  readonly executionPackage?: string;
};

/** Invocation-local bytes needed by a lowered recipe. Author files never store Runtime blobs. */
export type GenerationGraphResourceAttachment = {
  readonly blob: BlobRef;
  open(): Promise<AsyncIterable<Uint8Array>>;
};

/** All package behavior stays outside the project document. */
export type GenerationGraphLoweringHost = {
  readonly resolveImplementation: (
    node: GenerationGraphNode,
    project: GenerationGraphProject,
  ) => Awaitable<GenerationNodeImplementation>;
};

export type LoweredGenerationGraph = {
  readonly program: LinkedProgram;
  readonly graph: import("@hypit/protocol").AuthorGraph;
  readonly attachments: readonly GenerationGraphResourceAttachment[];
  readonly executionPackages: readonly string[];
};
