import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  ApplicationHost,
  ApplicationProductSession,
  ApplicationProductSessionHandle,
} from "../index.js";
import { serveApplicationEventStream } from "./event-stream.js";
import { executionHttp } from "./execution-http.js";

export type NodeApplicationProductRequest = {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly session: ApplicationProductSession;
  readonly sessionHandle: ApplicationProductSessionHandle;
  readonly pathname: string;
  readonly url: URL;
  readonly signal: AbortSignal;
};

export type NodeApplicationProductAdapter = {
  readonly product: string;
  handle(request: NodeApplicationProductRequest): Promise<boolean>;
};

export type NodeApplicationHomeRequest = {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly pathname: string;
  readonly url: URL;
};

export type NodeApplicationHomeAdapter = {
  handle(request: NodeApplicationHomeRequest): Promise<boolean>;
};

export type OpenNodeApplicationServerOptions = {
  readonly application: ApplicationHost;
  readonly products: readonly NodeApplicationProductAdapter[];
  readonly home?: NodeApplicationHomeAdapter;
  readonly hostname?: string;
  readonly port?: number;
  readonly token?: string;
};

export type NodeApplicationServerAddress = {
  readonly instance: string;
  readonly origin: string;
  readonly token: string;
  readonly home?: string;
};

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

async function jsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 1024 * 1024) throw new Error("Application request exceeds one megabyte.");
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("Application request body must be JSON.");
  }
}

function record(value: unknown, subject: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${subject} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function pathPart(value: string, subject: string): string {
  const decoded = decodeURIComponent(value);
  if (decoded.length === 0 || decoded.includes("/")) throw new Error(`${subject} is invalid.`);
  return decoded;
}

export class NodeApplicationServer {
  readonly application: ApplicationHost;
  readonly instance: string;
  readonly token: string;
  readonly #hostname: string;
  readonly #port: number;
  readonly #products = new Map<string, NodeApplicationProductAdapter>();
  readonly #home: NodeApplicationHomeAdapter | undefined;
  readonly #homeHandle: string | undefined;
  readonly #server;
  readonly #shutdown = new AbortController();
  #address: NodeApplicationServerAddress | undefined;
  #listenPromise: Promise<NodeApplicationServerAddress> | undefined;
  #closePromise: Promise<void> | undefined;

  constructor(options: OpenNodeApplicationServerOptions) {
    this.application = options.application;
    this.instance = `application_${randomUUID()}`;
    this.#hostname = options.hostname ?? "127.0.0.1";
    this.#port = options.port ?? 0;
    this.token = options.token ?? randomBytes(32).toString("base64url");
    this.#home = options.home;
    this.#homeHandle = options.home === undefined ? undefined : `home_${randomUUID()}`;
    if (this.token.length < 32) throw new Error("Application server token is too short.");
    for (const product of options.products) {
      if (this.#products.has(product.product)) {
        throw new Error(`Application server repeats Product adapter ${product.product}.`);
      }
      this.#products.set(product.product, product);
    }
    this.#server = createServer(async (request, response) => {
      try {
        await this.#handle(request, response);
      } catch (error) {
        if (!response.destroyed) sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  #authorized(request: IncomingMessage): boolean {
    return request.headers.authorization === `Bearer ${this.token}`;
  }

  async #handleControl(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    authorized = this.#authorized(request),
  ): Promise<boolean> {
    if (!url.pathname.startsWith("/api/application")) return false;
    if (!authorized) {
      sendJson(response, 401, { error: "Application authorization is required." });
      return true;
    }
    if (url.pathname.startsWith("/api/application/execution/")) {
      if (!this.#authorized(request) || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress ?? "")) {
        sendJson(response, 401, { error: "Application authorization is required." });
        return true;
      }
      const disconnected = new AbortController();
      response.once("close", () => disconnected.abort());
      const signal = AbortSignal.any([this.#shutdown.signal, disconnected.signal]);
      const result = await executionHttp(this.application, url, request.method, () => jsonBody(request), signal);
      if (!response.destroyed) sendJson(response, result.status, result.value);
      return true;
    }
    if (request.method === "GET" && url.pathname === "/api/application") {
      sendJson(response, 200, this.application.observe());
      return true;
    }
    if (request.method === "GET" && url.pathname === "/api/application/events") {
      serveApplicationEventStream(response, this.#shutdown.signal, this.application.subscribe.bind(this.application));
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/application/projects") {
      const project = await this.application.openProject(await jsonBody(request));
      sendJson(response, 201, { handle: project.handle, project: project.project });
      return true;
    }
    const projectPrefix = "/api/application/project-leases/";
    if (request.method === "GET" && url.pathname.startsWith(projectPrefix)) {
      const [encodedLease, projection, ...extra] = url.pathname.slice(projectPrefix.length).split("/");
      if (extra.length === 0 && (projection === undefined || projection === "events")) {
        const lease = pathPart(encodedLease!, "Project lease handle");
        const project = this.application.project(lease);
        if (projection === undefined) {
          sendJson(response, 200, await project.observe());
        } else {
          const lifetime = new AbortController();
          const signal = AbortSignal.any([lifetime.signal, this.#shutdown.signal]);
          serveApplicationEventStream(response, signal, (listener) => {
            const unsubscribeProject = project.subscribe(listener);
            const unsubscribeApplication = this.application.subscribe((event) => {
              if (event.kind === "project.lease-closed" && event.lease === lease) lifetime.abort();
            });
            return () => {
              unsubscribeProject();
              unsubscribeApplication();
            };
          });
        }
        return true;
      }
    }
    if (request.method === "DELETE" && url.pathname.startsWith(projectPrefix)) {
      await this.application.closeProject(pathPart(url.pathname.slice(projectPrefix.length), "Project lease handle"));
      response.writeHead(204, { "cache-control": "no-store" });
      response.end();
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/application/sessions") {
      const body = record(await jsonBody(request), "Product Session request");
      if (typeof body.project !== "string" || typeof body.product !== "string") {
        throw new Error("Product Session request requires project and product handles.");
      }
      const session = await this.application.launchProduct({
        project: body.project,
        product: body.product,
        input: body.input,
      });
      sendJson(response, 201, {
        handle: session.handle,
        project: session.project,
        product: session.product,
        url: this.sessionUrl(session.handle),
      });
      return true;
    }
    const sessionPrefix = "/api/application/sessions/";
    if (request.method === "DELETE" && url.pathname.startsWith(sessionPrefix)) {
      await this.application.closeProduct(pathPart(url.pathname.slice(sessionPrefix.length), "Product Session handle"));
      response.writeHead(204, { "cache-control": "no-store" });
      response.end();
      return true;
    }
    sendJson(response, 404, { error: "Application operation is unavailable." });
    return true;
  }

  async #handleHome(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
    if (this.#home === undefined || this.#homeHandle === undefined) return false;
    const prefix = `/home/${encodeURIComponent(this.#homeHandle)}`;
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return false;
    const pathname = url.pathname.slice(prefix.length) || "/";
    if (pathname.startsWith("/api/application")) {
      const controlUrl = new URL(url);
      controlUrl.pathname = pathname;
      return await this.#handleControl(request, response, controlUrl, true);
    }
    const handled = await this.#home.handle({ request, response, pathname, url });
    if (!handled) sendJson(response, 404, { error: "Application Home route is unavailable." });
    return true;
  }

  async #handleProduct(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
    const match = /^\/sessions\/([^/]+)(\/.*)?$/u.exec(url.pathname);
    if (match === null) return false;
    const handle = pathPart(match[1]!, "Product Session handle");
    const selected = this.application.session(handle);
    const adapter = this.#products.get(selected.product);
    if (adapter === undefined) throw new Error(`Product ${selected.product} has no local HTTP adapter.`);
    const handled = await adapter.handle({
      request,
      response,
      session: selected.session,
      sessionHandle: handle,
      pathname: match[2] ?? "/",
      url,
      signal: this.#shutdown.signal,
    });
    if (!handled) sendJson(response, 404, { error: "Product operation is unavailable." });
    return true;
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? this.#hostname}`);
    if (await this.#handleControl(request, response, url)) return;
    if (await this.#handleHome(request, response, url)) return;
    if (await this.#handleProduct(request, response, url)) return;
    if (request.method === "GET" && url.pathname === "/") {
      sendJson(response, 200, { service: "hypit.application", instance: this.instance });
      return;
    }
    sendJson(response, 404, { error: "Application route is unavailable." });
  }

  listen(): Promise<NodeApplicationServerAddress> {
    this.#listenPromise ??= new Promise<NodeApplicationServerAddress>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      this.#server.once("error", onError);
      this.#server.listen(this.#port, this.#hostname, () => {
        this.#server.off("error", onError);
        const address = this.#server.address() as AddressInfo;
        const origin = `http://${this.#hostname}:${address.port}`;
        this.#address = {
          instance: this.instance,
          origin,
          token: this.token,
          ...(this.#homeHandle === undefined
            ? {}
            : { home: `${origin}/home/${encodeURIComponent(this.#homeHandle)}/` }),
        };
        resolve(this.#address);
      });
    });
    return this.#listenPromise;
  }

  sessionUrl(handle: ApplicationProductSessionHandle): string {
    if (this.#address === undefined) throw new Error("Application server is not listening.");
    return `${this.#address.origin}/sessions/${encodeURIComponent(handle)}/`;
  }

  close(): Promise<void> {
    this.#closePromise ??= (async () => {
      this.#shutdown.abort();
      try {
        await this.#listenPromise?.catch(() => undefined);
        if (this.#server.listening) {
          await new Promise<void>((resolve, reject) => {
            this.#server.close((error) => error === undefined ? resolve() : reject(error));
          });
        }
      } finally {
        await this.application.close();
      }
    })();
    return this.#closePromise;
  }
}

export function openNodeApplicationServer(options: OpenNodeApplicationServerOptions): NodeApplicationServer {
  return new NodeApplicationServer(options);
}
