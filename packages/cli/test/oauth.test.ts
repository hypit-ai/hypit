import assert from "node:assert/strict";
import { once } from "node:events";
import { createConnection } from "node:net";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { decodeOAuth2Credential } from "@hypit/runtime";

import { acquireOAuthCredential, authorizeBrowserLaunch } from "../src/oauth.js";

const acquisition = {
  kind: "oauth2-pkce" as const,
  authorizationEndpoint: "https://identity.example.test/authorize",
  redirectUri: "https://identity.example.test/callback",
  tokenEndpoint: "https://identity.example.test/token",
  clientId: "client",
  scopes: ["work"],
  requestTimeoutMs: 1_000,
};

/** Where the hosted callback page forwards the code: the port packed after the last `.` of state. */
function loopbackCallback(authorization: URL): URL {
  const state = authorization.searchParams.get("state")!;
  return new URL(`http://127.0.0.1:${state.slice(state.lastIndexOf(".") + 1)}/callback`);
}

function returnAuthorization(url: string, page: (html: string) => void): void {
  const authorization = new URL(url);
  const redirect = loopbackCallback(authorization);
  redirect.searchParams.set("state", authorization.searchParams.get("state")!);
  redirect.searchParams.set("code", "authorization-code");
  void globalThis.fetch(redirect).then(async (response) => {
    assert.equal(response.status, 200);
    page(await response.text());
  });
}

test("OAuth callback reports authorization while the CLI finishes the credential", async () => {
  let resolveCallback!: (html: string) => void;
  const callbackPage = new Promise<string>((resolve) => { resolveCallback = resolve; });
  const progress: string[] = [];
  const raw = await acquireOAuthCredential(acquisition, {
    onProgress: (message) => progress.push(message),
    open: (url) => returnAuthorization(url, resolveCallback),
    fetch: async (input, init) => {
      assert.equal(String(input), acquisition.tokenEndpoint);
      assert.equal(init?.signal?.aborted, false);
      return Response.json({ access_token: "access", refresh_token: "refresh", expires_in: 60 });
    },
  });

  const credential = decodeOAuth2Credential(raw);
  const callbackHtml = await callbackPage;
  assert.equal(credential?.accessToken, "access");
  assert.match(callbackHtml, /Authorization received/u);
  assert.doesNotMatch(callbackHtml, /credential is ready|signed in to Hypit/iu);
  assert.deepEqual(progress.slice(1), [
    "Authorization returned. Exchanging token…",
    "Token received. Saving credential…",
  ]);
});

test("OAuth callback releases another browser connection after sending its page", async () => {
  let browserConnection: ReturnType<typeof createConnection> | undefined;
  const raw = await acquireOAuthCredential(acquisition, {
    open: (url) => {
      const redirect = loopbackCallback(new URL(url));
      browserConnection = createConnection({ host: redirect.hostname, port: Number(redirect.port) });
      void once(browserConnection, "connect").then(() => {
        browserConnection!.write(`GET /favicon.ico HTTP/1.1\r\nHost: ${redirect.host}\r\n`);
        returnAuthorization(url, () => {});
      });
    },
    fetch: async () => Response.json({ access_token: "access" }),
  });

  assert.equal(decodeOAuth2Credential(raw)?.accessToken, "access");
  assert.ok(browserConnection);
  if (!browserConnection.destroyed) {
    await once(browserConnection, "close", { signal: AbortSignal.timeout(1_000) });
  }
});

test("Windows authorize launch quotes the URL so cmd does not split on query ampersands", () => {
  const url = "https://identity.example.test/authorize?response_type=code&client_id=client&redirect_uri=http://127.0.0.1:9/callback";
  const launch = authorizeBrowserLaunch(url, {
    platform: "win32",
    comSpec: "C:\\Windows\\System32\\cmd.exe",
  });
  assert.equal(launch.command, "C:\\Windows\\System32\\cmd.exe");
  assert.equal(launch.windowsVerbatimArguments, true);
  assert.deepEqual(launch.args, ["/d", "/s", "/v:off", "/c", 'start "" "%HYPIT_OAUTH_AUTHORIZE_URL%"']);
  assert.equal(launch.env?.HYPIT_OAUTH_AUTHORIZE_URL, url);
  assert.equal(authorizeBrowserLaunch(url, { platform: "darwin" }).command, "open");
  assert.deepEqual(authorizeBrowserLaunch(url, { platform: "linux" }).args, [url]);
});

test("Windows start preserves the entire serialized OAuth URL through cmd", {
  skip: process.platform !== "win32",
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit oauth "));
  try {
    const receiver = join(directory, "receive.mjs");
    await writeFile(receiver, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
    const url = new URL("https://identity.example.test/authorize");
    url.searchParams.set("redirect_uri", "http://127.0.0.1:1234/callback");
    url.searchParams.set("scope", "read write");
    url.searchParams.set("state", "literal%HYPIT_OAUTH_TEST_VALUE%!value&more");
    const serialized = url.href;
    const launch = authorizeBrowserLaunch(serialized);
    // Keep real cmd and start parsing, but receive the argument in Node instead of opening a UI.
    const args = [...launch.args];
    args[args.length - 1] = args.at(-1)!.replace('start "" ', `start "" /b /wait "${process.execPath}" "${receiver}" `);
    const child = spawnSync(launch.command, args, {
      encoding: "utf8", windowsHide: true, windowsVerbatimArguments: launch.windowsVerbatimArguments,
      env: { ...process.env, ...launch.env, HYPIT_OAUTH_TEST_VALUE: "must-not-expand", "3A": "must-not-expand" },
      timeout: 10_000,
    });
    assert.equal(child.status, 0, child.error?.message ?? child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), [serialized]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("OAuth token exchange uses the Endpoint-declared request timeout", async () => {
  await assert.rejects(
    async () => await acquireOAuthCredential({ ...acquisition, requestTimeoutMs: 20 }, {
      open: (url) => returnAuthorization(url, () => {}),
      fetch: async (_input, init) => await new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted === true) {
          reject(signal.reason);
          return;
        }
        // A real pending request keeps the event loop alive; AbortSignal.timeout does not.
        const response = setTimeout(() => resolve(Response.json({ access_token: "late" })), 1_000);
        signal?.addEventListener("abort", () => {
          clearTimeout(response);
          reject(signal.reason);
        }, { once: true });
      }),
    }),
    /token exchange timed out after 20 ms.*no credential was stored/u,
  );
});

test("a missing browser opener leaves the printed authorization URL usable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-oauth-no-opener-"));
  try {
    const entry = join(directory, "authorize.mjs");
    await writeFile(entry, `
import { acquireOAuthCredential } from ${JSON.stringify(new URL("../src/oauth.ts", import.meta.url).href)};
const value = await acquireOAuthCredential(${JSON.stringify(acquisition)}, {
  onProgress(message) {
    if (!message.startsWith("Opening sign-in: ")) return;
    const authorize = new URL(message.slice("Opening sign-in: ".length));
    const state = authorize.searchParams.get("state");
    const callback = new URL("http://127.0.0.1:" + state.slice(state.lastIndexOf(".") + 1) + "/callback");
    callback.searchParams.set("state", state);
    callback.searchParams.set("code", "manual-code");
    setTimeout(() => { void fetch(callback); }, 50);
  },
  fetch: async () => Response.json({access_token: "manual-access"}),
});
process.stdout.write(value);
`);
    const child = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), entry], {
      encoding: "utf8", windowsHide: true, timeout: 15_000,
      env: { ...process.env, PATH: "", ComSpec: join(directory, "missing-cmd.exe") },
    });
    assert.equal(child.status, 0, child.error?.message ?? child.stderr);
    assert.equal(decodeOAuth2Credential(child.stdout)?.accessToken, "manual-access");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
