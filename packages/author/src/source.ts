import type {
  AuthorGraph,
  GraphValueRef,
  LinkedProgram,
  ResolvedModuleClosure,
  TypeRef,
  TypedRecord,
} from "@hypit/protocol";
import { sameType, typeKey } from "@hypit/protocol";
import type {
  ResolvedSourceAsset,
  SourceAssetRequest,
  SourceAssetResolver,
  SourceImportRequest,
  SourceRange,
  SourceResolver,
  SourceUnit,
} from "@hypit/source";

import type { AuthorComponent, AuthorValueRef } from "./author.js";

export type AuthorSourceUnit = SourceUnit;
export type AuthorFrontendSourceUnit = AuthorSourceUnit;
export type AuthorSourceImport = SourceImportRequest;

export type AuthorSourceDiscovery = {
  readonly modules: readonly string[];
  readonly sources: readonly AuthorSourceImport[];
};

export type AuthorSourceAssetRequest = SourceAssetRequest;
export type ResolvedAuthorSourceAsset = ResolvedSourceAsset;
export type AuthorSourceResolver = SourceResolver;
export type AuthorSourceAssetResolver = SourceAssetResolver;

export type AuthorSourceExport = {
  readonly name: string;
  readonly ref: AuthorValueRef;
  readonly type: TypeRef;
};

export type AuthorSourceIdentity = {
  readonly namespace: TypeRef;
  readonly id: string;
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
  readonly resolveAsset: (request: AuthorSourceAssetRequest) => Awaitable<ResolvedAuthorSourceAsset>;
};

export type DecodedAuthorSource = {
  readonly records: readonly TypedRecord[];
  readonly components: readonly AuthorComponent[];
  readonly exports: readonly AuthorSourceExport[];
  readonly identities?: readonly AuthorSourceIdentity[];
  readonly provenance?: readonly AuthorElementProvenanceDraft[];
};

export type AuthorFrontend = {
  readonly id: string;
  discover(source: AuthorFrontendSourceUnit): Awaitable<AuthorSourceDiscovery>;
  decode(source: AuthorFrontendSourceUnit, context: AuthorSourceDecodeContext): Awaitable<DecodedAuthorSource>;
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

export type AuthorRecordValidator = (
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

/** Domain result of authoring; the Compiler owns how a Source closure is assembled. */
export type CompiledSourceClosure = {
  readonly closure: SourceClosure;
  readonly program: LinkedProgram;
  readonly graph: AuthorGraph;
  readonly exports: readonly CompiledSourceExport[];
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
