import type { GraphFragment } from "@hypit/author";
import type {
  BlobRef,
  CanonicalValue,
  LinkedProgram,
  ModuleRef,
  TypeRef,
} from "@hypit/protocol";
import type { SourceAssetRequest } from "@hypit/source";

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

export type GenerationOperationNodeImplementation = {
  readonly kind: "operation";
  readonly using: GenerationComponentRef;
  /** First generation-graph revision deliberately requires one public result per node. */
  readonly fragment: GraphFragment;
  /** Package-normalized bindings. Fixed nodes use the saved node inputs unchanged. */
  readonly inputs?: Readonly<Record<string, GenerationGraphInput>>;
  /** Installed package specifier whose Producer/Refinement facets execute this node, when needed. */
  readonly executionPackage?: string;
};

/** One package-loaded author value. It closes over files before Runtime execution. */
export type GenerationValueNodeImplementation = {
  readonly kind: "value";
  readonly using: GenerationComponentRef;
  readonly type: TypeRef;
  readonly value: CanonicalValue;
};

export type GenerationNodeImplementation =
  | GenerationOperationNodeImplementation
  | GenerationValueNodeImplementation;

/** Invocation-local bytes needed by a lowered recipe. Author files never store Runtime blobs. */
export type GenerationGraphResourceAttachment = {
  readonly blob: BlobRef;
  open(): Promise<AsyncIterable<Uint8Array>>;
};

/** Host authority available to package-owned value loaders. It never exposes filesystem paths. */
export type GenerationNodeAssetHost = {
  resolveAsset(request: SourceAssetRequest): Awaitable<BlobRef>;
  readAsset(request: SourceAssetRequest): Awaitable<Uint8Array>;
  attachments(): Awaitable<readonly GenerationGraphResourceAttachment[]>;
};

/** All package behavior stays outside the project document. */
export type GenerationGraphLoweringHost = {
  readonly resolveImplementation: (
    node: GenerationGraphNode,
    project: GenerationGraphProject,
  ) => Awaitable<GenerationNodeImplementation>;
  readonly attachments?: () => Awaitable<readonly GenerationGraphResourceAttachment[]>;
};

export type LoweredGenerationGraph = {
  readonly program: LinkedProgram;
  readonly graph: import("@hypit/protocol").AuthorGraph;
  readonly attachments: readonly GenerationGraphResourceAttachment[];
  readonly executionPackages: readonly string[];
};
