import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { runtimeConfigObject, runtimeConfigString } from "@hypit/runtime-kit";
import type {
  ManagedProgram,
  ManagedProgramCommand,
  ManagedProgramState,
  RuntimeAdapterFactoryContext,
} from "@hypit/runtime-kit";
import { pythonEnvironmentCommand } from "@hypit/runtime-host-node";

/**
 * WhisperX loads multi-gigabyte weights before it can answer, so it is a warm
 * program a developer keeps running, not a process spawned for each Need. The
 * Provider declares how to bring it up; the Runtime Profile may override the
 * command for an environment that installs WhisperX differently.
 *
 * The locked project is a package asset. Its environment lives in the Host's
 * program home, while this read-only project remains replaceable Distribution
 * input. A custom service command transfers process ownership to that deployment.
 */
const require = createRequire(import.meta.url);
export const localWhisperXManagedProject = join(
  require.resolve("@hypit/whisperx-service-runtime/pyproject.toml"),
  "..",
);

function configuredCommand(value: unknown, key: string) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string")) {
    throw new Error(`WhisperX ${key} must be a non-empty array of strings`);
  }
  return { command: value[0] as string, args: (value as string[]).slice(1) };
}

function run(command: ManagedProgramCommand): Promise<{ readonly ok: boolean; readonly output: string }> {
  return new Promise((resolve) => {
    execFile(command.command, [...command.args], {
      cwd: command.cwd,
      env: { ...process.env, ...command.env },
      timeout: 60_000,
      shell: false,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      resolve(error === null
        ? { ok: true, output: stdout.trim() }
        : { ok: false, output: (stderr.trim() || error.message).split(/\r?\n/u).at(-1) ?? "" });
    });
  });
}

export function localWhisperXProgram(context: RuntimeAdapterFactoryContext): ManagedProgram {
  const config = runtimeConfigObject(context.config, "local WhisperX");
  const baseUrl = (runtimeConfigString(config.baseUrl, "WhisperX baseUrl") ?? "http://127.0.0.1:8765")
    .replace(/\/+$/u, "");
  const serviceUrl = new URL(baseUrl);
  const expectedDevice = runtimeConfigString(config.expectedDevice, "WhisperX expectedDevice") ?? "cpu";
  const expected = {
    protocol: "hypit.whisperx-service@1",
    serviceVersion: runtimeConfigString(config.expectedServiceVersion, "WhisperX expectedServiceVersion") ?? "0.1.0",
    whisperxVersion: runtimeConfigString(config.expectedWhisperXVersion, "WhisperX expectedWhisperXVersion") ?? "3.8.6",
    model: runtimeConfigString(config.expectedModel, "WhisperX expectedModel") ?? "small",
    device: expectedDevice,
    compute: runtimeConfigString(config.expectedCompute, "WhisperX expectedCompute")
      ?? (expectedDevice === "cpu" ? "int8" : "float16"),
    batchSize: typeof config.expectedBatchSize === "number" ? config.expectedBatchSize : 8,
  };
  const customStart = configuredCommand(config.serviceCommand, "serviceCommand");
  const managed = customStart === undefined;
  if (managed && !existsSync(localWhisperXManagedProject)) {
    throw new Error("local WhisperX has no packaged managed runtime; configure serviceCommand explicitly");
  }
  const stateRoot = join(context.hostStateRoot, "programs", "whisperx");
  const environment = join(stateRoot, ".venv");
  const nltkData = join(stateRoot, "nltk_data");
  const serviceEnvironment = {
    HYPIT_WHISPERX_PORT: serviceUrl.port || "80",
    HYPIT_WHISPERX_MODEL: expected.model,
    HYPIT_WHISPERX_DEVICE: expected.device,
    HYPIT_WHISPERX_COMPUTE: expected.compute,
    HYPIT_WHISPERX_BATCH_SIZE: String(expected.batchSize),
    HYPIT_WHISPERX_NLTK_DATA: nltkData,
  };
  const check: ManagedProgramCommand = {
    command: pythonEnvironmentCommand(environment, "hypit-whisperx-check"),
    args: [],
    env: { HYPIT_WHISPERX_NLTK_DATA: nltkData },
  };
  const managedStart: ManagedProgramCommand = {
    command: pythonEnvironmentCommand(environment, "hypit-whisperx-service"),
    args: [],
    env: serviceEnvironment,
  };
  const installationProbe = async (): Promise<ManagedProgramState> => {
    const result = await run(check);
    if (!result.ok) return { state: "down", detail: `${check.command} is not ready: ${result.output}` };
    let report: {
      readonly protocol?: unknown;
      readonly serviceVersion?: unknown;
      readonly packages?: Record<string, unknown>;
    };
    try {
      report = JSON.parse(result.output) as typeof report;
    } catch {
      return { state: "mismatch", detail: `${check.command} returned an invalid installation report` };
    }
    const differs = [
      report.protocol === expected.protocol ? undefined : `protocol is ${String(report.protocol)}`,
      report.serviceVersion === expected.serviceVersion ? undefined : `serviceVersion is ${String(report.serviceVersion)}`,
      report.packages?.whisperx === expected.whisperxVersion ? undefined : `whisperx is ${String(report.packages?.whisperx)}`,
    ].filter((item): item is string => item !== undefined);
    return differs.length === 0
      ? { state: "ready" }
      : { state: "mismatch", detail: differs.join("; ") };
  };
  return {
    id: "whisperx",
    ...(managed ? {
      stateRoot,
      installation: {
        probe: installationProbe,
        commands: [{
          command: "uv",
          args: ["sync", "--project", localWhisperXManagedProject, "--frozen", "--no-editable"],
          env: { UV_PROJECT_ENVIRONMENT: environment },
        }, {
          command: pythonEnvironmentCommand(environment, "hypit-whisperx-prepare"),
          args: ["--nltk-data", nltkData],
          env: { HYPIT_WHISPERX_NLTK_DATA: nltkData },
        }],
      },
    } : {}),
    start: customStart ?? managedStart,
    async probe(): Promise<ManagedProgramState> {
      let health: Record<string, unknown>;
      try {
        const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
        if (!response.ok) return { state: "down", detail: `${baseUrl}/health answered ${response.status}` };
        health = await response.json() as Record<string, unknown>;
      } catch {
        return { state: "down", detail: `nothing is answering at ${baseUrl}` };
      }
      const differs = Object.entries(expected)
        .filter(([key, want]) => health[key] !== want)
        .map(([key, want]) => `${key} is ${String(health[key])}, expected ${String(want)}`);
      if (health.ok !== true) differs.push("the service reports itself unhealthy");
      return differs.length === 0
        ? { state: "ready" }
        : { state: "mismatch", detail: differs.join("; ") };
    },
  };
}
