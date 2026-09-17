import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ServerConfig = {
  host: string;
  port: number;
  projectsDir: string;
  allowedOrigins: readonly string[];
  sessionToken?: string;
  webDir?: string;
  distributionDir: string;
  runtimePath?: string;
  graffBinary?: string;
  model?: string;
  trustLocalAgent: boolean;
  maxModelCalls: number;
  maxToolCalls: number;
  maxRunMs: number;
  maxConcurrentRuns: number;
};

export function isLoopback(host: string): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host.toLowerCase());
}

function positiveInteger(value: string | undefined, fallback: number, name: string, maximum: number): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const host = env.SURREEL_HOST ?? "127.0.0.1";
  const token = env.SURREEL_SESSION_TOKEN;
  if (token !== undefined && token.length < 24) throw new Error("SURREEL_SESSION_TOKEN must contain at least 24 characters.");
  if (!isLoopback(host) && (!token || !env.SURREEL_ALLOWED_ORIGINS)) {
    throw new Error("A non-loopback SURREEL_HOST requires SURREEL_SESSION_TOKEN and explicit SURREEL_ALLOWED_ORIGINS.");
  }
  const origins = (env.SURREEL_ALLOWED_ORIGINS ??
    "http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  if (!isLoopback(host) && origins.length === 0) throw new Error("A non-loopback host requires at least one allowed frontend origin.");
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password || parsed.hostname.includes("*")) {
      throw new Error("SURREEL_ALLOWED_ORIGINS must contain complete http(s) origins without paths or wildcards.");
    }
  }
  const dataBase = env.XDG_DATA_HOME && isAbsolute(env.XDG_DATA_HOME)
    ? env.XDG_DATA_HOME
    : process.platform === "win32" ? env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local")
      : process.platform === "darwin" ? join(homedir(), "Library", "Application Support")
        : join(homedir(), ".local", "share");
  return {
    host,
    port: positiveInteger(env.SURREEL_PORT, 8787, "SURREEL_PORT", 65535),
    projectsDir: resolve(env.SURREEL_PROJECTS_DIR ?? join(dataBase, "surreel")),
    distributionDir: resolve(env.SURREEL_HYPIT_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "../../..")),
    ...(env.SURREEL_HYPIT_RUNTIME === undefined ? {} : { runtimePath: resolve(env.SURREEL_HYPIT_RUNTIME) }),
    allowedOrigins: origins,
    ...(token === undefined ? {} : { sessionToken: token }),
    ...(env.SURREEL_WEB_DIR === undefined ? {} : { webDir: resolve(env.SURREEL_WEB_DIR) }),
    ...(env.SURREEL_GRAFF_BINARY === undefined ? {} : { graffBinary: env.SURREEL_GRAFF_BINARY }),
    ...(env.SURREEL_AGENT_MODEL === undefined ? {} : { model: env.SURREEL_AGENT_MODEL }),
    trustLocalAgent: env.SURREEL_TRUST_LOCAL_AGENT === "1",
    maxModelCalls: positiveInteger(env.SURREEL_MAX_MODEL_CALLS, 60, "SURREEL_MAX_MODEL_CALLS", 1000),
    maxToolCalls: positiveInteger(env.SURREEL_MAX_TOOL_CALLS, 180, "SURREEL_MAX_TOOL_CALLS", 5000),
    maxRunMs: positiveInteger(env.SURREEL_RUN_TIMEOUT_MS, 1_800_000, "SURREEL_RUN_TIMEOUT_MS", 86_400_000),
    maxConcurrentRuns: positiveInteger(env.SURREEL_MAX_CONCURRENT_RUNS, 2, "SURREEL_MAX_CONCURRENT_RUNS", 8),
  };
}
