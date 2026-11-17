#!/usr/bin/env node
import { resolve } from "node:path";
import { openApplicationHost } from "@hypit/application";
import {
  createNodeApplicationProjectProvider,
  openNodeApplicationServer,
} from "@hypit/application/node";
import {
  createNleStudioProductProvider,
  nleStudioProduct,
  type NleStudioProductSession,
} from "./host.js";
import { nleStudioNodeProductAdapter } from "./node-adapter.js";
import { createLocalHtmlVideoExecutor } from "@hypit/html-video-local";

type CliOptions = {
  readonly root: string;
  readonly document: string;
  readonly viewDocument?: string;
  readonly port: number;
};

function cliOptions(argv: readonly string[]): CliOptions {
  let root: string | undefined;
  let document: string | undefined;
  let viewDocument: string | undefined;
  let port = 4317;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    const value = argv[index + 1];
    if (flag === "--root" && value !== undefined) root = value;
    else if (flag === "--document" && value !== undefined) document = value;
    else if (flag === "--view" && value !== undefined) viewDocument = value;
    else if (flag === "--port" && value !== undefined) port = Number(value);
    else throw new Error(`Unknown or incomplete NLE Studio option: ${String(flag)}.`);
    index += 1;
  }
  if (root === undefined) throw new Error("NLE Studio requires --root <project-directory>.");
  if (document === undefined) throw new Error("NLE Studio requires --document <project-relative-svml>.");
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error("NLE Studio --port must be an integer from 0 through 65535.");
  }
  return viewDocument === undefined ? { root, document, port } : { root, document, viewDocument, port };
}

const options = cliOptions(process.argv.slice(2));
const mediaTools = {
  ...(process.env.HYPIT_FFMPEG_PATH?.trim() ? { ffmpegPath: process.env.HYPIT_FFMPEG_PATH.trim() } : {}),
  ...(process.env.HYPIT_FFPROBE_PATH?.trim() ? { ffprobePath: process.env.HYPIT_FFPROBE_PATH.trim() } : {}),
  ...(process.env.HYPIT_CHROME_PATH?.trim() ? { chromePath: process.env.HYPIT_CHROME_PATH.trim() } : {}),
  ...(process.env.HYPIT_ELECTRON_PATH?.trim() ? { electronPath: process.env.HYPIT_ELECTRON_PATH.trim() } : {}),
};
const application = openApplicationHost({
  projects: createNodeApplicationProjectProvider(),
  products: [createNleStudioProductProvider({
    deliveryExecutor: createLocalHtmlVideoExecutor(mediaTools),
    mediaTools,
  })],
});
const server = openNodeApplicationServer({
  application,
  products: [nleStudioNodeProductAdapter],
  port: options.port,
});
const address = await server.listen();
const projectLease = await application.openProject({ root: options.root });
const productLease = await application.launchProduct<NleStudioProductSession>({
  project: projectLease.handle,
  product: nleStudioProduct,
  input: {
    document: options.document,
    ...(options.viewDocument === undefined ? {} : { viewDocument: options.viewDocument }),
  },
});

process.stdout.write(`Hypit Application: ${address.origin}\n`);
process.stdout.write(`Application token: ${address.token}\n`);
process.stdout.write(`NLE Studio: ${server.sessionUrl(productLease.handle)}\n`);
process.stdout.write(`Application Project: ${projectLease.project}\n`);
process.stdout.write(`Product Session: ${productLease.handle}\n`);
process.stdout.write(`Project Boundary: ${resolve(options.root)}\n`);
process.stdout.write(`NLE document: ${options.document}\n`);

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  void server.close().then(() => process.exit(0), (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
