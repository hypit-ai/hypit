import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { nodeHypitDataRoot } from "./node-data-root.js";

export type LocalService = "application" | "execution";
export type LocalServiceEndpoint<Service extends LocalService = LocalService> = {
  readonly format: `hypit.${Service}-endpoint`;
  readonly instance: string;
  readonly origin: string;
  readonly token: string;
  readonly home?: string;
  readonly process: number;
};

export type LocalServiceEndpointOptions = {
  readonly path?: string;
};

export type LocalServiceEndpointLease<Service extends LocalService = LocalService> = {
  readonly endpoint: LocalServiceEndpoint<Service>;
  readonly path: string;
  close(): Promise<void>;
};

function defaultStateDirectory(): string {
  if (process.platform === "darwin" || process.platform === "win32") return join(nodeHypitDataRoot(), "runtime");
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (runtime !== undefined && runtime.length > 0) return join(runtime, "hypit");
  return join(homedir(), ".local", "state", "hypit", "runtime");
}

export function localServiceEndpointPath(
  service: LocalService, options: LocalServiceEndpointOptions = {},
): string {
  return options.path ?? join(defaultStateDirectory(), service + ".json");
}

function endpoint<Service extends LocalService>(value: unknown, service: Service): LocalServiceEndpoint<Service> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const selected = value as Partial<LocalServiceEndpoint<Service>>;
  if (selected.format !== `hypit.${service}-endpoint`
    || typeof selected.instance !== "string"
    || typeof selected.origin !== "string"
    || typeof selected.token !== "string"
    || !Number.isSafeInteger(selected.process)
    || (selected.home !== undefined && typeof selected.home !== "string")) return undefined;
  try {
    const origin = new URL(selected.origin);
    if (selected.origin !== origin.origin || origin.protocol !== "http:"
      || (origin.hostname !== "127.0.0.1" && origin.hostname !== "[::1]")) {
      return undefined;
    }
    if (selected.home !== undefined && new URL(selected.home).origin !== origin.origin) return undefined;
  } catch {
    return undefined;
  }
  return selected as LocalServiceEndpoint<Service>;
}

async function readEndpointFile<Service extends LocalService>(path: string, service: Service): Promise<LocalServiceEndpoint<Service> | undefined> {
  try {
    return endpoint(JSON.parse(await readFile(path, "utf8")) as unknown, service);
  } catch {
    return undefined;
  }
}

export function readLocalServiceEndpoint<Service extends LocalService>(service: Service, options: LocalServiceEndpointOptions = {}) {
  return readEndpointFile(localServiceEndpointPath(service, options), service);
}

async function endpointIsLive(value: LocalServiceEndpoint, service: LocalService): Promise<boolean> {
  try {
    const response = await fetch(new URL("/", value.origin), {
      signal: AbortSignal.timeout(800),
      redirect: "error",
    });
    if (!response.ok) return false;
    const observation = await response.json() as { service?: unknown; instance?: unknown };
    return observation.service === `hypit.${service}` && observation.instance === value.instance;
  } catch {
    return false;
  }
}

export async function findLocalServiceEndpoint<Service extends LocalService>(
  service: Service, options: LocalServiceEndpointOptions = {},
): Promise<LocalServiceEndpoint<Service> | undefined> {
  const found = await readLocalServiceEndpoint(service, options);
  return found !== undefined && await endpointIsLive(found, service) ? found : undefined;
}

export async function waitForLocalService<Service extends LocalService>(service: Service, options: LocalServiceEndpointOptions, signal?: AbortSignal) {
  const deadline = Date.now() + 8_000;
  do {
    signal?.throwIfAborted();
    const endpoint = await findLocalServiceEndpoint(service, options);
    if (endpoint !== undefined) return endpoint;
    await delay(100, undefined, { signal });
  } while (Date.now() < deadline);
  throw new Error(`Hypit ${service} did not become ready. Run hypit ${service === "application" ? "host" : "execution"} start in the foreground.`);
}

export async function reserveLocalServiceEndpoint<Service extends LocalService>(
  service: Service, options: LocalServiceEndpointOptions = {},
) {
  const path = localServiceEndpointPath(service, options);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const { DatabaseSync } = await import("node:sqlite");
  let lock;
  try {
    lock = new DatabaseSync(`${path}.sqlite`);
    lock.exec("BEGIN EXCLUSIVE");
  } catch (error) {
    lock?.close();
    if (typeof error === "object" && error !== null && "errcode" in error && error.errcode === 5) return undefined;
    throw error;
  }
  let published: LocalServiceEndpoint<Service> | undefined;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      const current = await readEndpointFile(path, service);
      if (published !== undefined && current?.instance === published.instance) await unlink(path);
    } finally {
      lock.close();
    }
  };
  return {
    close,
    async publish(address: Omit<LocalServiceEndpoint, "format" | "process">): Promise<LocalServiceEndpointLease<Service>> {
      if (closed || published !== undefined) throw new Error(`Hypit ${service} endpoint publication is unavailable.`);
      const value: LocalServiceEndpoint<Service> = { format: `hypit.${service}-endpoint`, ...address, process: process.pid };
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: "wx" });
        await rename(temporary, path);
        published = value;
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
      return { endpoint: value, path, close };
    },
  };
}
