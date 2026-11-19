import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ExecutionAuthorizationAttempt, ExecutionAuthorizationStatus, NodeExecutionHostClient } from "@hypit/execution/node";
import type { InvocationObservation, JsonValue } from "@hypit/execution";
import { readJsonInput, writeNewFile, type CliResult } from "./io.js";
import { openBrowser, readProof } from "./terminal.js";

export async function authCommand(
  host: NodeExecutionHostClient, action: string, options: { readonly environment?: string; readonly manual?: boolean; readonly noOpen?: boolean },
  signal: AbortSignal,
): Promise<CliResult> {
  const path = `${host.path(await host.selectEnvironment(options.environment, signal))}/auth`;
  if (action !== "login") {
    const status = await host.request<ExecutionAuthorizationStatus>(path, { method: action === "logout" ? "DELETE" : "GET", signal });
    return { value: status, text: status.status };
  }

  const current = await host.request<ExecutionAuthorizationStatus>(path, { signal });
  if (current.status === "connected" || current.status === "needs-refresh") {
    return { value: current, text: current.status };
  }
  if (current.status === "reconnect") await host.request(path, { method: "DELETE", signal });
  let attempt = await host.request<ExecutionAuthorizationAttempt>(path + "/attempt",
    { method: "POST", body: { manual: options.manual === true }, signal });
  const attemptPath = path + `/attempt/${encodeURIComponent(attempt.id)}`;
  const input = new AbortController();
  try {
    process.stderr.write(`Open this URL to authorize HypiHub:\n${attempt.authorizationUrl}\n`);
    if (!options.noOpen) openBrowser(attempt.authorizationUrl);
    let proof = readProof(AbortSignal.any([signal, input.signal])).then(
      value => ({ value }), error => ({ error }));
    while (attempt.state === "pending") {
      const update = await Promise.race([proof, delay(400, undefined, { signal })]);
      if (update !== undefined && "error" in update) throw update.error;
      if (update !== undefined) {
        if (update.value) {
          attempt = await host.request<ExecutionAuthorizationAttempt>(attemptPath,
            { method: "POST", body: { proof: update.value }, signal });
          continue;
        }
        if (options.manual) throw new Error("Manual authorization requires code#state on stdin.");
        proof = new Promise(() => {});
      }
      attempt = await host.request<ExecutionAuthorizationAttempt>(attemptPath, { signal });
    }
    if (attempt.state === "failed") throw new Error(attempt.error);
    return { value: attempt.connection, text: attempt.connection.status };
  } finally {
    input.abort();
    if (attempt.state === "pending") await host.request(attemptPath, { method: "DELETE", signal: AbortSignal.timeout(2_000) }).catch(() => undefined);
  }
}

async function resourceMap(path: string) {
  const value = await readJsonInput(path);
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Resource input must be a JSON object.");
  const base = path === "-" ? process.cwd() : dirname(resolve(path));
  return await Promise.all(Object.entries(value).map(async ([name, raw]) => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)
      || Object.keys(raw).some(key => !["path", "mediaType", "durationSeconds"].includes(key))
      || typeof raw.path !== "string" || typeof raw.mediaType !== "string" || !raw.mediaType.includes("/")
      || (raw.durationSeconds !== undefined && (typeof raw.durationSeconds !== "number"
        || !Number.isFinite(raw.durationSeconds) || raw.durationSeconds <= 0))) {
      throw new Error(`Resource ${name} requires a file path and media type, with an optional positive duration.`);
    }
    const file = resolve(base, raw.path);
    const info = await stat(file);
    if (!info.isFile()) throw new Error(`Resource ${name} must be a regular file.`);
    return { name, file, mediaType: raw.mediaType, size: info.size,
      ...(raw.durationSeconds === undefined ? {} : { durationSeconds: raw.durationSeconds as number }) };
  }));
}

export async function executionCommand(
  host: NodeExecutionHostClient, action: string, subject: string | undefined,
  options: { readonly environment?: string; readonly endpoint?: string; readonly input?: string; readonly resources?: string;
    readonly invocation?: string; readonly output?: string; readonly resource?: string; readonly to?: string; readonly progress: boolean },
  signal: AbortSignal,
): Promise<CliResult> {
  const environment = await host.environment(await host.selectEnvironment(options.environment, signal), signal);
  const lease = environment.connect();
  try {
    const { client } = lease;
    if (action === "doctor") {
      const findings = await environment.doctor!(subject, signal);
      return { value: { environment: environment.projection, findings },
        text: findings.map(({ severity, code, message }) => `${severity} ${code}  ${message}`).join("\n"),
        failed: findings.some(finding => finding.severity === "error") };
    }
    if (action === "capabilities") return { value: client.capabilities() };
    if (action === "quote" || action === "submit") {
      if (subject === undefined || options.input === undefined) throw new Error(`execution ${action} requires a Capability and --input.`);
      if (options.input === "-" && options.resources === "-") throw new Error("Choose a file for either --input or --resources.");
      const request = { capability: subject, input: await readJsonInput(options.input) as JsonValue,
        ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }) };
      const files = options.resources === undefined ? [] : await resourceMap(options.resources);
      if (action === "quote") {
        const inputs = Object.fromEntries(files.map(({ name, mediaType, size, durationSeconds }) =>
          [name, { mediaType, size, ...(durationSeconds === undefined ? {} : { durationSeconds }) }]));
        const result = await client.quote(request, { inputs, signal });
        const text = result.kind === "estimate" ? `${result.model}  ${result.estimatedCredits} credits  USD ${result.estimatedUSD}`
          : result.kind === "unavailable" ? result.reason
            : `${result.model}\nMissing metering inputs: ${result.missing.join(", ")}\n${JSON.stringify(result.pricing, null, 2)}`;
        return { value: result, text, failed: result.kind === "unavailable" };
      }
      const inputs = Object.fromEntries(files.map(({ name, mediaType, size, file }) => [name,
        { mediaType, size, bytes: (async function* () { yield* createReadStream(file, { signal }); })() }]));
      return { value: await client.start(request, { inputs, signal,
        ...(options.invocation === undefined ? {} : { invocation: options.invocation }) }) };
    }

    if (subject === undefined) throw new Error(`execution ${action} requires an Invocation id.`);
    const address = { environment: client.environment, invocation: subject };
    if (action === "cancel") return { value: await client.cancel(address) };
    if (action === "publication") {
      const publication = await client.publication(address);
      if (publication === undefined) throw new Error("Requested Publication is unavailable.");
      return { value: publication };
    }
    if (action === "resource") {
      if (options.output === undefined || options.resource === undefined || options.to === undefined) {
        throw new Error("execution resource requires --output, --resource and --to.");
      }
      const destination = resolve(options.to);
      const source = await client.openResource(address, options.output, options.resource);
      await writeNewFile(destination, source.bytes, signal);
      return { value: { path: destination }, text: destination };
    }
    let observation: InvocationObservation;
    let previous: string | undefined;
    do {
      const current = await client.get(address);
      if (current === undefined) throw new Error(`Unknown Invocation ${address.invocation}.`);
      observation = current;
      if (action === "inspect" || ["complete", "failed", "cancelled"].includes(observation.phase)) break;
      const progress = observation.progress ?? observation.phase;
      if (options.progress && progress !== previous) process.stderr.write(progress + "\n");
      previous = progress;
      await delay(500, undefined, { signal });
    } while (true);
    return { value: observation, failed: action === "wait" && observation.phase !== "complete" };
  } finally {
    await lease.close();
    await environment.close();
  }
}
