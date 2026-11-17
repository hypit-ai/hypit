import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { NodeApplicationServerAddress } from "@hypit/application/node";

export type NodeHypitApplicationEndpoint = {
  readonly format: "hypit.application-endpoint";
  readonly instance: string;
  readonly origin: string;
  readonly token: string;
  readonly home?: string;
  readonly process: number;
};

export type NodeHypitApplicationEndpointOptions = {
  readonly path?: string;
};

export type NodeHypitApplicationEndpointLease = {
  readonly endpoint: NodeHypitApplicationEndpoint;
  readonly path: string;
  close(): Promise<void>;
};

type EndpointLockOwner = {
  readonly instance: string;
  readonly process: number;
};

function defaultStateDirectory(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Hypit", "runtime");
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA;
    return join(local === undefined || local.length === 0 ? homedir() : local, "Hypit", "runtime");
  }
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (runtime !== undefined && runtime.length > 0) return join(runtime, "hypit");
  return join(homedir(), ".local", "state", "hypit", "runtime");
}

export function nodeHypitApplicationEndpointPath(
  options: NodeHypitApplicationEndpointOptions = {},
): string {
  return options.path ?? join(defaultStateDirectory(), "application.json");
}

function endpoint(value: unknown): NodeHypitApplicationEndpoint | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const selected = value as Partial<NodeHypitApplicationEndpoint>;
  if (selected.format !== "hypit.application-endpoint"
    || typeof selected.instance !== "string"
    || typeof selected.origin !== "string"
    || typeof selected.token !== "string"
    || !Number.isSafeInteger(selected.process)
    || (selected.home !== undefined && typeof selected.home !== "string")) return undefined;
  try {
    const origin = new URL(selected.origin);
    if (origin.protocol !== "http:" || (origin.hostname !== "127.0.0.1" && origin.hostname !== "[::1]")) {
      return undefined;
    }
    if (selected.home !== undefined && new URL(selected.home).origin !== origin.origin) return undefined;
  } catch {
    return undefined;
  }
  return selected as NodeHypitApplicationEndpoint;
}

async function readEndpointFile(path: string): Promise<NodeHypitApplicationEndpoint | undefined> {
  try {
    return endpoint(JSON.parse(await readFile(path, "utf8")) as unknown);
  } catch {
    return undefined;
  }
}

async function endpointIsLive(value: NodeHypitApplicationEndpoint): Promise<boolean> {
  try {
    const response = await fetch(new URL("/", value.origin), {
      signal: AbortSignal.timeout(800),
      redirect: "error",
    });
    if (!response.ok) return false;
    const observation = await response.json() as { service?: unknown; instance?: unknown };
    return observation.service === "hypit.application" && observation.instance === value.instance;
  } catch {
    return false;
  }
}

export async function findNodeHypitApplicationEndpoint(
  options: NodeHypitApplicationEndpointOptions = {},
): Promise<NodeHypitApplicationEndpoint | undefined> {
  const found = await readEndpointFile(nodeHypitApplicationEndpointPath(options));
  return found !== undefined && await endpointIsLive(found) ? found : undefined;
}

function processIsAlive(identifier: number): boolean {
  try {
    process.kill(identifier, 0);
    return true;
  } catch (error) {
    return error !== null && typeof error === "object" && (error as { code?: unknown }).code === "EPERM";
  }
}

async function lockOwner(path: string): Promise<EndpointLockOwner | undefined> {
  try {
    const value = JSON.parse(await readFile(join(path, "owner.json"), "utf8")) as Partial<EndpointLockOwner>;
    return typeof value.instance === "string" && Number.isSafeInteger(value.process)
      ? value as EndpointLockOwner
      : undefined;
  } catch {
    return undefined;
  }
}

async function clearLock(path: string, instance?: string): Promise<void> {
  const owner = await lockOwner(path);
  if (instance !== undefined && owner?.instance !== instance) return;
  await unlink(join(path, "owner.json")).catch(() => undefined);
  await rmdir(path).catch(() => undefined);
}

async function acquireLock(path: string, owner: EndpointLockOwner): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if (error === null || typeof error !== "object" || (error as { code?: unknown }).code !== "EEXIST") throw error;
    const selected = await lockOwner(path);
    if (selected !== undefined && processIsAlive(selected.process)) {
      throw new Error(`Hypit Application ${selected.instance} is already starting or running.`);
    }
    await clearLock(path);
    await mkdir(path, { mode: 0o700 });
  }
  try {
    await writeFile(join(path, "owner.json"), `${JSON.stringify(owner)}\n`, { mode: 0o600, flag: "wx" });
  } catch (error) {
    await rmdir(path).catch(() => undefined);
    throw error;
  }
}

export async function publishNodeHypitApplicationEndpoint(
  address: NodeApplicationServerAddress,
  options: NodeHypitApplicationEndpointOptions = {},
): Promise<NodeHypitApplicationEndpointLease> {
  const path = nodeHypitApplicationEndpointPath(options);
  const directory = dirname(path);
  const lock = `${path}.lock`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const owner = { instance: address.instance, process: process.pid } satisfies EndpointLockOwner;
  await acquireLock(lock, owner);
  const value: NodeHypitApplicationEndpoint = {
    format: "hypit.application-endpoint",
    instance: address.instance,
    origin: address.origin,
    token: address.token,
    ...(address.home === undefined ? {} : { home: address.home }),
    process: process.pid,
  };
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    await clearLock(lock, address.instance);
    throw error;
  }
  let closed = false;
  return {
    endpoint: value,
    path,
    close: async () => {
      if (closed) return;
      closed = true;
      const current = await readEndpointFile(path);
      if (current?.instance === address.instance) await unlink(path).catch(() => undefined);
      await clearLock(lock, address.instance);
    },
  };
}
