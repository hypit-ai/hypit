import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  findNodeHypitApplicationEndpoint, waitForLocalApplication,
  type NodeHypitApplicationEndpoint, type NodeHypitApplicationEndpointOptions,
} from "../application-endpoint.js";

export class LocalHostError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly subject?: unknown) { super(message); }
}

export class LocalHostClient {
  constructor(readonly endpoint: NodeHypitApplicationEndpoint) {}

  async request<Result>(path: string, options: { readonly method?: string; readonly body?: unknown; readonly signal?: AbortSignal } = {}): Promise<Result> {
    const url = new URL(path, this.endpoint.origin);
    if (url.origin !== this.endpoint.origin) throw new Error("The Host returned a URL outside its local origin.");
    const response = await fetch(url, {
      method: options.method ?? "GET", redirect: "error",
      headers: { authorization: `Bearer ${this.endpoint.token}`, ...(options.body === undefined ? {} : { "content-type": "application/json" }) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (response.status === 204) return undefined as Result;
    const value: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message = typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : undefined;
      const body = typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
      throw new LocalHostError(message ?? `Hypit Host returned HTTP ${response.status}.`, response.status,
        typeof body?.code === "string" ? body.code : undefined, body?.subject);
    }
    return value as Result;
  }

  async openProject(root: string, signal: AbortSignal) {
    return await this.request<{ readonly handle: string; readonly project: string }>("/api/application/projects",
      { method: "POST", body: { root }, signal });
  }

  async closeProject(handle: string) {
    await this.request(`/api/application/project-leases/${encodeURIComponent(handle)}`, { method: "DELETE" });
  }
}

export async function connectLocalHost(options: NodeHypitApplicationEndpointOptions, signal: AbortSignal): Promise<LocalHostClient> {
  const found = await findNodeHypitApplicationEndpoint(options);
  if (found !== undefined) return new LocalHostClient(found);
  const entry = fileURLToPath(new URL("../cli.js", import.meta.url));
  const child = spawn(process.execPath, [entry, "host", "start", ...(options.path === undefined ? [] : ["--endpoint-file", options.path])],
    { detached: true, stdio: "ignore", windowsHide: true });
  const failed = new Promise<never>((_resolve, reject) => { child.once("error", reject); });
  child.unref();
  return new LocalHostClient(await Promise.race([failed, waitForLocalApplication(options, signal)]));
}
