import type {
  BuildState,
  CanonicalValue,
  CapabilityRef,
  InvokeProducerCommand,
  ProducerRef,
  StoredValue,
  TypeRef,
  TypedRecord,
} from "@hypit/protocol";

export type Awaitable<T> = T | Promise<T>;

export type TypeValidatorContext = {
  readonly type: TypeRef;
  readonly value: StoredValue;
};

export type TypeValidatorHandler = (
  context: TypeValidatorContext,
) => void | Promise<void>;

/** Minimal structural port implemented by a validation Host. */
export interface TypeValidatorRegistrar {
  register(
    type: TypeRef,
    handler: TypeValidatorHandler,
  ): void;
}

export type ProducerHandlerResult = {
  readonly outputs: Readonly<Record<string, StoredValue>>;
  readonly needs: Readonly<Record<string, CanonicalValue>>;
};

/**
 * Pure compute context. Artifact bytes, credentials, network and stores are deliberately absent;
 * those effects must cross an explicit Need into a Provider.
 */
export type ProducerHandlerContext = {
  readonly command: InvokeProducerCommand;
  readonly producer: ProducerRef;
  readonly inputs: Readonly<Record<string, TypedRecord>>;
};

export type ProducerHandler = (
  context: ProducerHandlerContext,
) => Awaitable<ProducerHandlerResult>;

/** Minimal structural port implemented by a Producer registry. */
export interface ProducerRegistrar {
  registerProducer(
    producer: ProducerRef,
    handler: ProducerHandler,
  ): void;
}

/** Enumerable deterministic Producer handler owned by its package. */
export type ProducerFacet = {
  readonly producer: ProducerRef;
  readonly handler: ProducerHandler;
};

/** One input whose value will exist only after an upstream Build step has run. */
export type PlannedNeedInput = {
  readonly input: string;
  readonly record: string;
  readonly sourceStep?: string;
  /** Capability-owned semantic role when the value represents media, such as image or audio. */
  readonly role?: string;
};

/**
 * The complete support-relevant request known before external work starts. Values produced later
 * are represented by input slots; their eventual StoredValues are execution bindings, not missing
 * author intent. A slot may be a Resource or a structured value.
 */
export type PlannedNeedSpecification = {
  readonly constraints: CanonicalValue;
  readonly pendingInputs: readonly PlannedNeedInput[];
};

/** Package-owned, presentation-neutral reading of one request. */
export type PlannedNeedPresentation = {
  readonly fields: Readonly<Record<string, readonly CanonicalValue[]>>;
  readonly references: Readonly<Record<string, number>>;
};

export type PlannedNeedFacet = {
  readonly producer: ProducerRef;
  readonly port: string;
  readonly capability: CapabilityRef;
  plan(input: {
    readonly state: BuildState;
    readonly step: string;
    readonly port: string;
  }): PlannedNeedSpecification | undefined;
  present?(specification: PlannedNeedSpecification): PlannedNeedPresentation;
};

/** Missing direct inputs of one planned Need, preserved as graph edges rather than guessed values. */
export function plannedNeedInputs(
  state: BuildState,
  stepId: string,
  roles: Readonly<Record<string, string>> = {},
): readonly PlannedNeedInput[] {
  const step = state.plan.steps.find((item) => item.id === stepId);
  if (step === undefined) return [];
  const available = new Set(state.records.map((record) => record.id));
  const producedBy = new Map(state.plan.steps.flatMap((item) =>
    Object.values(item.outputs).map((record) => [record, item.id] as const)));
  return Object.entries(step.inputs).flatMap(([input, record]) => {
    if (available.has(record)) return [];
    const sourceStep = producedBy.get(record);
    const role = roles[input];
    return [{
      input,
      record,
      ...(sourceStep === undefined ? {} : { sourceStep }),
      ...(role === undefined ? {} : { role }),
    }];
  });
}

export function registerProducerFacets(
  registry: ProducerRegistrar,
  facets: readonly ProducerFacet[],
): void {
  for (const facet of facets) {
    registry.registerProducer(facet.producer, facet.handler);
  }
}

/** Package-owned semantic validator. */
export type TypeValidatorFacet = {
  readonly type: TypeRef;
  readonly handler: TypeValidatorHandler;
};

export function registerTypeValidatorFacets(
  registry: TypeValidatorRegistrar,
  facets: readonly TypeValidatorFacet[],
): void {
  for (const facet of facets) {
    registry.register(facet.type, facet.handler);
  }
}

/** Trusted deterministic implementation package; it selects no Provider or Runtime infrastructure. */
export type ComponentPackage = {
  readonly producers?: readonly ProducerFacet[];
  readonly validators?: readonly TypeValidatorFacet[];
  /** Planning knowledge owned by the package that declares the external request. */
  readonly plannedNeeds?: readonly PlannedNeedFacet[];
};
