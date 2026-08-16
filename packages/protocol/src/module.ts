import type { CapabilityRef, ModuleRef, ProducerRef, TypeRef } from "./identity.js";

/** Logical package address for immutable semantic Modules. */
export const modulePackageAbi = "narratage.module@1";

export type ModuleDependency = {
  readonly module: ModuleRef;
};

export type TypeDeclaration = {
  readonly name: string;
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

export type ProducerDeclaration = {
  readonly name: string;
  readonly inputs: readonly PortDeclaration[];
  readonly outputs: readonly PortDeclaration[];
  readonly needs: readonly NeedPortDeclaration[];
};

export type ModuleManifest = {
  readonly format: "narratage.module@1";
  readonly name: string;
  readonly version: string;
  readonly dependencies: readonly ModuleDependency[];
  readonly types: readonly TypeDeclaration[];
  readonly capabilities: readonly CapabilityDeclaration[];
  readonly producers: readonly ProducerDeclaration[];
};

/** Domain-neutral interface resolved into Core; package-owned value schemas stay outside it. */
export type ResolvedModuleManifest = Omit<ModuleManifest, "types"> & {
  readonly types: readonly { readonly name: string }[];
};

export type ResolvedModule = {
  readonly manifest: ResolvedModuleManifest;
};

export type ResolvedModuleClosure = {
  readonly format: "narratage.closure@1";
  readonly modules: readonly ResolvedModule[];
};

export type ResolvedTypeDeclaration = {
  readonly name: string;
  readonly ref: TypeRef;
};

export type ResolvedProducerDeclaration = ProducerDeclaration & {
  readonly ref: ProducerRef;
};

export type ResolvedCapabilityDeclaration = CapabilityDeclaration & {
  readonly ref: CapabilityRef;
};
