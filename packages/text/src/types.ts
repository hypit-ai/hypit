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
  TypedRecord,
} from "@svml/protocol";
import type {
  AuthorComponent,
  AuthorFrontend,
  AuthorModule,
  AuthorSourceExport,
  AuthorValueRef,
  GraphFragment,
  ResolvedAuthorSourceImport,
} from "@svml/elaborator";

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

/** Source-local diagnostics are removed before the component enters the semantic AuthorModule. */
export type SurfaceComponentDraft = AuthorComponent & {
  readonly range: SourceRange;
};

export type SurfaceDecodeOutput = {
  readonly records: readonly SurfaceRecordDraft[];
  readonly components: readonly SurfaceComponentDraft[];
  readonly fragments: readonly GraphFragment[];
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
  /**
   * Resolve an explicitly written author reference. Imported record values are
   * available because their SourceUnit has already been compiled and admitted.
   * A component output has a ref and Type but no compile-time Record value.
   */
  readonly resolveReference: (path: string) => SurfaceResolvedReference | undefined;
};

export type SurfaceResolvedReference = {
  readonly path: string;
  readonly ref: AuthorValueRef;
  readonly type: TypeRef;
  readonly record?: TypedRecord;
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
  readonly sourceImports?: readonly ResolvedAuthorSourceImport[];
};

export type TextDecodeResult = {
  readonly module: TypedModule;
  readonly author: AuthorModule;
  readonly fragments: readonly GraphFragment[];
  readonly exports: readonly AuthorSourceExport[];
  readonly imports: readonly TextImportRequest[];
  readonly frontendClosureDigest: Digest;
  readonly sourceMaps: readonly CanonicalValue[];
};

export type TextAuthorFrontendOptions = {
  readonly registry: TextSurfaceRegistryLike;
  readonly resolveModule: (request: TextImportRequest) => ModuleRef;
};

export type TextAuthorFrontend = AuthorFrontend;

export interface TextSurfaceRegistryLike {
  resolve(module: ModuleRef, surface: string): RegisteredSurface | undefined;
}
