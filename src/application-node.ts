import {
  openApplicationHost,
  type ApplicationExecutionDirectory,
  type ApplicationHost,
  type ApplicationProductProvider,
} from "@hypit/application";
import {
  createNodeApplicationProjectProvider,
  openNodeApplicationServer,
  type NodeApplicationProductAdapter,
  type NodeApplicationServer,
} from "@hypit/application/node";
import { applicationHomeNodeAdapter } from "@hypit/application-home/node";
import {
  nleStudioProductProvider,
} from "@hypit/nle-studio";
import { nleStudioNodeProductAdapter } from "@hypit/nle-studio/node";

export * from "@hypit/application/node";
export {
  findNodeHypitApplicationEndpoint,
  nodeHypitApplicationEndpointPath,
  publishNodeHypitApplicationEndpoint,
  type NodeHypitApplicationEndpoint,
  type NodeHypitApplicationEndpointLease,
  type NodeHypitApplicationEndpointOptions,
} from "./application-endpoint.js";

export type OpenNodeHypitApplicationOptions = {
  readonly execution?: ApplicationExecutionDirectory;
  readonly products?: readonly ApplicationProductProvider[];
};

export type OpenNodeHypitApplicationServerOptions = OpenNodeHypitApplicationOptions & {
  readonly application?: ApplicationHost;
  readonly productAdapters?: readonly NodeApplicationProductAdapter[];
  readonly hostname?: string;
  readonly port?: number;
  readonly token?: string;
};

export function openNodeHypitApplication(
  options: OpenNodeHypitApplicationOptions = {},
): ApplicationHost {
  return openApplicationHost({
    projects: createNodeApplicationProjectProvider(),
    products: [nleStudioProductProvider, ...(options.products ?? [])],
    ...(options.execution === undefined ? {} : { execution: options.execution }),
  });
}

export function openNodeHypitApplicationServer(
  options: OpenNodeHypitApplicationServerOptions = {},
): NodeApplicationServer {
  const application = options.application ?? openNodeHypitApplication(options);
  return openNodeApplicationServer({
    application,
    home: applicationHomeNodeAdapter,
    products: [nleStudioNodeProductAdapter, ...(options.productAdapters ?? [])],
    ...(options.hostname === undefined ? {} : { hostname: options.hostname }),
    ...(options.port === undefined ? {} : { port: options.port }),
    ...(options.token === undefined ? {} : { token: options.token }),
  });
}
