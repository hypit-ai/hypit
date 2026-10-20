/** Public structural ABI for packages that contribute commands to the root Hypit CLI Host. */
export type { CliApplicationContext, CliCommandModule } from "./application.js";
export { commandHint } from "./command-hint.js";
export { parseCliDecimalInteger } from "./decimal-integer.js";
export { cliEndpointLine, cliEndpointView, createCliScratchResources, openCliRuntimeHost, selectCliEndpoint } from "./immediate.js";
export type { CliRuntimeSelectionContext } from "./immediate.js";
export { hypitHostStateRoot, hypitProjectStateRoot } from "./paths.js";
export { writeCliOutput } from "./output.js";
export { loadDiscoveredSourcePackages } from "./source-packages.js";
export { discoverSourcePackages } from "./source-discovery.js";
export { resolveBuildResultValue } from "./run-file.js";
export type { CliCompilerOptions, CliDistribution } from "./distribution.js";
export type { CliIo, CliMachineView, CliOutputOptions, CliTerminal } from "./output.js";
export type * from "./runtime-port.js";
