import { randomUUID } from "node:crypto";
import type { ProjectHost } from "@hypit/project";
import {
  ApplicationExecutionDirectory,
  openApplicationExecutionDirectory,
} from "./execution.js";
import type {
  ApplicationEvent,
  ApplicationEventListener,
  ApplicationProductProvider,
  ApplicationProductSession,
  ApplicationProductSessionHandle,
  ApplicationProductSessionLease,
  ApplicationProjectId,
  ApplicationProjectLease,
  ApplicationProjectLeaseHandle,
  ApplicationProjectProvider,
  ApplicationProjection,
  IdentifiedApplicationProject,
} from "./types.js";

type ProjectEntry = {
  readonly id: ApplicationProjectId;
  readonly key: string;
  readonly host: ProjectHost;
  readonly leases: Set<ApplicationProjectLeaseHandle>;
  readonly sessions: Set<ApplicationProductSessionHandle>;
};

type SessionEntry = {
  readonly handle: ApplicationProductSessionHandle;
  readonly project: ProjectEntry;
  readonly product: string;
  readonly session: ApplicationProductSession;
  readonly browser?: { connections: number; timer?: ReturnType<typeof setTimeout> };
  closing?: Promise<void>;
};

const browserReconnectMs = 60_000;

export type OpenApplicationHostOptions = {
  readonly projects: ApplicationProjectProvider;
  readonly products?: readonly ApplicationProductProvider[];
  readonly execution?: ApplicationExecutionDirectory;
  readonly closeExecution?: boolean;
};

function productIdentity(value: string): void {
  if (!/^[a-z][a-z0-9.-]{0,191}$/u.test(value)) {
    throw new Error("Application Product identity must be a stable lowercase identity.");
  }
}

function launchParameters(provider: ApplicationProductProvider): void {
  const names = new Set<string>();
  for (const parameter of provider.launchParameters ?? []) {
    if (!/^[a-z][A-Za-z0-9]{0,63}$/u.test(parameter.name)) {
      throw new Error(`Application Product ${provider.product} has an invalid launch parameter name.`);
    }
    if (names.has(parameter.name)) {
      throw new Error(`Application Product ${provider.product} repeats launch parameter ${parameter.name}.`);
    }
    if (parameter.title.trim().length === 0) {
      throw new Error(`Application Product ${provider.product} launch parameter ${parameter.name} requires a title.`);
    }
    names.add(parameter.name);
  }
}

export class ApplicationHost {
  readonly execution: ApplicationExecutionDirectory;
  readonly #closeExecution: boolean;
  readonly #projectProvider: ApplicationProjectProvider;
  readonly #products = new Map<string, ApplicationProductProvider>();
  readonly #projects = new Map<string, ProjectEntry>();
  readonly #projectsById = new Map<ApplicationProjectId, ProjectEntry>();
  readonly #projectLeases = new Map<ApplicationProjectLeaseHandle, ProjectEntry>();
  readonly #openingProjects = new Map<string, Promise<ProjectEntry>>();
  readonly #closingProjects = new Map<string, Promise<void>>();
  readonly #sessions = new Map<ApplicationProductSessionHandle, SessionEntry>();
  readonly #closingSessions = new Map<ApplicationProductSessionHandle, Promise<void>>();
  readonly #listeners = new Set<ApplicationEventListener>();
  #closed = false;
  #closePromise: Promise<void> | undefined;

  constructor(options: OpenApplicationHostOptions) {
    this.#projectProvider = options.projects;
    this.execution = options.execution ?? openApplicationExecutionDirectory();
    this.#closeExecution = options.execution === undefined || options.closeExecution === true;
    for (const provider of options.products ?? []) {
      productIdentity(provider.product);
      if (this.#products.has(provider.product)) {
        throw new Error(`ApplicationHost repeats Product Provider ${provider.product}.`);
      }
      if (provider.title.trim().length === 0) {
        throw new Error(`Application Product Provider ${provider.product} requires a title.`);
      }
      launchParameters(provider);
      this.#products.set(provider.product, provider);
    }
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("ApplicationHost is closed.");
  }

  subscribe(listener: ApplicationEventListener): () => void {
    this.#assertOpen();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(event: ApplicationEvent): void {
    for (const listener of this.#listeners) {
      try { listener(structuredClone(event)); } catch { /* Observers cannot veto a registry change. */ }
    }
  }

  async #openProject(identified: IdentifiedApplicationProject): Promise<ProjectEntry> {
    await this.#closingProjects.get(identified.key);
    this.#assertOpen();
    const found = this.#projects.get(identified.key);
    if (found !== undefined) return found;
    let opening = this.#openingProjects.get(identified.key);
    if (opening === undefined) {
      opening = (async () => {
        const clients = await this.execution.openProjectClients(identified.boundary);
        let host: ProjectHost;
        try {
          host = await this.#projectProvider.open(identified.input, clients, this.execution.discoveryFor(identified.boundary));
        } catch (error) {
          await Promise.allSettled([...clients].reverse().map(async (client) => await client.close()));
          throw error;
        }
        if (host.boundary.root !== identified.boundary.root) {
          await host.close();
          throw new Error(`Project Provider opened ${host.boundary.root} for identity ${identified.boundary.root}.`);
        }
        if (this.#closed) {
          await host.close();
          throw new Error("ApplicationHost closed while opening a Project Boundary.");
        }
        const entry: ProjectEntry = {
          id: `project_${randomUUID()}`,
          key: identified.key,
          host,
          leases: new Set(),
          sessions: new Set(),
        };
        this.#projects.set(identified.key, entry);
        this.#projectsById.set(entry.id, entry);
        return entry;
      })().finally(() => this.#openingProjects.delete(identified.key));
      this.#openingProjects.set(identified.key, opening);
    }
    return await opening;
  }

  async openProject(input: unknown): Promise<ApplicationProjectLease> {
    this.#assertOpen();
    const identified = await this.#projectProvider.identify(input);
    if (identified.key.trim().length === 0) throw new Error("Application Project identity is empty.");
    const entry = await this.#openProject(identified);
    const handle = `project-lease_${randomUUID()}`;
    entry.leases.add(handle);
    this.#projectLeases.set(handle, entry);
    this.#emit({ kind: "project.lease-opened", project: entry.id, lease: handle, invalidated: ["application"] });
    let released = false;
    return {
      handle,
      project: entry.id,
      host: entry.host,
      close: async () => {
        if (released) return;
        released = true;
        await this.closeProject(handle);
      },
    };
  }

  async closeProject(handle: ApplicationProjectLeaseHandle): Promise<void> {
    const entry = this.#projectLeases.get(handle);
    if (entry === undefined) return;
    this.#projectLeases.delete(handle);
    entry.leases.delete(handle);
    const closing = this.#closeUnusedProject(entry);
    this.#emit({ kind: "project.lease-closed", project: entry.id, lease: handle, invalidated: ["application"] });
    await closing;
  }

  async #closeUnusedProject(entry: ProjectEntry): Promise<void> {
    if (entry.leases.size > 0 || entry.sessions.size > 0 || !this.#projects.has(entry.key)) return;
    this.#projects.delete(entry.key);
    this.#projectsById.delete(entry.id);
    const closing = entry.host.close().finally(() => {
      if (this.#closingProjects.get(entry.key) === closing) this.#closingProjects.delete(entry.key);
    });
    this.#closingProjects.set(entry.key, closing);
    await closing;
  }

  project(handle: ApplicationProjectLeaseHandle): ProjectHost {
    const project = this.#projectLeases.get(handle);
    if (project === undefined) throw new Error(`Application Project lease ${handle} is not open.`);
    return project.host;
  }

  async launchProduct<Session extends ApplicationProductSession = ApplicationProductSession>(input: {
    readonly project: ApplicationProjectLeaseHandle;
    readonly product: string;
    readonly input: unknown;
    readonly browser?: boolean;
  }): Promise<ApplicationProductSessionLease<Session>> {
    this.#assertOpen();
    const project = this.#projectLeases.get(input.project);
    if (project === undefined) throw new Error(`Application Project lease ${input.project} is not open.`);
    const provider = this.#products.get(input.product);
    if (provider === undefined) throw new Error(`Application Product Provider ${input.product} is not registered.`);
    const session = await provider.open(project.host, input.input);
    if (session === null || typeof session !== "object" || typeof session.close !== "function") {
      throw new Error(`Application Product Provider ${input.product} returned an invalid session.`);
    }
    if (this.#closed) {
      await session.close();
      throw new Error("ApplicationHost closed while opening a Product Session.");
    }
    if (!this.#projectsById.has(project.id)) {
      await session.close();
      throw new Error("Application Project closed while opening a Product Session.");
    }
    const handle = `session_${randomUUID()}`;
    const entry: SessionEntry = { handle, project, product: input.product, session,
      ...(input.browser ? { browser: { connections: 0 } } : {}) };
    this.#sessions.set(handle, entry);
    project.sessions.add(handle);
    this.#scheduleBrowserRelease(entry);
    this.#emit({ kind: "product.opened", project: project.id, session: handle, invalidated: ["application"] });
    let released = false;
    return {
      handle,
      project: project.id,
      product: input.product,
      session: session as Session,
      close: async () => {
        if (released) return;
        released = true;
        await this.closeProduct(handle);
      },
    };
  }

  #scheduleBrowserRelease(entry: SessionEntry): void {
    const browser = entry.browser;
    if (browser === undefined || browser.connections !== 0 || browser.timer !== undefined || !this.#sessions.has(entry.handle)) return;
    browser.timer = setTimeout(() => {
      delete browser.timer;
      if (entry.session.retainWhenDisconnected?.()) this.#scheduleBrowserRelease(entry);
      else void this.closeProduct(entry.handle).catch(() => undefined);
    }, browserReconnectMs).unref();
  }

  /** Keep browser sessions available while a transport connection or request is open. */
  connectProduct(handle: ApplicationProductSessionHandle): () => void {
    const entry = this.#sessions.get(handle);
    if (entry === undefined) throw new Error(`Application Product Session ${handle} is not open.`);
    const browser = entry.browser;
    if (browser === undefined) return () => {};
    browser.connections += 1;
    if (browser.timer !== undefined) clearTimeout(browser.timer);
    delete browser.timer;
    let connected = true;
    return () => {
      if (!connected) return;
      connected = false;
      browser.connections -= 1;
      this.#scheduleBrowserRelease(entry);
    };
  }

  session<Session extends ApplicationProductSession = ApplicationProductSession>(
    handle: ApplicationProductSessionHandle,
  ): ApplicationProductSessionLease<Session> {
    const entry = this.#sessions.get(handle);
    if (entry === undefined) throw new Error(`Application Product Session ${handle} is not open.`);
    return {
      handle,
      project: entry.project.id,
      product: entry.product,
      session: entry.session as Session,
      close: async () => await this.closeProduct(handle),
    };
  }

  closeProduct(handle: ApplicationProductSessionHandle): Promise<void> {
    const entry = this.#sessions.get(handle);
    if (entry === undefined) return this.#closingSessions.get(handle) ?? Promise.resolve();
    entry.closing ??= (async () => {
      if (entry.browser?.timer !== undefined) clearTimeout(entry.browser.timer);
      this.#sessions.delete(handle);
      entry.project.sessions.delete(handle);
      const event = {
        kind: "product.closed", project: entry.project.id, session: handle, invalidated: ["application"],
      } as const;
      try {
        await entry.session.close();
      } finally {
        const closing = this.#closeUnusedProject(entry.project);
        this.#emit(event);
        await closing;
      }
    })().finally(() => this.#closingSessions.delete(handle));
    this.#closingSessions.set(handle, entry.closing);
    return entry.closing;
  }

  closeProductFromCaller(handle: ApplicationProductSessionHandle): Promise<void> {
    const entry = this.#sessions.get(handle);
    if (entry?.browser && entry.session.retainWhenDisconnected?.()) {
      throw new Error("Save or reload the open documents and let delivery finish or cancel it before closing this Session.");
    }
    return this.closeProduct(handle);
  }

  observe(): ApplicationProjection {
    return {
      products: [...this.#products.values()].map(({ product, title, launchParameters = [] }) => ({
        product,
        title,
        launchParameters: structuredClone(launchParameters),
      })),
      projects: [...this.#projects.values()].map((entry) => ({
        id: entry.id,
        name: entry.host.boundary.manifest.name,
        leases: entry.leases.size,
        sessions: [...entry.sessions],
      })),
      sessions: [...this.#sessions.values()].map((entry) => ({
        handle: entry.handle,
        project: entry.project.id,
        product: entry.product,
      })),
      execution: this.execution.observe(),
    };
  }

  close(): Promise<void> {
    this.#closePromise ??= (async () => {
      if (this.#closed) return;
      this.#closed = true;
      this.#listeners.clear();
      await Promise.allSettled(this.#openingProjects.values());
      const failures: unknown[] = [];
      const sessionResults = await Promise.allSettled([...this.#sessions.keys()].reverse()
        .map(async (handle) => await this.closeProduct(handle)));
      for (const result of sessionResults) if (result.status === "rejected") failures.push(result.reason);
      await Promise.allSettled(this.#closingSessions.values());
      this.#projectLeases.clear();
      for (const entry of this.#projects.values()) entry.leases.clear();
      const projectResults = await Promise.allSettled([...this.#projects.values()].reverse()
        .map(async (entry) => await this.#closeUnusedProject(entry)));
      for (const result of projectResults) if (result.status === "rejected") failures.push(result.reason);
      await Promise.allSettled(this.#closingProjects.values());
      if (this.#closeExecution) await this.execution.close().catch((error) => failures.push(error));
      if (failures.length > 0) throw failures[0];
    })();
    return this.#closePromise;
  }
}

export function openApplicationHost(options: OpenApplicationHostOptions): ApplicationHost {
  return new ApplicationHost(options);
}
