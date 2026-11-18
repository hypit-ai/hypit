import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ApplicationAuthorizationAttempt, ApplicationAuthorizationStatus } from "@hypit/application";
import type { ExecutionFinding, ExecutionQuote, InvocationObservation } from "@hypit/execution";
import type { LocalHostClient } from "./client.js";
import { openBrowser, readProof } from "./terminal.js";

export async function readJsonInput(path: string): Promise<unknown> {
  try {
    if (path !== "-") return JSON.parse(await readFile(path, "utf8"));
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const value of process.stdin) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      length += chunk.length;
      if (length > 1024 * 1024) throw new Error("Input exceeds one megabyte.");
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  catch { throw new Error(`Could not read JSON input from ${path === "-" ? "stdin" : path}.`); }
}

export type CliResult = { readonly value: unknown; readonly text?: string; readonly failed?: boolean };

function executionPath(id: string) {
  return `/api/application/execution/${encodeURIComponent(id)}`;
}

export async function authCommand(
  host: LocalHostClient, action: string, options: { readonly environment: string; readonly manual?: boolean; readonly noOpen?: boolean },
  signal: AbortSignal,
): Promise<CliResult> {
  const path = `${executionPath(options.environment)}/auth`;
  if (action !== "login") {
    const status = await host.request<ApplicationAuthorizationStatus>(path, { method: action === "logout" ? "DELETE" : "GET", signal });
    return { value: status, text: status.status };
  }

  const current = await host.request<ApplicationAuthorizationStatus>(path, { signal });
  if (current.status === "connected" || current.status === "needs-refresh") {
    return { value: current, text: current.status };
  }
  if (current.status === "reconnect") await host.request(path, { method: "DELETE", signal });
  let attempt = await host.request<ApplicationAuthorizationAttempt>(path + "/attempt",
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
          attempt = await host.request<ApplicationAuthorizationAttempt>(attemptPath,
            { method: "POST", body: { proof: update.value }, signal });
          continue;
        }
        if (options.manual) throw new Error("Manual authorization requires code#state on stdin.");
        proof = new Promise(() => {});
      }
      attempt = await host.request<ApplicationAuthorizationAttempt>(attemptPath, { signal });
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
  return Object.fromEntries(Object.entries(value).map(([name, raw]) => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw) || typeof raw.path !== "string") {
      throw new Error(`Resource ${name} requires a file path.`);
    }
    return [name, { ...raw, path: resolve(base, raw.path) }];
  }));
}

export async function executionCommand(
  host: LocalHostClient, action: string, subject: string | undefined,
  options: { readonly environment: string; readonly project?: string; readonly endpoint?: string;
    readonly input?: string; readonly resources?: string; readonly progress: boolean },
  signal: AbortSignal,
): Promise<CliResult> {
  const path = executionPath(options.environment);
  if (action === "doctor") {
    const query = subject === undefined ? "" : `?capability=${encodeURIComponent(subject)}`;
    const report = await host.request<{ readonly findings: readonly ExecutionFinding[] }>(path + "/doctor" + query, { signal });
    return { value: report, text: report.findings.map(({ severity, code, message }) => `${severity} ${code}  ${message}`).join("\n"),
      failed: report.findings.some(finding => finding.severity === "error") };
  }
  const project = options.project === undefined ? undefined : await host.openProject(options.project, signal);
  const url = (route: string) => path + route + (project === undefined ? "" : `?project=${encodeURIComponent(project.handle)}`);
  try {
    if (action === "capabilities") return { value: await host.request(url("/capabilities"), { signal }) };
    if (action === "quote" || action === "submit") {
      if (subject === undefined || options.input === undefined) throw new Error(`execution ${action} requires a Capability and --input.`);
      if (options.input === "-" && options.resources === "-") throw new Error("Choose a file for either --input or --resources.");
      const request = { capability: subject, input: await readJsonInput(options.input),
        ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }) };
      const body = { request, ...(options.resources === undefined ? {} : { inputs: await resourceMap(options.resources) }) };
      const requestOptions = { method: "POST", body, signal };
      if (action === "quote") {
        const result = await host.request<ExecutionQuote>(url("/quote"), requestOptions);
        const text = result.kind === "estimate" ? `${result.model}  ${result.estimatedCredits} credits  USD ${result.estimatedUSD}`
          : result.kind === "unavailable" ? result.reason
            : `${result.model}\nMissing metering inputs: ${result.missing.join(", ")}\n${JSON.stringify(result.pricing, null, 2)}`;
        return { value: result, text, failed: result.kind === "unavailable" };
      }
      return { value: await host.request(url("/invocations"), requestOptions) };
    }

    if (subject === undefined) throw new Error(`execution ${action} requires an Invocation id.`);
    const address = `/invocations/${encodeURIComponent(subject)}`;
    if (action === "cancel") return { value: await host.request(url(address + "/cancel"), { method: "POST", signal }) };
    if (action === "publication") return { value: await host.request(url(address + "/publication"), { signal }) };
    let observation: InvocationObservation;
    let previous: string | undefined;
    do {
      observation = await host.request<InvocationObservation>(url(address), { signal });
      if (action === "inspect" || ["complete", "failed", "cancelled"].includes(observation.phase)) break;
      const progress = observation.progress ?? observation.phase;
      if (options.progress && progress !== previous) process.stderr.write(progress + "\n");
      previous = progress;
      await delay(500, undefined, { signal });
    } while (true);
    return { value: observation, failed: action === "wait" && observation.phase !== "complete" };
  } finally {
    if (project !== undefined) await host.closeProject(project.handle);
  }
}
