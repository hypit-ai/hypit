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
import { createCanvasStudioProductProvider } from "@hypit/canvas-studio";
import { canvasStudioNodeProductAdapter } from "@hypit/canvas-studio/node";
import {
  createNleStudioProductProvider,
} from "@hypit/nle-studio";
import { nleStudioNodeProductAdapter } from "@hypit/nle-studio/node";
import {
  createLocalHtmlVideoExecutor,
  type LocalHtmlVideoTools,
} from "@hypit/html-video-local";

import { canvasProjectAdapter } from "./canvas-project.js";

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
  readonly closeExecution?: boolean;
  /** Local audiovisual tools supplied to the default NLE Studio executors. */
  readonly localHtmlVideo?: LocalHtmlVideoTools;
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
  const video = createLocalHtmlVideoExecutor(options.localHtmlVideo ?? {});
  return openApplicationHost({
    projects: createNodeApplicationProjectProvider(),
    products: [createNleStudioProductProvider({
      deliveryExecutor: video,
      frameExecutor: video,
      ...(options.localHtmlVideo === undefined ? {} : { mediaTools: options.localHtmlVideo }),
    }), createCanvasStudioProductProvider(options.localHtmlVideo), ...(options.products ?? [])],
    ...(options.execution === undefined ? {} : { execution: options.execution }),
    ...(options.closeExecution === undefined ? {} : { closeExecution: options.closeExecution }),
  });
}

export function openNodeHypitApplicationServer(
  options: OpenNodeHypitApplicationServerOptions = {},
): NodeApplicationServer {
  const application = options.application ?? openNodeHypitApplication(options);
  return openNodeApplicationServer({
    application,
    closeApplication: options.application === undefined,
    home: applicationHomeNodeAdapter,
    projectAdapters: [canvasProjectAdapter(options.localHtmlVideo)],
    products: [nleStudioNodeProductAdapter, canvasStudioNodeProductAdapter, ...(options.productAdapters ?? [])],
    ...(options.hostname === undefined ? {} : { hostname: options.hostname }),
    ...(options.port === undefined ? {} : { port: options.port }),
    ...(options.token === undefined ? {} : { token: options.token }),
  });
}
