import type {
  CanonicalValue,
  Digest,
  ModuleRef,
  ResolvedModuleClosure,
  SourceRange,
  StoredValue,
  TypeRef,
  TypedModule,
  TypedRecord,
} from "@narratage/protocol";
import type {
  AuthorComponent,
  AuthorFrontend,
  AuthorModule,
  AuthorSourceAssetRequest,
  AuthorSourceExport,
  AuthorValueRef,
  Awaitable,
  GraphFragment,
  ResolvedAuthorSourceImport,
} from "@narratage/elaborator";

/** Decoder-local Markup text; Source identity and closure ownership stay outside the parser. */
export type MarkupSource = {
  readonly name: string;
  readonly text: string;
};

export type MarkupImportRequest = {
  readonly kind: "module" | "source";
  readonly from: string;
  readonly alias?: string;
  readonly range: SourceRange;
};

export type MarkupDiscovery = {
  readonly imports: readonly MarkupImportRequest[];
  readonly bodyStart: number;
};

export type MarkupReference = {
  readonly kind: "reference";
  readonly path: string;
};

export type MarkupAttributeValue = string | MarkupReference;

export type StructuredText = {
  readonly kind: "text";
  readonly value: string;
  readonly range: SourceRange;
};

export type StructuredElement = {
  readonly kind: "element";
  readonly name: string;
  readonly attributes: Readonly<Record<string, MarkupAttributeValue>>;
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
};

export type RawSurfaceInput = {
  readonly sourceName: string;
  readonly source: string;
  readonly tag: string;
  readonly openingStart: number;
  readonly contentStart: number;
  readonly attributes: Readonly<Record<string, MarkupAttributeValue>>;
  readonly resolveAsset: (request: AuthorSourceAssetRequest) => Awaitable<import("@narratage/elaborator").ResolvedAuthorSourceAsset>;
};

export type RawSurfaceOutput = SurfaceDecodeOutput & {
  readonly nextOffset: number;
};

export type StructuredSurfaceInput = {
  readonly sourceName: string;
  readonly element: StructuredElement;
  /**
   * Resolve an explicitly written author reference. Imported record values are
   * available because their source has already been compiled and admitted.
   * A component output has a ref and Type but no compile-time Record value.
   */
  readonly resolveReference: (path: string) => SurfaceResolvedReference | undefined;
  readonly resolveAsset: (request: AuthorSourceAssetRequest) => Awaitable<import("@narratage/elaborator").ResolvedAuthorSourceAsset>;
};

export type SurfaceResolvedReference = {
  readonly path: string;
  readonly ref: AuthorValueRef;
  readonly type: TypeRef;
  readonly record?: TypedRecord;
};

export type RawSurfaceHandler = (input: RawSurfaceInput) => Awaitable<RawSurfaceOutput>;
export type StructuredSurfaceHandler = (input: StructuredSurfaceInput) => Awaitable<SurfaceDecodeOutput>;

type MarkupSurfaceDeclarationBase = {
  readonly name: string;
  readonly tag: string;
  readonly outputs: readonly TypeRef[];
  readonly implementation: { readonly digest: Digest };
};

export type RawSurfaceDeclaration = MarkupSurfaceDeclarationBase & { readonly mode: "raw" };
export type StructuredSurfaceDeclaration = MarkupSurfaceDeclarationBase & { readonly mode: "structured" };
export type MarkupSurfaceDeclaration = RawSurfaceDeclaration | StructuredSurfaceDeclaration;

type RegisteredSurfaceBase = {
  readonly module: ModuleRef;
  readonly surface: string;
  readonly tag: string;
  readonly outputs: readonly TypeRef[];
  readonly implementationDigest: Digest;
};

export type RegisteredRawSurface = RegisteredSurfaceBase & {
  readonly mode: "raw";
  readonly handler: RawSurfaceHandler;
};

export type RegisteredStructuredSurface = RegisteredSurfaceBase & {
  readonly mode: "structured";
  readonly handler: StructuredSurfaceHandler;
};

export type RegisteredSurface =
  | RegisteredRawSurface
  | RegisteredStructuredSurface;

export type MarkupDecodeContext = {
  readonly closure: ResolvedModuleClosure;
  readonly registry: MarkupSurfaceRegistryLike;
  readonly resolveModule: (request: MarkupImportRequest) => ModuleRef;
  readonly sourceImports?: readonly ResolvedAuthorSourceImport[];
  readonly resolveAsset?: (request: AuthorSourceAssetRequest) => Awaitable<import("@narratage/elaborator").ResolvedAuthorSourceAsset>;
};

export type MarkupDecodeResult = {
  readonly module: TypedModule;
  readonly author: AuthorModule;
  readonly fragments: readonly GraphFragment[];
  readonly exports: readonly AuthorSourceExport[];
};

export type MarkupAuthorFrontendOptions = {
  readonly registry: MarkupSurfaceRegistryLike;
  readonly resolveModule: (request: MarkupImportRequest) => ModuleRef;
};

export type MarkupAuthorFrontend = AuthorFrontend;

export interface MarkupSurfaceRegistryLike {
  resolve(module: ModuleRef, surface: string): RegisteredSurface | undefined;
  surfaces(module: ModuleRef): readonly RegisteredSurface[];
}
