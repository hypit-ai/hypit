import { stat } from "node:fs/promises";

import type { CapabilityInvocationRequest, EndpointCredential, EndpointInstance } from "@hypit/endpoint";
import { endpointOffers, verifyEndpointPricingDocument } from "@hypit/endpoint";
import type {
  CredentialStore,
  CredentialValue,
  ExecutionDiagnostic,
  OperationProgress,
  ExecutionEnvironmentEndpointObservation,
  ExecutionEnvironmentEndpointPricingObservation,
  ExecutionEnvironmentEndpointQuery,
} from "@hypit/execution-environment";
import { writableCredentialStore } from "@hypit/execution-environment";
import { capabilityKey } from "@hypit/module";
import type { Value } from "@hypit/protocol";
import type { CapabilityRef } from "@hypit/module";
import type { ResourceStore } from "@hypit/resource-store";

import { createLocalEnvironmentCredentialControl } from "./credentials.js";
import type { LocalEnvironmentCredentialControl } from "./credentials-control.js";
import {
  LocalExecutionEnvironmentDeployment,
  openLocalExecutionEnvironmentProfile,
} from "./deployment.js";
import type {
  ActivatedLocalExecutionEnvironmentEndpoint,
  LocalExecutionEnvironmentDeploymentOptions,
  OpenedLocalExecutionEnvironmentCredentialStores,
} from "./deployment.js";
import type {
  ExecutionEnvironmentDoctorDiagnostic,
  ExecutionEnvironmentEndpointActivation,
  ManagedProgram,
  ManagedProgramState,
} from "./extension.js";
import type { LocalExecutionEnvironmentAdapterSelection } from "./profile.js";

export type LocalExecutionEnvironmentHostOptions = LocalExecutionEnvironmentDeploymentOptions;

export type LocalExecutionEnvironmentHostScope = {
  readonly capabilities?: readonly CapabilityRef[];
  readonly endpoints?: readonly string[];
};

export type LocalExecutionEnvironmentDoctorResult = {
  readonly dataRoot: string;
  readonly diagnostics: readonly ExecutionEnvironmentDoctorDiagnostic[];
};

export type LocalExecutionEnvironmentInvocationObservation = {
  readonly reportProgress?: (progress: OperationProgress) => Promise<void>;
  readonly reportDiagnostic?: (diagnostic: ExecutionDiagnostic) => Promise<void>;
};

export type LocalExecutionEnvironmentDeclaredProgram = {
  readonly instance: string;
  readonly program: ManagedProgram;
};

export type LocalExecutionEnvironmentInspection = {
  readonly dataRoot: string;
  /** Exact deployment snapshot used by Generation assembly in the same command. */
  readonly deployment: LocalExecutionEnvironmentDeployment;
  readonly activations: readonly ActivatedLocalExecutionEnvironmentEndpoint[];
  endpoints(): Promise<readonly ExecutionEnvironmentEndpointObservation[]>;
  pricing(): Promise<readonly ExecutionEnvironmentEndpointPricingObservation[]>;
  preflight(): Promise<LocalExecutionEnvironmentDoctorResult>;
  close(): void | Promise<void>;
};

export type LocalExecutionEnvironmentHost = {
  readonly profile: string;
  readonly dataRoot: string;
  openInspection(queries: readonly ExecutionEnvironmentEndpointQuery[]): Promise<LocalExecutionEnvironmentInspection>;
  endpoints(queries: readonly ExecutionEnvironmentEndpointQuery[]): Promise<readonly ExecutionEnvironmentEndpointObservation[]>;
  pricing(queries: readonly ExecutionEnvironmentEndpointQuery[]): Promise<readonly ExecutionEnvironmentEndpointPricingObservation[]>;
  preflight(scope?: LocalExecutionEnvironmentHostScope): Promise<LocalExecutionEnvironmentDoctorResult>;
  doctor(scope?: LocalExecutionEnvironmentHostScope): Promise<LocalExecutionEnvironmentDoctorResult>;
  openCredentials(endpoint: string): Promise<LocalEnvironmentCredentialControl>;
  invoke(
    request: CapabilityInvocationRequest,
    resources: ResourceStore,
    observation?: LocalExecutionEnvironmentInvocationObservation,
  ): Promise<Value>;
  declaredPrograms(scope?: LocalExecutionEnvironmentHostScope): Promise<readonly LocalExecutionEnvironmentDeclaredProgram[]>;
};

type InspectionSnapshot = {
  readonly profile: string;
  readonly deployment: LocalExecutionEnvironmentDeployment;
  readonly activations: readonly ActivatedLocalExecutionEnvironmentEndpoint[];
  readonly endpoints: Awaited<ReturnType<LocalExecutionEnvironmentDeployment["createEndpointRegistry"]>>;
};

type InspectionSelection = {
  readonly query: ExecutionEnvironmentEndpointQuery;
  readonly observation: ExecutionEnvironmentEndpointObservation;
  readonly activation?: ActivatedLocalExecutionEnvironmentEndpoint;
};

function diagnostic(error: unknown, code: string, subject?: string): ExecutionEnvironmentDoctorDiagnostic {
  return {
    severity: "error",
    code,
    message: error instanceof Error ? error.message : String(error),
    ...(subject === undefined ? {} : { subject }),
  };
}

async function resolveEndpointCredentials(
  endpoint: EndpointInstance,
  store: CredentialStore,
  profile: string,
): Promise<Readonly<Record<string, EndpointCredential>>> {
  const credentials: Record<string, EndpointCredential> = {};
  for (const slot of endpoint.credentials) {
    const value = await store.resolve(slot.ref);
    if (value === undefined) {
      throw new Error(`${slot.label} for Endpoint ${slot.endpoint} is not configured in Environment ${profile}`);
    }
    const writable = await writableCredentialStore(store, slot.ref);
    Object.defineProperty(credentials, slot.slot, {
      value: {
        ...value,
        ...(writable === undefined ? {} : {
          replace: async (replacement: CredentialValue) => await writable.put(slot.ref, replacement),
        }),
      },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return credentials;
}

function resolveSelections(
  snapshot: InspectionSnapshot,
  queries: readonly ExecutionEnvironmentEndpointQuery[],
): readonly InspectionSelection[] {
  const { deployment, activations, endpoints } = snapshot;
  return queries.map((query): InspectionSelection => {
    const base = { need: query.need, capability: structuredClone(query.capability) };
    const binding = deployment.document.bindings[capabilityKey(query.capability)];
    const bound = binding === undefined ? {} : { binding };
    const selection = endpoints.select(query);
    if (selection.status === "missing") {
      return { query, observation: { ...base, status: "unresolved", support: "not-evaluated", ...bound } };
    }
    if (selection.status === "ambiguous") {
      return {
        query,
        observation: {
          ...base,
          status: "ambiguous",
          support: "not-evaluated",
          endpoints: selection.endpointIds,
          ...bound,
        },
      };
    }
    const match = activations.find(({ activation }) => activation.endpoint.instance.id === selection.registration.id);
    const pricing = match?.activation.endpoint.pricing;
    const support = query.kind === "concrete"
      ? endpoints.checkSupport(selection.registration, query)
      : { status: "not-evaluated" as const };
    const selected = {
      ...base,
      status: "resolved" as const,
      endpoint: selection.registration.id,
      ...(match === undefined ? {} : { use: match.entry.use }),
      ...(pricing === undefined ? {} : { pricing: structuredClone(pricing) }),
      ...bound,
    };
    const observation: ExecutionEnvironmentEndpointObservation = support.status === "unsupported" ? {
      ...selected,
      support: "unsupported",
      rejections: [{ endpoint: selection.registration.id, message: support.reason }],
    } : { ...selected, support: support.status };
    return { query, observation, ...(match === undefined ? {} : { activation: match }) };
  });
}

async function readPricing(
  snapshot: InspectionSnapshot,
  selections: readonly InspectionSelection[],
  stores: Map<string, OpenedLocalExecutionEnvironmentCredentialStores>,
): Promise<readonly ExecutionEnvironmentEndpointPricingObservation[]> {
  const openedStores = async (endpoint: EndpointInstance) => {
    let opened = stores.get(endpoint.instance.id);
    if (opened === undefined) {
      opened = await snapshot.deployment.credentialsFor([endpoint]).openCredentialStores();
      stores.set(endpoint.instance.id, opened);
    }
    return opened;
  };
  const result: ExecutionEnvironmentEndpointPricingObservation[] = [];
  for (const selection of selections) {
    const request = selection.query;
    const selected: ExecutionEnvironmentEndpointPricingObservation = selection.observation;
    const endpoint = selection.activation?.activation.endpoint;
    if (request.kind !== "concrete" || selected.support === "unsupported"
      || selected.status !== "resolved" || selected.pricing?.kind === "local"
      || endpoint?.readPricing === undefined) {
      result.push(selected);
      continue;
    }
    try {
      const pricingDocuments = await endpoint.readPricing({
        request: {
          capability: request.capability,
          returns: request.returns,
          constraints: request.constraints,
        },
        credentials: async () => {
          const opened = await openedStores(endpoint);
          return await resolveEndpointCredentials(endpoint, opened.store, snapshot.profile);
        },
      });
      pricingDocuments.forEach(verifyEndpointPricingDocument);
      result.push({
        ...selected,
        ...(pricingDocuments.length === 0 ? {} : { pricingDocuments: structuredClone(pricingDocuments) }),
      });
    } catch (error) {
      result.push({ ...selected, pricingError: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

async function inspectDeployment(
  profile: string,
  deployment: LocalExecutionEnvironmentDeployment,
  options: LocalExecutionEnvironmentHostScope & { readonly active: boolean },
  prepared?: readonly ActivatedLocalExecutionEnvironmentEndpoint[],
): Promise<LocalExecutionEnvironmentDoctorResult> {
  const environment = deployment.scope(options);
  const scoped = options.endpoints !== undefined || options.capabilities !== undefined;
  const diagnostics: ExecutionEnvironmentDoctorDiagnostic[] = [];
  try {
    if (!(await stat(environment.dataRoot)).isDirectory()) {
      throw new Error(`Environment data root ${environment.dataRoot} is not a directory`);
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      return {
        dataRoot: environment.dataRoot,
        diagnostics: [diagnostic(error, "ENVIRONMENT_DATA_ROOT_INVALID", environment.dataRoot)],
      };
    }
  }
  if (prepared === undefined) {
    try {
      await environment.installAdapters({ endpoints: true });
    } catch (error) {
      return { dataRoot: environment.dataRoot, diagnostics: [diagnostic(error, "ENVIRONMENT_PACKAGE_SELECTION_INVALID")] };
    }
  }
  const requested = options.capabilities === undefined
    ? undefined
    : new Set(options.capabilities.map(capabilityKey));
  const covered = new Set<string>();
  const activated: Array<{
    readonly item: LocalExecutionEnvironmentAdapterSelection;
    readonly activation: ExecutionEnvironmentEndpointActivation;
  }> = [];
  const selectedEndpoints: typeof activated = [];
  const preparedActivations = new Map(prepared?.map((item) => [item.entry.instance, item.activation]));
  for (const item of environment.document.endpoints) {
    let activation: ExecutionEnvironmentEndpointActivation;
    try {
      const existing = preparedActivations.get(item.instance);
      if (prepared !== undefined && existing === undefined) {
        throw new Error(`Environment inspection has no activated Endpoint ${item.instance}`);
      }
      activation = existing ?? await environment.registry.activateEndpoint(
        item.use,
        environment.context(item, { endpointPool: true }),
      );
    } catch (error) {
      diagnostics.push(diagnostic(error, "ENVIRONMENT_ENDPOINT_CONFIG_INVALID", item.instance));
      continue;
    }
    activated.push({ item, activation });
    if (requested !== undefined && !endpointOffers(activation.endpoint)
      .some((offer) => environment.requestsCapability(item.instance, offer.capability, requested))) continue;
    for (const offer of endpointOffers(activation.endpoint)) covered.add(capabilityKey(offer.capability));
    selectedEndpoints.push({ item, activation });
    const program = activation.program;
    if (program === undefined) continue;
    let state: ManagedProgramState;
    try {
      state = await program.probe();
    } catch (error) {
      diagnostics.push(diagnostic(error, "MANAGED_PROGRAM_PROBE_FAILED", program.id));
      continue;
    }
    if (state.state !== "ready") {
      diagnostics.push({
        severity: "error",
        code: state.state === "down" ? "MANAGED_PROGRAM_DOWN" : "MANAGED_PROGRAM_MISMATCH",
        message: `${program.id} is not usable: ${state.detail}`,
        subject: program.id,
      });
    }
  }
  for (const capability of options.capabilities ?? []) {
    if (!covered.has(capabilityKey(capability))) diagnostics.push({
      severity: "error",
      code: "ENVIRONMENT_CAPABILITY_UNBOUND",
      message: `No usable Endpoint in this Environment fulfills ${capabilityKey(capability)}`,
      subject: capabilityKey(capability),
    });
  }
  try {
    const endpoints = await environment.createEndpointRegistry(
      activated.map(({ item, activation }) => ({ entry: item, activation })),
    );
    for (const [key, instance] of Object.entries(environment.document.bindings)) {
      const offered = activated.some(({ item, activation }) => item.instance === instance
        && endpointOffers(activation.endpoint).some((offer) => capabilityKey(offer.capability) === key));
      if (!offered && activated.some(({ item }) => item.instance === instance)) diagnostics.push({
        severity: "error",
        code: "ENVIRONMENT_BINDING_INVALID",
        message: `bindings names ${instance} for ${key}, but that Endpoint does not offer it`,
        subject: key,
      });
    }
    for (const conflict of endpoints.capacityConflicts()) diagnostics.push({
      severity: "error",
      code: "ENVIRONMENT_POOL_CONFLICT",
      message: `${conflict.endpointIds.join(", ")} share ${conflict.resource} but size it ${conflict.settings.join(" and ")}; use the same limit and period for this shared resource or different pools`,
      subject: conflict.resource,
    });
    for (const contest of endpoints.contested()) {
      if (contest.bound !== undefined) continue;
      const key = capabilityKey(contest.capability);
      diagnostics.push({
        severity: requested !== undefined && requested.has(key) ? "error" : "warning",
        code: "ENVIRONMENT_CAPABILITY_AMBIGUOUS",
        message: `${contest.endpointIds.join(", ")} all offer ${key}. Say which one does it in Environment bindings`,
        subject: key,
      });
    }
  } catch (error) {
    diagnostics.push(diagnostic(error, "ENVIRONMENT_ENDPOINT_INSTALL_FAILED"));
  }
  const credentialEnvironment = scoped
    ? environment.credentialsFor(selectedEndpoints.map(({ activation }) => activation.endpoint))
    : environment;
  try {
    await credentialEnvironment.installAdapters({ credentials: true });
    for (const item of credentialEnvironment.document.credentials) {
      const context = credentialEnvironment.context(item);
      try {
        diagnostics.push(...credentialEnvironment.registry.validate(item.use, "credential-store", context));
        if (options.active) {
          diagnostics.push(...await credentialEnvironment.registry.doctor(item.use, "credential-store", context));
        }
      } catch (error) {
        diagnostics.push(diagnostic(error, "ENVIRONMENT_COMPONENT_CONFIG_INVALID", item.instance));
      }
    }
  } catch (error) {
    diagnostics.push(diagnostic(error, "ENVIRONMENT_CREDENTIAL_CHECK_FAILED"));
  }
  if (selectedEndpoints.length > 0) {
    let stores: OpenedLocalExecutionEnvironmentCredentialStores | undefined;
    try {
      stores = await credentialEnvironment.openCredentialStores();
      for (const { item, activation } of selectedEndpoints) {
        const credentials: Record<string, CredentialValue> = {};
        let missing = false;
        for (const slot of activation.endpoint.credentials) {
          const value = await stores.store.resolve(slot.ref);
          if (value !== undefined) {
            Object.defineProperty(credentials, slot.slot, {
              value,
              enumerable: true,
              configurable: true,
              writable: true,
            });
            continue;
          }
          missing = true;
          diagnostics.push({
            severity: "error",
            code: "ENVIRONMENT_CREDENTIAL_MISSING",
            message: `${slot.label} for Endpoint ${slot.endpoint} is not configured in Environment ${profile}`,
            subject: `${slot.endpoint}.${slot.slot}`,
          });
        }
        if (!options.active || missing || activation.diagnose === undefined) continue;
        try {
          const offers = endpointOffers(activation.endpoint);
          const capabilities = (options.capabilities ?? offers.map((offer) => offer.capability))
            .filter((capability) => offers.some((offer) => capabilityKey(offer.capability) === capabilityKey(capability)));
          diagnostics.push(...await activation.diagnose({ credentials, capabilities }));
        } catch (error) {
          diagnostics.push(diagnostic(error, "ENVIRONMENT_ADAPTER_DOCTOR_FAILED", item.instance));
        }
      }
    } catch (error) {
      diagnostics.push(diagnostic(error, "ENVIRONMENT_CREDENTIAL_CHECK_FAILED"));
    } finally {
      await stores?.close();
    }
  }
  return { dataRoot: environment.dataRoot, diagnostics };
}

async function openInspection(
  profile: string,
  deployment: LocalExecutionEnvironmentDeployment,
  queries: readonly ExecutionEnvironmentEndpointQuery[],
): Promise<LocalExecutionEnvironmentInspection> {
  const selected = deployment.scope({ capabilities: queries.map((query) => query.capability) });
  const activations = await selected.activateEndpoints();
  const snapshot: InspectionSnapshot = {
    profile,
    deployment: selected,
    activations,
    endpoints: await selected.createEndpointRegistry(activations),
  };
  const selections = resolveSelections(snapshot, queries);
  const stores = new Map<string, OpenedLocalExecutionEnvironmentCredentialStores>();
  let closed = false;
  let endpointResult: readonly ExecutionEnvironmentEndpointObservation[] | undefined;
  let pricingResult: Promise<readonly ExecutionEnvironmentEndpointPricingObservation[]> | undefined;
  let preflightResult: Promise<LocalExecutionEnvironmentDoctorResult> | undefined;
  const assertOpen = (): void => {
    if (closed) throw new Error("Environment inspection is closed");
  };
  const endpoints = (): readonly ExecutionEnvironmentEndpointObservation[] => {
    assertOpen();
    endpointResult ??= selections.map((item) => item.observation);
    return endpointResult;
  };
  const selectedEndpoints = (): readonly string[] => [...new Set(endpoints().flatMap((item) =>
    item.status === "resolved" && item.endpoint !== undefined ? [item.endpoint] : []))];
  return {
    dataRoot: selected.dataRoot,
    deployment: selected,
    activations,
    endpoints: async () => endpoints(),
    pricing: async () => {
      assertOpen();
      pricingResult ??= readPricing(snapshot, selections, stores);
      return await pricingResult;
    },
    preflight: async () => {
      assertOpen();
      preflightResult ??= inspectDeployment(profile, selected, {
        endpoints: selectedEndpoints(),
        active: false,
      }, activations);
      return await preflightResult;
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await Promise.all([...stores.values()].map((opened) => opened.close()));
      stores.clear();
    },
  };
}

export function createLocalExecutionEnvironmentHost(
  profile: string,
  deployment: LocalExecutionEnvironmentDeployment,
): LocalExecutionEnvironmentHost {
  return {
    profile,
    dataRoot: deployment.dataRoot,
    openInspection: async (queries) => await openInspection(profile, deployment, queries),
    endpoints: async (queries) => {
      if (queries.length === 0) return [];
      const inspection = await openInspection(profile, deployment, queries);
      try { return await inspection.endpoints(); } finally { await inspection.close(); }
    },
    pricing: async (queries) => {
      if (queries.length === 0) return [];
      const inspection = await openInspection(profile, deployment, queries);
      try { return await inspection.pricing(); } finally { await inspection.close(); }
    },
    preflight: async (scope = {}) => await inspectDeployment(profile, deployment, { ...scope, active: false }),
    doctor: async (scope = {}) => await inspectDeployment(profile, deployment, { ...scope, active: true }),
    openCredentials: async (endpointId) => {
      const endpoint = deployment.document.endpoints.find((item) => item.instance === endpointId);
      if (endpoint === undefined) throw new Error(`Environment Profile has no Endpoint instance ${endpointId}`);
      const selected = deployment.scope({ endpoints: [endpointId] });
      const [activation] = await selected.activateEndpoints();
      if (activation === undefined) throw new Error(`Environment Profile did not activate Endpoint ${endpointId}`);
      const credentialDeployment = selected.credentialsFor([activation.activation.endpoint]);
      const credentials = await credentialDeployment.openCredentialStores();
      return createLocalEnvironmentCredentialControl({
        credentialStore: credentials.store,
        endpoints: [activation.activation.endpoint],
        close: credentials.close,
      });
    },
    invoke: async (request, resources, observation = {}) => {
      const selected = deployment.scope({ capabilities: [request.capability] });
      const activations = await selected.activateEndpoints();
      const endpoints = await selected.createEndpointRegistry(activations);
      const subject = capabilityKey(request.capability);
      const selection = endpoints.select(request);
      if (selection.status === "missing") {
        throw new Error(selection.endpointId === undefined
          ? `No Endpoint in ${profile} serves ${subject}`
          : `${profile} binds ${subject} to ${selection.endpointId}, which does not offer this demand`);
      }
      if (selection.status === "ambiguous") {
        throw new Error(`Several Endpoints in ${profile} serve ${subject}: ${selection.endpointIds.join(", ")}. Set an Environment binding`);
      }
      const registration = selection.registration;
      const support = endpoints.checkSupport(registration, request);
      if (support.status === "unsupported") throw new Error(`${registration.id} rejected ${subject}: ${support.reason}`);
      if (registration.kind !== "immediate") {
        throw new Error(`${subject} is an asynchronous capability; direct Environment calls only use immediate capabilities`);
      }
      const activation = activations.find(({ activation: item }) => item.endpoint.instance.id === registration.id)?.activation;
      if (activation === undefined) throw new Error(`Endpoint ${registration.id} is not declared by ${profile}`);
      const stores = await selected.credentialsFor([activation.endpoint]).openCredentialStores();
      try {
        const credentials = await resolveEndpointCredentials(activation.endpoint, stores.store, profile);
        return await registration.handler({ request, resources, credentials, ...observation });
      } finally {
        await stores.close();
      }
    },
    declaredPrograms: async (scope = {}) => {
      const selected = deployment.scope(scope);
      if (scope.capabilities?.length === 0) return [];
      const requested = scope.capabilities === undefined
        ? undefined
        : new Set(scope.capabilities.map(capabilityKey));
      const programs: LocalExecutionEnvironmentDeclaredProgram[] = [];
      for (const { entry, activation } of await selected.activateEndpoints()) {
        if (requested !== undefined && !endpointOffers(activation.endpoint)
          .some((offer) => selected.requestsCapability(entry.instance, offer.capability, requested))) continue;
        if (activation.program !== undefined) programs.push({ instance: entry.instance, program: activation.program });
      }
      return programs;
    },
  };
}

export async function openLocalExecutionEnvironmentHost(
  path: string,
  options: LocalExecutionEnvironmentHostOptions,
): Promise<LocalExecutionEnvironmentHost> {
  const opened = await openLocalExecutionEnvironmentProfile(path);
  return createLocalExecutionEnvironmentHost(
    opened.absolute,
    new LocalExecutionEnvironmentDeployment(opened.document, opened.dataRoot, options),
  );
}
