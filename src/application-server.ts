#!/usr/bin/env node
import {
  openNodeHypitApplicationServer,
  publishNodeHypitApplicationEndpoint,
} from "./application-node.js";

type CliOptions = {
  readonly port: number;
};

function cliOptions(argv: readonly string[]): CliOptions {
  let port = 4317;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    const value = argv[index + 1];
    if (flag === "--port" && value !== undefined) port = Number(value);
    else throw new Error(`Unknown or incomplete Hypit Application option: ${String(flag)}.`);
    index += 1;
  }
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error("Hypit Application --port must be an integer from 0 through 65535.");
  }
  return { port };
}

const options = cliOptions(process.argv.slice(2));
const server = openNodeHypitApplicationServer({ port: options.port });
const address = await server.listen();
const endpoint = await publishNodeHypitApplicationEndpoint(address).catch(async (error: unknown) => {
  await server.close();
  throw error;
});

process.stdout.write(`Hypit Application: ${address.origin}\n`);
if (address.home !== undefined) process.stdout.write(`Application Home: ${address.home}\n`);
process.stdout.write(`Application token: ${address.token}\n`);
process.stdout.write(`Application endpoint: ${endpoint.path}\n`);

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  void endpoint.close().then(async () => await server.close()).then(() => process.exit(0), (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
