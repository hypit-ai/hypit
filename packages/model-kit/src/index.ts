import type {
  ComponentPackage,
  PlannedNeedFacet,
  PlannedNeedPresentation,
  PlannedNeedSpecification,
  ProducerFacet,
  ProducerHandlerContext,
  TypeValidatorFacet,
} from "@hypit/component-kit";
import { artifactDependency, artifactTypes } from "@hypit/artifact";
import { sealGraphFragment } from "@hypit/elaborator";
import type { HostFacet } from "@hypit/host";
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
  BuildState,
  ModuleManifest,
  ModuleRef,
  ProducerRef,
  TypeRef,
} from "@hypit/protocol";

export type PlannedExactModelMediaReference = {
  readonly port: string;
  readonly role: GenerationMediaBinding["role"];
  readonly fields?: GenerationMediaBinding["fields"];
  readonly record: string;
  readonly sourceStep?: string;
  /** The Blob already exists in this disposable planning view. */
  readonly available: boolean;
};

export type PlannedExactModelRequest = {
  readonly model: string;
  /** Every authored scalar and Text port value, plus media values whose Blobs already exist. */
  readonly ports: GenerationRequestDraft["ports"];
  /** Declared media edges whose files will be produced by an upstream Build step. */
  readonly pendingMedia: readonly PlannedExactModelMediaReference[];
  /** True only when the executable Need already exists and has passed full request validation. */
  readonly complete: boolean;
};

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
    readonly plannedNeeds: readonly PlannedNeedFacet[];
  };
  /** Inert declaration of these exact models for Hosts that address one directly. */
  readonly hostFacet: ExactModelHostFacet;
};

export const exactModelHostAbi = "hypit.exact-model-host@1";

/**
 * What one installed package can generate, named exactly, for a Host that drives a
 * single model without a Build. It carries no Provider choice and no Runtime state;
 * the Host still resolves who fulfils the Capability.
 */
export type ExactModelHostFacet = HostFacet & {
  readonly abi: typeof exactModelHostAbi;
  /** The exact model names this package declares, in declaration order. */
  readonly offers: readonly string[];
  readonly implementation: { readonly endpoints: readonly ExactModelEndpoint[] };
};

function createExactModelHostFacet(endpoints: readonly ExactModelEndpoint[]): ExactModelHostFacet {
  assert(endpoints.length > 0, "an exact model Host facet declares no endpoint");
  return {
    abi: exactModelHostAbi,
    offers: endpoints.map((item) => item.ports.model),
    implementation: { endpoints },
  };
}

/** Read every exact model declared by one selected package's Host facets. */
export function exactModelsFromHostFacets(
  facets: readonly HostFacet[],
): readonly ExactModelEndpoint[] {
  const found: ExactModelEndpoint[] = [];
  for (const facet of facets) {
    if (facet.abi !== exactModelHostAbi) continue;
    const implementation = facet.implementation as { readonly endpoints?: unknown } | null;
    const declared = implementation === null ? undefined : implementation.endpoints;
    assert(Array.isArray(declared), `${exactModelHostAbi} facet has an invalid implementation`);
    for (const item of declared as readonly unknown[]) {
      const endpoint = item as ExactModelEndpoint | null;
      assert(endpoint !== null && typeof endpoint === "object"
        && typeof endpoint.key === "string" && typeof endpoint.ports?.model === "string",
        `${exactModelHostAbi} facet declares an invalid exact model`);
      found.push(endpoint);
    }
  }
  return found;
}

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

function sameReference(
  left: { readonly module: ModuleRef; readonly name: string },
  right: { readonly module: ModuleRef; readonly name: string },
): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
}

/**
 * Read one exact-model request from its declared assembly graph.
 *
 * This follows only the exact producers published by the model Host facet. It never searches for
 * object shapes or guesses which upstream record "looks like" a request. Missing media stays a
 * symbolic graph edge; scalar parameters and authored Text remain available before the file exists.
 */
export function plannedExactModelRequest(
  state: BuildState,
  stepId: string,
  needPort: string,
  endpoint: ExactModelEndpoint,
): PlannedExactModelRequest | undefined {
  const generationStep = state.plan.steps.find((step) => step.id === stepId);
  if (generationStep === undefined || !sameReference(generationStep.producer, endpoint.producer)) return undefined;
  const binding = generationStep.needs[needPort];
  if (binding === undefined) return undefined;

  const knownNeed = state.needs.find((need) => need.id === binding.id);
  if (knownNeed !== undefined) {
    verifyRequestAgainstPorts(endpoint.ports, knownNeed.constraints);
    return {
      model: endpoint.ports.model,
      ports: structuredClone((knownNeed.constraints as unknown as GenerationRequestDraft).ports),
      pendingMedia: [],
      complete: true,
    };
  }

  const records = new Map(state.records.map((record) => [record.id, record]));
  const producedBy = new Map(state.plan.steps.flatMap((step) =>
    Object.values(step.outputs).map((record) => [record, step] as const)));
  const requestRecord = generationStep.inputs.request;
  if (requestRecord === undefined) return undefined;
  const finalize = producedBy.get(requestRecord);
  if (finalize === undefined || !sameReference(finalize.producer, endpoint.finalizeProducer)) return undefined;
  const finalDraft = finalize.inputs.draft;
  if (finalDraft === undefined) return undefined;

  const pendingMedia: PlannedExactModelMediaReference[] = [];
  const visiting = new Set<string>();
  const rebuildDraft = (recordId: string): GenerationRequestDraft => {
    if (visiting.has(recordId)) throw new Error(`${endpoint.ports.model} request assembly contains a cycle at ${recordId}`);
    visiting.add(recordId);
    try {
      const record = records.get(recordId);
      if (record !== undefined) {
        const draft = inlineValue<GenerationRequestDraft>(record.value, `${endpoint.ports.model} request draft`);
        verifyRequestDraftAgainstPorts(endpoint.ports, draft);
        return draft;
      }
      const step = producedBy.get(recordId);
      if (step === undefined) throw new Error(`${endpoint.ports.model} request draft ${recordId} has no source`);
      const previousId = step.inputs.draft;
      if (previousId === undefined) throw new Error(`${step.id} does not declare its request draft input`);
      let draft = rebuildDraft(previousId);

      const textBinding = Object.values(endpoint.textBindings)
        .find((candidate) => sameReference(step.producer, candidate.producer));
      if (textBinding !== undefined) {
        const textId = step.inputs.text;
        const text = textId === undefined ? undefined : records.get(textId);
        if (text === undefined) throw new Error(`${step.id} has no authored Text input`);
        return bindGenerationText(
          endpoint.ports,
          draft,
          textBinding.port,
          inlineValue<Text>(text.value, `${step.id} Text`),
        );
      }

      const mediaBinding = Object.values(endpoint.mediaBindings)
        .find((candidate) => sameReference(step.producer, candidate.producer));
      if (mediaBinding === undefined) {
        throw new Error(`${step.id} is not part of ${endpoint.ports.model}'s declared request assembly`);
      }
      const bindingId = step.inputs.binding;
      const artifactId = step.inputs.artifact;
      const authoredBinding = bindingId === undefined ? undefined : records.get(bindingId);
      if (authoredBinding === undefined || artifactId === undefined) {
        throw new Error(`${step.id} is missing its authored media binding`);
      }
      const value = inlineValue<GenerationMediaBinding>(authoredBinding.value, `${step.id} media binding`);
      const port = endpoint.ports.ports.find((candidate): candidate is GenerationMediaPort =>
        candidate.name === mediaBinding.port && candidate.value.kind === "media");
      if (port === undefined) throw new Error(`${step.id} names undeclared media port ${mediaBinding.port}`);
      verifyGenerationMediaBinding(port, value);
      const artifact = records.get(artifactId);
      if (artifact?.value.kind === "blob") {
        draft = bindGenerationMedia(endpoint.ports, draft, mediaBinding.port, value, artifact.value);
      } else {
        pendingMedia.push({
          port: mediaBinding.port,
          role: value.role,
          ...(value.fields === undefined ? {} : { fields: structuredClone(value.fields) }),
          record: artifactId,
          ...(producedBy.get(artifactId) === undefined ? {} : { sourceStep: producedBy.get(artifactId)!.id }),
          available: false,
        });
      }
      return draft;
    } finally {
      visiting.delete(recordId);
    }
  };

  const draft = rebuildDraft(finalDraft);
  return {
    model: endpoint.ports.model,
    ports: structuredClone(draft.ports),
    pendingMedia,
    complete: false,
  };
}

function exactModelSpecification(planned: PlannedExactModelRequest): PlannedNeedSpecification {
  const ports = structuredClone(planned.ports) as Record<string, CanonicalValue[]>;
  for (const resource of planned.pendingMedia) {
    const items = ports[resource.port] ?? [];
    items.push(canonicalize({
      role: resource.role,
      slot: resource.record,
      ...(resource.fields === undefined ? {} : { fields: resource.fields }),
    }));
    ports[resource.port] = items;
  }
  return {
    constraints: canonicalize({ ports }),
    pendingInputs: planned.pendingMedia.map((resource) => ({
      input: resource.port,
      record: resource.record,
      ...(resource.sourceStep === undefined ? {} : { sourceStep: resource.sourceStep }),
      role: resource.role,
    })),
  };
}

function exactModelPresentation(
  endpoint: ExactModelEndpoint,
  specification: PlannedNeedSpecification,
): PlannedNeedPresentation {
  const request = specification.constraints as { readonly ports?: Readonly<Record<string, readonly CanonicalValue[]>> };
  const fields: Record<string, readonly CanonicalValue[]> = {};
  const references: Record<string, number> = {};
  for (const port of endpoint.ports.ports) {
    const values = request.ports?.[port.name] ?? [];
    if (port.value.kind !== "media") {
      if (values.length > 0) fields[port.name] = structuredClone(values);
      continue;
    }
    for (const value of values) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
      const role = (value as { readonly role?: unknown }).role;
      if (typeof role === "string") references[role] = (references[role] ?? 0) + 1;
    }
  }
  return { fields, references };
}

function exactModelPlannedNeedFacet(endpoint: ExactModelEndpoint): PlannedNeedFacet {
  return {
    producer: endpoint.producer,
    port: "generation",
    capability: endpoint.capability,
    plan({ state, step, port }) {
      const planned = plannedExactModelRequest(state, step, port, endpoint);
      return planned === undefined ? undefined : exactModelSpecification(planned);
    },
    present: (specification) => exactModelPresentation(endpoint, specification),
  };
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
    hostFacet: createExactModelHostFacet(Object.values(endpoints) as readonly ExactModelEndpoint[]),
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
      plannedNeeds: Object.values(endpoints).map((endpoint) => exactModelPlannedNeedFacet(endpoint)),
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
