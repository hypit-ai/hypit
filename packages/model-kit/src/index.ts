import type {
  ComponentPackage,
  ProducerFacet,
  ProducerHandlerContext,
  TypeValidatorFacet,
} from "@hypit/component-kit";
import { artifactDependency, artifactTypes } from "@hypit/artifact";
import { sealGraphFragment } from "@hypit/elaborator";
import {
  bindGenerationMedia,
  bindGenerationText,
  finalizeGenerationRequestDraft,
  generationModuleRef,
  generationProducers,
  generationTypes,
  mediaBindingSchemaFromPort,
  requestDraftSchemaFromPorts,
  requestSchemaFromPorts,
  verifyGenerationMediaBinding,
  verifyRequestDraftAgainstPorts,
  verifyRequestAgainstPorts,
} from "@hypit/generation";
import type {
  GenerationMediaBinding,
  GenerationMediaPort,
  GenerationPortTable,
  GenerationRequestDraft,
} from "@hypit/generation";
import { textDependency, textTypes } from "@hypit/text";
import type { Text } from "@hypit/text";
import {
  canonicalize,
} from "@hypit/protocol";
import type {
  CanonicalValue,
  CapabilityRef,
  ModuleManifest,
  ModuleRef,
  ProducerRef,
  TypeRef,
} from "@hypit/protocol";

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
  readonly draftType: TypeRef;
  readonly finalizeProducer: ProducerRef;
  readonly mediaBindings: Readonly<Record<string, ExactModelMediaBindingEndpoint>>;
  readonly textBindings: Readonly<Record<string, ExactModelTextBindingEndpoint>>;
  readonly ports: GenerationPortTable;
  readonly fragment: ReturnType<typeof sealGraphFragment>;
};

export type ExactModelMediaBindingEndpoint = {
  readonly port: string;
  readonly type: TypeRef;
  readonly producer: ProducerRef;
};

export type ExactModelTextBindingEndpoint = {
  readonly port: string;
  readonly producer: ProducerRef;
};

export type ExactModelMediaInput = {
  /** Stable local input name inside this Fragment shape. */
  readonly name: string;
  /** Exact model media port receiving the artifact. */
  readonly port: string;
};

export type ExactModelTextInput = {
  /** Stable local input name inside this Fragment shape. */
  readonly name: string;
  /** Exact model text port receiving the Text value. */
  readonly port: string;
};

export type ExactModelModule<Key extends string = string> = {
  readonly module: ModuleRef;
  readonly manifest: ModuleManifest;
  /** Keyed by the endpoint keys declared by the module. */
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
  const draftType = { module, name: `${spec.requestTypeName}Draft` };
  const capability = { module, name: spec.ports.model };
  const producer = { module, name: spec.producerName };
  const returns = spec.ports.result === "audio"
    ? generationTypes.audioSet
    : spec.ports.result === "image" ? generationTypes.imageSet : generationTypes.videoSet;
  const finalizeProducer = { module, name: `finalize-${spec.producerName}` };
  const mediaBindings = Object.fromEntries(spec.ports.ports
    .filter((port): port is GenerationMediaPort => port.value.kind === "media")
    .map((port) => [port.name, {
      port: port.name,
      type: { module, name: `${spec.requestTypeName}${pascal(port.name)}Binding` },
      producer: { module, name: `bind-${spec.producerName}-${port.name}` },
    } satisfies ExactModelMediaBindingEndpoint]));
  const textBindings = Object.fromEntries(spec.ports.ports
    .filter((port) => port.value.kind === "text")
    .map((port) => [port.name, {
      port: port.name,
      producer: { module, name: `bind-${spec.producerName}-${port.name}-text` },
    } satisfies ExactModelTextBindingEndpoint]));
  return {
    requestType,
    draftType,
    capability,
    producer,
    returns,
    finalizeProducer,
    mediaBindings,
    textBindings,
  };
}

function pascal(value: string): string {
  return value.replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/gu, (_whole, _boundary, letter: string) => letter.toUpperCase());
}

function inlineRequest(
  value: { readonly kind: string; readonly value?: CanonicalValue },
  subject: string,
): CanonicalValue {
  assert(value.kind === "inline" && value.value !== undefined, `${subject} must be an inline request`);
  return canonicalize(value.value);
}

function inlineValue<T>(
  value: { readonly kind: string; readonly value?: CanonicalValue },
  subject: string,
): T {
  assert(value.kind === "inline" && value.value !== undefined, `${subject} must be inline`);
  return canonicalize(value.value) as unknown as T;
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
    format: "hypit.module@1",
    name: options.module.name,
    version: options.module.version,
    dependencies: [
      { module: generationModuleRef },
      artifactDependency,
      textDependency,
    ],
    types: endpointData.flatMap((item) => [
      {
        name: item.requestType.name,
      },
      {
        name: item.draftType.name,
      },
      ...Object.values(item.mediaBindings).map((binding) => {
        const port = item.spec.ports.ports.find((candidate): candidate is GenerationMediaPort =>
          candidate.name === binding.port && candidate.value.kind === "media");
        assert(port !== undefined, `${item.spec.key} media binding ${binding.port} has no port`);
        return { name: binding.type.name };
      }),
    ]),
    capabilities: endpointData.map((item) => ({
      name: item.capability.name,
      returns: item.returns,
    })),
    producers: endpointData.flatMap((item) => [
      {
        name: item.producer.name,
        inputs: [{ name: "request", type: item.requestType }],
        outputs: [],
        needs: [{
          name: "generation",
          capability: item.capability,
          returns: item.returns,
        }],
      },
      ...Object.values(item.mediaBindings).map((binding) => ({
        name: binding.producer.name,
        inputs: [
          { name: "draft", type: item.draftType },
          { name: "binding", type: binding.type },
          { name: "artifact", type: artifactTypes.blob },
        ],
        outputs: [{ name: "draft", type: item.draftType }],
        needs: [],
      })),
      ...Object.values(item.textBindings).map((binding) => ({
        name: binding.producer.name,
        inputs: [
          { name: "draft", type: item.draftType },
          { name: "text", type: textTypes.text },
        ],
        outputs: [{ name: "draft", type: item.draftType }],
        needs: [],
      })),
      {
        name: item.finalizeProducer.name,
        inputs: [{ name: "draft", type: item.draftType }],
        outputs: [{ name: "request", type: item.requestType }],
        needs: [],
      },
    ]),
  };

  const endpoints = Object.fromEntries(endpointData.map((item): [Key, ExactModelEndpoint] => {
    const fragment = sealGraphFragment({
      inputs: [{ name: "request", type: item.requestType }],
      operations: [{
        id: "generate",
        producer: item.producer,
        inputs: { request: { kind: "fragment-input", name: "request" } },
        result: { kind: "need", name: "generation" },
      }],
      exports: [{
        name: "result",
        type: item.returns,
        root: { kind: "fragment-operation", operation: "generate" },
      }],
    });
    return [item.spec.key, {
      key: item.spec.key,
      requestType: item.requestType,
      capability: item.capability,
      producer: item.producer,
      returns: item.returns,
      draftType: item.draftType,
      finalizeProducer: item.finalizeProducer,
      mediaBindings: item.mediaBindings,
      textBindings: item.textBindings,
      ports: item.spec.ports,
      fragment,
    } satisfies ExactModelEndpoint];
  }));

  return {
    module: { ...options.module },
    manifest,
    endpoints: endpoints as Readonly<Record<Key, ExactModelEndpoint>>,
    component: {
      validators: endpointData.flatMap((item) => [{
        type: item.requestType,
        handler({ value }) {
          verifyRequestAgainstPorts(item.spec.ports, inlineRequest(value, item.spec.key));
        },
      }, {
        type: item.draftType,
        handler({ value }) {
          verifyRequestDraftAgainstPorts(item.spec.ports, inlineRequest(value, `${item.spec.key} draft`));
        },
      }]),
      producers: endpointData.flatMap((item) => [
        {
          producer: item.producer,
          handler: ({ inputs }: ProducerHandlerContext) => {
            const requestRecord = inputs.request;
            assert(requestRecord !== undefined, `${item.spec.key} request input is missing`);
            const request = inlineRequest(requestRecord.value, item.spec.key);
            verifyRequestAgainstPorts(item.spec.ports, request);
            return { outputs: {}, needs: { generation: request } };
          },
        },
        ...Object.values(item.mediaBindings).map((binding) => ({
          producer: binding.producer,
          handler: ({ inputs }: ProducerHandlerContext) => {
            const draft = inlineValue<GenerationRequestDraft>(inputs.draft!.value, `${item.spec.key} draft`);
            const value = inlineValue<GenerationMediaBinding>(inputs.binding!.value, `${binding.port} binding`);
            const port = item.spec.ports.ports.find((candidate): candidate is GenerationMediaPort =>
              candidate.name === binding.port && candidate.value.kind === "media");
            assert(port !== undefined, `${item.spec.key} media binding ${binding.port} has no port`);
            verifyGenerationMediaBinding(port, value);
            const artifact = inputs.artifact!.value;
            assert(artifact.kind === "blob", `${binding.port} artifact must be a Blob`);
            return {
              outputs: {
                draft: {
                  kind: "inline" as const,
                  value: canonicalize(bindGenerationMedia(item.spec.ports, draft, binding.port, value, artifact)),
                },
              },
              needs: {},
            };
          },
        })),
        ...Object.values(item.textBindings).map((binding) => ({
          producer: binding.producer,
          handler: ({ inputs }: ProducerHandlerContext) => {
            const draft = inlineValue<GenerationRequestDraft>(inputs.draft!.value, `${item.spec.key} draft`);
            const text = inlineValue<Text>(inputs.text!.value, `${binding.port} Text`);
            return {
              outputs: {
                draft: {
                  kind: "inline" as const,
                  value: canonicalize(bindGenerationText(item.spec.ports, draft, binding.port, text)),
                },
              },
              needs: {},
            };
          },
        })),
        {
          producer: item.finalizeProducer,
          handler: ({ inputs }) => ({
            outputs: {
              request: {
                kind: "inline" as const,
                value: canonicalize(finalizeGenerationRequestDraft(
                  item.spec.ports,
                  inlineValue<GenerationRequestDraft>(inputs.draft!.value, `${item.spec.key} draft`),
                )),
              },
            },
            needs: {},
          }),
        },
      ]),
    },
  };
}

export function exactModelMediaInputNames(name: string): {
  readonly artifact: string;
  readonly binding: string;
} {
  assert(name.trim().length > 0, "Exact model media input name is empty");
  return { artifact: `${name}:artifact`, binding: `${name}:binding` };
}

export function exactModelTextInputName(name: string): string {
  assert(name.trim().length > 0, "Exact model text input name is empty");
  return `${name}:text`;
}

/**
 * Expand one exact-model invocation into a deterministic request-assembly
 * graph. Every runtime-produced media artifact remains a real Fragment input;
 * the fold only constructs the Provider-facing request after those inputs are
 * available.
 */
export function createExactModelPrimaryGenerationFragment(
  endpoint: ExactModelEndpoint,
  mediaInputs: readonly ExactModelMediaInput[] = [],
  textInputs: readonly ExactModelTextInput[] = [],
) {
  const names = [...mediaInputs, ...textInputs].map((item) => item.name);
  assert(new Set(names).size === names.length, "Exact model input names must be unique");
  const inputs = [{ name: "draft", type: endpoint.draftType }];
  const operations: Array<{
    readonly id: string;
    readonly producer: ProducerRef;
    readonly inputs: Readonly<Record<string, { readonly kind: "fragment-input"; readonly name: string } | { readonly kind: "fragment-operation"; readonly operation: string }>>;
    readonly result: { readonly kind: "output"; readonly name: string } | { readonly kind: "need"; readonly name: string };
  }> = [];
  const input = (name: string) => ({ kind: "fragment-input" as const, name });
  const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });
  let draft = input("draft") as ReturnType<typeof input> | ReturnType<typeof operation>;

  for (const [index, item] of textInputs.entries()) {
    const binding = endpoint.textBindings[item.port];
    assert(binding !== undefined, `${endpoint.ports.model} has no text port ${item.port}`);
    const inputName = exactModelTextInputName(item.name);
    inputs.push({ name: inputName, type: textTypes.text });
    const id = `bind-text:${String(index + 1).padStart(4, "0")}:${item.port}`;
    operations.push({
      id,
      producer: binding.producer,
      inputs: { draft, text: input(inputName) },
      result: { kind: "output", name: "draft" },
    });
    draft = operation(id);
  }

  for (const [index, item] of mediaInputs.entries()) {
    const binding = endpoint.mediaBindings[item.port];
    assert(binding !== undefined, `${endpoint.ports.model} has no media port ${item.port}`);
    const inputNames = exactModelMediaInputNames(item.name);
    inputs.push({ name: inputNames.binding, type: binding.type });
    inputs.push({ name: inputNames.artifact, type: artifactTypes.blob });
    const id = `bind:${String(index + 1).padStart(4, "0")}:${item.port}`;
    operations.push({
      id,
      producer: binding.producer,
      inputs: {
        draft,
        binding: input(inputNames.binding),
        artifact: input(inputNames.artifact),
      },
      result: { kind: "output", name: "draft" },
    });
    draft = operation(id);
  }

  operations.push({
    id: "finalize-request",
    producer: endpoint.finalizeProducer,
    inputs: { draft },
    result: { kind: "output", name: "request" },
  });
  operations.push({
    id: "generate",
    producer: endpoint.producer,
    inputs: { request: operation("finalize-request") },
    result: { kind: "need", name: "generation" },
  });
  const result = endpoint.ports.result;
  const primaryProducer = result === "audio"
    ? generationProducers.primaryAudio
    : result === "image" ? generationProducers.primaryImage : generationProducers.primaryVideo;
  operations.push({
    id: `select-primary-${result}`,
    producer: primaryProducer,
    inputs: { set: operation("generate") },
    result: { kind: "output", name: result },
  });
  const shape = [
    ...textInputs.map((item) => `${item.name}=${item.port}:text`),
    ...mediaInputs.map((item) => `${item.name}=${item.port}:media`),
  ].join(",") || "no-dynamic-inputs";
  return sealGraphFragment({
    inputs,
    operations,
    exports: [{
      name: result,
      type: artifactTypes.blob,
      root: operation(`select-primary-${result}`),
    }],
  });
}
