import type { RefinementPackage, TypeRefinement } from "@hypit/hypit/refinement";
import type {
  ProducerPackage,
  ProducerFacet,
  ProducerHandlerContext,
} from "@hypit/hypit/producer";
import { blobDependency, blobTypes } from "@hypit/hypit/blob";
import { sealGraphFragment } from "@hypit/hypit/author";
import {
  bindGenerationMedia,
  bindGenerationText,
  sealGenerationPortRequest,
  verifyGenerationMediaBinding,
  verifyRequestDraftAgainstPorts,
  verifyRequestAgainstPorts,
} from "./request.js";
import type {
  GenerationMediaBinding,
  GenerationRequest,
  GenerationRequestDraft,
} from "./request.js";
import type {
  GenerationMediaPort,
  GenerationPortTable,
} from "./ports.js";
import { generationProducers, generationTypes } from "./manifest.js";
import { textDependency, textTypes } from "@hypit/hypit/text";
import type { Text } from "@hypit/hypit/text";
import {
  canonicalize,
  isBlobRef,
  normalizeValue,
  sameModule,
} from "@hypit/hypit/protocol";
import type {
  CapabilityRef,
  ModuleManifest,
  ModuleRef,
  ProducerRef,
  TypeRef,
  Value,
} from "@hypit/hypit/protocol";

/**
 * One exact model endpoint. The model declares which input ports it accepts;
 * its request Schema and semantic validator are derived from that declaration,
 * so the Capability name, the accepted media roles and the port cardinalities
 * have exactly one source of truth.
 */
export type FieldModelEndpointSpec = {
  readonly key: string;
  readonly requestTypeName: string;
  readonly producerName: string;
  readonly ports: GenerationPortTable;
  /** The model-owned result contract. Standard generated-media products are optional conveniences. */
  readonly result: FieldModelResultContract;
  /** Additional complete-request rules, after port and supplied-input validation. */
  readonly validateRequest?: (request: GenerationRequest) => void;
  /** Pure, synchronous checks of supplied values, in drafts and complete requests; throw to reject. */
  readonly validateInputs?: (inputs: GenerationRequestDraft) => void;
};

export type FieldModelResultContract = {
  readonly type: TypeRef;
  /** An explicit ordinary Producer used by authoring Fragments that publish one artifact. */
  readonly primary: {
    readonly producer: ProducerRef;
    readonly input: string;
    readonly output: string;
  };
};

export const standardGenerationResultTypes = {
  audio: generationTypes.audioSet,
  image: generationTypes.imageSet,
  video: generationTypes.videoSet,
} as const satisfies Record<string, TypeRef>;

export const standardGenerationResults = {
  audio: {
    type: standardGenerationResultTypes.audio,
    primary: { producer: generationProducers.primaryAudio, input: "set", output: "audio" },
  },
  image: {
    type: standardGenerationResultTypes.image,
    primary: { producer: generationProducers.primaryImage, input: "set", output: "image" },
  },
  video: {
    type: standardGenerationResultTypes.video,
    primary: { producer: generationProducers.primaryVideo, input: "set", output: "video" },
  },
} as const satisfies Record<string, FieldModelResultContract>;

export type ModelOperationSpec = {
  readonly key: string;
  readonly capabilityName: string;
  readonly requestTypeName: string;
  readonly producerName: string;
  readonly returns: TypeRef;
  /** The Model is the sole owner of the complete canonical request contract. */
  readonly validateRequest: (request: unknown) => void;
};

export type ModelOperation = {
  readonly key: string;
  readonly requestType: TypeRef;
  readonly capability: CapabilityRef;
  readonly producer: ProducerRef;
  readonly returns: TypeRef;
  readonly fragment: ReturnType<typeof sealGraphFragment>;
  readonly validateRequest: (request: unknown) => void;
};

export type ModelModule<Key extends string = string> = {
  readonly module: ModuleRef;
  readonly manifest: ModuleManifest;
  readonly operations: Readonly<Record<Key, ModelOperation>>;
  readonly component: { producers: ProducerPackage; refinements: RefinementPackage } & {
    readonly refinements: readonly TypeRefinement[];
    readonly producers: readonly ProducerFacet[];
  };
};

/**
 * Define only the irreducible Model contract: request Type, exact Capability,
 * result Type and the Producer that turns a complete request into a Need.
 * Request-building Producers and authoring Surfaces remain ordinary code in
 * the Model package and are not classified by Generation.
 */
export function defineModelModule<const Key extends string>(options: {
  readonly module: ModuleRef;
  readonly operations: readonly (Omit<ModelOperationSpec, "key"> & { readonly key: Key })[];
}): ModelModule<Key> {
  assert(options.operations.length > 0, `${options.module.name} declares no model operation`);
  const keys = options.operations.map((item) => item.key);
  assert(new Set(keys).size === keys.length, `${options.module.name} repeats a model operation key`);
  const capabilities = options.operations.map((item) => item.capabilityName);
  assert(new Set(capabilities).size === capabilities.length, `${options.module.name} repeats a model capability`);
  const dependencyModules: ModuleRef[] = [];
  for (const spec of options.operations) {
    const module = spec.returns.module;
    if (!sameModule(module, options.module)
      && !dependencyModules.some((existing) => sameModule(existing, module))) dependencyModules.push(module);
  }

  const operations = Object.fromEntries(options.operations.map((spec): [Key, ModelOperation] => {
    const requestType = { module: options.module, name: spec.requestTypeName };
    const capability = { module: options.module, name: spec.capabilityName };
    const producer = { module: options.module, name: spec.producerName };
    return [spec.key, {
      key: spec.key,
      requestType,
      capability,
      producer,
      returns: spec.returns,
      validateRequest: spec.validateRequest,
      fragment: sealGraphFragment({
        inputs: [{ name: "request", type: requestType }],
        operations: [{
          id: "generate",
          producer,
          inputs: { request: { kind: "fragment-input", name: "request" } },
          result: { kind: "need" as const, name: "generation" },
        }],
        exports: [{
          name: "result",
          type: spec.returns,
          root: { kind: "fragment-operation", operation: "generate" },
        }],
      }),
    }];
  }));

  return {
    module: { ...options.module },
    manifest: {
      format: "hypit.module@1",
      name: options.module.name,
      version: options.module.version,
      dependencies: dependencyModules,
      types: options.operations.map((item) => item.requestTypeName),
      capabilities: options.operations.map((item) => ({
        name: item.capabilityName,
        returns: item.returns,
      })),
      producers: options.operations.map((item) => ({
        name: item.producerName,
        inputs: [{ name: "request", type: { module: options.module, name: item.requestTypeName } }],
        result: { kind: "need" as const, name: "generation", capability: { module: options.module, name: item.capabilityName } },
      })),
    },
    operations: operations as Readonly<Record<Key, ModelOperation>>,
    component: {
      refinements: options.operations.map((spec) => ({
        type: operations[spec.key]!.requestType,
        handler({ value }) {
          spec.validateRequest(inlineRequest(value, spec.key));
        },
      })),
      producers: options.operations.map((spec) => ({
        producer: operations[spec.key]!.producer,
        handler({ inputs }) {
          const request = inputs.request;
          assert(request !== undefined, `${spec.key} request input is missing`);
          const value = inlineRequest(request.value, spec.key);
          spec.validateRequest(value);
          return { kind: "need" as const, constraints: value };
        },
      })),
    },
  };
}

export type ExactModelEndpoint = {
  readonly key: string;
  readonly requestType: TypeRef;
  readonly capability: CapabilityRef;
  readonly producer: ProducerRef;
  readonly returns: TypeRef;
  readonly result: FieldModelResultContract;
  readonly draftType: TypeRef;
  readonly finalizeProducer: ProducerRef;
  readonly mediaBindings: Readonly<Record<string, ExactModelMediaBindingEndpoint>>;
  readonly textBindings: Readonly<Record<string, ExactModelTextBindingEndpoint>>;
  readonly ports: GenerationPortTable;
  readonly validateRequest: (request: unknown) => void;
  readonly validateDraft: (draft: unknown) => void;
  readonly sealRequest: (ports: GenerationRequest["ports"]) => GenerationRequest;
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

export type ExactModelFragmentPublication = {
  /** Publishes the Model's complete result value without interpreting it. */
  readonly result?: string;
  /** Publishes the result selected by the Model's explicit primary Producer. */
  readonly primary?: string;
};

export type ExactModelModule<Key extends string = string> = {
  readonly module: ModuleRef;
  readonly manifest: ModuleManifest;
  /** Keyed by the endpoint keys declared by the module. */
  readonly endpoints: Readonly<Record<Key, ExactModelEndpoint>>;
  readonly component: { producers: ProducerPackage; refinements: RefinementPackage } & {
    readonly refinements: readonly TypeRefinement[];
    readonly producers: readonly ProducerFacet[];
  };
};

export type DefineFieldModelModuleOptions<Key extends string = string> = {
  readonly module: ModuleRef;
  readonly endpoints: readonly (Omit<FieldModelEndpointSpec, "key"> & { readonly key: Key })[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fieldEndpointRefs(module: ModuleRef, spec: FieldModelEndpointSpec) {
  const draftType = { module, name: `${spec.requestTypeName}Draft` };
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
    draftType,
    finalizeProducer,
    mediaBindings,
    textBindings,
  };
}

function pascal(value: string): string {
  return value.replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/gu, (_whole, _boundary, letter: string) => letter.toUpperCase());
}

function inlineRequest(
  value: Value | undefined,
  subject: string,
): Value {
  assert(value !== undefined, `${subject} request is missing`);
  return normalizeValue(value, subject);
}

function inlineValue<T>(
  value: Value | undefined,
  subject: string,
): T {
  assert(value !== undefined, `${subject} is missing`);
  return value as unknown as T;
}

/**
 * Builds the repetitive nominal shell around an exact model request. The model package still owns
 * every field, constraint and model name; this helper only wires Type -> Producer -> Need -> Fragment.
 */
export function defineFieldModelModule<const Key extends string>(
  options: DefineFieldModelModuleOptions<Key>,
): ExactModelModule<Key> {
  assert(options.module.name.trim().length > 0 && options.module.version.trim().length > 0,
    "Exact model module identity is invalid");
  assert(options.endpoints.length > 0, `${options.module.name} declares no exact model endpoint`);
  const keys = options.endpoints.map((item) => item.key);
  assert(new Set(keys).size === keys.length, `${options.module.name} repeats an endpoint key`);
  const models = options.endpoints.map((item) => item.ports.model);
  assert(new Set(models).size === models.length, `${options.module.name} repeats an exact model`);
  const fieldData = options.endpoints.map((spec) => {
    const validateRequest = (request: unknown): void => {
      verifyRequestAgainstPorts(spec.ports, request);
      spec.validateInputs?.(request);
      spec.validateRequest?.(request);
    };
    const validateDraft = (draft: unknown): void => {
      verifyRequestDraftAgainstPorts(spec.ports, draft);
      spec.validateInputs?.(draft);
    };
    return { spec, validateRequest, validateDraft, ...fieldEndpointRefs(options.module, spec) };
  });
  const model = defineModelModule({
    module: options.module,
    operations: fieldData.map((item) => ({
      key: item.spec.key,
      capabilityName: item.spec.ports.model,
      requestTypeName: item.spec.requestTypeName,
      producerName: item.spec.producerName,
      returns: item.spec.result.type,
      validateRequest: item.validateRequest,
    })),
  });
  const endpointData = fieldData.map((item) => ({
    ...item,
    operation: model.operations[item.spec.key],
  }));
  const fieldDependencies = fieldData.flatMap((item) => [
    ...(sameModule(item.spec.result.primary.producer.module, options.module)
      ? [] : [item.spec.result.primary.producer.module]),
    ...(item.spec.ports.ports.some((port) => port.value.kind === "media") ? [blobDependency] : []),
    ...(item.spec.ports.ports.some((port) => port.value.kind === "text") ? [textDependency] : []),
  ]);

  const manifest: ModuleManifest = {
    ...model.manifest,
    dependencies: [...model.manifest.dependencies, ...fieldDependencies]
      .filter((item, index, dependencies) => dependencies.findIndex((candidate) =>
        sameModule(candidate, item)) === index),
    types: [
      ...model.manifest.types,
      ...endpointData.flatMap((item) => [
        item.draftType.name,
        ...Object.values(item.mediaBindings).map((binding) => {
          const port = item.spec.ports.ports.find((candidate): candidate is GenerationMediaPort =>
            candidate.name === binding.port && candidate.value.kind === "media");
          assert(port !== undefined, `${item.spec.key} media binding ${binding.port} has no port`);
          return binding.type.name;
        }),
      ]),
    ],
    producers: [
      ...model.manifest.producers,
      ...endpointData.flatMap((item) => [
        ...Object.values(item.mediaBindings).map((binding) => ({
          name: binding.producer.name,
          inputs: [
            { name: "draft", type: item.draftType },
            { name: "binding", type: binding.type },
            { name: "artifact", type: blobTypes.blob },
          ],
          result: { kind: "output" as const, name: "draft", type: item.draftType },
        })),
        ...Object.values(item.textBindings).map((binding) => ({
          name: binding.producer.name,
          inputs: [
            { name: "draft", type: item.draftType },
            { name: "text", type: textTypes.text },
          ],
          result: { kind: "output" as const, name: "draft", type: item.draftType },
        })),
        {
          name: item.finalizeProducer.name,
          inputs: [{ name: "draft", type: item.draftType }],
          result: { kind: "output" as const, name: "request", type: item.operation.requestType },
        },
      ]),
    ],
  };

  const endpoints = Object.fromEntries(endpointData.map((item): [Key, ExactModelEndpoint] => {
    return [item.spec.key, {
      key: item.spec.key,
      requestType: item.operation.requestType,
      capability: item.operation.capability,
      producer: item.operation.producer,
      returns: item.operation.returns,
      result: item.spec.result,
      draftType: item.draftType,
      finalizeProducer: item.finalizeProducer,
      mediaBindings: item.mediaBindings,
      textBindings: item.textBindings,
      ports: item.spec.ports,
      validateRequest: item.validateRequest,
      validateDraft: item.validateDraft,
      sealRequest(ports) {
        const request = sealGenerationPortRequest(item.spec.ports, ports);
        item.spec.validateInputs?.(request);
        item.spec.validateRequest?.(request);
        return request;
      },
      fragment: item.operation.fragment,
    } satisfies ExactModelEndpoint];
  }));

  return {
    module: model.module,
    manifest,
    endpoints: endpoints as Readonly<Record<Key, ExactModelEndpoint>>,
    component: {
      refinements: [
        ...model.component.refinements,
        ...endpointData.map((item) => ({
          type: item.draftType,
          handler({ value }: Parameters<TypeRefinement["handler"]>[0]) {
            endpoints[item.spec.key]!.validateDraft(inlineRequest(value, `${item.spec.key} draft`));
          },
        })),
      ],
      producers: [
        ...model.component.producers,
        ...endpointData.flatMap((item) => [
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
              assert(isBlobRef(artifact), `${binding.port} artifact must be a Blob`);
              const bound = bindGenerationMedia(item.spec.ports, draft, binding.port, value, artifact);
              endpoints[item.spec.key]!.validateDraft(bound);
              return { kind: "output" as const, value: (canonicalize(bound)) };
            },
          })),
          ...Object.values(item.textBindings).map((binding) => ({
            producer: binding.producer,
            handler: ({ inputs }: ProducerHandlerContext) => {
              const draft = inlineValue<GenerationRequestDraft>(inputs.draft!.value, `${item.spec.key} draft`);
              const text = inlineValue<Text>(inputs.text!.value, `${binding.port} Text`);
              const bound = bindGenerationText(item.spec.ports, draft, binding.port, text);
              endpoints[item.spec.key]!.validateDraft(bound);
              return { kind: "output" as const, value: (canonicalize(bound)) };
            },
          })),
          {
            producer: item.finalizeProducer,
            handler: ({ inputs }: ProducerHandlerContext) => {
              const endpoint = endpoints[item.spec.key]!;
              const draft = inlineValue<GenerationRequestDraft>(inputs.draft!.value, `${item.spec.key} draft`);
              endpoint.validateDraft(draft);
              return { kind: "output" as const, value: (canonicalize(endpoint.sealRequest(draft.ports))) };
            },
          },
        ]),
      ],
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
export function createExactModelGenerationFragment(
  endpoint: ExactModelEndpoint,
  mediaInputs: readonly ExactModelMediaInput[] = [],
  textInputs: readonly ExactModelTextInput[] = [],
  publication: ExactModelFragmentPublication,
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
      result: { kind: "output" as const, name: "draft" },
    });
    draft = operation(id);
  }

  for (const [index, item] of mediaInputs.entries()) {
    const binding = endpoint.mediaBindings[item.port];
    assert(binding !== undefined, `${endpoint.ports.model} has no media port ${item.port}`);
    const inputNames = exactModelMediaInputNames(item.name);
    inputs.push({ name: inputNames.binding, type: binding.type });
    inputs.push({ name: inputNames.artifact, type: blobTypes.blob });
    const id = `bind:${String(index + 1).padStart(4, "0")}:${item.port}`;
    operations.push({
      id,
      producer: binding.producer,
      inputs: {
        draft,
        binding: input(inputNames.binding),
        artifact: input(inputNames.artifact),
      },
      result: { kind: "output" as const, name: "draft" },
    });
    draft = operation(id);
  }

  operations.push({
    id: "finalize-request",
    producer: endpoint.finalizeProducer,
    inputs: { draft },
    result: { kind: "output" as const, name: "request" },
  });
  operations.push({
    id: "generate",
    producer: endpoint.producer,
    inputs: { request: operation("finalize-request") },
    result: { kind: "need" as const, name: "generation" },
  });
  assert(publication.result !== undefined || publication.primary !== undefined,
    `${endpoint.ports.model} Fragment publishes neither its result nor its primary value`);
  assert(publication.result === undefined || publication.result.trim().length > 0,
    `${endpoint.ports.model} result publication name is empty`);
  assert(publication.primary === undefined || publication.primary.trim().length > 0,
    `${endpoint.ports.model} primary publication name is empty`);
  assert(publication.result === undefined || publication.primary === undefined
    || publication.result !== publication.primary,
    `${endpoint.ports.model} result and primary publication names must differ`);
  const exports: Array<{ readonly name: string; readonly type: TypeRef;
    readonly root: ReturnType<typeof operation> }> = [];
  if (publication.result !== undefined) {
    exports.push({ name: publication.result, type: endpoint.returns, root: operation("generate") });
  }
  if (publication.primary !== undefined) {
    const output = endpoint.result.primary.output;
    const selector = `select-primary-${output}`;
    operations.push({
      id: selector,
      producer: endpoint.result.primary.producer,
      inputs: { [endpoint.result.primary.input]: operation("generate") },
      result: { kind: "output" as const, name: output },
    });
    exports.push({ name: publication.primary, type: blobTypes.blob, root: operation(selector) });
  }
  return sealGraphFragment({
    inputs,
    operations,
    exports,
  });
}

/** Authoring convenience for Surfaces that intentionally publish one primary artifact. */
export function createExactModelPrimaryGenerationFragment(
  endpoint: ExactModelEndpoint,
  mediaInputs: readonly ExactModelMediaInput[] = [],
  textInputs: readonly ExactModelTextInput[] = [],
) {
  return createExactModelGenerationFragment(endpoint, mediaInputs, textInputs, {
    primary: endpoint.result.primary.output,
  });
}
