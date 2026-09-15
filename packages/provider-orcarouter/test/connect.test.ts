import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import test from "node:test";

import { acquireOAuthCredential } from "@hypit/cli/oauth-host";
import type { CredentialAcquisition } from "@hypit/runtime";

import { decodeOrcaRouterCredential } from "../src/credentials.js";
import { createOrcaRouterProvider, orcaRouterOrigins } from "../src/provider.js";
import { orcaRouterAcquisition } from "../src/credentials.js";

/**
 * A local stand-in for the OrcaRouter authorization service. It records exactly what the connect
 * adapter sent, so the test can prove the flow's shape rather than only its outcome.
 */
type Recorded = {
  readonly authorize: URL[];
  readonly exchanges: { readonly url: string; readonly body: Record<string, string>; readonly contentType: string }[];
};

function authServer(options: {
  readonly scope?: string;
  readonly status?: number;
  readonly body?: Record<string, unknown>;
} = {}): { readonly server: Server; readonly recorded: Recorded; readonly url: string } {
  const recorded: Recorded = { authorize: [], exchanges: [] };
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/auth") {
      recorded.authorize.push(url);
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      // The consent screen displays the code; nothing is delivered to a callback.
      response.end("<p>code: FAKE-CODE</p>");
      return;
    }
    if (url.pathname === "/api/v1/auth/keys" && request.method === "POST") {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        recorded.exchanges.push({
          url: `http://127.0.0.1:${(server.address() as { port: number }).port}${url.pathname}`,
          body: JSON.parse(raw) as Record<string, string>,
          contentType: String(request.headers["content-type"] ?? ""),
        });
        response.writeHead(options.status ?? 200, { "content-type": "application/json" });
        response.end(JSON.stringify(options.body ?? { key: "sk-orca-minted-by-consent", user_id: "12345", scope: options.scope ?? "api" }));
      });
      return;
    }
    // The relay's own spellings must never be reached.
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found", path: url.pathname }));
  });
  return { server, recorded, url: "" };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); });
}

/** The Endpoint's declaration with the local fake service standing in for the public origins. */
function acquisitionFor(base: string, overrides: Partial<CredentialAcquisition> = {}): CredentialAcquisition {
  const declared = orcaRouterAcquisition({ authBaseUrl: base });
  return { ...declared, ...overrides };
}

test("connect: authorize -> displayed code -> exchange -> persist, through the OrcaRouter adapter", async () => {
  const { server, recorded } = authServer();
  const base = await listen(server);
  const opened: string[] = [];
  let persisted = "";
  try {
    const raw = await acquireOAuthCredential(acquisitionFor(base), {
      open: (url) => opened.push(url),
      readCode: async () => "FAKE-CODE",
    });
    assert.equal(raw, "sk-orca-minted-by-consent");
    assert.equal(opened.length, 1);

    // 1. The authorize URL asks for an out-of-band code with an S256 challenge and a state.
    const authorize = new URL(opened[0]!);
    assert.equal(authorize.origin, base);
    assert.equal(authorize.pathname, "/auth");
    assert.equal(authorize.searchParams.get("callback_url"), "oob");
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
    assert.equal(authorize.searchParams.get("scope"), "api");
    assert.equal(authorize.searchParams.get("app_name"), "Hypit");
    const challenge = authorize.searchParams.get("code_challenge")!;
    const state = authorize.searchParams.get("state")!;
    assert.match(state, /^[A-Za-z0-9_-]{32}$/u);

    // 2. The exchange goes to /api/v1/auth/keys on the auth origin, in the declared JSON shape,
    //    and carries the verifier whose SHA-256 is the challenge — nothing else could redeem it.
    assert.equal(recorded.exchanges.length, 1);
    const exchange = recorded.exchanges[0]!;
    assert.equal(exchange.url, `${new URL(base).origin}/api/v1/auth/keys`);
    assert.match(exchange.contentType, /application\/json/u);
    assert.equal(exchange.body.code, "FAKE-CODE");
    assert.equal(exchange.body.code_challenge_method, "S256");
    assert.equal(exchange.body.grant_type, undefined);
    const verifier = exchange.body.code_verifier!;
    assert.equal(Buffer.from(createHash("sha256").update(verifier).digest()).toString("base64url"), challenge);
    // The verifier never travelled on the authorize URL.
    assert.ok(!opened[0]!.includes(verifier));

    // 3. What lands in the slot is an ordinary OrcaRouter key: the relay's Bearer value, not an
    //    envelope and not a refreshable token pair.
    persisted = raw;
    assert.equal(persisted, "sk-orca-minted-by-consent");
    assert.equal(decodeOrcaRouterCredential(persisted)?.key, "sk-orca-minted-by-consent");
  } finally {
    await close(server);
  }
});

test("connect: a narrower granted scope is refused rather than assumed", async () => {
  const { server } = authServer({ scope: "connector" });
  const base = await listen(server);
  try {
    await assert.rejects(
      async () => await acquireOAuthCredential(acquisitionFor(base), {
        open: () => {},
        readCode: async () => "FAKE-CODE",
      }),
      /granted scope "connector", not "api"/u,
    );
  } finally {
    await close(server);
  }
});

test("connect: a refused or expired code ends the attempt cleanly", async () => {
  for (const status of [400, 403, 429]) {
    const { server } = authServer({ status, body: { error: "invalid_grant" } });
    const base = await listen(server);
    try {
      await assert.rejects(
        async () => await acquireOAuthCredential(acquisitionFor(base), {
          open: () => {},
          readCode: async () => "FAKE-CODE",
        }),
        new RegExp(`token exchange failed \\(${status}\\)`, "u"),
      );
    } finally {
      await close(server);
    }
  }
});

test("connect: a decline and a missing code both stop without a request", async () => {
  const { server, recorded } = authServer();
  const base = await listen(server);
  try {
    await assert.rejects(
      async () => await acquireOAuthCredential(acquisitionFor(base), { open: () => {}, readCode: async () => undefined }),
      /no authorization code was entered/u,
    );
    assert.equal(recorded.exchanges.length, 0);
  } finally {
    await close(server);
  }
});

test("connect: each attempt uses a fresh verifier and state", async () => {
  const { server, recorded } = authServer();
  const base = await listen(server);
  const opened: string[] = [];
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await acquireOAuthCredential(acquisitionFor(base), {
        open: (url) => opened.push(url),
        readCode: async () => "FAKE-CODE",
      });
    }
    assert.equal(opened.length, 2);
    assert.notEqual(new URL(opened[0]!).searchParams.get("state"), new URL(opened[1]!).searchParams.get("state"));
    assert.notEqual(new URL(opened[0]!).searchParams.get("code_challenge"), new URL(opened[1]!).searchParams.get("code_challenge"));
    assert.notEqual(recorded.exchanges[0]!.body.code_verifier, recorded.exchanges[1]!.body.code_verifier);
  } finally {
    await close(server);
  }
});

test("connect: the minted key reaches inference on the relay origin, not the auth origin", async () => {
  const { server } = authServer();
  const base = await listen(server);
  const calls: { readonly url: string; readonly authorization: string }[] = [];
  try {
    const key = await acquireOAuthCredential(acquisitionFor(base), {
      open: () => {},
      readCode: async () => "FAKE-CODE",
    });
    const provider = createOrcaRouterProvider({
      fetch: async (input, init) => {
        calls.push({
          url: String(input),
          authorization: String((init?.headers as Record<string, string> | undefined)?.authorization ?? ""),
        });
        return Response.json({ data: [{ id: "deepseek/deepseek-v4.1-flash", supported_endpoint_types: ["openai"] }] });
      },
    });
    const credential = provider.credentialFor({ apiKey: { secret: key } });
    const catalog = await provider.client.models(credential, "chat");
    assert.equal(catalog.source, "live");
    assert.deepEqual(catalog.models.map((model) => model.id), ["deepseek/deepseek-v4.1-flash"]);
    // Model discovery uses the inference origin and the key, whichever entry point produced it.
    assert.equal(calls[0]!.url, "https://api.orcarouter.ai/v1/models?capability=chat");
    assert.equal(calls[0]!.authorization, "Bearer sk-orca-minted-by-consent");
    // The authorization origin is untouched by inference: only the relay host is called.
    assert.equal(new URL(calls[0]!.url).host, "api.orcarouter.ai");
    assert.equal(orcaRouterOrigins({}).authBaseUrl, "https://www.orcarouter.ai");
  } finally {
    await close(server);
  }
});
