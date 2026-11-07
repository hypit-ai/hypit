/** Public structural ABI for packages that contribute commands to the root Hypit CLI Host. */
export type { CliApplicationContext, CliCommandModule } from "./application.js";
export { commandHint } from "./command-hint.js";
export type { CommandScope } from "./command-hint.js";
export { parseCliDecimalInteger } from "./decimal-integer.js";
export { hypitHostStateRoot, hypitProjectStateRoot } from "./paths.js";
export { writeCliHelp, writeCliOutput } from "./output.js";
export type { CliIo, CliMachineView, CliOutputOptions, CliTerminal } from "./output.js";
