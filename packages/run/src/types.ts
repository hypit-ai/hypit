import type {
  CompiledSourceClosure,
  GraphFragment,
} from "@narratage/elaborator";
import type {
  BuildState,
  Candidate,
  Digest,
  OperationNode,
  Satisfaction,
  StoredValue,
  TypeRef,
} from "@narratage/protocol";
import type { CompiledSourceIdentity, SourceHeader, SourceUnit } from "@narratage/source";

export type RunSourceUnit = SourceUnit;

export type RunFrontendSourceUnit = RunSourceUnit & {
  readonly header: SourceHeader;
};

export type RunAuthorSourceRequest = {
  readonly source: string;
};

export type RunImport = {
  readonly from: string;
  readonly as: string;
};

export type RunTarget = {
  readonly output: string;
};

export type RunProvidedValue = {
  readonly kind: "provided";
  readonly id: string;
  readonly type: TypeRef;
  /** File containing one StoredValue JSON object. */
  readonly from: string;
};

/** Ordinary source file admitted as one content-addressed Candidate of an explicitly named blob Type. */
export type RunProvidedFile = {
  readonly kind: "file";
  readonly id: string;
  readonly type: TypeRef;
  readonly from: string;
  readonly mediaType: string;
};

export type RunBuildRecord = {
  readonly kind: "build-record";
  readonly id: string;
  readonly build: string;
  /** Logical Output id selected by the prior Build; independent of the current author graph. */
  readonly output: string;
};

export type RunFragmentInput = {
  readonly name: string;
  /** Public author-source export. */
  readonly from: string;
};

export type RunFragmentInstance = {
  readonly kind: "fragment";
  readonly id: string;
  readonly using: {
    readonly alias: string;
    readonly name: string;
  };
  readonly inputs: readonly RunFragmentInput[];
  /** Omitted means every Fragment export. */
  readonly exports?: readonly string[];
};

export type RunCandidateDeclaration = RunProvidedValue | RunProvidedFile | RunBuildRecord | RunFragmentInstance;

export type RunSatisfaction = {
  readonly output: string;
  /** Candidate id, or `fragment-instance.export`. */
  readonly candidate: string;
};

export type RunDocument = {
  readonly format: "svml.run-document@1";
  readonly author: RunAuthorSourceRequest;
  readonly imports: readonly RunImport[];
  readonly targets: readonly RunTarget[];
  readonly candidates: readonly RunCandidateDeclaration[];
  readonly satisfactions: readonly RunSatisfaction[];
};

export type RunSourceDiscovery = {
  readonly author: RunAuthorSourceRequest;
  readonly imports: readonly RunImport[];
};

export type DecodedRunSource = {
  readonly document: RunDocument;
};

export type RunFrontend = {
  readonly id: string;
  readonly implementationDigest: Digest;
  discover(source: RunFrontendSourceUnit): RunSourceDiscovery | Promise<RunSourceDiscovery>;
  decode(source: RunFrontendSourceUnit): DecodedRunSource | Promise<DecodedRunSource>;
};

export interface RunFrontendRegistryLike {
  resolve(id: string): RunFrontend | undefined;
}

/** One self-contained Run Source identity. Run Sources do not recursively import other Run Sources. */
export type RunSourceClosure = CompiledSourceIdentity & {
  readonly format: "svml.run-source-closure@1";
  readonly id: Digest;
};

export type RunFragmentPackage = {
  readonly name: string;
  readonly fragments: Readonly<Record<string, GraphFragment>>;
};

export interface RunFragmentRegistryLike {
  resolve(packageName: string, fragmentName: string): GraphFragment | undefined;
}

/** Complete, mandatory execution-intent graph. Empty alternate Candidate sets are still a Run Graph. */
export type RunGraph = {
  readonly format: "svml.run-graph@1";
  readonly id: Digest;
  readonly candidates: readonly Candidate[];
  readonly operations: readonly OperationNode[];
  readonly satisfactions: readonly Satisfaction[];
  readonly targets: readonly { readonly output: string }[];
};

export type ResolveRunDocumentContext = {
  readonly compilation: CompiledSourceClosure;
  readonly sourceClosure: RunSourceClosure;
  readonly fragments: RunFragmentRegistryLike;
  readonly readStoredValue: (from: string) => Promise<StoredValue> | StoredValue;
  readonly readFile: (from: string, mediaType: string) => Promise<StoredValue> | StoredValue;
  readonly readBuild: (id: string) => Promise<BuildState | undefined> | BuildState | undefined;
  /** Host presentation lookup: resolve a prior Build's public output alias to its Logical Output id. */
  readonly resolveBuildOutput?: (
    build: string,
    output: string,
  ) => Promise<string | undefined> | string | undefined;
};

export type RunCompilation = {
  readonly closure: RunSourceClosure;
  readonly document: RunDocument;
  readonly graph: RunGraph;
  readonly candidates: Readonly<Record<string, string>>;
  /** Author-written Candidate name selected for each resolved Logical Output. Presentation only. */
  readonly satisfactionNames: Readonly<Record<string, string>>;
};
