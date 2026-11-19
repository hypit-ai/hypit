import type { NodeApplicationServerAddress } from "@hypit/application/node";
import {
  findLocalServiceEndpoint, localServiceEndpointPath, reserveLocalServiceEndpoint, waitForLocalService,
  type LocalServiceEndpoint, type LocalServiceEndpointLease, type LocalServiceEndpointOptions,
} from "./local-endpoint.js";

export type NodeHypitApplicationEndpoint = LocalServiceEndpoint<"application">;
export type NodeHypitApplicationEndpointOptions = LocalServiceEndpointOptions;
export type NodeHypitApplicationEndpointLease = LocalServiceEndpointLease<"application">;

export function nodeHypitApplicationEndpointPath(options: NodeHypitApplicationEndpointOptions = {}) {
  return localServiceEndpointPath("application", options);
}

export function findNodeHypitApplicationEndpoint(options: NodeHypitApplicationEndpointOptions = {}) {
  return findLocalServiceEndpoint("application", options);
}

export function waitForLocalApplication(options: NodeHypitApplicationEndpointOptions, signal?: AbortSignal) {
  return waitForLocalService("application", options, signal);
}

export function reserveNodeHypitApplicationEndpoint(options: NodeHypitApplicationEndpointOptions = {}) {
  return reserveLocalServiceEndpoint("application", options);
}

export async function publishNodeHypitApplicationEndpoint(
  address: NodeApplicationServerAddress, options: NodeHypitApplicationEndpointOptions = {},
): Promise<NodeHypitApplicationEndpointLease> {
  const reservation = await reserveNodeHypitApplicationEndpoint(options);
  if (reservation === undefined) throw new Error("Hypit Application is already starting or running.");
  try { return await reservation.publish(address); }
  catch (error) { await reservation.close(); throw error; }
}
