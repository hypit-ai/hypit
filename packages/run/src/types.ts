import type {
  CompiledSourceClosure,
  GraphFragment,
} from "@svml/elaborator";
import type {
  BuildState,
  Candidate,
  CanonicalValue,
  Digest,
  NeedAcceptance,
  OperationNode,
  Satisfaction,
  StoredValue,
  TypeRef,
} from "@svml/protocol";
import type { RealizationOverlay } from "@svml/realization";
import type { SourceHeader } from "@svml/source";

export type RunSourceUnit = {
  readonly id: string;
  readonly name: string;
  readonly text: string;
};

export type RunFrontendSourceUnit = RunSourceUnit & {
  readonly header: SourceHeader;
  readonly sourceDigest: Digest;
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
  readonly accepts: NeedAcceptance;
};

export type RunTargetSet = {
  readonly id: string;
  readonly targets: readonly RunTarget[];
};

export type RunProvidedValue = {
  readonly kind: "provided";
  readonly id: string;
  readonly type: TypeRef;
  /** File containing one StoredValue JSON object. */
  readonly from: string;
  readonly provenance?: CanonicalValue;
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

export type RunCandidateDeclaration = RunProvidedValue | RunBuildRecord | RunFragmentInstance;

export type RunSatisfaction = {
  readonly output: string;
  /** Candidate id, or `fragment-instance.export`. */
  readonly candidate: string;
  readonly fidelity: "exact" | "substitute";
};

export type RunDocument = {
  readonly format: "svml.run-document@2";
  readonly author: RunAuthorSourceRequest;
  readonly selectedTargets: string;
  readonly imports: readonly RunImport[];
  readonly targetSets: readonly RunTargetSet[];
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

export type RunSourceUnitIdentity = {
  readonly format: "svml.run-source-unit@1";
  readonly id: Digest;
  readonly frontendRequest: string;
  readonly frontend: string;
  readonly frontendDigest: Digest;
  readonly sourceDigest: Digest;
  readonly semanticDigest: Digest;
  readonly authorSource: string;
  readonly imports: readonly RunImport[];
};

export type RunSourceClosure = {
  readonly format: "svml.run-source-closure@1";
  readonly id: Digest;
  readonly entry: Digest;
  readonly units: readonly RunSourceUnitIdentity[];
};

export type RunFragmentPackage = {
  readonly name: string;
  readonly fragments: Readonly<Record<string, GraphFragment>>;
};

export interface RunFragmentRegistryLike {
  resolve(packageName: string, fragmentName: string): GraphFragment | undefined;
}

export type ResolvedRunTargetSet = {
  readonly id: string;
  readonly targets: readonly {
    readonly output: string;
    readonly accepts: NeedAcceptance;
  }[];
};

/** Complete, mandatory execution-intent graph. Empty alternate Candidate sets are still a Run Graph. */
export type RunGraph = {
  readonly format: "svml.run-graph@1";
  readonly id: Digest;
  readonly authorGraph: Digest;
  readonly sourceClosure: Digest;
  readonly candidates: readonly Candidate[];
  readonly operations: readonly OperationNode[];
  readonly satisfactions: readonly Satisfaction[];
  readonly targetSets: readonly ResolvedRunTargetSet[];
  readonly selectedTargets: string;
};

export type ResolveRunDocumentContext = {
  readonly compilation: CompiledSourceClosure;
  readonly sourceClosure: RunSourceClosure;
  readonly fragments: RunFragmentRegistryLike;
  readonly readStoredValue: (from: string) => Promise<StoredValue> | StoredValue;
  readonly readBuild: (id: string) => Promise<BuildState | undefined> | BuildState | undefined;
};

export type RunCompilation = {
  readonly closure: RunSourceClosure;
  readonly document: RunDocument;
  readonly graph: RunGraph;
  readonly overlay?: RealizationOverlay;
  readonly candidates: Readonly<Record<string, string>>;
};
