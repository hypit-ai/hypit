import assert from "node:assert/strict";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { isLoopback, loadConfig } from "../src/config.js";

const sessionToken = "surreel-test-session-token-at-least-24";

function defaultDataRoot(): string {
  if (process.platform === "win32") return join(homedir(), "AppData", "Local");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support");
  return join(homedir(), ".local", "share");
}

test("configuration defaults stay local, bounded, and independent of the ambient environment", () => {
  const config = loadConfig({});

  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 8787);
  assert.equal(config.projectsDir, resolve(defaultDataRoot(), "surreel"));
  assert.equal(config.distributionDir, resolve(dirname(fileURLToPath(import.meta.url)), "../../.."));
  assert.deepEqual(config.allowedOrigins, [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
  assert.equal(config.trustLocalAgent, false);
  assert.equal(config.maxModelCalls, 60);
  assert.equal(config.maxToolCalls, 180);
  assert.equal(config.maxRunMs, 1_800_000);
  assert.equal(config.maxConcurrentRuns, 2);
  assert.equal(config.sessionToken, undefined);
  assert.equal(config.webDir, undefined);
  assert.equal(config.graffBinary, undefined);
  assert.equal(config.model, undefined);
});

test("injected environment resolves project, distribution, and web paths and passes agent settings", () => {
  const env = {
    SURREEL_PROJECTS_DIR: "tmp/surreel-projects",
    SURREEL_HYPIT_DIR: "tmp/hypit",
    SURREEL_WEB_DIR: "tmp/surreel-web",
    SURREEL_GRAFF_BINARY: "custom-graff",
    SURREEL_AGENT_MODEL: "test-provider/test-model",
    SURREEL_SESSION_TOKEN: sessionToken,
  };
  const config = loadConfig(env);

  assert.equal(config.projectsDir, resolve(env.SURREEL_PROJECTS_DIR));
  assert.equal(config.distributionDir, resolve(env.SURREEL_HYPIT_DIR));
  assert.equal(config.webDir, resolve(env.SURREEL_WEB_DIR));
  assert.equal(config.graffBinary, "custom-graff");
  assert.equal(config.model, "test-provider/test-model");
  assert.equal(config.sessionToken, sessionToken);
});

test("an absolute XDG data home controls default projects while relative XDG paths are ignored", () => {
  const dataHome = resolve("tmp/surreel-data-home");

  assert.equal(loadConfig({ XDG_DATA_HOME: dataHome }).projectsDir, join(dataHome, "surreel"));
  assert.equal(loadConfig({ XDG_DATA_HOME: "relative-data-home" }).projectsDir,
    resolve(defaultDataRoot(), "surreel"));
  assert.equal(loadConfig({ XDG_DATA_HOME: "" }).projectsDir, resolve(defaultDataRoot(), "surreel"));
  assert.equal(loadConfig({ XDG_DATA_HOME: dataHome, SURREEL_PROJECTS_DIR: "explicit-projects" }).projectsDir,
    resolve("explicit-projects"));
});

test("loopback recognition covers the supported names and excludes remote bindings", () => {
  for (const host of ["localhost", "LOCALHOST", "127.0.0.1", "::1", "[::1]"]) {
    assert.equal(isLoopback(host), true, host);
    assert.equal(loadConfig({ SURREEL_HOST: host }).host, host);
  }
  for (const host of ["0.0.0.0", "::", "192.168.1.2", "surreel.example", "localhost.example", ""]) {
    assert.equal(isLoopback(host), false, host);
  }
});

test("non-loopback bindings require a sufficiently long token and nonempty explicit origins", () => {
  for (const host of ["0.0.0.0", "::", "192.168.1.2"]) {
    const base = { SURREEL_HOST: host };
    assert.throws(() => loadConfig(base), /SURREEL_SESSION_TOKEN/);
    assert.throws(() => loadConfig({ ...base, SURREEL_SESSION_TOKEN: sessionToken }), /SURREEL_ALLOWED_ORIGINS/);
    assert.throws(() => loadConfig({ ...base, SURREEL_ALLOWED_ORIGINS: "https://surreel.example" }), /SURREEL_SESSION_TOKEN/);
    for (const origins of ["", "   ", ",", " , , "]) {
      assert.throws(() => loadConfig({
        ...base,
        SURREEL_SESSION_TOKEN: sessionToken,
        SURREEL_ALLOWED_ORIGINS: origins,
      }), `non-loopback host ${host} must reject empty origins ${JSON.stringify(origins)}`);
    }
  }

  for (const token of ["", "short", "a".repeat(23)]) {
    assert.throws(() => loadConfig({ SURREEL_SESSION_TOKEN: token }), /SURREEL_SESSION_TOKEN/);
  }
  assert.equal(loadConfig({ SURREEL_SESSION_TOKEN: "a".repeat(24) }).sessionToken, "a".repeat(24));
});

test("explicit HTTP and HTTPS origins are trimmed and accepted with a remote binding", () => {
  const config = loadConfig({
    SURREEL_HOST: "0.0.0.0",
    SURREEL_SESSION_TOKEN: sessionToken,
    SURREEL_ALLOWED_ORIGINS: " https://app.surreel.example , http://localhost:4321 , https://[::1]:8443 ",
  });

  assert.equal(config.host, "0.0.0.0");
  assert.deepEqual(config.allowedOrigins, [
    "https://app.surreel.example",
    "http://localhost:4321",
    "https://[::1]:8443",
  ]);
});

test("allowed origins reject wildcard hosts, paths, credentials, queries, fragments, and non-HTTP schemes", () => {
  for (const origin of [
    "*",
    "https://*.surreel.example",
    "https://*",
    "https://surreel.example/editor",
    "https://surreel.example/",
    "https://user:password@surreel.example",
    "https://user@surreel.example",
    "https://surreel.example?project=test",
    "https://surreel.example#editor",
    "ftp://surreel.example",
    "file:///tmp/surreel",
    "javascript:alert(1)",
    "data:text/html,surreel",
    "surreel.example",
  ]) {
    assert.throws(() => loadConfig({ SURREEL_ALLOWED_ORIGINS: origin }), origin);
  }
  assert.throws(() => loadConfig({
    SURREEL_ALLOWED_ORIGINS: "https://surreel.example,https://*.surreel.example",
  }));
});

test("numeric configuration accepts inclusive limits and rejects invalid or out-of-range values", () => {
  const settings = [
    { env: "SURREEL_PORT", property: "port", maximum: 65_535 },
    { env: "SURREEL_MAX_MODEL_CALLS", property: "maxModelCalls", maximum: 1_000 },
    { env: "SURREEL_MAX_TOOL_CALLS", property: "maxToolCalls", maximum: 5_000 },
    { env: "SURREEL_RUN_TIMEOUT_MS", property: "maxRunMs", maximum: 86_400_000 },
    { env: "SURREEL_MAX_CONCURRENT_RUNS", property: "maxConcurrentRuns", maximum: 8 },
  ] as const;

  for (const setting of settings) {
    for (const value of [1, setting.maximum]) {
      assert.equal(loadConfig({ [setting.env]: String(value) })[setting.property], value, setting.env);
    }
    for (const value of ["", " ", "0", "-1", "1.5", "NaN", "Infinity", "invalid", String(setting.maximum + 1), "9007199254740992"]) {
      assert.throws(() => loadConfig({ [setting.env]: value }), new RegExp(setting.env),
        `${setting.env} must reject ${JSON.stringify(value)}`);
    }
  }
});

test("local agent execution trust requires the explicit opt-in value", () => {
  assert.equal(loadConfig({ SURREEL_TRUST_LOCAL_AGENT: "1" }).trustLocalAgent, true);
  for (const value of ["", "0", "false", "true", "yes", " 1 "]) {
    assert.equal(loadConfig({ SURREEL_TRUST_LOCAL_AGENT: value }).trustLocalAgent, false, value);
  }
});
