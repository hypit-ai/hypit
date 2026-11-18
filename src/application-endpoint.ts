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
    if (selected.origin !== origin.origin || origin.protocol !== "http:"
      || (origin.hostname !== "127.0.0.1" && origin.hostname !== "[::1]")) {
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

export async function waitForLocalApplication(options: NodeHypitApplicationEndpointOptions, signal?: AbortSignal) {
  const deadline = Date.now() + 8_000;
  do {
    signal?.throwIfAborted();
    const endpoint = await findNodeHypitApplicationEndpoint(options);
    if (endpoint !== undefined) return endpoint;
    await delay(100, undefined, { signal });
  } while (Date.now() < deadline);
  throw new Error("Hypit Host did not become ready. Run hypit host start in the foreground to see its diagnostic.");
}

export async function reserveNodeHypitApplicationEndpoint(
  options: NodeHypitApplicationEndpointOptions = {},
) {
  const path = nodeHypitApplicationEndpointPath(options);
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
  let published: NodeHypitApplicationEndpoint | undefined;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      const current = await readEndpointFile(path);
      if (published !== undefined && current?.instance === published.instance) await unlink(path);
    } finally {
      lock.close();
    }
  };
  return {
    close,
    async publish(address: NodeApplicationServerAddress): Promise<NodeHypitApplicationEndpointLease> {
      if (closed || published !== undefined) throw new Error("Application endpoint publication is unavailable.");
      const value: NodeHypitApplicationEndpoint = { format: "hypit.application-endpoint", ...address, process: process.pid };
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

export async function publishNodeHypitApplicationEndpoint(
  address: NodeApplicationServerAddress,
  options: NodeHypitApplicationEndpointOptions = {},
): Promise<NodeHypitApplicationEndpointLease> {
  const reservation = await reserveNodeHypitApplicationEndpoint(options);
  if (reservation === undefined) throw new Error("Hypit Application is already starting or running.");
  try { return await reservation.publish(address); }
  catch (error) { await reservation.close(); throw error; }
}
