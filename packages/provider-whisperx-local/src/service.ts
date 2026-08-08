import { runtimeConfigObject, runtimeConfigString } from "@narratage/runtime-adapter";
import type { RuntimeAdapterFactoryContext, RuntimeExternalService, RuntimeServiceState } from "@narratage/runtime-adapter";

import { localWhisperXPunktTabDigest } from "./provider.js";

/**
 * WhisperX loads multi-gigabyte weights before it can answer, so it is a warm
 * program a developer keeps running, not a process spawned for each Need. The
 * Provider declares how to bring it up; the Runtime Profile may override the
 * command for an environment that installs WhisperX differently.
 */
const DEFAULT_START = {
  command: "uv",
  args: ["run", "--project", "services/whisperx", "--frozen", "svml-whisperx-service"],
} as const;

const DEFAULT_PREPARE = {
  command: "uv",
  args: ["run", "--project", "services/whisperx", "--frozen", "svml-whisperx-prepare"],
} as const;

function command(value: unknown, fallback: { readonly command: string; readonly args: readonly string[] }) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string")) {
    throw new Error("WhisperX serviceCommand must be a non-empty array of strings");
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
    punktTabDigest: runtimeConfigString(config.expectedPunktTabDigest, "WhisperX expectedPunktTabDigest") ?? localWhisperXPunktTabDigest,
  };
  return {
    id: "whisperx",
    prepare: command(config.servicePrepareCommand, DEFAULT_PREPARE),
    start: command(config.serviceCommand, DEFAULT_START),
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
