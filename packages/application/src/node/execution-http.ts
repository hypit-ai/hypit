import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type { ExecutionResourceSource, InvocationRequest, QuoteInputs } from "@hypit/execution";
import type { ApplicationHost } from "../index.js";

type Reply = { readonly status: number; readonly value: unknown };

function record(value: unknown, fields?: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || (fields !== undefined && Object.keys(value).some(key => !fields.includes(key)))) {
    throw new Error("Invalid Execution request.");
  }
  return value as Record<string, unknown>;
}

async function localInputs(value: unknown) {
  if (value === undefined) return [];
  return await Promise.all(Object.entries(record(value)).map(async ([name, raw]) => {
    const { path, mediaType, durationSeconds } = record(raw, ["path", "mediaType", "durationSeconds"]);
    if (typeof path !== "string" || !isAbsolute(path) || typeof mediaType !== "string" || !mediaType.includes("/")
      || (durationSeconds !== undefined && (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds <= 0))) {
      throw new Error(`Invalid local Execution input ${name}.`);
    }
    const info = await stat(path);
    if (!info.isFile()) throw new Error(`Execution input ${name} must be a regular file.`);
    return { name, path, mediaType, size: info.size, ...(durationSeconds === undefined ? {} : { durationSeconds }) };
  }));
}

export async function executionHttp(
  application: ApplicationHost, url: URL, method: string | undefined, body: () => Promise<unknown>, signal: AbortSignal,
): Promise<Reply> {
  const [idPath, operation, detail, action, ...extra] = url.pathname.slice("/api/application/execution/".length).split("/");
  if (!idPath || extra.length > 0) return { status: 404, value: { error: "Unknown Execution route." } };
  const id = decodeURIComponent(idPath);
  const environment = application.execution.environment(id);
  if (environment === undefined) return { status: 404, value: { error: `Unknown Execution Environment ${id}.` } };
  const local = environment.local;

  if (operation === "auth") {
    const auth = local?.authorization;
    if (auth === undefined) throw new Error(`Environment ${id} does not expose account authorization.`);
    if (detail === undefined && method === "GET") return { status: 200, value: await auth.status() };
    if (detail === undefined && method === "DELETE") {
      await auth.disconnect();
      return { status: 200, value: await auth.status() };
    }
    if (detail === "attempt" && action === undefined && method === "POST") {
      const { manual } = record(await body(), ["manual"]);
      if (typeof manual !== "boolean") throw new Error("Authorization requires a manual mode selection.");
      return { status: 201, value: await auth.begin(manual) };
    }
    if (detail === "attempt" && action !== undefined) {
      const attempt = decodeURIComponent(action);
      if (method === "GET") return { status: 200, value: auth.observe(attempt) };
      if (method === "DELETE") {
        auth.cancel(attempt);
        return { status: 200, value: auth.observe(attempt) };
      }
      if (method === "POST") {
        const { proof } = record(await body(), ["proof"]);
        if (typeof proof !== "string" || proof.length > 2048) throw new Error("Invalid authorization proof.");
        return { status: 200, value: await auth.complete(attempt, proof) };
      }
    }
    return { status: 404, value: { error: "Unknown Execution authorization route." } };
  }

  if (operation === "doctor" && detail === undefined && method === "GET") {
    if (local?.doctor === undefined) throw new Error(`Environment ${id} does not expose diagnostics.`);
    return { status: 200, value: { environment: environment.projection,
      findings: await local.doctor(url.searchParams.get("capability") ?? undefined, signal) } };
  }

  const project = url.searchParams.get("project");
  const lease = project === null ? local?.connect() : undefined;
  const client = project === null ? lease?.client : application.project(project).executionClient(id)?.client;
  if (client === undefined) throw new Error(`Environment ${id} is unavailable to this caller.`);
  try {
    if (operation === "capabilities" && detail === undefined && method === "GET") {
      return { status: 200, value: client.capabilities() };
    }
    if ((operation === "quote" || operation === "invocations") && detail === undefined && method === "POST") {
      const payload = record(await body(), ["request", "inputs"]);
      const request = record(payload.request, ["capability", "input", "endpoint"]) as InvocationRequest;
      const files = await localInputs(payload.inputs);
      if (operation === "quote") {
        const inputs: QuoteInputs = Object.fromEntries(files.map(({ name, mediaType, size, durationSeconds }) =>
          [name, { mediaType, size, ...(durationSeconds === undefined ? {} : { durationSeconds }) }]));
        return { status: 200, value: await client.quote(request, { inputs, signal }) };
      }
      const inputs: Readonly<Record<string, ExecutionResourceSource>> = Object.fromEntries(files.map(({ name, path, mediaType, size }) =>
        [name, { mediaType, size, bytes: (async function* () { yield* createReadStream(path, { signal }); })() }]));
      return { status: 202, value: await client.start(request, { inputs, signal }) };
    }
    if (operation === "invocations" && detail !== undefined) {
      const address = { environment: id, invocation: decodeURIComponent(detail) };
      if (action === "cancel" && method === "POST") return { status: 200, value: await client.cancel(address) };
      if ((action === "publication" || action === undefined) && method === "GET") {
        const result = action === "publication" ? await client.publication(address) : await client.get(address);
        return result === undefined ? { status: 404, value: { error: "Requested Invocation or Publication is unavailable." } }
          : { status: 200, value: result };
      }
    }
    return { status: 404, value: { error: "Unknown Execution route." } };
  } finally {
    await lease?.close();
  }
}
