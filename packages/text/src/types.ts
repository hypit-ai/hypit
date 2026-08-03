import type {
  CanonicalValue,
  Digest,
  ModuleRef,
  ResolvedModuleClosure,
  SourceRange,
  StoredValue,
  SurfaceDeclaration,
  TypeRef,
  TypedModule,
} from "@svml/protocol";

export type SourceUnit = {
  readonly name: string;
  readonly text: string;
};

export type TextImportRequest = {
  readonly from: string;
  readonly alias?: string;
  readonly using?: string;
  readonly range: SourceRange;
};

export type TextDiscovery = {
  readonly imports: readonly TextImportRequest[];
  readonly bodyStart: number;
};

export type TextReference = {
  readonly kind: "reference";
  readonly path: string;
};

export type TextAttributeValue = string | TextReference;

export type StructuredText = {
  readonly kind: "text";
  readonly value: string;
  readonly range: SourceRange;
};

export type StructuredElement = {
  readonly kind: "element";
  readonly name: string;
  readonly attributes: Readonly<Record<string, TextAttributeValue>>;
  readonly children: readonly StructuredNode[];
  readonly range: SourceRange;
};

export type StructuredNode = StructuredText | StructuredElement;

export type SurfaceRecordDraft = {
  readonly id: string;
  readonly type: TypeRef;
  readonly value: StoredValue;
  readonly range: SourceRange;
};

export type SurfaceDecodeOutput = {
  readonly records: readonly SurfaceRecordDraft[];
  readonly sourceMaps?: readonly CanonicalValue[];
};

export type RawSurfaceInput = {
  readonly sourceName: string;
  readonly source: string;
  readonly tag: string;
  readonly openingStart: number;
  readonly contentStart: number;
  readonly attributes: Readonly<Record<string, TextAttributeValue>>;
};

export type RawSurfaceOutput = SurfaceDecodeOutput & {
  readonly nextOffset: number;
};

export type StructuredSurfaceInput = {
  readonly sourceName: string;
  readonly element: StructuredElement;
};

export type RawSurfaceHandler = (input: RawSurfaceInput) => RawSurfaceOutput;
export type StructuredSurfaceHandler = (input: StructuredSurfaceInput) => SurfaceDecodeOutput;

export type RegisteredSurface = {
  readonly module: ModuleRef;
  readonly surface: string;
  readonly implementationDigest: Digest;
  readonly mode: SurfaceDeclaration["mode"];
  readonly handler: RawSurfaceHandler | StructuredSurfaceHandler;
};

export type TextDecodeContext = {
  readonly closure: ResolvedModuleClosure;
  readonly registry: TextSurfaceRegistryLike;
  readonly resolveModule: (request: TextImportRequest) => ModuleRef;
};

export type TextDecodeResult = {
  readonly module: TypedModule;
  readonly imports: readonly TextImportRequest[];
  readonly frontendClosureDigest: Digest;
  readonly sourceMaps: readonly CanonicalValue[];
};

export interface TextSurfaceRegistryLike {
  resolve(module: ModuleRef, surface: string): RegisteredSurface | undefined;
}
