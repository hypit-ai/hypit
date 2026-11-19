#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { ExecutionHostError } from "@hypit/execution/node";
import { findLocalServiceEndpoint, localServiceEndpointPath } from "./local-endpoint.js";
import { canvasCommand } from "./cli/canvas.js";
import { LocalHostError, connectLocalHost } from "./cli/client.js";
import { authCommand, executionCommand } from "./cli/execution.js";
import type { CliResult } from "./cli/io.js";
import { nleCommand, projectRoot } from "./cli/nle.js";

const usage = `Usage: hypit <command> [options]

  host start|status
  project inspect [directory]
  auth status|login|logout [--environment <id>]
  execution start|status
  execution start accepts --data-root <directory>
  execution capabilities|doctor [capability]
  execution quote|submit <capability> --input <file|-> [--resources <file>]
  execution submit accepts --invocation-id <uuid>
  execution inspect|wait|cancel|publication <invocation>
  execution resource <invocation> --output <name> --resource <name> --to <file>
  transcript align <transcript.json|-> --words <words.json|-> --end <seconds> [--start <seconds>] --to <file>
  nle open|inspect <file.svml> [--project <directory>] [--view <file>]
  nle export <file.svml> --to <project-relative.mp4> [--profile <file>]
  canvas create <file.canvas.json> --name <name>
  canvas open|inspect|catalog <file.canvas.json> [--project <directory>]
  canvas node|history <file.canvas.json> <node>
  canvas apply <file.canvas.json> --input <file|->
  canvas quote|invoke <file.canvas.json> <node> [--environment <id>] [--endpoint <id>]
  canvas invoke also requires --if-revision <revision> and accepts --invocation-id <uuid>
  canvas adopt <file.canvas.json> <node> --input <file|->

Use --json for structured output and --endpoint-file for an explicitly selected local Host.
Use --help or --version without starting the Host.
`;

const common = {
  help: { type: "boolean", short: "h" },
  json: { type: "boolean" },
} as const;

function argumentsFor(raw: string[], group: string, action: string) {
  const options = {
    ...common,
    ...(group !== "transcript" ? { "endpoint-file": { type: "string" } } as const : {}),
    ...(group === "transcript" ? {
      words: { type: "string" }, start: { type: "string" }, end: { type: "string" }, to: { type: "string" },
    } as const : {}),
    ...(action === "start" ? { port: { type: "string" } } as const : {}),
    ...(group === "host" && action === "start" ? { "execution-endpoint-file": { type: "string" } } as const : {}),
    ...(group === "execution" && action === "start" ? { "data-root": { type: "string" } } as const : {}),
    ...(group === "execution" || group === "auth" || group === "canvas" && ["quote", "invoke"].includes(action) ? { environment: { type: "string" } } as const : {}),
    ...(group === "auth" && action === "login" ? { manual: { type: "boolean" }, "no-open": { type: "boolean" } } as const : {}),
    ...(group === "nle" || group === "canvas" ? { project: { type: "string" } } as const : {}),
    ...(group === "execution" && ["quote", "submit"].includes(action) ? {
      endpoint: { type: "string" }, input: { type: "string" }, resources: { type: "string" },
    } as const : {}),
    ...(group === "execution" && action === "submit" ? { "invocation-id": { type: "string" } } as const : {}),
    ...(group === "execution" && action === "resource" ? { output: { type: "string" }, resource: { type: "string" }, to: { type: "string" } } as const : {}),
    ...(group === "nle" && action !== "export" ? { view: { type: "string" } } as const : {}),
    ...((group === "nle" || group === "canvas") && action === "open" ? { "no-open": { type: "boolean" } } as const : {}),
    ...(group === "canvas" && action === "create" ? { name: { type: "string" } } as const : {}),
    ...(group === "canvas" && ["apply", "adopt"].includes(action) ? { input: { type: "string" } } as const : {}),
    ...(group === "canvas" && ["quote", "invoke"].includes(action) ? { endpoint: { type: "string" }, "if-revision": { type: "string" } } as const : {}),
    ...(group === "canvas" && action === "invoke" ? { "invocation-id": { type: "string" } } as const : {}),
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
    execution: ["start", "status", "capabilities", "doctor", "quote", "submit", "inspect", "wait", "cancel", "publication", "resource"],
    transcript: ["align"],
    nle: ["open", "inspect", "export"],
    canvas: ["create", "open", "inspect", "catalog", "node", "apply", "history", "quote", "invoke", "adopt"],
  };
  if (action === undefined || !Object.hasOwn(actions, group) || !actions[group]!.includes(action)) {
    throw new Error("Unknown Hypit command. Run hypit --help.");
  }
  const { values, positionals } = argumentsFor(rest, group, action);
  const text = (name: keyof typeof values) => {
    const value = values[name];
    return typeof value === "string" ? value : undefined;
  };
  const [subject, canvasNode] = positionals;
  const takesSubject = group === "canvas" || group === "nle" || group === "project" || group === "transcript" || group === "execution" && !["start", "status", "capabilities"].includes(action);
  const takesNode = group === "canvas" && ["node", "history", "quote", "invoke", "adopt"].includes(action);
  if (positionals.length > (takesNode ? 2 : takesSubject ? 1 : 0)) throw new Error("Unexpected positional argument.");
  if ((group === "nle" || group === "canvas") && subject === undefined) throw new Error(group + " requires a document path.");
  const endpointFile = text("endpoint-file");
  const endpoint = endpointFile === undefined ? {} : { path: resolve(endpointFile) };
  const environment = text("environment");
  const environmentOption = environment === undefined ? {} : { environment };

  function output(result: CliResult) {
    process.stdout.write((!values.json && result.text !== undefined ? result.text : JSON.stringify(result.value, null, 2)) + "\n");
    if (result.failed) process.exitCode = 1;
  }

  if (group === "host" || group === "execution" && ["start", "status"].includes(action)) {
    const service = group === "host" ? "application" : "execution";
    const name = service === "application" ? "Hypit Host" : "Execution Host";
    if (action === "status") {
      const current = await findLocalServiceEndpoint(service, endpoint);
      output(current === undefined ? { value: { status: "stopped" }, text: name + " is stopped." }
        : { value: { status: "running", origin: current.origin, instance: current.instance }, text: current.origin });
      return;
    }
    const port = text("port") === undefined ? 0 : Number(values.port);
    if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error("--port must be an integer from 0 to 65535.");
    const dataRoot = text("data-root");
    const executionEndpointFile = text("execution-endpoint-file");
    const started = service === "execution"
      ? await (await import("./local-execution.js")).startLocalExecution({ ...endpoint, port,
          ...(dataRoot === undefined ? {} : { dataRoot: resolve(dataRoot) }) })
      : await (await import("./local-application.js")).startLocalApplication({ ...endpoint, port,
          ...(executionEndpointFile === undefined ? {} : { executionEndpointFile: resolve(executionEndpointFile) }) });
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
    const path = localServiceEndpointPath(service, endpoint);
    output({ value: { origin: started.endpoint.origin, path, ...(started.endpoint.home === undefined ? {} : { home: started.endpoint.home }) },
      text: `${name} ${started.endpoint.origin}\n${path}${started.endpoint.home === undefined ? "" : `\n${started.endpoint.home}`}` });
    return;
  }

  const interruption = new AbortController();
  const interrupt = () => interruption.abort(new Error("Interrupted."));
  process.once("SIGINT", interrupt);
  const { signal } = interruption;
  try {
    if (group === "transcript") {
      const { transcriptAlignCommand } = await import("./cli/transcript.js");
      output(await transcriptAlignCommand(subject, text("words"), text("start"), text("end"), text("to"), signal));
      return;
    }
    if (group === "auth" || group === "execution") {
      const { connectLocalExecution } = await import("./local-execution.js");
      const host = await connectLocalExecution(endpoint, signal);
      if (group === "auth") {
        output(await authCommand(host, action, { ...environmentOption, manual: values.manual === true, noOpen: values["no-open"] === true }, signal));
      } else {
        const picked = (["endpoint", "input", "resources", "output", "resource", "to"] as const).flatMap(name => {
          const value = text(name);
          return value === undefined ? [] : [[name, value] as const];
        });
        const invocation = text("invocation-id");
        output(await executionCommand(host, action, subject, {
          ...Object.fromEntries(picked), ...environmentOption, progress: !values.json && process.stderr.isTTY === true,
          ...(invocation === undefined ? {} : { invocation }),
        }, signal));
      }
      return;
    }

    const host = await connectLocalHost(endpoint, signal);
    const projectPath = text("project");
    const project = projectPath === undefined ? {} : { project: resolve(projectPath) };
    if (group === "canvas") {
      const name = text("name");
      const input = text("input");
      const expectedRevision = text("if-revision");
      const invocation = text("invocation-id");
      const endpoint = text("endpoint");
      output(await canvasCommand(host, action, subject!, {
        ...project, ...environmentOption, noOpen: values["no-open"] === true,
        ...(canvasNode === undefined ? {} : { node: canvasNode }),
        ...(name === undefined ? {} : { name }),
        ...(input === undefined ? {} : { input }),
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
        ...(invocation === undefined ? {} : { invocation }),
        ...(endpoint === undefined ? {} : { endpoint }),
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
  if (args.includes("--json")) process.stdout.write(JSON.stringify({ error: message, ...(error instanceof LocalHostError ? { code: error.code, subject: error.subject } : error instanceof ExecutionHostError ? { code: error.code } : {}) }) + "\n");
  else process.stderr.write(`hypit: ${message}\n`);
  process.exitCode = message === "Interrupted." ? 130 : 1;
}
