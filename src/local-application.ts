import { randomInt } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { openNodeHypitApplicationServer } from "./application-node.js";
import {
  findNodeHypitApplicationEndpoint, reserveNodeHypitApplicationEndpoint,
  type NodeHypitApplicationEndpointOptions,
} from "./application-endpoint.js";
import { openApplicationExecutionDirectory } from "@hypit/application";
import { discoverLocalExecution } from "./local-execution.js";

export async function startLocalApplication(
  options: NodeHypitApplicationEndpointOptions & { readonly port: number; readonly executionEndpointFile?: string },
) {
  const deadline = Date.now() + 8_000;
  let reservation;
  do {
    const existing = await findNodeHypitApplicationEndpoint(options);
    if (existing !== undefined) return { endpoint: existing };
    reservation = await reserveNodeHypitApplicationEndpoint(options);
    if (reservation !== undefined) break;
    // Concurrent SQLite writers can both lose the first lock attempt on a new file.
    await delay(randomInt(50, 120));
  } while (Date.now() < deadline);
  if (reservation === undefined) throw new Error("Hypit Host startup is busy. Try again when the running Host is ready.");

  let server: ReturnType<typeof openNodeHypitApplicationServer> | undefined;
  let execution: ReturnType<typeof openApplicationExecutionDirectory> | undefined;
  try {
    const discover = discoverLocalExecution(options.executionEndpointFile === undefined ? {} : { path: options.executionEndpointFile });
    execution = openApplicationExecutionDirectory([], () => discover);
    const localHtmlVideo = {
      ...(process.env.HYPIT_FFMPEG_PATH?.trim() ? { ffmpegPath: process.env.HYPIT_FFMPEG_PATH.trim() } : {}),
      ...(process.env.HYPIT_FFPROBE_PATH?.trim() ? { ffprobePath: process.env.HYPIT_FFPROBE_PATH.trim() } : {}),
      ...(process.env.HYPIT_CHROME_PATH?.trim() ? { chromePath: process.env.HYPIT_CHROME_PATH.trim() } : {}),
      ...(process.env.HYPIT_ELECTRON_PATH?.trim() ? { electronPath: process.env.HYPIT_ELECTRON_PATH.trim() } : {}),
    };
    server = openNodeHypitApplicationServer({ port: options.port, localHtmlVideo, execution, closeExecution: true });
    const selected = server;
    const publication = await reservation.publish(await server.listen());
    return {
      endpoint: publication.endpoint,
      close: async () => {
        try { await selected.close(); }
        finally { await reservation.close(); }
      },
    };
  } catch (error) {
    try {
      if (server !== undefined) await server.close();
      else await execution?.close();
    } finally {
      await reservation.close();
    }
    throw error;
  }
}
