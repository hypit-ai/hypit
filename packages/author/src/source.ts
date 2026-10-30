import type {
  AuthorGraph,
  BlobRef,
  GraphValueRef,
  LinkedProgram,
  ResolvedModuleClosure,
  TypeRef,
  TypedRecord,
} from "@hypit/protocol";
import { sameType, typeKey } from "@hypit/protocol";
import type {
  SourceAssetRequest,
  SourceAssetReader,
  SourceAssetResolver,
  SourceImportRequest,
  SourceRange,
  SourceResolver,
  SourceUnit,
} from "@hypit/source";

import type {
  AuthorComponent,
  AuthorValueRef,
} from "./author.js";
import type { AuthorDocumentFrontend } from "./document.js";

export type AuthorSourceUnit = SourceUnit;
export type AuthorSourceImport = SourceImportRequest;

export type AuthorSourceDiscovery = {
  readonly modules: readonly string[];
  readonly sources: readonly AuthorSourceImport[];
};

export type AuthorSourceAssetRequest = SourceAssetRequest;
export type AuthorSourceResolver = SourceResolver;
export type AuthorSourceAssetResolver = SourceAssetResolver;
export type AuthorSourceAssetReader = SourceAssetReader;

export type AuthorSourceExport = {
  readonly name: string;
  readonly ref: AuthorValueRef;
  readonly type: TypeRef;
};

/** Package-owned recoverable output; independent of the Source module interface. */
export type AuthorRetainedOutput = {
  readonly name: string;
  readonly ref: AuthorValueRef;
  readonly type: TypeRef;
};

export type AuthorInputProvenanceDraft = {
  readonly name: string;
  readonly range: SourceRange;
  readonly kind: "literal" | "reference";
  readonly ref?: AuthorValueRef;
};

export type AuthorElementProvenanceDraft = {
  readonly range: SourceRange;
  readonly records: readonly string[];
  readonly components: readonly string[];
  readonly outputs: readonly { readonly component: string; readonly name: string; readonly id: string }[];
  readonly inputs: readonly AuthorInputProvenanceDraft[];
};

export type ResolvedAuthorSourceImport = {
  readonly request: AuthorSourceImport;
  readonly source: string;
  readonly exports: readonly AuthorSourceExport[];
  readonly records: readonly TypedRecord[];
};

export type Awaitable<T> = T | Promise<T>;

export type AuthorSourceDecodeContext = {
  readonly closure: ResolvedModuleClosure;
  readonly imports: readonly ResolvedAuthorSourceImport[];
  readonly resolveAsset: (request: AuthorSourceAssetRequest) => Awaitable<BlobRef>;
  readonly readAsset?: (request: AuthorSourceAssetRequest) => Awaitable<Uint8Array>;
};

export type DecodedAuthorSource = {
  readonly records: readonly TypedRecord[];
  readonly components: readonly AuthorComponent[];
  readonly exports: readonly AuthorSourceExport[];
  readonly retainedOutputs?: readonly AuthorRetainedOutput[];
  readonly provenance?: readonly AuthorElementProvenanceDraft[];
};

export type AuthorFrontend = {
  readonly id: string;
  /** Present only when this Frontend supports lossless author-document editing. */
  readonly document?: AuthorDocumentFrontend;
  discover(source: SourceUnit): Awaitable<AuthorSourceDiscovery>;
  decode(source: SourceUnit, context: AuthorSourceDecodeContext): Awaitable<DecodedAuthorSource>;
};

export interface AuthorFrontendRegistryLike {
  resolve(id: string): AuthorFrontend | undefined;
}

export class AuthorFrontendError extends Error {
  readonly code: string;
  readonly subject: string | undefined;

  constructor(code: string, message: string, subject?: string) {
    super(message);
    this.name = "AuthorFrontendError";
    this.code = code;
    this.subject = subject;
  }
}

export class AuthorFrontendRegistry implements AuthorFrontendRegistryLike {
  readonly #frontends = new Map<string, AuthorFrontend>();

  register(frontend: AuthorFrontend): void {
    if (frontend.id.length === 0) throw new AuthorFrontendError("EMPTY_FRONTEND_ID", "Frontend id is empty");
    if (this.#frontends.has(frontend.id)) {
      throw new AuthorFrontendError("DUPLICATE_FRONTEND", `Frontend ${frontend.id} is already registered`, frontend.id);
    }
    this.#frontends.set(frontend.id, frontend);
  }

  resolve(id: string): AuthorFrontend | undefined {
    return this.#frontends.get(id);
  }
}

export type AuthorRecordRefiner = (
  record: TypedRecord,
) => Awaitable<void>;

export type SourceClosureUnit = {
  readonly id: string;
  readonly name: string;
  readonly frontend: string;
  readonly imports: readonly { readonly alias: string; readonly source: string }[];
};

export type AuthorInputProvenance = {
  readonly id: string;
  readonly name: string;
  readonly range: SourceRange;
  readonly kind: "literal" | "reference";
  readonly ref?: AuthorValueRef;
};

export type AuthorElementProvenance = {
  readonly id: string;
  readonly source: string;
  readonly sourceName: string;
  readonly frontend: string;
  readonly range: SourceRange;
  readonly records: readonly { readonly local: string; readonly id: string }[];
  readonly components: readonly { readonly local: string; readonly id: string }[];
  readonly outputs: readonly {
    readonly component: string;
    readonly name: string;
    readonly local: string;
    readonly id: string;
  }[];
  readonly inputs: readonly AuthorInputProvenance[];
};

export type AuthorProvenance = {
  readonly format: "hypit.author-provenance@1";
  readonly elements: readonly AuthorElementProvenance[];
};

export type SourceClosure = {
  readonly entry: string;
  readonly units: readonly SourceClosureUnit[];
};

export type CompiledSourceExport = {
  readonly name: string;
  readonly type: TypeRef;
  readonly ref: GraphValueRef;
};

export type CompiledRetainedOutput = {
  /** Source-qualified author name used by the Result surface. */
  readonly name: string;
  readonly type: TypeRef;
  readonly ref: Extract<GraphValueRef, { readonly kind: "logical-output" }>;
};

/** Domain result of authoring; the Compiler owns how a Source closure is assembled. */
export type CompiledSourceClosure = {
  readonly closure: SourceClosure;
  readonly program: LinkedProgram;
  readonly graph: AuthorGraph;
  readonly exports: readonly CompiledSourceExport[];
  readonly retainedOutputs: readonly CompiledRetainedOutput[];
  readonly provenance: AuthorProvenance;
};

export function resolveCompiledSourceExport(
  compiled: CompiledSourceClosure,
  name: string,
  expected?: TypeRef,
): CompiledSourceExport {
  const item = compiled.exports.find((candidate) => candidate.name === name);
  if (item === undefined) throw new AuthorFrontendError("UNKNOWN_SOURCE_EXPORT", `unknown source export ${name}`, name);
  if (expected !== undefined && !sameType(item.type, expected)) {
    throw new AuthorFrontendError(
      "SOURCE_EXPORT_TYPE_MISMATCH",
      `${name} is ${typeKey(item.type)}, expected ${typeKey(expected)}`,
      name,
    );
  }
  return item;
}
