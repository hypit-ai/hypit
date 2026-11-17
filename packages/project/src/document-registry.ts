function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function ownerKind(value: string): void {
  assert(/^[a-z][a-z0-9.-]{0,191}$/u.test(value), "Project owner kind is invalid.");
}

export function assertProjectRelativePath(value: string, label = "Project document path"): void {
  assert(value.length > 0 && !value.includes("\\") && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value),
    `${label} must be a portable project-relative path.`);
  assert(value.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."),
    `${label} contains an invalid path segment.`);
}

export type ProjectOwnerProvider<Service, Context> = {
  readonly owner: string;
  open(context: Context, path: string): Service | Promise<Service>;
  close(service: Service): void | Promise<void>;
};

export type ProjectDocumentLease<Service> = {
  readonly owner: string;
  readonly path: string;
  readonly service: Service;
  close(): void;
};

export type OpenProjectDocumentObservation = {
  readonly owner: string;
  readonly path: string;
  readonly leases: number;
};

type Entry<Context> = {
  readonly provider: ProjectOwnerProvider<unknown, Context>;
  readonly service: unknown;
  leases: number;
};

export class ProjectDocumentRegistry<Context> {
  readonly #context: Context;
  readonly #entries = new Map<string, Entry<Context>>();
  readonly #opening = new Map<string, Promise<Entry<Context>>>();
  #closed = false;

  constructor(context: Context) {
    this.#context = context;
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("Project document registry is closed.");
  }

  async open<Service>(
    provider: ProjectOwnerProvider<Service, Context>,
    path: string,
  ): Promise<ProjectDocumentLease<Service>> {
    this.#assertOpen();
    ownerKind(provider.owner);
    assertProjectRelativePath(path);
    const key = `${provider.owner}\u0000${path}`;
    let entry = this.#entries.get(key);
    if (entry === undefined) {
      let opening = this.#opening.get(key);
      if (opening === undefined) {
        const providerForEntry = provider as ProjectOwnerProvider<unknown, Context>;
        opening = Promise.resolve(provider.open(this.#context, path)).then(async (service) => {
          if (this.#closed) {
            await provider.close(service);
            throw new Error("Project document registry closed while opening a document.");
          }
          const created: Entry<Context> = { provider: providerForEntry, service, leases: 0 };
          this.#entries.set(key, created);
          return created;
        }).finally(() => this.#opening.delete(key));
        this.#opening.set(key, opening);
      }
      entry = await opening;
    }
    assert(entry.provider === provider,
      `Project document ${provider.owner}:${path} is already open with another provider instance.`);
    entry.leases += 1;
    let released = false;
    return {
      owner: provider.owner,
      path,
      service: entry.service as Service,
      close: () => {
        if (released) return;
        released = true;
        entry!.leases -= 1;
      },
    };
  }

  observe(): readonly OpenProjectDocumentObservation[] {
    return [...this.#entries.entries()].map(([key, entry]) => {
      const separator = key.indexOf("\u0000");
      return { owner: key.slice(0, separator), path: key.slice(separator + 1), leases: entry.leases };
    });
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await Promise.allSettled(this.#opening.values());
    const entries = [...this.#entries.values()].reverse();
    this.#entries.clear();
    const results = await Promise.allSettled(entries.map(async (entry) => await entry.provider.close(entry.service)));
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure !== undefined) throw failure.reason;
  }
}
