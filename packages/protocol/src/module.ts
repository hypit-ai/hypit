import type { CapabilityRef, Digest, ModuleRef, ProducerRef, TypeRef } from "./identity.js";
import type { ValueSchema } from "./value.js";

/** Logical package address for immutable semantic Modules. */
export const modulePackageAbi = "svml.module@1";

export type ModuleDependency = {
  readonly module: ModuleRef;
  readonly digest: Digest;
};

export type TypeDeclaration = {
  readonly name: string;
  readonly schema: ValueSchema;
  /** Optional package-owned semantic refinement beyond the structural Schema. */
  readonly validator?: TypeValidatorDeclaration;
};

export type TypeValidatorDeclaration = {
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
};

export type ImplementationRef = {
  readonly digest: Digest;
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
  readonly producers: readonly ProducerDeclaration[];
};

export type ResolvedModule = {
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
