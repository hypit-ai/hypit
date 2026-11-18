#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { findNodeHypitApplicationEndpoint, nodeHypitApplicationEndpointPath } from "./application-endpoint.js";
import { connectLocalHost } from "./cli/client.js";
import { authCommand, executionCommand, type CliResult } from "./cli/execution.js";
import { nleCommand, projectRoot } from "./cli/nle.js";

const usage = `Usage: hypit <command> [options]

  host start|status
  project inspect [directory]
  auth status|login|logout [--environment <id>]
  execution capabilities|doctor [capability]
  execution quote|submit <capability> --input <file|-> [--resources <file>]
  execution inspect|wait|cancel|publication <invocation>
  nle open|inspect <file.svml> [--project <directory>] [--view <file>]
  nle export <file.svml> --to <project-relative.mp4> [--profile <file>]

Use --json for structured output and --endpoint-file for an explicitly selected local Host.
Use --help or --version without starting the Host.
`;

const common = {
  help: { type: "boolean", short: "h" },
  json: { type: "boolean" },
  "endpoint-file": { type: "string" },
} as const;

function argumentsFor(raw: string[], group: string, action: string) {
  const options = {
    ...common,
    ...(group === "host" && action === "start" ? { port: { type: "string" }, "execution-root": { type: "string" } } as const : {}),
    ...(group === "execution" || group === "auth" ? { environment: { type: "string" } } as const : {}),
    ...(group === "auth" && action === "login" ? { manual: { type: "boolean" }, "no-open": { type: "boolean" } } as const : {}),
    ...(group === "execution" && action !== "doctor" || group === "nle" ? { project: { type: "string" } } as const : {}),
    ...(group === "execution" && ["quote", "submit"].includes(action) ? {
      endpoint: { type: "string" }, input: { type: "string" }, resources: { type: "string" },
    } as const : {}),
    ...(group === "nle" && action !== "export" ? { view: { type: "string" } } as const : {}),
    ...(group === "nle" && action === "open" ? { "no-open": { type: "boolean" } } as const : {}),
    ...(group === "nle" && action === "export" ? { to: { type: "string" }, profile: { type: "string" } } as const : {}),
  };
  return parseArgs({ args: raw, options, allowPositionals: true, strict: true });
}

async function command(args: string[]): Promise<void> {
  if (args.length === 1 && ["--version", "-v"].includes(args[0]!)) {
    const info = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    process.stdout.write(info.version + "\n");
    return;
  }
  const [group, action, ...rest] = args;
  if (group === undefined || group === "help" || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(usage);
    return;
  }
  const actions: Readonly<Record<string, readonly string[]>> = {
    host: ["start", "status"],
    project: ["inspect"],
    auth: ["status", "login", "logout"],
    execution: ["capabilities", "doctor", "quote", "submit", "inspect", "wait", "cancel", "publication"],
    nle: ["open", "inspect", "export"],
  };
  if (action === undefined || !Object.hasOwn(actions, group) || !actions[group]!.includes(action)) {
    throw new Error("Unknown Hypit command. Run hypit --help.");
  }
  const { values, positionals } = argumentsFor(rest, group, action);
  const text = (name: keyof typeof values) => {
    const value = values[name];
    return typeof value === "string" ? value : undefined;
  };
  const [subject] = positionals;
  const takesSubject = group === "nle" || group === "project" || group === "execution" && action !== "capabilities";
  if (positionals.length > (takesSubject ? 1 : 0)) throw new Error("Unexpected positional argument.");
  if (group === "nle" && subject === undefined) throw new Error("NLE requires a document path.");
  const endpoint = values["endpoint-file"] === undefined ? {} : { path: resolve(values["endpoint-file"]) };
  const environment = text("environment") ?? "hypihub";

  function output(result: CliResult) {
    process.stdout.write((!values.json && result.text !== undefined ? result.text : JSON.stringify(result.value, null, 2)) + "\n");
    if (result.failed) process.exitCode = 1;
  }

  if (group === "host") {
    if (action === "status") {
      const current = await findNodeHypitApplicationEndpoint(endpoint);
      output(current === undefined ? { value: { status: "stopped" }, text: "Hypit Host is stopped." }
        : { value: { status: "running", origin: current.origin, instance: current.instance }, text: current.origin });
      return;
    }
    const port = text("port") === undefined ? 0 : Number(values.port);
    if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error("--port must be an integer from 0 to 65535.");
    const { startLocalApplication } = await import("./local-application.js");
    const executionRoot = text("execution-root");
    const started = await startLocalApplication({ ...endpoint, port,
      ...(executionRoot === undefined ? {} : { executionRoot: resolve(executionRoot) }) });
    const close = started.close;
    if (close !== undefined) {
      let closing = false;
      const shutdown = () => {
        if (closing) return;
        closing = true;
        void close().catch(error => {
          process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
          process.exitCode = 1;
        });
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    }
    const path = nodeHypitApplicationEndpointPath(endpoint);
    output({ value: { origin: started.endpoint.origin, path, ...(started.endpoint.home === undefined ? {} : { home: started.endpoint.home }) },
      text: `Hypit Host ${started.endpoint.origin}\n${path}${started.endpoint.home === undefined ? "" : `\n${started.endpoint.home}`}` });
    return;
  }

  const interruption = new AbortController();
  const interrupt = () => interruption.abort(new Error("Interrupted."));
  process.once("SIGINT", interrupt);
  const { signal } = interruption;
  try {
    const host = await connectLocalHost(endpoint, signal);
    const projectPath = text("project");
    const project = projectPath === undefined ? {} : { project: resolve(projectPath) };
    if (group === "auth") {
      output(await authCommand(host, action, { environment, manual: values.manual === true, noOpen: values["no-open"] === true }, signal));
    } else if (group === "execution") {
      const endpoint = text("endpoint");
      const input = text("input");
      const resources = text("resources");
      output(await executionCommand(host, action, subject, {
        ...project, environment, progress: !values.json && process.stderr.isTTY === true,
        ...(endpoint === undefined ? {} : { endpoint }),
        ...(input === undefined ? {} : { input }),
        ...(resources === undefined ? {} : { resources }),
      }, signal));
    } else if (group === "nle") {
      const view = text("view");
      const to = text("to");
      const profile = text("profile");
      output(await nleCommand(host, action, subject!, {
        ...project, progress: !values.json && process.stderr.isTTY === true,
        ...(view === undefined ? {} : { view }),
        ...(to === undefined ? {} : { to }),
        ...(profile === undefined ? {} : { profile }),
        noOpen: values["no-open"] === true,
      }, signal));
    } else {
      const root = subject === undefined ? await projectRoot(process.cwd()) : resolve(subject);
      const project = await host.openProject(root, signal);
      try { output({ value: await host.request(`/api/application/project-leases/${encodeURIComponent(project.handle)}`, { signal }) }); }
      finally { await host.closeProject(project.handle); }
    }
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  } finally {
    process.off("SIGINT", interrupt);
  }
}

const args = process.argv.slice(2);
try { await command(args); }
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (args.includes("--json")) process.stdout.write(JSON.stringify({ error: message }) + "\n");
  else process.stderr.write(`hypit: ${message}\n`);
  process.exitCode = message === "Interrupted." ? 130 : 1;
}
