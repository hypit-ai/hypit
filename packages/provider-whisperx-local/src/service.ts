import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { runtimeConfigObject, runtimeConfigString } from "@narratage/runtime-adapter";
import type { RuntimeAdapterFactoryContext, RuntimeExternalService, RuntimeServiceState } from "@narratage/runtime-adapter";

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

function command(
  value: unknown,
  fallback: { readonly command: string; readonly args: readonly string[] } | undefined,
  key: string,
) {
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(
      `WhisperX ${key} is required: the pinned uv project is not at ${WORKSPACE_PROJECT},`
      + " so this deployment must say what command runs WhisperX",
    );
  }
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string")) {
    throw new Error(`WhisperX ${key} must be a non-empty array of strings`);
  }
  return { command: value[0] as string, args: (value as string[]).slice(1) };
}

export function localWhisperXService(context: RuntimeAdapterFactoryContext): RuntimeExternalService {
  const config = runtimeConfigObject(context.config, "local WhisperX");
  const baseUrl = (runtimeConfigString(config.baseUrl, "WhisperX baseUrl") ?? "http://127.0.0.1:8765")
    .replace(/\/+$/u, "");
  const expected = {
    protocol: "svml.whisperx-service@1",
    serviceVersion: runtimeConfigString(config.expectedServiceVersion, "WhisperX expectedServiceVersion") ?? "0.1.0",
    whisperxVersion: runtimeConfigString(config.expectedWhisperXVersion, "WhisperX expectedWhisperXVersion") ?? "3.8.6",
    model: runtimeConfigString(config.expectedModel, "WhisperX expectedModel") ?? "small",
    device: runtimeConfigString(config.expectedDevice, "WhisperX expectedDevice") ?? "cpu",
    punktTabDigest: runtimeConfigString(config.expectedPunktTabDigest, "WhisperX expectedPunktTabDigest")
      ?? localWhisperXPunktTabDigest,
  };
  return {
    id: "whisperx",
    prepare: command(config.servicePrepareCommand, workspaceCommand("svml-whisperx-prepare"), "servicePrepareCommand"),
    start: command(config.serviceCommand, workspaceCommand("svml-whisperx-service"), "serviceCommand"),
    async probe(): Promise<RuntimeServiceState> {
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
