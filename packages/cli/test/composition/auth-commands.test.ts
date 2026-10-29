import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import type { CliDistribution } from "../../src/distribution.js";
import { runCliApplication } from "../../src/application.js";
import type { CliIo } from "../../src/output.js";
import { createLocalCredentialControl } from "@hypit/runtime-local";
import { createLocalRuntimeCliCommandModules } from "@hypit/runtime-local/cli";
import type { LocalRuntimeHost } from "@hypit/runtime-local";
import { commandHint } from "../../src/command-hint.js";
import { cliDistribution } from "../distribution-scenario.js";
import { credentialControl, runtimeControl } from "../control-scenario.js";
import { runCli } from "./control-command-scenario.js";

test("auth opens only one Endpoint credential control, never the execution Runtime", async () => {
  const calls: string[] = [];
  const credentials = credentialControl({
    async credentials(endpoint?: string) {
      calls.push(`credentials.status:${endpoint}`);
      return [{
        endpoint: "images.project",
        slot: "apiKey",
        label: "Image service API key",
        kind: "secret",
        ref: { store: "env", key: "IMAGE_API_KEY" },
        configured: false,
        writable: false,
      }];
    },
    async close() { calls.push("credentials.close"); },
  });
  const distribution = cliDistribution({
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openCredentials: async (endpoint: string) => {
        calls.push(`credentials.create:${endpoint}`);
        return credentials;
      },
      createRuntime: async () => {
        calls.push("execution.create");
        throw new Error("auth must not construct execution");
      },
    }),
  });
  let output = "";

  await runCli([
    "auth", "status", "images.project", "--runtime", "/tmp/runtime.json", "--json",
  ], { write: (text) => { output += text; } }, distribution);

  assert.deepEqual(calls, [
    "credentials.create:images.project",
    "credentials.status:images.project",
    "credentials.close",
  ]);
  assert.equal((JSON.parse(output) as { readonly endpoint?: string }).endpoint, "images.project");
  const machine = JSON.parse(output) as { readonly credentials: readonly Record<string, unknown>[] };
  assert.equal("ref" in machine.credentials[0]!, false);
  assert.equal("key" in machine.credentials[0]!, false);
});

test("auth status exposes declared acquisition without acquiring or revealing credentials", async () => {
  const acquisition = {
    kind: "oauth2-pkce", authorizationEndpoint: "https://service.example/authorize",
    tokenEndpoint: "https://service.example/token", clientId: "example-client", scopes: ["inference"],
  };
  const distribution = cliDistribution({
    openRuntimeHost: async () => ({
      openCredentials: async () => ({
        credentials: async () => [
          { endpoint: "service.project", slot: "browser", label: "Service access", kind: "secret",
            configured: false, writable: true, ref: { store: "os", key: "private-reference" }, acquisition,
            secret: "not-for-display" },
          { endpoint: "service.project", slot: "key", label: "Service key", kind: "secret",
            configured: false, writable: true, ref: { store: "os", key: "private-reference" } },
          { endpoint: "service.project", slot: "external", label: "External key", kind: "secret",
            configured: false, writable: false, ref: { store: "env", key: "PRIVATE_KEY" } },
        ],
        putCredential: async () => { throw new Error("Status must not acquire a credential"); },
        close() {},
      }),
      createRuntime: async () => { throw new Error("Status must not start execution"); },
    }),
  });
  for (const json of [true, false]) {
    let output = "";
    await runCli(["auth", "status", "service.project", "--runtime", "/tmp/runtime.json", ...(json ? ["--json"] : [])], {
      write: (text) => { output += text; },
      readSecret: async () => { throw new Error("Status must not request user input"); },
    }, distribution);
    assert.doesNotMatch(output, /not-for-display|private-reference|PRIVATE_KEY|example-client/u);
    if (json) {
      const view = JSON.parse(output);
      assert.equal(view.format, "hypit.cli-auth-status@1");
      assert.deepEqual(view.credentials[0].acquisition, {
        kind: "oauth2-pkce", authorizationEndpoint: "https://service.example/authorize",
      });
      assert.equal(view.credentials[1].acquisition, undefined);
      assert.equal(view.credentials[2].writable, false);
    } else {
      assert.match(output, /login opens OAuth: https:\/\/service.example\/authorize/u);
      assert.match(output, /login uses secure secret input/u);
      assert.match(output, /managed by its external credential source/u);
    }
  }
});


test("auth login explains an environment-owned credential before asking for a secret", async () => {
  let prompted = false;
  let closed = false;
  const credentials = credentialControl({
    async describeCredentials() {
      return [{
        endpoint: "images.project",
        slot: "apiKey",
        label: "Image service API key",
        kind: "secret",
        ref: { store: "env", key: "IMAGE_API_KEY" },
        configured: false,
        writable: false,
      }];
    },
    async close() { closed = true; },
  });
  const distribution = cliDistribution({
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openCredentials: async () => credentials,
    }),
  });

  await assert.rejects(
    async () => await runCli([
      "auth", "login", "images.project", "--runtime", "/tmp/runtime.json",
    ], {
      write() {},
      readSecret: async () => {
        prompted = true;
        return "must-not-be-read";
      },
    }, distribution),
    /cannot be written.*set IMAGE_API_KEY/u,
  );
  assert.equal(prompted, false);
  assert.equal(closed, true);
});


test("auth can replace and delete a credential whose Store cannot read its old value", async () => {
  let value = "damaged";
  let reads = 0;
  const endpoint: Parameters<typeof createLocalCredentialControl>[0]["endpoints"][number] = {
    instance: { id: "service.project", pool: "service.project" }, capabilities: [],
    credentials: [{ endpoint: "service.project", slot: "apiKey", label: "Service key", kind: "secret",
      ref: { store: "test", key: "service" } }],
  };
  const credentialStore = {
    owns: () => true,
    async resolve() { reads++; throw new Error("credential cannot be read"); },
    async put(_ref: unknown, input: { secret: string }) { value = input.secret; },
    async delete() { value = ""; return true; },
  };
  const distribution = cliDistribution({
    openRuntimeHost: async () => ({
      openCredentials: async () => createLocalCredentialControl({ credentialStore, endpoints: [endpoint] }),
    }),
  });
  await assert.rejects(runCli(["auth", "status", "service.project", "--runtime", "/tmp/runtime.json"],
    { write() {} }, distribution), /credential cannot be read/u);
  reads = 0;
  for (const action of ["login", "logout"]) {
    let output = "";
    await runCli(["auth", action, "service.project", "--runtime", "/tmp/runtime.json", "--json"], {
      write(text) { output += text; }, readSecret: async () => "replacement",
    }, distribution);
    assert.equal(JSON.parse(output).configured, action === "login");
    assert.equal(value, action === "login" ? "replacement" : "");
  }
  assert.equal(reads, 0, "management must not read the previous or newly written secret");
});
