import type { CapabilityRef, Digest, ModuleRef, ProducerRef, TypeRef } from "./identity.js";
import type { CanonicalValue, ValueSchema } from "./value.js";

export type ModuleDependency = {
  readonly module: ModuleRef;
  readonly digest: Digest;
};

export type TypeDeclaration = {
  readonly name: string;
  readonly schema: ValueSchema;
  readonly description?: string;
  /** Optional package-owned semantic refinement beyond the structural Schema. */
  readonly validator?: TypeValidatorDeclaration;
  /**
   * One value of this type, for anything that must show or exercise it before a
   * Build has produced one.
   *
   * The module that defines a type is the only place that knows what an
   * unspecified one should look like. Without this, every consumer invents its
   * own and they drift apart with nothing to notice. Omitted where no honest
   * default exists — a type carrying content-addressed media cannot have one,
   * because the module has no bytes to point at.
   */
  readonly default?: CanonicalValue;
};

export type TypeValidatorDeclaration = {
  readonly abi: "svml.type-validator@1";
  readonly implementation: ImplementationRef;
};

export type PortDeclaration = {
  readonly name: string;
  readonly type: TypeRef;
};

export type NeedPortDeclaration = {
  readonly name: string;
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
};

export type CapabilityDeclaration = {
  readonly name: string;
  readonly returns: TypeRef;
  readonly description?: string;
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
  readonly format: "svml.module@1";
  readonly name: string;
  readonly version: string;
  readonly dependencies: readonly ModuleDependency[];
  readonly types: readonly TypeDeclaration[];
  readonly capabilities: readonly CapabilityDeclaration[];
  readonly surfaces: readonly SurfaceDeclaration[];
  readonly producers: readonly ProducerDeclaration[];
};

export type ResolvedModule = {
  readonly ref: ModuleRef;
  readonly digest: Digest;
  readonly manifest: ModuleManifest;
};

export type ResolvedModuleClosure = {
  readonly format: "svml.closure@1";
  readonly modules: readonly ResolvedModule[];
  readonly digest: Digest;
};

export type ResolvedTypeDeclaration = TypeDeclaration & {
  readonly ref: TypeRef;
};

export type ResolvedProducerDeclaration = ProducerDeclaration & {
  readonly ref: ProducerRef;
};

export type ResolvedCapabilityDeclaration = CapabilityDeclaration & {
  readonly ref: CapabilityRef;
};
