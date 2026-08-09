import type {
  ComponentPackage,
  ProducerFacet,
  TypeValidatorFacet,
} from "@narratage/component-kit";
import { sealGraphFragment } from "@narratage/elaborator";
import {
  generationManifestDigest,
  generationModuleRef,
  generationTypes,
  requestSchemaFromPorts,
  verifyRequestAgainstPorts,
} from "@narratage/generation";
import type { GenerationPortTable } from "@narratage/generation";
import {
  canonicalize,
  digestOf,
} from "@narratage/protocol";
import type {
  CanonicalValue,
  CapabilityRef,
  Digest,
  ModuleManifest,
  ModuleRef,
  ProducerRef,
  TypeRef,
} from "@narratage/protocol";

/**
 * One exact model endpoint. The model declares which input ports it accepts;
 * its request Schema and semantic validator are derived from that declaration,
 * so the Capability name, the accepted media roles and the port cardinalities
 * have exactly one source of truth.
 */
export type ExactModelEndpointSpec = {
  readonly key: string;
  readonly requestTypeName: string;
  readonly producerName: string;
  readonly ports: GenerationPortTable;
};

export type ExactModelEndpoint = {
  readonly key: string;
  readonly requestType: TypeRef;
  readonly capability: CapabilityRef;
  readonly producer: ProducerRef;
  readonly returns: TypeRef;
  readonly implementationDigest: Digest;
  readonly validatorDigest: Digest;
  readonly ports: GenerationPortTable;
  readonly fragment: ReturnType<typeof sealGraphFragment>;
};

export type ExactModelModule<Key extends string = string> = {
  readonly module: ModuleRef;
  readonly manifest: ModuleManifest;
  readonly manifestDigest: Digest;
  /** Keyed by the exact endpoint keys the module declared, so a stale key fails to compile. */
  readonly endpoints: Readonly<Record<Key, ExactModelEndpoint>>;
  readonly component: ComponentPackage & {
    readonly validators: readonly TypeValidatorFacet[];
    readonly producers: readonly ProducerFacet[];
  };
};

export type DefineExactModelModuleOptions<Key extends string = string> = {
  readonly module: ModuleRef;
  readonly endpoints: readonly (Omit<ExactModelEndpointSpec, "key"> & { readonly key: Key })[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function endpointRef(module: ModuleRef, spec: ExactModelEndpointSpec) {
  const requestType = { module, name: spec.requestTypeName };
  const capability = { module, name: spec.ports.model };
  const producer = { module, name: spec.producerName };
  const returns = spec.ports.result === "audio"
    ? generationTypes.audioSet
    : spec.ports.result === "image" ? generationTypes.imageSet : generationTypes.videoSet;
  const implementationDigest = digestOf(`${module.name}/${spec.producerName}@1`);
  const validatorDigest = digestOf(`${module.name}/validate-${spec.requestTypeName}@1`);
  return { requestType, capability, producer, returns, implementationDigest, validatorDigest };
}

function inlineRequest(
  value: { readonly kind: string; readonly value?: CanonicalValue },
  subject: string,
): CanonicalValue {
  assert(value.kind === "inline" && value.value !== undefined, `${subject} must be an inline request`);
  return canonicalize(value.value);
}

/**
 * Builds the repetitive nominal shell around an exact model request. The model package still owns
 * every field, constraint and model name; this helper only wires Type -> Producer -> Need -> Fragment.
 */
export function defineExactModelModule<const Key extends string>(
  options: DefineExactModelModuleOptions<Key>,
): ExactModelModule<Key> {
  assert(options.module.name.trim().length > 0 && options.module.version.trim().length > 0,
    "Exact model module identity is invalid");
  assert(options.endpoints.length > 0, `${options.module.name} declares no exact model endpoint`);
  const keys = options.endpoints.map((item) => item.key);
  assert(new Set(keys).size === keys.length, `${options.module.name} repeats an endpoint key`);
  const models = options.endpoints.map((item) => item.ports.model);
  assert(new Set(models).size === models.length, `${options.module.name} repeats an exact model`);
  const endpointData = options.endpoints.map((spec) => ({ spec, ...endpointRef(options.module, spec) }));

  const manifest: ModuleManifest = {
    format: "svml.module@1",
    name: options.module.name,
    version: options.module.version,
    dependencies: [{ module: generationModuleRef, digest: generationManifestDigest }],
    types: endpointData.map((item) => ({
      name: item.requestType.name,
      schema: requestSchemaFromPorts(item.spec.ports),
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: `${options.module.name}/validate-${item.spec.key}`,
          digest: item.validatorDigest,
        },
      },
    })),
    capabilities: endpointData.map((item) => ({
      name: item.capability.name,
      returns: item.returns,
    })),
    surfaces: [],
    producers: endpointData.map((item) => ({
      name: item.producer.name,
      inputs: [{ name: "request", type: item.requestType }],
      outputs: [],
      needs: [{
        name: "generation",
        capability: item.capability,
        returns: item.returns,
      }],
      implementation: {
        kind: "registered",
        locator: `${options.module.name}/${item.spec.key}`,
        digest: item.implementationDigest,
      },
    })),
  };

  const endpoints = Object.fromEntries(endpointData.map((item): [Key, ExactModelEndpoint] => {
    const fragment = sealGraphFragment({
      name: `${options.module.name}/${item.spec.key}@1`,
      inputs: [{ name: "request", type: item.requestType }],
      operations: [{
        id: "generate",
        producer: item.producer,
        inputs: { request: { kind: "fragment-input", name: "request" } },
        result: { kind: "need", name: "generation", accepts: "exact" },
      }],
      exports: [{
        name: "result",
        type: item.returns,
        root: { kind: "fragment-operation", operation: "generate" },
        semanticInputs: ["request"],
        fidelity: "exact",
      }],
    });
    return [item.spec.key, {
      key: item.spec.key,
      requestType: item.requestType,
      capability: item.capability,
      producer: item.producer,
      returns: item.returns,
      implementationDigest: item.implementationDigest,
      validatorDigest: item.validatorDigest,
      ports: item.spec.ports,
      fragment,
    } satisfies ExactModelEndpoint];
  }));

  return {
    module: { ...options.module },
    manifest,
    manifestDigest: digestOf(manifest),
    endpoints: endpoints as Readonly<Record<Key, ExactModelEndpoint>>,
    component: {
      name: options.module.name,
      validators: endpointData.map((item) => ({
        type: item.requestType,
        implementationDigest: item.validatorDigest,
        handler({ value }) {
          verifyRequestAgainstPorts(item.spec.ports, inlineRequest(value, item.spec.key));
        },
      })),
      producers: endpointData.map((item) => ({
        producer: item.producer,
        implementationDigest: item.implementationDigest,
        handler: ({ inputs }) => {
          const requestRecord = inputs.request;
          assert(requestRecord !== undefined, `${item.spec.key} request input is missing`);
          const request = inlineRequest(requestRecord.value, item.spec.key);
          verifyRequestAgainstPorts(item.spec.ports, request);
          return { outputs: {}, needs: { generation: request } };
        },
      })),
    },
  };
}
