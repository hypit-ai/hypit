import type {
  ModuleRef,
  ResolvedModuleClosure,
  SourceRange,
  StoredValue,
  TypeRef,
  TypedRecord,
} from "@hypit/protocol";
import type {
  AuthorComponent,
  AuthorFrontend,
  AuthorSourceAssetRequest,
  AuthorSourceExport,
  AuthorValueRef,
  Awaitable,
  GraphFragment,
  ResolvedAuthorSourceImport,
} from "@hypit/elaborator";

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

/** Source-local diagnostics are removed before the component enters semantic elaboration. */
export type SurfaceComponentDraft = AuthorComponent & {
  readonly range: SourceRange;
};

export type SurfaceDecodeOutput = {
  readonly records: readonly SurfaceRecordDraft[];
  readonly components: readonly SurfaceComponentDraft[];
  readonly fragments: readonly GraphFragment[];
  /**
   * Public source bindings contributed by this Surface invocation. Omit to
   * publish every generated binding; use an explicit list to keep plumbing
   * addressable inside the source without exposing it from the source.
   */
  readonly exports?: readonly string[];
};

export type RawSurfaceInput = {
  readonly sourceName: string;
  readonly source: string;
  readonly tag: string;
  readonly openingStart: number;
  readonly contentStart: number;
  readonly attributes: Readonly<Record<string, MarkupAttributeValue>>;
  readonly resolveAsset: (request: AuthorSourceAssetRequest) => Awaitable<import("@hypit/elaborator").ResolvedAuthorSourceAsset>;
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
  readonly resolveAsset: (request: AuthorSourceAssetRequest) => Awaitable<import("@hypit/elaborator").ResolvedAuthorSourceAsset>;
};

export type SurfaceResolvedReference = {
  readonly path: string;
  readonly ref: AuthorValueRef;
  readonly type: TypeRef;
  readonly record?: TypedRecord;
};

export type RawSurfaceHandler = (input: RawSurfaceInput) => Awaitable<RawSurfaceOutput>;
export type StructuredSurfaceHandler = (input: StructuredSurfaceInput) => Awaitable<SurfaceDecodeOutput>;

export type SurfaceAttributeKind = "identifier" | "literal" | "reference" | "expression";

export type SurfaceRecipePropertyVocabulary = {
  readonly name: string;
  readonly required: boolean;
  readonly summary: string;
  readonly values?: readonly string[];
  readonly fallback?: string;
};

export type SurfaceAttributeVocabulary = {
  readonly name: string;
  readonly kind: SurfaceAttributeKind;
  readonly required: boolean;
  readonly summary: string;
  readonly values?: readonly string[];
  readonly accepts?: readonly TypeRef[];
  readonly recipe?: readonly SurfaceRecipePropertyVocabulary[];
};

export type SurfaceChildVocabulary = {
  readonly tag: string;
  readonly cardinality: "one" | "optional" | "many";
  readonly summary: string;
  readonly attributes?: readonly SurfaceAttributeVocabulary[];
  /** Elements written inside this child, declared to the same depth the Surface accepts them. */
  readonly children?: readonly SurfaceChildVocabulary[];
  readonly text?: string;
};

export type SurfacePortVocabulary = {
  readonly name: string;
  readonly type: TypeRef;
  readonly summary: string;
};

export type SurfacePreview = {
  readonly mediaType: string;
  readonly path: string;
  readonly open: () => Promise<Uint8Array>;
};

export type SurfaceVocabulary = {
  readonly summary: string;
  readonly appearance?: string;
  readonly preview?: SurfacePreview;
  readonly attributes: readonly SurfaceAttributeVocabulary[];
  readonly children?: readonly SurfaceChildVocabulary[];
  readonly ports?: readonly SurfacePortVocabulary[];
  readonly text?: string;
  readonly example: string;
  readonly notes?: readonly string[];
};

type MarkupSurfaceDeclarationBase = {
  readonly name: string;
  readonly tag: string;
  readonly outputs: readonly TypeRef[];
  readonly vocabulary?: SurfaceVocabulary;
};

export type RawSurfaceDeclaration = MarkupSurfaceDeclarationBase & { readonly mode: "raw" };
export type StructuredSurfaceDeclaration = MarkupSurfaceDeclarationBase & { readonly mode: "structured" };
export type MarkupSurfaceDeclaration = RawSurfaceDeclaration | StructuredSurfaceDeclaration;

type RegisteredSurfaceBase = {
  readonly module: ModuleRef;
  readonly surface: string;
  readonly tag: string;
  readonly outputs: readonly TypeRef[];
  readonly vocabulary?: SurfaceVocabulary;
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
  readonly resolveAsset?: (request: AuthorSourceAssetRequest) => Awaitable<import("@hypit/elaborator").ResolvedAuthorSourceAsset>;
};

export type MarkupDecodeResult = {
  readonly records: readonly TypedRecord[];
  readonly components: readonly AuthorComponent[];
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
