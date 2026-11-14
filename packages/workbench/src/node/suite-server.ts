import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";

export type WorkbenchSuiteSurface = "nle" | "scene" | "canvas";

export type WorkbenchSuiteServer = {
  readonly origin: string;
  readonly urls: Partial<Record<WorkbenchSuiteSurface, string>>;
  readonly mediaUrl?: string;
  close(): Promise<void>;
};

type SurfaceTargets = Partial<Record<WorkbenchSuiteSurface, string>>;

function origin(host: string, port: number): string {
  return `http://${host.includes(":") ? `[${host}]` : host}:${port}`;
}

function surfacePath(surface: WorkbenchSuiteSurface): string {
  if (surface === "nle") return "/nle";
  if (surface === "scene") return "/3d";
  return "/canvas";
}

function routeSurface(pathname: string): WorkbenchSuiteSurface | "shared" | "project" | undefined {
  if (pathname === "/nle" || pathname === "/comments" || pathname.startsWith("/api/nle")) return "nle";
  if (pathname === "/3d" || pathname.startsWith("/api/scene")) return "scene";
  if (pathname === "/canvas" || pathname.startsWith("/api/canvas")) return "canvas";
  if (pathname === "/assets/app.js" || pathname === "/assets/style.css") return "nle";
  if (pathname.startsWith("/assets/3d") || pathname === "/assets/three.module.js"
    || pathname === "/assets/three.core.js" || pathname === "/assets/OrbitControls.js"
    || pathname === "/assets/TransformControls.js" || pathname === "/assets/GLTFLoader.js"
    || pathname === "/assets/BufferGeometryUtils.js") return "scene";
  if (pathname.startsWith("/assets/canvas")) return "canvas";
  if (pathname === "/api/workbench/environment") return "shared";
  if (pathname === "/api/project/media" || pathname.startsWith("/api/project/media/")) return "project";
  if (pathname === "/assets/topbar.js" || pathname === "/assets/topbar.css") return "shared";
  return undefined;
}

function proxy(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  targetOrigin: string,
): void {
  const target = new URL(targetOrigin);
  const upstream = httpRequest({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    method: incoming.method,
    path: incoming.url,
    headers: { ...incoming.headers, host: target.host },
  }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.on("error", (error) => {
    if (outgoing.headersSent) {
      outgoing.destroy(error);
      return;
    }
    outgoing.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    outgoing.end(`${JSON.stringify({
      format: "hypit.workbench-error@1",
      error: { name: error.name, message: error.message },
    })}\n`);
  });
  incoming.pipe(upstream);
}

/**
 * Publishes independent Workbench surface Hosts through one loopback origin.
 *
 * Each surface keeps its own document, package selection and domain Host. This
 * process-local router gives their already-disjoint URLs one shared shell and
 * may expose a separately owned Project application adapter on the same origin.
 */
export async function startWorkbenchSuiteServer(options: {
  readonly targets: SurfaceTargets;
  /** Project-scoped application adapter shared by otherwise independent surfaces. */
  readonly projectTarget?: string;
  readonly defaultSurface: WorkbenchSuiteSurface;
  readonly host?: "127.0.0.1" | "::1";
  readonly port?: number;
}): Promise<WorkbenchSuiteServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Workbench Suite port must be an integer from 0 through 65535.");
  }
  if (options.targets[options.defaultSurface] === undefined) {
    throw new Error(`Workbench Suite default surface ${options.defaultSurface} is not mounted.`);
  }
  const sharedTarget = options.targets.nle ?? options.targets.scene ?? options.targets.canvas;
  if (sharedTarget === undefined) throw new Error("Workbench Suite needs at least one surface.");

  const server = createServer(async (incoming, outgoing) => {
    const url = new URL(incoming.url ?? "/", "http://workbench.local");
    if (incoming.method === "GET" && url.pathname === "/") {
      outgoing.writeHead(302, { location: surfacePath(options.defaultSurface) });
      outgoing.end();
      return;
    }
    const routed = routeSurface(url.pathname);
    const target = routed === "shared" ? sharedTarget
      : routed === "project" ? options.projectTarget
        : routed === undefined ? undefined : options.targets[routed];
    if (target !== undefined) {
      proxy(incoming, outgoing, target);
      return;
    }
    const missing = routed !== undefined && routed !== "shared";
    outgoing.writeHead(missing ? 404 : 400, {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    });
    outgoing.end(`${JSON.stringify({
      format: "hypit.workbench-error@1",
      error: {
        name: "Error",
        message: missing
          ? `Workbench surface ${routed} is not mounted in this process.`
          : `Unknown Workbench route: ${url.pathname}`,
      },
    })}\n`);
  });

  await new Promise<void>((fulfill, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => { server.removeListener("error", reject); fulfill(); });
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Workbench Suite did not bind a TCP address.");
  const base = origin(host, address.port);
  return {
    origin: base,
    urls: Object.fromEntries(Object.keys(options.targets).map((key) => [
      key,
      `${base}${surfacePath(key as WorkbenchSuiteSurface)}`,
    ])) as Partial<Record<WorkbenchSuiteSurface, string>>,
    ...(options.projectTarget === undefined ? {} : { mediaUrl: `${base}/api/project/media` }),
    async close() {
      await new Promise<void>((fulfill, reject) => server.close((error) => error === undefined ? fulfill() : reject(error)));
    },
  };
}
