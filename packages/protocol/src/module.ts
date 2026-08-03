import type { Digest, ModuleRef, ProducerRef, TypeRef } from "./identity.js";
import type { ValueSchema } from "./value.js";

export type ModuleDependency = {
  readonly module: ModuleRef;
  readonly digest: Digest;
};

export type TypeDeclaration = {
  readonly name: string;
  readonly schema: ValueSchema;
  readonly description?: string;
};

export type PortDeclaration = {
  readonly name: string;
  readonly type: TypeRef;
};

export type NeedPortDeclaration = {
  readonly name: string;
  readonly wants: TypeRef;
};

export type ImplementationRef = {
  readonly kind: string;
  readonly locator: string;
  readonly digest: Digest;
};

/**
 * A source Surface is an author-facing declaration exported by a module.
 * `raw` delegates the complete region after its opening tag to the registered
 * Surface implementation. `structured` first uses the selected Frontend's
 * generic element parser and delegates only the resulting tree. `outputs`
 * bounds which authored record types that parser is allowed to introduce.
 */
export type SurfaceDeclaration = {
  readonly name: string;
  readonly tag: string;
  readonly mode: "raw" | "structured";
  readonly outputs: readonly TypeRef[];
  readonly implementation: ImplementationRef;
};

export type ProducerDeclaration = {
  readonly name: string;
  readonly inputs: readonly PortDeclaration[];
  readonly outputs: readonly PortDeclaration[];
  readonly needs: readonly NeedPortDeclaration[];
  readonly implementation: ImplementationRef;
};

export type ModuleManifest = {
  readonly format: "svml.module@0";
  readonly name: string;
  readonly version: string;
  readonly dependencies: readonly ModuleDependency[];
  readonly types: readonly TypeDeclaration[];
  readonly surfaces: readonly SurfaceDeclaration[];
  readonly producers: readonly ProducerDeclaration[];
};

export type ResolvedModule = {
  readonly ref: ModuleRef;
  readonly digest: Digest;
  readonly manifest: ModuleManifest;
};

export type ResolvedModuleClosure = {
  readonly format: "svml.closure@0";
  readonly modules: readonly ResolvedModule[];
  readonly digest: Digest;
};

export type ResolvedTypeDeclaration = TypeDeclaration & {
  readonly ref: TypeRef;
};

export type ResolvedProducerDeclaration = ProducerDeclaration & {
  readonly ref: ProducerRef;
};
