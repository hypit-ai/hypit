import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { collectNodePackageComponents, loadNodePackageSelection } from "@hypit/package-loader-node";
import type { NodePackageSelectionRequest } from "@hypit/package-loader-node";
import { canonicalize } from "@hypit/protocol";
import type { CanonicalValue, CapabilityRef } from "@hypit/protocol";
import {
  CompositeCredentialStore,
} from "@hypit/runtime";
import type { ArtifactStore, CredentialStore } from "@hypit/runtime";
import {
  isRuntimeAdapterHostFacet,
  runtimeArtifactStoreAdapterHostAbi,
  runtimeCredentialStoreAdapterHostAbi,
  runtimeEndpointAdapterHostAbi,
  RuntimeAdapterRegistry,
} from "@hypit/runtime-kit";
import type {
  ManagedProgram,
  ManagedProgramState,
  RuntimeDoctorDiagnostic,
  RuntimeEndpointActivation,
  RuntimeOpened,
} from "@hypit/runtime-kit";
import { SqliteRuntimeState } from "@hypit/store-sqlite";

import { createLocalRuntime } from "./runtime.js";
import {
  createLocalRuntimeArchiveControl,
  createLocalRuntimeArtifactAccess,
} from "./control.js";
import { createLocalCredentialControl } from "./credentials.js";
import type {
  LocalCredentialControl,
  LocalRuntime,
  LocalRuntimeArchiveControl,
  LocalRuntimeArtifactAccess,
} from "./types.js";

export type RuntimeConfigEntry = {
  readonly use: string;
  readonly instance: string;
  readonly pool?: string;
  readonly config?: CanonicalValue;
};

export type RuntimeConfigDocument = {
  readonly format: "hypit.runtime-profile@1";
  readonly dataRoot: string;
  readonly artifacts: RuntimeConfigEntry;
  readonly credentials: readonly RuntimeConfigEntry[];
  readonly endpoints: readonly RuntimeConfigEntry[];
};

export type LoadRuntimeConfigOptions = {
  readonly registry?: RuntimeAdapterRegistry;
  readonly packageRoot?: string;
};

export type RuntimeConfigDoctorResult = {
  readonly dataRoot: string;
  readonly diagnostics: readonly RuntimeDoctorDiagnostic[];
};

export type ResolvedRuntimeConfigPaths = {
  readonly packageRoot: string;
  readonly dataRoot: string;
};

type OpenedRuntimeConfig = {
  readonly absolute: string;
  readonly document: RuntimeConfigDocument;
  readonly root: string;
  readonly packageRoot: string;
};

type DeclaredManagedProgram = {
  readonly instance: string;
  readonly program: ManagedProgram;
};

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${subject} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], subject: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${subject} does not accept ${unknown[0]}`);
}

function requiredString(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${subject} must be a non-empty string`);
  return value;
}

function entry(value: unknown, instance: string, subject: string, poolAllowed = false): RuntimeConfigEntry {
  const item = object(value, subject);
  exactKeys(item, poolAllowed ? ["use", "pool", "config"] : ["use", "config"], subject);
  const pool = item.pool === undefined ? undefined : requiredString(item.pool, `${subject}.pool`);
  return {
    use: requiredString(item.use, `${subject}.use`),
    instance,
    ...(pool === undefined ? {} : { pool }),
    ...(item.config === undefined ? {} : { config: canonicalize(item.config) }),
  };
}

function entries(value: unknown, subject: string, poolAllowed = false): readonly RuntimeConfigEntry[] {
  const values = object(value ?? {}, subject);
  return Object.entries(values).map(([instance, item]) => {
    requiredString(instance, `${subject} instance`);
    return entry(item, instance, `${subject}.${instance}`, poolAllowed);
  });
}

export function parseRuntimeConfig(value: unknown): RuntimeConfigDocument {
  const item = object(value, "$runtime");
  exactKeys(item, ["format", "runtime"], "$runtime");
  if (item.format !== "hypit.runtime-profile@1") {
    throw new Error("$runtime.format must be hypit.runtime-profile@1");
  }
  const runtime = object(item.runtime, "$runtime.runtime");
  exactKeys(runtime, ["use", "config"], "$runtime.runtime");
  if (runtime.use !== "@hypit/runtime-local") {
    throw new Error(`Local Runtime loader cannot activate ${String(runtime.use)}`);
  }
  const config = object(runtime.config, "$runtime.runtime.config");
  exactKeys(config, ["dataRoot", "artifacts", "credentials", "endpoints"], "$runtime.runtime.config");
  const artifacts = entry(config.artifacts, "artifacts", "$runtime.runtime.config.artifacts");
  const credentials = entries(config.credentials, "$runtime.runtime.config.credentials");
  const endpoints = entries(config.endpoints, "$runtime.runtime.config.endpoints", true);
  const ids = [...credentials, ...endpoints].map((value) => value.instance);
  if (new Set(ids).size !== ids.length) throw new Error("$runtime repeats a Runtime instance id");
  return {
    format: "hypit.runtime-profile@1",
    dataRoot: requiredString(config.dataRoot, "$runtime.runtime.config.dataRoot"),
    artifacts,
    credentials,
    endpoints,
  };
}

async function openRuntimeConfig(path: string, packageRootHint?: string): Promise<OpenedRuntimeConfig> {
  const absolute = resolve(path);
  const document = parseRuntimeConfig(JSON.parse(await readFile(absolute, "utf8")));
  const profileRoot = dirname(absolute);
  return {
    absolute,
    document,
    root: resolve(profileRoot, document.dataRoot),
    packageRoot: resolve(packageRootHint ?? profileRoot),
  };
}

function runtimePackageSelection(document: RuntimeConfigDocument): NodePackageSelectionRequest {
  return {
    selected: [],
    logical: [
      { abi: runtimeArtifactStoreAdapterHostAbi, name: document.artifacts.use },
      ...document.credentials.map((item) => ({ abi: runtimeCredentialStoreAdapterHostAbi, name: item.use })),
      ...document.endpoints.map((item) => ({ abi: runtimeEndpointAdapterHostAbi, name: item.use })),
    ],
  };
}

function endpointPackageSelection(document: RuntimeConfigDocument): NodePackageSelectionRequest {
  return {
    selected: [],
    logical: document.endpoints.map((item) => ({ abi: runtimeEndpointAdapterHostAbi, name: item.use })),
  };
}

async function installRuntimeAdapters(
  registry: RuntimeAdapterRegistry,
  packageRoot: string,
  selection: NodePackageSelectionRequest,
): Promise<void> {
  const logical = selection.logical?.filter((address) => {
    if (address.abi === runtimeEndpointAdapterHostAbi) return !registry.has(address.name, "endpoint");
    if (address.abi === runtimeArtifactStoreAdapterHostAbi) return !registry.has(address.name, "artifact-store");
    if (address.abi === runtimeCredentialStoreAdapterHostAbi) return !registry.has(address.name, "credential-store");
    return true;
  }) ?? [];
  if (selection.selected.length === 0 && logical.length === 0) return;
  const loaded = await loadNodePackageSelection({ selected: selection.selected, logical }, packageRoot);
  for (const item of loaded) {
    for (const facet of item.contribution.hostFacets ?? []) {
      if (isRuntimeAdapterHostFacet(facet)) registry.registerFacet(facet);
    }
  }
}

export async function resolveRuntimeConfigPaths(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<ResolvedRuntimeConfigPaths> {
  const opened = await openRuntimeConfig(path, options.packageRoot);
  return { packageRoot: opened.packageRoot, dataRoot: opened.root };
}

function capabilityKey(capability: CapabilityRef): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

async function activatedEndpoints(
  document: RuntimeConfigDocument,
  root: string,
  registry: RuntimeAdapterRegistry,
): Promise<readonly { readonly entry: RuntimeConfigEntry; readonly activation: RuntimeEndpointActivation }[]> {
  return await Promise.all(document.endpoints.map(async (item) => ({
    entry: item,
    activation: await registry.activateEndpoint(item.use, {
      dataRoot: root,
      instance: item.instance,
      pool: item.pool ?? item.instance,
      config: item.config ?? {},
    }),
  })));
}

export async function declaredManagedPrograms(
  path: string,
  options: LoadRuntimeConfigOptions & { readonly capabilities?: readonly CapabilityRef[] } = {},
): Promise<{ readonly dataRoot: string; readonly programs: readonly DeclaredManagedProgram[] }> {
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  if (options.capabilities?.length === 0) return { dataRoot: root, programs: [] };
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installRuntimeAdapters(registry, packageRoot, endpointPackageSelection(document));
  const requested = options.capabilities === undefined
    ? undefined
    : new Set(options.capabilities.map(capabilityKey));
  const programs: DeclaredManagedProgram[] = [];
  for (const { entry, activation } of await activatedEndpoints(document, root, registry)) {
    if (requested !== undefined && !activation.endpoint.offers.some((offer) => requested.has(capabilityKey(offer.capability)))) continue;
    if (activation.program !== undefined) programs.push({ instance: entry.instance, program: activation.program });
  }
  return { dataRoot: root, programs };
}

function diagnostic(error: unknown, code: string, subject?: string): RuntimeDoctorDiagnostic {
  return {
    severity: "error",
    code,
    message: error instanceof Error ? error.message : String(error),
    ...(subject === undefined ? {} : { subject }),
  };
}

async function openCredentialStores(
  document: RuntimeConfigDocument,
  root: string,
  registry: RuntimeAdapterRegistry,
): Promise<{ readonly store: CredentialStore; close(): Promise<void> }> {
  const opened: RuntimeOpened<CredentialStore>[] = [];
  try {
    for (const item of document.credentials) {
      opened.push(await registry.openCredentialStore(item.use, {
        dataRoot: root,
        instance: item.instance,
        config: item.config ?? {},
      }));
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

async function openArtifactStore(
  document: RuntimeConfigDocument,
  root: string,
  registry: RuntimeAdapterRegistry,
): Promise<RuntimeOpened<ArtifactStore>> {
  const item = document.artifacts;
  return await registry.openArtifactStore(item.use, {
    dataRoot: root,
    instance: item.instance,
    config: item.config ?? {},
  });
}

function statePath(root: string): string {
  return resolve(root, "runtime.sqlite");
}

export async function doctorRuntimeConfig(
  path: string,
  options: LoadRuntimeConfigOptions & { readonly capabilities?: readonly CapabilityRef[] } = {},
): Promise<RuntimeConfigDoctorResult> {
  const { absolute, document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const diagnostics: RuntimeDoctorDiagnostic[] = [];
  try {
    if (!(await stat(root)).isDirectory()) throw new Error(`Runtime root ${root} is not a directory`);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      return { dataRoot: root, diagnostics: [diagnostic(error, "RUNTIME_DATA_ROOT_INVALID", root)] };
    }
  }
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  try {
    await installRuntimeAdapters(registry, packageRoot, runtimePackageSelection(document));
  } catch (error) {
    return { dataRoot: root, diagnostics: [diagnostic(error, "RUNTIME_PACKAGE_SELECTION_INVALID")] };
  }
  const storeSelections = [
    { item: document.artifacts, kind: "artifact-store" as const },
    ...document.credentials.map((item) => ({ item, kind: "credential-store" as const })),
  ];
  for (const selection of storeSelections) {
    const context = { dataRoot: root, instance: selection.item.instance, config: selection.item.config ?? {} };
    try {
      diagnostics.push(...registry.validate(selection.item.use, selection.kind, context));
      diagnostics.push(...await registry.doctor(selection.item.use, selection.kind, context));
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_COMPONENT_CONFIG_INVALID", selection.item.instance));
    }
  }
  const requested = options.capabilities === undefined
    ? undefined
    : new Set(options.capabilities.map(capabilityKey));
  const covered = new Set<string>();
  const credentialEndpoints: RuntimeEndpointActivation[] = [];
  for (const item of document.endpoints) {
    let activation: RuntimeEndpointActivation;
    try {
      activation = await registry.activateEndpoint(item.use, {
        dataRoot: root,
        instance: item.instance,
        pool: item.pool ?? item.instance,
        config: item.config ?? {},
      });
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_ENDPOINT_CONFIG_INVALID", item.instance));
      continue;
    }
    if (requested !== undefined && !activation.endpoint.offers.some((offer) => requested.has(capabilityKey(offer.capability)))) continue;
    for (const offer of activation.endpoint.offers) covered.add(capabilityKey(offer.capability));
    try {
      diagnostics.push(...(activation.diagnose === undefined ? [] : await activation.diagnose()));
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_ADAPTER_DOCTOR_FAILED", item.instance));
    }
    credentialEndpoints.push(activation);
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
      code: "RUNTIME_CAPABILITY_UNBOUND",
      message: `No usable Endpoint in this Runtime Profile fulfills ${capabilityKey(capability)}`,
      subject: capabilityKey(capability),
    });
  }
  if (credentialEndpoints.some((item) => item.endpoint.credentials.length > 0)) {
    let stores: Awaited<ReturnType<typeof openCredentialStores>> | undefined;
    try {
      stores = await openCredentialStores(document, root, registry);
      for (const activation of credentialEndpoints) {
        for (const slot of activation.endpoint.credentials) {
          if (await stores.store.resolve(slot.ref) !== undefined) continue;
          diagnostics.push({
            severity: "error",
            code: "RUNTIME_CREDENTIAL_MISSING",
            message: `${slot.label} for Endpoint ${slot.endpoint} is not configured. ${
              slot.ref.store === "env"
                ? `Set ${slot.ref.key} in this process environment.`
                : `Configure it with: hypit auth login ${slot.endpoint} --runtime ${absolute}`}`,
            subject: `${slot.endpoint}.${slot.slot}`,
          });
        }
      }
    } catch (error) {
      diagnostics.push(diagnostic(error, "RUNTIME_CREDENTIAL_CHECK_FAILED"));
    } finally {
      await stores?.close();
    }
  }
  return { dataRoot: root, diagnostics };
}

export async function createRuntimeFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntime> {
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installRuntimeAdapters(registry, packageRoot, runtimePackageSelection(document));
  const state = new SqliteRuntimeState(statePath(root));
  let artifacts: RuntimeOpened<ArtifactStore> | undefined;
  let credentials: Awaited<ReturnType<typeof openCredentialStores>> | undefined;
  try {
    artifacts = await openArtifactStore(document, root, registry);
    credentials = await openCredentialStores(document, root, registry);
    const endpoints = await Promise.all(document.endpoints.map(async (item) => await registry.createEndpoint(item.use, {
      dataRoot: root,
      instance: item.instance,
      pool: item.pool ?? item.instance,
      config: item.config ?? {},
    })));
    return await createLocalRuntime({
      buildStore: state.builds,
      buildCatalog: state.catalog,
      operationStore: state.operations,
      dispatchStore: state.dispatch,
      artifactStore: artifacts.value,
      credentialStore: credentials.store,
      loadComponentPackages: async (specifiers) => {
        const loaded = await loadNodePackageSelection(specifiers, packageRoot);
        return collectNodePackageComponents(loaded.map((item) => item.contribution));
      },
      endpoints,
      close: async () => {
        await credentials?.close();
        await artifacts?.close?.();
        state.close();
      },
    });
  } catch (error) {
    await credentials?.close();
    await artifacts?.close?.();
    state.close();
    throw error;
  }
}

export async function createRuntimeArchiveFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions & { readonly readOnly?: boolean } = {},
): Promise<LocalRuntimeArchiveControl> {
  const { root } = await openRuntimeConfig(path, options.packageRoot);
  const state = new SqliteRuntimeState(statePath(root), { readOnly: options.readOnly === true });
  return createLocalRuntimeArchiveControl({
    buildStore: state.builds,
    buildCatalog: state.catalog,
    operationStore: state.operations,
    dispatchStore: state.dispatch,
    close: () => state.close(),
  });
}

export async function createRuntimeArtifactAccessFromConfig(
  path: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalRuntimeArtifactAccess> {
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installRuntimeAdapters(registry, packageRoot, {
    selected: [], logical: [{ abi: runtimeArtifactStoreAdapterHostAbi, name: document.artifacts.use }],
  });
  const opened = await openArtifactStore(document, root, registry);
  return createLocalRuntimeArtifactAccess({
    artifactStore: opened.value,
    ...(opened.close === undefined ? {} : { close: opened.close }),
  });
}

export async function createRuntimeCredentialsFromConfig(
  path: string,
  endpointInstance: string,
  options: LoadRuntimeConfigOptions = {},
): Promise<LocalCredentialControl> {
  const { document, root, packageRoot } = await openRuntimeConfig(path, options.packageRoot);
  const endpoint = document.endpoints.find((item) => item.instance === endpointInstance);
  if (endpoint === undefined) throw new Error(`Runtime Profile has no Endpoint instance ${endpointInstance}`);
  const registry = options.registry ?? new RuntimeAdapterRegistry();
  await installRuntimeAdapters(registry, packageRoot, runtimePackageSelection(document));
  const credentials = await openCredentialStores(document, root, registry);
  try {
    const endpointPackage = await registry.createEndpoint(endpoint.use, {
      dataRoot: root,
      instance: endpoint.instance,
      pool: endpoint.pool ?? endpoint.instance,
      config: endpoint.config ?? {},
    });
    return createLocalCredentialControl({
      credentialStore: credentials.store,
      endpoints: [endpointPackage],
      close: credentials.close,
    });
  } catch (error) {
    await credentials.close();
    throw error;
  }
}
