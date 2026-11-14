import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";

import type { CliIo } from "@hypit/cli";
import {
  createPublicBuildId,
  submitLongBuild,
  type BuildSubmissionHost,
  type BuildSubmissionInspection,
  type BuildSubmissionRuntime,
} from "@hypit/build-submission";
import type { Product, ProductAddress, ProductHistory } from "@hypit/product";
import type { BuildResultHistory } from "@hypit/result";
import {
  createGenerationCanvasPresentationHost,
  generationCanvasPresentationPackagesFromFacets,
  prepareGenerationWorkspaceNode,
} from "@hypit/generation-canvas";
import { readGenerationWorkspaceFile } from "@hypit/generation-canvas/node";
import {
  createNodeGenerationGraphProjectHost,
  createGenerationGraphRuntimeRequest,
  readGenerationGraphProjectFile,
  type GenerationGraphRuntimeRequest,
} from "@hypit/generation-graph/node";
import {
  loadNodePackageSelection,
  locateNodePackage,
  NodePackageNotFoundError,
  physicalPackageName,
} from "@hypit/loader/node";
import {
  createNleAuthoringHost,
  nleAuthoringPackagesFromFacets,
  type NleComposition,
} from "@hypit/nle";
import {
  createSceneAuthoringHost,
  createSceneLoweringHost,
  sceneAuthoringPackagesFromFacets,
  scenePackagesFromFacets,
  type SceneProject,
} from "@hypit/scene";
import { readSceneProjectFile } from "@hypit/scene/node";
import { readNleProjectFile } from "@hypit/nle/node";
import {
  createNleInspectorPresentationHost,
  createNleTimelinePresentationHost,
  nleInspectorPresentationPackagesFromFacets,
  nleTimelinePresentationPackagesFromFacets,
} from "@hypit/nle-view";
import { moduleKey } from "@hypit/module";
import { moduleFacetKind } from "@hypit/module";
import { findProjectRoot } from "@hypit/project/node";
import {
  createNodeProjectMediaServicePool,
  startNodeProjectMediaHttpServer,
  type NodeProjectMediaService,
} from "@hypit/media-service/node";
import type { CredentialAcquisition } from "@hypit/execution-environment";
import { NodeFilesystemWorkspace } from "@hypit/generation-authoring/workspace/node";

import {
  startGenerationCanvasWorkbenchServer,
  startSceneWorkbenchServer,
  startWorkbenchSuiteServer,
  startWorkbenchServer,
  type WorkbenchEnvironmentHost,
} from "./node/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function writeWorkbenchHelp(io: Pick<CliIo, "write">): void {
  io.write("Usage: hypit workbench <document> [<document> ...] [--port <port>] [--json]\n\n"
    + "Open one Scene, NLE Project or Generation Canvas, or mount one of each behind a shared browser Workbench.\n\n"
    + "Documents:\n"
    + "  *.scene.json    Scene editor\n"
    + "  *.nle.json      Timeline editor\n"
    + "  *.workspace.json Generation Workspace Canvas\n\n"
    + "Options:\n"
    + "  --port <port>   Loopback port; 0 selects an available port (default: 0)\n"
    + "  --json          Write the machine-readable startup address\n");
}

function portValue(raw: string | undefined): number {
  if (raw === undefined) return 0;
  const value = Number(raw);
  assert(Number.isSafeInteger(value) && value >= 0 && value <= 65_535,
    "--port must be an integer from 0 through 65535");
  return value;
}

function nlePackageNames(composition: NleComposition): readonly string[] {
  const names = new Set<string>();
  const add = (symbol: { readonly module: { readonly name: string } }) => {
    names.add(moduleKey(symbol.module));
  };
  for (const value of composition.componentValues) add(value.component);
  for (const track of composition.tracks) {
    for (const item of track.items) {
      if (item.kind === "adjustment") add(item.operator);
      else if (item.source === "component") add(item.component);
      else if (item.source === "composition") {
        for (const name of nlePackageNames(item.composition)) names.add(name);
      }
      if (item.kind === "present") {
        for (const application of item.picture?.operators ?? []) add(application.operator);
        for (const application of item.audio?.operators ?? []) add(application.operator);
      }
      if (item.kind === "present" && item.audio?.reconstruction !== undefined) {
        add(item.audio.reconstruction.using);
      }
    }
  }
  for (const transition of composition.transitions) add(transition.operator);
  for (const matte of composition.mattes) add(matte.operator);
  return [...names];
}

function scenePackageNames(project: SceneProject): readonly string[] {
  const names = new Set<string>();
  const add = (symbol: { readonly module: { readonly name: string } }) => {
    names.add(moduleKey(symbol.module));
  };
  add(project.environment.using);
  for (const object of project.objects) add(object.using);
  for (const performance of project.performances) {
    for (const track of performance.tracks) for (const item of track.items) add(item.using);
  }
  return [...names];
}

function installedWorkbenchPackages(
  logicalNames: readonly string[],
  projectRoot: string,
  distributionPackageRoot?: string,
): readonly string[] {
  const installed = new Set<string>();
  for (const logicalName of logicalNames) {
    const physical = physicalPackageName(logicalName);
    try {
      locateNodePackage(physical, {
        from: join(projectRoot, "__hypit_workbench__.mjs"),
        workspaceRoots: distributionPackageRoot === undefined
          ? [projectRoot]
          : [projectRoot, distributionPackageRoot],
      });
      installed.add(physical);
    } catch (error) {
      // Timeline presentation is optional. A missing package keeps the generic Item projection;
      // an installed but malformed package remains a real error when it is activated below.
      if (!(error instanceof NodePackageNotFoundError)) throw error;
    }
  }
  return [...installed];
}

async function waitForStop(): Promise<void> {
  await new Promise<void>((fulfill) => {
    const stop = (): void => {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      fulfill();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

export type WorkbenchCliOptions = {
  readonly distributionPackageRoot?: string;
  readonly openEnvironmentHost?: (path: string, options: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }) => Promise<WorkbenchEnvironmentServiceHost>;
  readonly resolveProjectRuntime?: (projectRoot: string) => Promise<{ readonly profile: string } | undefined>;
  readonly openRuntimeHost?: (path: string, options: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }) => Promise<WorkbenchRuntimeHost>;
  readonly acquireOAuthCredential?: (acquisition: CredentialAcquisition) => Promise<string>;
  readonly openProjectResults?: (projectRoot: string) => Promise<{
    readonly location: {
      readonly root: string;
      readonly historyPath: string;
      readonly productsPath: string;
    };
    readonly history: BuildResultHistory;
    readonly products: ProductHistory;
    close(): void | Promise<void>;
  }>;
  readonly materializeMediaProduct?: (
    request: { readonly product: ProductAddress; readonly assetPath: string; readonly id: string },
    products: ProductHistory,
  ) => Promise<{ readonly assetPath: string; readonly mediaPath: string }>;
};

export async function startSceneProjectWorkbench(
  documentFile: string,
  projectRoot: string,
  port: number,
  workbenchOptions: WorkbenchCliOptions = {},
) {
  const opened = await readSceneProjectFile(documentFile);
  const packages = await loadNodePackageSelection({
    selected: installedWorkbenchPackages(
      scenePackageNames(opened.current), projectRoot, workbenchOptions.distributionPackageRoot,
    ),
  }, projectRoot, {
    ...(workbenchOptions.distributionPackageRoot === undefined
      ? {}
      : { fallbackRoots: [workbenchOptions.distributionPackageRoot] }),
  });
  const facets = packages.flatMap((item) => item.contribution.facets ?? []);
  const environment = openProjectWorkbenchEnvironment(projectRoot, workbenchOptions);
  const server = await startSceneWorkbenchServer({
    projectFile: documentFile,
    projectRoot,
    port,
    authoring: createSceneAuthoringHost(sceneAuthoringPackagesFromFacets(facets)),
    lowering: createSceneLoweringHost(scenePackagesFromFacets(facets)),
    ...(environment.host === undefined ? {} : { environment: environment.host }),
  }).catch(async (error: unknown) => {
    await environment.close();
    throw error;
  });
  return {
    ...server,
    async close() {
      await server.close();
      await environment.close();
    },
  };
}

type WorkbenchGenerationRuntime = BuildSubmissionRuntime<GenerationGraphRuntimeRequest, { readonly id: string }>;
type WorkbenchGenerationInspection = BuildSubmissionInspection<WorkbenchGenerationRuntime>;
type WorkbenchRuntimeBuildView = {
  readonly id: string;
  readonly activity: "submitting" | "ready" | "running" | "waiting" | "finalizing";
  readonly outputs?: Readonly<Record<string, Product>>;
};
type WorkbenchRuntimeControl = {
  inspect(build: string): Promise<WorkbenchRuntimeBuildView | undefined>;
  close(): void | Promise<void>;
};
type WorkbenchCredentialStatus = {
  readonly endpoint: string;
  readonly slot: string;
  readonly label: string;
  readonly configured: boolean;
  readonly writable: boolean;
  readonly acquisition?: CredentialAcquisition;
};
type WorkbenchCredentialControl = {
  credentials(endpoint?: string): Promise<readonly WorkbenchCredentialStatus[]>;
  putCredential(endpoint: string, slot: string, secret: string): Promise<WorkbenchCredentialStatus>;
  close(): void | Promise<void>;
};
type WorkbenchEnvironmentServiceHost = {
  openCredentials(endpoint: string): Promise<WorkbenchCredentialControl>;
};
type WorkbenchRuntimeHost = BuildSubmissionHost<WorkbenchGenerationInspection> & {
  openControl(options?: { readonly readOnly?: boolean }): Promise<WorkbenchRuntimeControl>;
};

type OpenedProjectWorkbenchEnvironment = {
  readonly host: WorkbenchEnvironmentHost | undefined;
  readonly observe: WorkbenchEnvironmentHost["observe"];
  readonly selectedRuntimeHost: () => Promise<{
    readonly profile: string;
    readonly host: WorkbenchRuntimeHost;
    readonly control: WorkbenchRuntimeControl;
  } | undefined>;
  close(): Promise<void>;
};

export function openProjectWorkbenchEnvironment(
  projectRoot: string,
  workbenchOptions: WorkbenchCliOptions,
): OpenedProjectWorkbenchEnvironment {
  const environmentCandidate = resolve(projectRoot, "hypit.environment.json");
  let openedRuntime: {
    readonly profile: string;
    readonly host: WorkbenchRuntimeHost;
    readonly control: WorkbenchRuntimeControl;
  } | undefined;
  let openedEnvironment: {
    readonly profile: string;
    readonly host: WorkbenchEnvironmentServiceHost;
  } | undefined;
  const close = async () => {
    await openedRuntime?.control.close();
    openedRuntime = undefined;
    openedEnvironment = undefined;
  };
  const selectedRuntimeHost = async () => {
    const selected = await workbenchOptions.resolveProjectRuntime?.(projectRoot);
    if (selected === undefined || workbenchOptions.openRuntimeHost === undefined) {
      await close();
      return undefined;
    }
    if (openedRuntime?.profile === selected.profile) return openedRuntime;
    await close();
    const host = await workbenchOptions.openRuntimeHost(selected.profile, {
      packageRoot: projectRoot,
      ...(workbenchOptions.distributionPackageRoot === undefined
        ? {}
        : { distributionPackageRoot: workbenchOptions.distributionPackageRoot }),
    });
    openedRuntime = { profile: selected.profile, host, control: await host.openControl({ readOnly: true }) };
    return openedRuntime;
  };
  const selectedEnvironmentHost = async () => {
    if (openedEnvironment !== undefined) return openedEnvironment;
    if (workbenchOptions.openEnvironmentHost === undefined
      || !(await stat(environmentCandidate).then((value) => value.isFile(), () => false))) return undefined;
    const host = await workbenchOptions.openEnvironmentHost(environmentCandidate, {
      packageRoot: projectRoot,
      ...(workbenchOptions.distributionPackageRoot === undefined
        ? {}
        : { distributionPackageRoot: workbenchOptions.distributionPackageRoot }),
    });
    openedEnvironment = { profile: environmentCandidate, host };
    return openedEnvironment;
  };
  const profileEndpoints = async (profile: string): Promise<readonly string[]> => {
    const value = JSON.parse(await readFile(profile, "utf8")) as { readonly endpoints?: unknown };
    return value.endpoints !== null && typeof value.endpoints === "object" && !Array.isArray(value.endpoints)
      ? Object.keys(value.endpoints) : [];
  };
  const environmentCredentials = async (
    environment: NonNullable<Awaited<ReturnType<typeof selectedEnvironmentHost>>>,
  ) => {
    const values: WorkbenchCredentialStatus[] = [];
    for (const endpoint of await profileEndpoints(environment.profile)) {
      const control = await environment.host.openCredentials(endpoint);
      try {
        values.push(...await control.credentials(endpoint));
      } finally {
        await control.close();
      }
    }
    return values;
  };
  const observe = async () => {
    const candidate = await stat(environmentCandidate).then((value) => value.isFile(), () => false)
      ? basename(environmentCandidate) : undefined;
    const environment = await selectedEnvironmentHost();
    if (environment === undefined) {
      return {
        status: "unavailable" as const,
        environment: { selected: false, ...(candidate === undefined ? {} : { candidate }) },
        credentials: [],
        issue: candidate === undefined ? "当前项目没有 hypit.environment.json。" : "当前 Host 无法打开项目执行环境。",
      };
    }
    const credentials = await environmentCredentials(environment);
    const missing = credentials.filter((item) => !item.configured);
    const actionable = missing.length > 0 && missing.every((item) => item.writable
      && item.acquisition?.kind === "oauth2-pkce") && workbenchOptions.acquireOAuthCredential !== undefined;
    return {
      status: missing.length === 0 ? "ready" as const
        : actionable ? "action-required" as const : "unavailable" as const,
      environment: { selected: true, label: basename(environment.profile) },
      credentials: credentials.map((item) => ({
        endpoint: item.endpoint,
        slot: item.slot,
        label: item.label,
        configured: item.configured,
        writable: item.writable,
        ...(item.acquisition?.kind === "oauth2-pkce" ? { acquisition: "oauth2-pkce" as const } : {}),
      })),
      ...(missing.length === 0 ? {} : {
        issue: actionable ? "登录生成服务后即可运行节点。" : `${missing[0]?.label ?? "生成服务凭据"}尚未配置。`,
      }),
    };
  };
  const host = workbenchOptions.openEnvironmentHost === undefined ? undefined : {
    observe,
    connect: async () => {
      const environment = await selectedEnvironmentHost();
      assert(environment !== undefined, "Project Environment Profile hypit.environment.json is unavailable.");
      const missing = (await environmentCredentials(environment)).find((item) => !item.configured);
      if (missing !== undefined) {
        assert(missing.writable, `${missing.label} is owned by a read-only credential source.`);
        assert(missing.acquisition?.kind === "oauth2-pkce",
          `${missing.label} cannot be acquired through browser login.`);
        assert(workbenchOptions.acquireOAuthCredential !== undefined,
          "Browser credential acquisition is unavailable in this Workbench.");
        const secret = await workbenchOptions.acquireOAuthCredential(missing.acquisition);
        const control = await environment.host.openCredentials(missing.endpoint);
        try {
          await control.putCredential(missing.endpoint, missing.slot, secret);
        } finally {
          await control.close();
        }
      }
      return await observe();
    },
  } satisfies WorkbenchEnvironmentHost | undefined;
  return { host, observe, selectedRuntimeHost, close };
}

type WorkbenchSurface = "nle" | "scene" | "canvas";

function documentSurface(documentFile: string): WorkbenchSurface {
  if (documentFile.endsWith(".scene.json")) return "scene";
  if (documentFile.endsWith(".workspace.json")) return "canvas";
  if (documentFile.endsWith(".nle.json")) return "nle";
  throw new Error("workbench supports .scene.json, .nle.json and .workspace.json documents");
}

async function documentProjectRoot(documentFile: string, fallbackRoot: string): Promise<string> {
  const discovered = await findProjectRoot({ cwd: dirname(documentFile) });
  if (discovered !== undefined) return discovered;
  const local = resolve(documentFile).startsWith(`${resolve(fallbackRoot)}${sep}`);
  return local ? fallbackRoot : dirname(documentFile);
}

export async function startNleProjectWorkbench(
  documentFile: string,
  projectRoot: string,
  port: number,
  workbenchOptions: WorkbenchCliOptions = {},
  media?: NodeProjectMediaService,
) {
  const opened = await readNleProjectFile(documentFile);
  const packages = await loadNodePackageSelection({
    selected: installedWorkbenchPackages(
      nlePackageNames(opened.current), projectRoot, workbenchOptions.distributionPackageRoot,
    ),
  }, projectRoot, {
    ...(workbenchOptions.distributionPackageRoot === undefined
      ? {}
      : { fallbackRoots: [workbenchOptions.distributionPackageRoot] }),
  });
  const facets = packages.flatMap((item) => item.contribution.facets ?? []);
  const presentations = createNleTimelinePresentationHost(
    nleTimelinePresentationPackagesFromFacets(facets),
  );
  const authoring = createNleAuthoringHost(nleAuthoringPackagesFromFacets(facets));
  const inspectors = createNleInspectorPresentationHost(
    nleInspectorPresentationPackagesFromFacets(facets),
    authoring,
  );
  const environment = openProjectWorkbenchEnvironment(projectRoot, workbenchOptions);
  const server = await startWorkbenchServer({
    projectRoot,
    projectFile: documentFile,
    port,
    presentations,
    inspectors,
    authoring,
    facets,
    ...(media === undefined ? {} : { media }),
    ...(environment.host === undefined ? {} : { environment: environment.host }),
    ...(workbenchOptions.distributionPackageRoot === undefined
      ? {} : { distributionPackageRoot: workbenchOptions.distributionPackageRoot }),
  }).catch(async (error: unknown) => {
    await environment.close();
    throw error;
  });
  return {
    ...server,
    async close() {
      await server.close();
      await environment.close();
    },
  };
}

export async function startCanvasProjectWorkbench(
  documentFile: string,
  projectRoot: string,
  port: number,
  workbenchOptions: WorkbenchCliOptions = {},
  media?: NodeProjectMediaService,
) {
  const workspace = await readGenerationWorkspaceFile(documentFile);
  const graph = await readGenerationGraphProjectFile(resolve(dirname(documentFile), workspace.graph.path));
  const logical = [...new Map(graph.nodes.map((node) => {
    const name = moduleKey(node.using.module);
    return [name, { kind: moduleFacetKind, name }];
  })).values()];
  const packages = await loadNodePackageSelection({ selected: workspace.packages, logical }, projectRoot, {
    ...(workbenchOptions.distributionPackageRoot === undefined
      ? {}
      : { fallbackRoots: [workbenchOptions.distributionPackageRoot] }),
  });
  const presentations = createGenerationCanvasPresentationHost(packages.flatMap((item) =>
    generationCanvasPresentationPackagesFromFacets(item.contribution.facets ?? [])));
  const graphFile = resolve(dirname(documentFile), workspace.graph.path);
  const authorWorkspace = await new NodeFilesystemWorkspace({
    root: projectRoot,
    sourceAdapter: (unit) => ({ unit, frontend: "generation-graph" }),
  }).open(graphFile);
  const graphHost = createNodeGenerationGraphProjectHost({
    packages,
    assets: {
      resolveAsset: (request) => authorWorkspace.resolveAsset(authorWorkspace.entry.unit, request),
      readAsset: async (request) => {
        if (authorWorkspace.readAsset === undefined) {
          throw new Error("Generation Graph Workspace cannot read author assets.");
        }
        return await authorWorkspace.readAsset(authorWorkspace.entry.unit, request);
      },
      attachments: async () => (await authorWorkspace.attachments()).map((item) => ({
        blob: item.blob,
        open: async () => await item.open(),
      })),
    },
  });
  const results = await workbenchOptions.openProjectResults?.(projectRoot);
  const environment = openProjectWorkbenchEnvironment(projectRoot, workbenchOptions);
  const selectedRuntimeHost = environment.selectedRuntimeHost;
  const environmentView = environment.observe;
  const resultsHost = results === undefined ? undefined : {
    products: results.products,
    observations: {
      inspectActive: async (build: string) => await (await selectedRuntimeHost())?.control.inspect(build),
      readResult: async (build: string) => await results.history.read(build),
    },
  };
  const execution = results === undefined || workbenchOptions.openRuntimeHost === undefined ? undefined : {
    status: async () => {
      const view = await environmentView();
      if (view.status !== "ready") {
        return view.issue === undefined ? { available: false } : { available: false, issue: view.issue };
      }
      return await selectedRuntimeHost() !== undefined ? { available: true }
        : { available: false, issue: "Generation Runtime is not selected." };
    },
    prepare: async (input: {
      readonly graph: typeof graph;
      readonly workspace: typeof workspace;
      readonly node: string;
    }) => await prepareGenerationWorkspaceNode({
      ...input,
      program: graphHost.program,
      host: graphHost.lowering,
      products: results.products,
    }),
    submit: async (input: {
      readonly graphFile: string;
      readonly prepared: Awaited<ReturnType<typeof prepareGenerationWorkspaceNode>>;
    }) => {
      const runtime = await selectedRuntimeHost();
      assert(runtime !== undefined, "Generation Runtime is not selected.");
      const session = await submitLongBuild({
        host: runtime.host,
        request: createGenerationGraphRuntimeRequest({
          projectPath: input.graphFile,
          prepared: input.prepared,
          publicationStores: results.location,
          build: createPublicBuildId(),
        }),
        packageContributions: packages.map((item) => item.contribution),
      });
      try {
        return { id: session.submission.id };
      } finally {
        await session.close();
      }
    },
  };
  const materialization = results === undefined || workbenchOptions.materializeMediaProduct === undefined
    ? undefined
    : {
        materialize: async (
          request: { readonly product: ProductAddress; readonly assetPath: string; readonly id: string },
          products: ProductHistory,
        ) => await workbenchOptions.materializeMediaProduct!(request, products),
      };
  const server = await startGenerationCanvasWorkbenchServer({
    projectRoot,
    workspaceFile: documentFile,
    port,
    presentations,
    graphHost: graphHost.lowering,
    ...(media === undefined ? {} : { media }),
    ...(resultsHost === undefined ? {} : { results: resultsHost }),
    ...(execution === undefined ? {} : { execution }),
    ...(environment.host === undefined ? {} : { environment: environment.host }),
    ...(materialization === undefined ? {} : { materialization }),
  }).catch(async (error: unknown) => {
    await environment.close();
    await results?.close();
    throw error;
  });
  return {
    ...server,
    async close() {
      await server.close();
      await environment.close();
      await results?.close();
    },
  };
}

export async function runWorkbenchCli(
  argv: readonly string[],
  io: CliIo,
  cwd: string,
  projectRoot: string,
  workbenchOptions: WorkbenchCliOptions = {},
): Promise<void> {
  if (argv[1] === "--help" || argv[1] === "help" || argv.length < 2) {
    writeWorkbenchHelp(io);
    return;
  }
  const positionals: string[] = [];
  let port: string | undefined;
  let json = false;
  for (let index = 1; index < argv.length; index += 1) {
    const item = argv[index]!;
    if (item === "--json") { json = true; continue; }
    if (["--debug", "--verbose", "--no-color"].includes(item)) continue;
    if (item === "--color") { index += 1; continue; }
    if (item === "--port") {
      assert(port === undefined, "--port cannot be repeated");
      port = argv[index + 1];
      assert(port !== undefined && !port.startsWith("--"), "--port requires a value");
      index += 1;
      continue;
    }
    assert(!item.startsWith("--"), `Unknown option ${item}`);
    positionals.push(item);
  }
  assert(positionals.length >= 1 && positionals.length <= 3,
    "workbench requires one document, with at most one Scene, NLE and Generation Workspace");
  const documentFiles = positionals.map((item) => resolve(cwd, item));
  const surfaces = documentFiles.map(documentSurface);
  assert(new Set(surfaces).size === surfaces.length,
    "workbench accepts at most one document for each surface");
  const selectedPort = portValue(port);
  if (documentFiles.length > 1) {
    const mediaPool = createNodeProjectMediaServicePool();
    const mediaLeases = new Map<string, ReturnType<typeof mediaPool.acquire>>();
    const opened: Array<{
      readonly surface: WorkbenchSurface;
      readonly origin: string;
      readonly file: string;
      readonly projectRoot: string;
      close(): Promise<void>;
    }> = [];
    let suite: Awaited<ReturnType<typeof startWorkbenchSuiteServer>> | undefined;
    let mediaServer: Awaited<ReturnType<typeof startNodeProjectMediaHttpServer>> | undefined;
    try {
      for (let index = 0; index < documentFiles.length; index += 1) {
        const file = documentFiles[index]!;
        const surface = surfaces[index]!;
        const root = await documentProjectRoot(file, projectRoot);
        let mediaLease = mediaLeases.get(root);
        if (mediaLease === undefined) {
          mediaLease = mediaPool.acquire(root);
          mediaLeases.set(root, mediaLease);
        }
        if (surface === "scene") {
          const server = await startSceneProjectWorkbench(file, root, 0, workbenchOptions);
          opened.push({ surface, origin: server.origin, file, projectRoot: root,
            close: async () => await server.close() });
        } else if (surface === "canvas") {
          const server = await startCanvasProjectWorkbench(file, root, 0, workbenchOptions, mediaLease.service);
          opened.push({ surface, origin: server.origin, file, projectRoot: root,
            close: async () => await server.close() });
        } else {
          const server = await startNleProjectWorkbench(file, root, 0, workbenchOptions, mediaLease.service);
          opened.push({ surface, origin: server.origin, file, projectRoot: root,
            close: async () => await server.close() });
        }
      }
      const roots = new Set(opened.map((item) => item.projectRoot));
      if (roots.size === 1) {
        const root = opened[0]!.projectRoot;
        mediaServer = await startNodeProjectMediaHttpServer({
          projectRoot: root,
          media: mediaLeases.get(root)!.service,
        });
      }
      suite = await startWorkbenchSuiteServer({
        targets: Object.fromEntries(opened.map((item) => [item.surface, item.origin])),
        ...(mediaServer === undefined ? {} : { projectTarget: mediaServer.origin }),
        defaultSurface: surfaces[0]!,
        port: selectedPort,
      });
      const documents = Object.fromEntries(opened.map((item) => [item.surface, item.file]));
      if (json) {
        io.write(`${JSON.stringify({ format: "hypit.workbench@1", origin: suite.origin,
          ...suite.urls, ...(suite.mediaUrl === undefined ? {} : { media: suite.mediaUrl }), documents })}\n`);
      } else {
        io.write(`Hypit Workbench\n${Object.entries(suite.urls)
          .map(([surface, url]) => `  ${surface}: ${url}`).join("\n")}`
          + `${suite.mediaUrl === undefined ? "" : `\n  media: ${suite.mediaUrl}`}`
          + "\n\nPress Ctrl+C to stop.\n");
      }
      await waitForStop();
    } finally {
      await suite?.close();
      await mediaServer?.close();
      for (const surface of opened.reverse()) await surface.close();
      for (const lease of mediaLeases.values()) await lease.release();
      await mediaPool.close();
    }
    return;
  }
  const documentFile = documentFiles[0]!;
  const documentRoot = await documentProjectRoot(documentFile, projectRoot);
  if (documentFile.endsWith(".scene.json")) {
    const server = await startSceneProjectWorkbench(documentFile, documentRoot, selectedPort, workbenchOptions);
    if (json) {
      io.write(`${JSON.stringify({ format: "hypit.workbench@1", origin: server.origin, scene: server.sceneUrl,
        projectFile: server.projectFile, viewFile: server.viewFile })}\n`);
    } else {
      io.write(`Hypit Workbench · Scene\n  ${server.sceneUrl}\n  ${server.projectFile}\n  ${server.viewFile}\n\nPress Ctrl+C to stop.\n`);
    }
    try {
      await waitForStop();
    } finally {
      await server.close();
    }
    return;
  }
  if (documentFile.endsWith(".workspace.json")) {
    const server = await startCanvasProjectWorkbench(documentFile, documentRoot, selectedPort, workbenchOptions);
    if (json) {
      io.write(`${JSON.stringify({ format: "hypit.workbench@1", origin: server.origin, canvas: server.canvasUrl,
        workspaceFile: server.workspaceFile, graphFile: server.graphFile })}\n`);
    } else {
      io.write(`Hypit Workbench · Canvas\n  ${server.canvasUrl}\n  ${server.workspaceFile}\n  ${server.graphFile}\n\nPress Ctrl+C to stop.\n`);
    }
    try {
      await waitForStop();
    } finally {
      await server.close();
    }
    return;
  }
  assert(documentFile.endsWith(".nle.json"),
    "workbench supports .scene.json, .nle.json and .workspace.json documents");
  const server = await startNleProjectWorkbench(documentFile, documentRoot, selectedPort, workbenchOptions);
  if (json) {
    io.write(`${JSON.stringify({ format: "hypit.workbench@1", origin: server.origin, nle: server.nleUrl,
      projectFile: server.projectFile, viewFile: server.viewFile, feedbackFile: server.feedbackFile })}\n`);
  } else {
    io.write(`Hypit Workbench · Timeline\n  ${server.nleUrl}\n  ${server.projectFile}\n  ${server.viewFile}\n  ${server.feedbackFile}\n\nPress Ctrl+C to stop.\n`);
  }
  try {
    await waitForStop();
  } finally {
    await server.close();
  }
}
