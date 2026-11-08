import type { CliCommandModule } from "@hypit/cli";

import { runBuildOperationsCli } from "./main.js";
import { writeBuildOperationsCliRootHelp, writeCliHelp } from "./output.js";
import type { BuildOperationsCliServices } from "./services.js";

export const buildOperationsCliCommandNames = [
  "builds", "history", "inspect", "logs", "status", "activity", "cancel", "result", "auth", "doctor",
] as const;

export function createBuildOperationsCliCommandModules(
  services: BuildOperationsCliServices,
): readonly CliCommandModule[] {
  return [{
    format: "hypit.cli-command@1",
    id: "@hypit/build-operations-cli",
    commands: buildOperationsCliCommandNames,
    writeRootHelp: writeBuildOperationsCliRootHelp,
    writeHelp(argv, io) {
      const topic = argv[0] === "help" ? argv[1] : argv[0];
      writeCliHelp(io, topic);
    },
    async run(argv, io, context) {
      await runBuildOperationsCli(argv, io, services, context);
    },
  }];
}

export { parseCommand } from "./arguments.js";
export type { AuthorCommand, CliCommand, RuntimeOption } from "./command.js";
export { runBuildOperationsCli } from "./main.js";
export {
  activityObservationKey,
  buildObservationKey,
  buildProgressLines,
  buildProgressView,
  observeBuild,
  observeBuildView,
} from "./observation.js";
export type { BuildProgressView } from "./observation.js";
export { acquireOAuthCredential, authorizeBrowserLaunch } from "./oauth.js";
export { createPlanOutput, createPricingOutput, writeCliHelp, writeCliOutput,
  writeSourceBuildCliRootHelp } from "./output.js";
export type { PlanRequest, PlanRequestOutput, PricingRequest } from "./output.js";
export { inlineValuePreview } from "./runtime-view.js";
export { buildResultView, buildStatusView, cliTypeName, projectPath } from "./view.js";
export type { OperationalMachineView } from "./machine-view.js";
export type { BuildCliContextServices, BuildOperationsCliServices } from "./services.js";
export type * from "./runtime-port.js";
export type {
  CliBuildResultView, CliBuildStatusView, CliBuildSummary, CliOutputView, PublicOutputRepresentation,
} from "./view.js";
