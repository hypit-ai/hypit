import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { EndpointRegistry, installEndpoint } from "@hypit/endpoint";
import type { EndpointInstance } from "@hypit/endpoint";
import { CompositeCredentialStore } from "@hypit/execution-environment";
import type { CredentialStore } from "@hypit/execution-environment";
import { hypitHostStateRoot } from "@hypit/host-paths";
import { loadNodePackageSelection } from "@hypit/loader/node";
import type { NodePackageSelectionRequest } from "@hypit/loader/node";
import { capabilityKey, parseCapabilityKey } from "@hypit/module";
import type { CapabilityRef } from "@hypit/module";

import {
  executionEnvironmentCredentialStoreAdapterFacetKind,
  executionEnvironmentEndpointAdapterFacetKind,
  ExecutionEnvironmentAdapterRegistry,
  isExecutionEnvironmentAdapterFacet,
} from "./extension.js";
import type {
  ExecutionEnvironmentAdapterFactoryContext,
  ExecutionEnvironmentEndpointActivation,
  ExecutionEnvironmentOpened,
} from "./extension.js";
import {
  parseLocalExecutionEnvironmentProfile,
  resolveLocalExecutionEnvironmentDataRoot,
} from "./profile.js";
import type {
  LocalExecutionEnvironmentAdapterSelection,
  LocalExecutionEnvironmentProfile,
} from "./profile.js";

export type LocalExecutionEnvironmentScope = {
  readonly endpoints?: readonly string[];
  readonly capabilities?: readonly CapabilityRef[];
};

export type LocalExecutionEnvironmentDeploymentOptions = {
  /** Installed project/package root used for package selection. */
  readonly packageRoot: string;
  readonly distributionPackageRoot?: string;
  /** Persistent machine/user state outside author projects. */
  readonly hostStateRoot?: string;
  readonly registry?: ExecutionEnvironmentAdapterRegistry;
  /** Execution-owned module binding used by isolated Build workers. */
  readonly importModule?: (url: string) => Promise<unknown>;
};

export type OpenedLocalExecutionEnvironmentProfile = {
  readonly absolute: string;
  readonly profileRoot: string;
  readonly dataRoot: string;
  readonly document: LocalExecutionEnvironmentProfile;
};

export type ActivatedLocalExecutionEnvironmentEndpoint = {
  readonly entry: LocalExecutionEnvironmentAdapterSelection;
  readonly activation: ExecutionEnvironmentEndpointActivation;
};

export type OpenedLocalExecutionEnvironmentCredentialStores = {
  readonly store: CredentialStore;
  close(): Promise<void>;
};

export function applyLocalExecutionEnvironmentBindings(
  registry: EndpointRegistry,
  bindings: Readonly<Record<string, string>> | undefined,
): void {
  for (const [key, endpointId] of Object.entries(bindings ?? {})) {
    registry.bind(parseCapabilityKey(key), endpointId);
  }
}

function selectedProfile(
  document: LocalExecutionEnvironmentProfile,
  scope: LocalExecutionEnvironmentScope,
): LocalExecutionEnvironmentProfile {
  const bound = scope.capabilities?.map((capability) => document.bindings[capabilityKey(capability)]);
  const names = scope.endpoints ?? (bound?.every((name) => name !== undefined) ? bound as string[] : undefined);
  if (names === undefined) return document;
  for (const name of names) {
    if (!document.endpoints.some((item) => item.instance === name)) {
      throw new Error(`Environment Profile has no Endpoint ${name}`);
    }
  }
  const selected = new Set(names);
  return {
    ...document,
    endpoints: document.endpoints.filter((item) => selected.has(item.instance)),
    bindings: Object.fromEntries(Object.entries(document.bindings).filter(([, name]) => selected.has(name))),
  };
}

function adapterSelection(
  document: LocalExecutionEnvironmentProfile,
  kinds: { readonly endpoints?: boolean; readonly credentials?: boolean },
): NodePackageSelectionRequest {
  return {
    selected: [],
    logical: [
      ...(kinds.credentials === true
        ? document.credentials.map((item) => ({ kind: executionEnvironmentCredentialStoreAdapterFacetKind, name: item.use }))
        : []),
      ...(kinds.endpoints === true
        ? document.endpoints.map((item) => ({ kind: executionEnvironmentEndpointAdapterFacetKind, name: item.use }))
        : []),
    ],
  };
}

function credentialSelections(
  document: LocalExecutionEnvironmentProfile,
  endpoints: readonly EndpointInstance[] | undefined,
): readonly LocalExecutionEnvironmentAdapterSelection[] {
  if (endpoints === undefined) return document.credentials;
  const used = new Set(endpoints.flatMap((endpoint) => endpoint.credentials.map((slot) => slot.ref.store)));
  return document.credentials.filter((item) => used.has(item.instance));
}

export async function openLocalExecutionEnvironmentProfile(
  path: string,
): Promise<OpenedLocalExecutionEnvironmentProfile> {
  const absolute = resolve(path);
  let value: unknown;
  try {
    value = JSON.parse(await readFile(absolute, "utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `Environment Profile ${absolute} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const document = parseLocalExecutionEnvironmentProfile(value);
  const profileRoot = dirname(absolute);
  return {
    absolute,
    profileRoot,
    dataRoot: resolveLocalExecutionEnvironmentDataRoot(profileRoot, document),
    document,
  };
}

/**
 * One opened local Environment deployment. Scoped views share Adapter registrations, but package
 * discovery, Endpoint activation, bindings and Credential Store ownership stay below consumers.
 */
export class LocalExecutionEnvironmentDeployment {
  readonly document: LocalExecutionEnvironmentProfile;
  readonly dataRoot: string;
  readonly packageRoot: string;
  readonly distributionPackageRoot: string | undefined;
  readonly hostStateRoot: string;
  readonly registry: ExecutionEnvironmentAdapterRegistry;
  readonly importModule: ((url: string) => Promise<unknown>) | undefined;

  constructor(
    document: LocalExecutionEnvironmentProfile,
    dataRoot: string,
    options: LocalExecutionEnvironmentDeploymentOptions,
  ) {
    this.document = document;
    this.dataRoot = resolve(dataRoot);
    this.packageRoot = resolve(options.packageRoot);
    this.distributionPackageRoot = options.distributionPackageRoot === undefined
      ? undefined
      : resolve(options.distributionPackageRoot);
    this.hostStateRoot = resolve(options.hostStateRoot ?? hypitHostStateRoot());
    this.registry = options.registry ?? new ExecutionEnvironmentAdapterRegistry();
    this.importModule = options.importModule;
  }

  scope(scope: LocalExecutionEnvironmentScope): LocalExecutionEnvironmentDeployment {
    return new LocalExecutionEnvironmentDeployment(selectedProfile(this.document, scope), this.dataRoot, {
      packageRoot: this.packageRoot,
      ...(this.distributionPackageRoot === undefined ? {} : { distributionPackageRoot: this.distributionPackageRoot }),
      hostStateRoot: this.hostStateRoot,
      registry: this.registry,
      ...(this.importModule === undefined ? {} : { importModule: this.importModule }),
    });
  }

  context(
    item: LocalExecutionEnvironmentAdapterSelection,
    options: { readonly endpointPool?: boolean } = {},
  ): ExecutionEnvironmentAdapterFactoryContext {
    const pool = options.endpointPool === true ? item.pool ?? item.instance : item.pool;
    return {
      hostStateRoot: this.hostStateRoot,
      dataRoot: this.dataRoot,
      instance: item.instance,
      ...(pool === undefined ? {} : { pool }),
      config: item.config ?? {},
    };
  }

  async installAdapters(kinds: { readonly endpoints?: boolean; readonly credentials?: boolean }): Promise<void> {
    const selection = adapterSelection(this.document, kinds);
    const logical = selection.logical?.filter((address) => {
      if (address.kind === executionEnvironmentEndpointAdapterFacetKind) {
        return !this.registry.has(address.name, "endpoint");
      }
      if (address.kind === executionEnvironmentCredentialStoreAdapterFacetKind) {
        return !this.registry.has(address.name, "credential-store");
      }
      return true;
    }) ?? [];
    if (logical.length === 0) return;
    const loaded = await loadNodePackageSelection({ selected: [], logical }, this.packageRoot, {
      ...(this.importModule === undefined ? {} : { importModule: this.importModule }),
      ...(this.distributionPackageRoot === undefined ? {} : { fallbackRoots: [this.distributionPackageRoot] }),
    });
    for (const item of loaded) {
      for (const facet of item.contribution.facets ?? []) {
        if (isExecutionEnvironmentAdapterFacet(facet)) this.registry.registerFacet(facet);
      }
    }
  }

  async activateEndpoints(): Promise<readonly ActivatedLocalExecutionEnvironmentEndpoint[]> {
    await this.installAdapters({ endpoints: true });
    return await Promise.all(this.document.endpoints.map(async (entry) => ({
      entry,
      activation: await this.registry.activateEndpoint(entry.use, this.context(entry, { endpointPool: true })),
    })));
  }

  applyBindings(registry: EndpointRegistry): void {
    applyLocalExecutionEnvironmentBindings(registry, this.document.bindings);
  }

  async createEndpointRegistry(
    activations?: readonly ActivatedLocalExecutionEnvironmentEndpoint[],
  ): Promise<EndpointRegistry> {
    const selected = activations ?? await this.activateEndpoints();
    const endpoints = new EndpointRegistry();
    for (const { activation } of selected) await installEndpoint(activation.endpoint, endpoints);
    this.applyBindings(endpoints);
    return endpoints;
  }

  credentialsFor(endpoints: readonly EndpointInstance[]): LocalExecutionEnvironmentDeployment {
    return new LocalExecutionEnvironmentDeployment({
      ...this.document,
      credentials: credentialSelections(this.document, endpoints),
    }, this.dataRoot, {
      packageRoot: this.packageRoot,
      ...(this.distributionPackageRoot === undefined ? {} : { distributionPackageRoot: this.distributionPackageRoot }),
      hostStateRoot: this.hostStateRoot,
      registry: this.registry,
      ...(this.importModule === undefined ? {} : { importModule: this.importModule }),
    });
  }

  async openCredentialStores(): Promise<OpenedLocalExecutionEnvironmentCredentialStores> {
    await this.installAdapters({ credentials: true });
    const opened: ExecutionEnvironmentOpened<CredentialStore>[] = [];
    try {
      for (const item of this.document.credentials) {
        opened.push(await this.registry.openCredentialStore(item.use, this.context(item)));
      }
      return {
        store: new CompositeCredentialStore(opened.map((item) => item.value)),
        close: async () => {
          for (const item of [...opened].reverse()) await item.close?.();
        },
      };
    } catch (error) {
      for (const item of [...opened].reverse()) await item.close?.();
      throw error;
    }
  }

  requestsCapability(
    instance: string,
    capability: CapabilityRef,
    requested: ReadonlySet<string> | undefined,
  ): boolean {
    const key = capabilityKey(capability);
    return requested === undefined || requested.has(key)
      && (this.document.bindings[key] === undefined || this.document.bindings[key] === instance);
  }
}

export async function openLocalExecutionEnvironmentDeployment(
  path: string,
  options: LocalExecutionEnvironmentDeploymentOptions,
): Promise<LocalExecutionEnvironmentDeployment> {
  const opened = await openLocalExecutionEnvironmentProfile(path);
  return new LocalExecutionEnvironmentDeployment(opened.document, opened.dataRoot, options);
}
