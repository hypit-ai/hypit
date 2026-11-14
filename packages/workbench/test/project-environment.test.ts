import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openProjectWorkbenchEnvironment } from "../src/cli-command.js";

test("Workbench opens project credentials through the Environment without opening Generation Runtime", async (t) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "hypit-workbench-environment-"));
  t.after(async () => { await rm(projectRoot, { recursive: true, force: true }); });
  await writeFile(join(projectRoot, "hypit.environment.json"), JSON.stringify({
    format: "hypit.execution-environment-local@1",
    dataRoot: ".hypit/environment/local",
    endpoints: { "hypihub.default": { use: "@hypit/provider-hypihub", config: {} } },
  }));

  let configured = false;
  let openedProfile: string | undefined;
  const environment = openProjectWorkbenchEnvironment(projectRoot, {
    resolveProjectRuntime: async () => { throw new Error("Environment observation opened Generation Runtime"); },
    openEnvironmentHost: async (profile) => {
      openedProfile = profile;
      return {
        async openCredentials(endpoint) {
          assert.equal(endpoint, "hypihub.default");
          const status = () => ({
            endpoint,
            slot: "apiKey",
            label: "HypiHub",
            configured,
            writable: true,
            acquisition: {
              kind: "oauth2-pkce" as const,
              authorizationEndpoint: "https://hypit.ai/oauth/authorize",
              tokenEndpoint: "https://hypit.ai/oauth/token",
              clientId: "hypit",
              redirectUri: "http://127.0.0.1/callback",
              scopes: [] as readonly string[],
              requestTimeoutMs: 30_000,
            },
          });
          return {
            async credentials() { return [status()]; },
            async putCredential(selectedEndpoint, slot, secret) {
              assert.equal(selectedEndpoint, endpoint);
              assert.equal(slot, "apiKey");
              assert.equal(secret, "oauth-secret");
              configured = true;
              return status();
            },
            close() {},
          };
        },
      };
    },
    acquireOAuthCredential: async () => "oauth-secret",
  });
  t.after(async () => { await environment.close(); });

  const observed = await environment.observe();
  assert.equal(openedProfile, join(projectRoot, "hypit.environment.json"));
  assert.equal(observed.status, "action-required");
  assert.deepEqual(observed.environment, { selected: true, label: "hypit.environment.json" });

  const connected = await environment.host!.connect();
  assert.equal(configured, true);
  assert.equal(connected.status, "ready");
  assert.deepEqual(connected.environment, { selected: true, label: "hypit.environment.json" });
});
