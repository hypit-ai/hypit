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

export type GenerationGraphProject = {
  readonly format: "hypit.generation-graph@1";
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly nodes: readonly GenerationGraphNode[];
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
  readonly value: import("@hypit/protocol").Value;
};

export type GenerationNodeImplementation =
  | GenerationOperationNodeImplementation
  | GenerationValueNodeImplementation;

/** Invocation-local bytes needed by a lowered recipe. Author files never store Runtime blobs. */
export type GenerationGraphResourceAttachment = {
  readonly blob: BlobRef;
  open(): Promise<AsyncIterable<Uint8Array>>;
};

/** One invocation-local value that may stand in for an upstream operation result. */
export type GenerationGraphDependencyValue = {
  readonly type: TypeRef;
  readonly value: import("@hypit/protocol").Value;
  readonly attachments?: readonly GenerationGraphResourceAttachment[];
};

export type GenerationGraphDependencyDecision =
  | { readonly kind: "execute" }
  | { readonly kind: "resolved-value"; readonly value: GenerationGraphDependencyValue };

/**
 * Dependency execution is an invocation policy, never recipe state. The default executes the
 * complete dependency closure. Interactive hosts may instead resolve selected non-target
 * operations to exact values while continuing to execute unselected operations through the same
 * saved recipe.
 */
export type GenerationGraphDependencyPolicy = {
  readonly kind: "selective";
  readonly decide: (
    node: GenerationGraphNode,
    output: TypeRef,
    project: GenerationGraphProject,
  ) => Awaitable<GenerationGraphDependencyDecision>;
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

export type GenerationGraphNodeInspection = {
  readonly node: string;
  readonly kind: "operation" | "value";
  readonly readiness: "ready" | "incomplete";
  /** Stable result contract available even while an operation is incomplete. */
  readonly output: TypeRef;
  readonly missing: readonly string[];
};

/** Package-backed authoring inspection; it carries no Canvas or Runtime policy. */
export type GenerationGraphInspectionHost = GenerationGraphLoweringHost & {
  readonly inspectNode: (
    node: GenerationGraphNode,
    project: GenerationGraphProject,
  ) => Awaitable<GenerationGraphNodeInspection>;
};

export type GenerationGraphNodeReport =
  | GenerationGraphNodeInspection
  | {
      readonly node: string;
      readonly readiness: "invalid";
      readonly message: string;
    };

export type LoweredGenerationGraph = {
  readonly program: LinkedProgram;
  readonly graph: import("@hypit/protocol").AuthorGraph;
  readonly attachments: readonly GenerationGraphResourceAttachment[];
  readonly executionPackages: readonly string[];
};
