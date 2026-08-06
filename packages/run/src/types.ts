import type {
  CompiledSourceClosure,
  GraphFragment,
} from "@svml/elaborator";
import type {
  BuildState,
  CanonicalValue,
  NeedAcceptance,
  Satisfaction,
  StoredValue,
  TypeRef,
} from "@svml/protocol";
import type { RunGraph } from "@svml/realization";

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
  readonly format: "svml.run-document@1";
  readonly source: string;
  readonly selectedTargets: string;
  readonly imports: readonly RunImport[];
  readonly targetSets: readonly RunTargetSet[];
  readonly candidates: readonly RunCandidateDeclaration[];
  readonly satisfactions: readonly RunSatisfaction[];
};

export type RunFragmentPackage = {
  readonly name: string;
  readonly fragments: Readonly<Record<string, GraphFragment>>;
};

export interface RunFragmentRegistryLike {
  resolve(packageName: string, fragmentName: string): GraphFragment | undefined;
}

export type ResolveRunDocumentContext = {
  readonly compilation: CompiledSourceClosure;
  readonly fragments: RunFragmentRegistryLike;
  readonly readStoredValue: (from: string) => Promise<StoredValue> | StoredValue;
  readonly readBuild: (id: string) => Promise<BuildState | undefined> | BuildState | undefined;
};

export type ResolvedRunDocument = {
  readonly source: string;
  readonly targets: readonly { readonly name: string; readonly accepts: NeedAcceptance }[];
  readonly graphs: readonly RunGraph[];
  readonly satisfactions: readonly Satisfaction[];
  readonly candidates: Readonly<Record<string, string>>;
};
