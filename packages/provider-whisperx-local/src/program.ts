import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { runtimeConfigObject, runtimeConfigString } from "@narratage/runtime-kit";
import type { RuntimeAdapterFactoryContext, ManagedProgram, ManagedProgramState } from "@narratage/runtime-kit";

import { localWhisperXPunktTabDigest } from "./provider.js";

/**
 * WhisperX loads multi-gigabyte weights before it can answer, so it is a warm
 * program a developer keeps running, not a process spawned for each Need. The
 * Provider declares how to bring it up; the Runtime Profile may override the
 * command for an environment that installs WhisperX differently.
 *
 * The default names the pinned uv project shipped beside this package in the
 * Narratage repository, by absolute path — a Runtime root is wherever the
 * operator keeps their Profile, and it is not where that project lives. An
 * installation that obtained this package on its own has no such directory and
 * must say what to run instead; `serviceCommand` is that.
 */
const WORKSPACE_PROJECT = fileURLToPath(new URL("../../../services/whisperx", import.meta.url));

function workspaceCommand(entry: string): { command: string; args: readonly string[] } | undefined {
  if (!existsSync(WORKSPACE_PROJECT)) return undefined;
  return { command: "uv", args: ["run", "--project", WORKSPACE_PROJECT, "--frozen", entry] };
}

function configuredCommand(value: unknown, key: string) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string")) {
    throw new Error(`WhisperX ${key} must be a non-empty array of strings`);
  }
  return { command: value[0] as string, args: (value as string[]).slice(1) };
}

export function localWhisperXProgram(context: RuntimeAdapterFactoryContext): ManagedProgram {
  const config = runtimeConfigObject(context.config, "local WhisperX");
  const baseUrl = (runtimeConfigString(config.baseUrl, "WhisperX baseUrl") ?? "http://127.0.0.1:8765")
    .replace(/\/+$/u, "");
  const expected = {
    protocol: "narratage.whisperx-service@1",
    serviceVersion: runtimeConfigString(config.expectedServiceVersion, "WhisperX expectedServiceVersion") ?? "0.1.0",
    whisperxVersion: runtimeConfigString(config.expectedWhisperXVersion, "WhisperX expectedWhisperXVersion") ?? "3.8.6",
    model: runtimeConfigString(config.expectedModel, "WhisperX expectedModel") ?? "small",
    device: runtimeConfigString(config.expectedDevice, "WhisperX expectedDevice") ?? "cpu",
    punktTabDigest: runtimeConfigString(config.expectedPunktTabDigest, "WhisperX expectedPunktTabDigest")
      ?? localWhisperXPunktTabDigest,
  };
  const customStart = configuredCommand(config.serviceCommand, "serviceCommand");
  const customPrepare = configuredCommand(config.servicePrepareCommand, "servicePrepareCommand");
  // Any lifecycle override transfers ownership to the deployment. This avoids
  // preparing the repository uv project before starting an unrelated conda,
  // systemd or container command. With no override the bundled project is the
  // managed default; when it is not present this becomes probe-only.
  const managed = customStart === undefined && customPrepare === undefined;
  const prepare = customPrepare ?? (managed ? workspaceCommand("narratage-whisperx-prepare") : undefined);
  const start = customStart ?? (managed ? workspaceCommand("narratage-whisperx-service") : undefined);
  return {
    id: "whisperx",
    ...(prepare === undefined ? {} : { prepare }),
    ...(start === undefined ? {} : { start }),
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
