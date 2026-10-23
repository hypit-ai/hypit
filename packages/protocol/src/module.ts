import type { CapabilityRef, ModuleRef, ProducerRef, TypeRef } from "./identity.js";

/** Logical package address for immutable semantic Modules. */
export const modulePackageAbi = "hypit.module@1";

export type PortDeclaration = {
  readonly name: string;
  readonly type: TypeRef;
};

export type CapabilityDeclaration = {
  readonly name: string;
  readonly returns: TypeRef;
};

export type ProducerResultDeclaration =
  | {
      readonly kind: "output";
      readonly name: string;
      readonly type: TypeRef;
    }
  | {
      readonly kind: "need";
      readonly name: string;
      readonly capability: CapabilityRef;
    };

export type ProducerDeclaration = {
  readonly name: string;
  readonly inputs: readonly PortDeclaration[];
  readonly result: ProducerResultDeclaration;
};

export type ModuleManifest = {
  readonly format: "hypit.module@1";
  readonly name: string;
  readonly version: string;
  readonly dependencies: readonly ModuleRef[];
  readonly types: readonly string[];
  readonly capabilities: readonly CapabilityDeclaration[];
  readonly producers: readonly ProducerDeclaration[];
};

export type ResolvedModuleClosure = {
  readonly format: "hypit.closure@1";
  readonly modules: readonly ModuleManifest[];
};

export type ResolvedProducerDeclaration = ProducerDeclaration & {
  readonly ref: ProducerRef;
};

export type ResolvedCapabilityDeclaration = CapabilityDeclaration & {
  readonly ref: CapabilityRef;
};
