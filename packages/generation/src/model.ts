import type { RefinementPackage, TypeRefinement } from "@hypit/hypit/refinement";
import type {
  ProducerPackage,
  ProducerFacet,
  ProducerHandlerContext,
} from "@hypit/hypit/producer";
import { blobDependency, blobTypes } from "@hypit/hypit/blob";
import { sealGraphFragment } from "@hypit/hypit/author";
import {
  bindModelArtifact,
  bindModelText,
  sealModelFieldRequest,
  verifyModelArtifactBinding,
  verifyModelFieldBuilder,
  verifyModelFieldRequest,
} from "./request.js";
import type {
  ModelArtifactBinding,
  ModelFieldBuilder,
  ModelFieldRequest,
} from "./request.js";
import type {
  ModelArtifactField,
  ModelFieldTable,
} from "./fields.js";
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
 * One exact model operation. The Model declares which input fields it accepts;
 * its request Schema and semantic validator are derived from that declaration,
 * so the Capability name, accepted media roles and field cardinalities
 * have exactly one source of truth.
 */
export type FieldModelOperationSpec = {
  readonly key: string;
  readonly requestTypeName: string;
  readonly producerName: string;
  readonly fields: ModelFieldTable;
  /** The model-owned result contract. Standard generated-media products are optional conveniences. */
  readonly result: FieldModelResultContract;
  /** Additional complete-request rules, after field and supplied-input validation. */
  readonly validateRequest?: (request: ModelFieldRequest) => void;
  /** Pure, synchronous checks of supplied values, in drafts and complete requests; throw to reject. */
  readonly validateInputs?: (inputs: ModelFieldBuilder) => void;
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
 * Request-building Producers and author declarations remain ordinary code in
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

export type FieldModelOperation = {
  readonly key: string;
  readonly requestType: TypeRef;
  readonly capability: CapabilityRef;
  readonly producer: ProducerRef;
  readonly returns: TypeRef;
  readonly result: FieldModelResultContract;
  readonly draftType: TypeRef;
  readonly finalizeProducer: ProducerRef;
  readonly mediaBindings: Readonly<Record<string, ModelArtifactBindingOperation>>;
  readonly textBindings: Readonly<Record<string, ModelTextBindingOperation>>;
  readonly fields: ModelFieldTable;
  readonly validateRequest: (request: unknown) => void;
  readonly validateDraft: (draft: unknown) => void;
  readonly sealRequest: (fields: ModelFieldRequest["fields"]) => ModelFieldRequest;
  readonly fragment: ReturnType<typeof sealGraphFragment>;
};

export type ModelArtifactBindingOperation = {
  readonly field: string;
  readonly type: TypeRef;
  readonly producer: ProducerRef;
};

export type ModelTextBindingOperation = {
  readonly field: string;
  readonly producer: ProducerRef;
};

export type ModelArtifactInput = {
  /** Stable local input name inside this Fragment shape. */
  readonly name: string;
  /** Exact Model field receiving the artifact. */
  readonly field: string;
};

export type ModelTextInput = {
  /** Stable local input name inside this Fragment shape. */
  readonly name: string;
  /** Exact Model field receiving the Text value. */
  readonly field: string;
};

export type FieldModelFragmentExports = {
  /** Exposes the Model's complete result value without interpreting it. */
  readonly result?: string;
  /** Exposes the result selected by the Model's explicit primary Producer. */
  readonly primary?: string;
};

export type FieldModelModule<Key extends string = string> = {
  readonly module: ModuleRef;
  readonly manifest: ModuleManifest;
  /** Keyed by the endpoint keys declared by the module. */
  readonly endpoints: Readonly<Record<Key, FieldModelOperation>>;
  readonly component: { producers: ProducerPackage; refinements: RefinementPackage } & {
    readonly refinements: readonly TypeRefinement[];
    readonly producers: readonly ProducerFacet[];
  };
};

export type DefineFieldModelModuleOptions<Key extends string = string> = {
  readonly module: ModuleRef;
  readonly endpoints: readonly (Omit<FieldModelOperationSpec, "key"> & { readonly key: Key })[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fieldEndpointRefs(module: ModuleRef, spec: FieldModelOperationSpec) {
  const draftType = { module, name: `${spec.requestTypeName}Draft` };
  const finalizeProducer = { module, name: `finalize-${spec.producerName}` };
  const mediaBindings = Object.fromEntries(spec.fields.fields
    .filter((field): field is ModelArtifactField => field.value.kind === "media")
    .map((field) => [field.name, {
      field: field.name,
      type: { module, name: `${spec.requestTypeName}${pascal(field.name)}Binding` },
      producer: { module, name: `bind-${spec.producerName}-${field.name}` },
    } satisfies ModelArtifactBindingOperation]));
  const textBindings = Object.fromEntries(spec.fields.fields
    .filter((field) => field.value.kind === "text")
    .map((field) => [field.name, {
      field: field.name,
      producer: { module, name: `bind-${spec.producerName}-${field.name}-text` },
    } satisfies ModelTextBindingOperation]));
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
): FieldModelModule<Key> {
  assert(options.module.name.trim().length > 0 && options.module.version.trim().length > 0,
    "Exact model module identity is invalid");
  assert(options.endpoints.length > 0, `${options.module.name} declares no exact model endpoint`);
  const keys = options.endpoints.map((item) => item.key);
  assert(new Set(keys).size === keys.length, `${options.module.name} repeats an endpoint key`);
  const models = options.endpoints.map((item) => item.fields.model);
  assert(new Set(models).size === models.length, `${options.module.name} repeats an exact model`);
  const fieldData = options.endpoints.map((spec) => {
    const validateRequest = (request: unknown): void => {
      verifyModelFieldRequest(spec.fields, request);
      spec.validateInputs?.(request);
      spec.validateRequest?.(request);
    };
    const validateDraft = (draft: unknown): void => {
      verifyModelFieldBuilder(spec.fields, draft);
      spec.validateInputs?.(draft);
    };
    return { spec, validateRequest, validateDraft, ...fieldEndpointRefs(options.module, spec) };
  });
  const model = defineModelModule({
    module: options.module,
    operations: fieldData.map((item) => ({
      key: item.spec.key,
      capabilityName: item.spec.fields.model,
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
    ...(item.spec.fields.fields.some((field) => field.value.kind === "media") ? [blobDependency] : []),
    ...(item.spec.fields.fields.some((field) => field.value.kind === "text") ? [textDependency] : []),
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
          const field = item.spec.fields.fields.find((candidate): candidate is ModelArtifactField =>
            candidate.name === binding.field && candidate.value.kind === "media");
          assert(field !== undefined, `${item.spec.key} artifact binding ${binding.field} has no field`);
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

  const endpoints = Object.fromEntries(endpointData.map((item): [Key, FieldModelOperation] => {
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
      fields: item.spec.fields,
      validateRequest: item.validateRequest,
      validateDraft: item.validateDraft,
      sealRequest(fields) {
        const request = sealModelFieldRequest(item.spec.fields, fields);
        item.spec.validateInputs?.(request);
        item.spec.validateRequest?.(request);
        return request;
      },
      fragment: item.operation.fragment,
    } satisfies FieldModelOperation];
  }));

  return {
    module: model.module,
    manifest,
    endpoints: endpoints as Readonly<Record<Key, FieldModelOperation>>,
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
              const draft = inlineValue<ModelFieldBuilder>(inputs.draft!.value, `${item.spec.key} draft`);
              const value = inlineValue<ModelArtifactBinding>(inputs.binding!.value, `${binding.field} binding`);
              const field = item.spec.fields.fields.find((candidate): candidate is ModelArtifactField =>
                candidate.name === binding.field && candidate.value.kind === "media");
              assert(field !== undefined, `${item.spec.key} artifact binding ${binding.field} has no field`);
              verifyModelArtifactBinding(field, value);
              const artifact = inputs.artifact!.value;
              assert(isBlobRef(artifact), `${binding.field} artifact must be a Blob`);
              const bound = bindModelArtifact(item.spec.fields, draft, binding.field, value, artifact);
              endpoints[item.spec.key]!.validateDraft(bound);
              return { kind: "output" as const, value: (canonicalize(bound)) };
            },
          })),
          ...Object.values(item.textBindings).map((binding) => ({
            producer: binding.producer,
            handler: ({ inputs }: ProducerHandlerContext) => {
              const draft = inlineValue<ModelFieldBuilder>(inputs.draft!.value, `${item.spec.key} draft`);
              const text = inlineValue<Text>(inputs.text!.value, `${binding.field} Text`);
              const bound = bindModelText(item.spec.fields, draft, binding.field, text);
              endpoints[item.spec.key]!.validateDraft(bound);
              return { kind: "output" as const, value: (canonicalize(bound)) };
            },
          })),
          {
            producer: item.finalizeProducer,
            handler: ({ inputs }: ProducerHandlerContext) => {
              const endpoint = endpoints[item.spec.key]!;
              const draft = inlineValue<ModelFieldBuilder>(inputs.draft!.value, `${item.spec.key} draft`);
              endpoint.validateDraft(draft);
              return { kind: "output" as const, value: (canonicalize(endpoint.sealRequest(draft.fields))) };
            },
          },
        ]),
      ],
    },
  };
}

export function modelArtifactInputNames(name: string): {
  readonly artifact: string;
  readonly binding: string;
} {
  assert(name.trim().length > 0, "Model artifact input name is empty");
  return { artifact: `${name}:artifact`, binding: `${name}:binding` };
}

export function modelTextInputName(name: string): string {
  assert(name.trim().length > 0, "Model Text input name is empty");
  return `${name}:text`;
}

/**
 * Expand one exact-model invocation into a deterministic request-assembly
 * graph. Every runtime-produced media artifact remains a real Fragment input;
 * the fold only constructs the Provider-facing request after those inputs are
 * available.
 */
export function createFieldModelGenerationFragment(
  endpoint: FieldModelOperation,
  mediaInputs: readonly ModelArtifactInput[] = [],
  textInputs: readonly ModelTextInput[] = [],
  outputNames: FieldModelFragmentExports,
) {
  const names = [...mediaInputs, ...textInputs].map((item) => item.name);
  assert(new Set(names).size === names.length, "Model input names must be unique");
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
    const binding = endpoint.textBindings[item.field];
    assert(binding !== undefined, `${endpoint.fields.model} has no text field ${item.field}`);
    const inputName = modelTextInputName(item.name);
    inputs.push({ name: inputName, type: textTypes.text });
    const id = `bind-text:${String(index + 1).padStart(4, "0")}:${item.field}`;
    operations.push({
      id,
      producer: binding.producer,
      inputs: { draft, text: input(inputName) },
      result: { kind: "output" as const, name: "draft" },
    });
    draft = operation(id);
  }

  for (const [index, item] of mediaInputs.entries()) {
    const binding = endpoint.mediaBindings[item.field];
    assert(binding !== undefined, `${endpoint.fields.model} has no artifact field ${item.field}`);
    const inputNames = modelArtifactInputNames(item.name);
    inputs.push({ name: inputNames.binding, type: binding.type });
    inputs.push({ name: inputNames.artifact, type: blobTypes.blob });
    const id = `bind:${String(index + 1).padStart(4, "0")}:${item.field}`;
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
  assert(outputNames.result !== undefined || outputNames.primary !== undefined,
    `${endpoint.fields.model} Fragment exposes neither its result nor its primary value`);
  assert(outputNames.result === undefined || outputNames.result.trim().length > 0,
    `${endpoint.fields.model} result output name is empty`);
  assert(outputNames.primary === undefined || outputNames.primary.trim().length > 0,
    `${endpoint.fields.model} primary output name is empty`);
  assert(outputNames.result === undefined || outputNames.primary === undefined
    || outputNames.result !== outputNames.primary,
    `${endpoint.fields.model} result and primary output names must differ`);
  const exports: Array<{ readonly name: string; readonly type: TypeRef;
    readonly root: ReturnType<typeof operation> }> = [];
  if (outputNames.result !== undefined) {
    exports.push({ name: outputNames.result, type: endpoint.returns, root: operation("generate") });
  }
  if (outputNames.primary !== undefined) {
    const output = endpoint.result.primary.output;
    const selector = `select-primary-${output}`;
    operations.push({
      id: selector,
      producer: endpoint.result.primary.producer,
      inputs: { [endpoint.result.primary.input]: operation("generate") },
      result: { kind: "output" as const, name: output },
    });
    exports.push({ name: outputNames.primary, type: blobTypes.blob, root: operation(selector) });
  }
  return sealGraphFragment({
    inputs,
    operations,
    exports,
  });
}

/** Authoring convenience for declarations that intentionally publish one primary artifact. */
export function createFieldModelPrimaryFragment(
  endpoint: FieldModelOperation,
  mediaInputs: readonly ModelArtifactInput[] = [],
  textInputs: readonly ModelTextInput[] = [],
) {
  return createFieldModelGenerationFragment(endpoint, mediaInputs, textInputs, {
    primary: endpoint.result.primary.output,
  });
}
