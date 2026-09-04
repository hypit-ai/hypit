import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { resolveNodePackageResource } from "@hypit/package-loader-node";
import type {
  ManagedProgram,
  ManagedProgramCommand,
  ManagedProgramState,
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
export const localWhisperXManagedProject = join(
  resolveNodePackageResource("@hypit/whisperx-service-runtime", "pyproject.toml", { from: import.meta.url }),
  "..",
);

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

export type LocalWhisperXProgramOptions = {
  readonly id: string;
  readonly hostStateRoot: string;
  readonly baseUrl: string;
  readonly expectedModel: string;
  readonly expectedDevice: string;
  readonly expectedCompute: string;
  readonly expectedBatchSize: number;
  readonly expectedServiceVersion: string;
  readonly expectedWhisperXVersion: string;
  readonly serviceCommand?: ManagedProgramCommand;
};

export function localWhisperXProgram(options: LocalWhisperXProgramOptions): ManagedProgram {
  const baseUrl = options.baseUrl.replace(/\/+$/u, "");
  const serviceUrl = new URL(baseUrl);
  const expected = {
    protocol: "hypit.whisperx-service@1",
    serviceVersion: options.expectedServiceVersion,
    whisperxVersion: options.expectedWhisperXVersion,
    model: options.expectedModel,
    device: options.expectedDevice,
    compute: options.expectedCompute,
    batchSize: options.expectedBatchSize,
  };
  const customStart = options.serviceCommand;
  const managed = customStart === undefined;
  if (managed && !existsSync(localWhisperXManagedProject)) {
    throw new Error("local WhisperX has no packaged managed runtime; configure serviceCommand explicitly");
  }
  const stateRoot = join(
    options.hostStateRoot,
    "programs",
    `whisperx-${encodeURIComponent(options.id)}-${encodeURIComponent(serviceUrl.host)}`,
  );
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
    id: options.id,
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
