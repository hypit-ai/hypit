import type { CliCommandModule } from "@hypit/cli";

import {
  runWorkbenchCli,
  startCanvasProjectWorkbench,
  startNleProjectWorkbench,
  startSceneProjectWorkbench,
  writeWorkbenchHelp,
  type WorkbenchCliOptions,
} from "./cli-command.js";
import { runSceneRecordCli, writeSceneRecordHelp } from "./scene-record-cli.js";

export type { WorkbenchCliOptions } from "./cli-command.js";

export function createWorkbenchCliCommandModules(
  options: WorkbenchCliOptions = {},
): readonly CliCommandModule[] {
  return [{
  id: "@hypit/workbench#cli",
  commands: ["workbench"],
  writeRootHelp(io) {
    io.write("\nBrowser Workbench\n  workbench <document> [<document> ...]\n");
  },
  writeHelp(_argv, io) {
    writeWorkbenchHelp(io);
  },
  async run(argv, io, context) {
    await runWorkbenchCli(argv, io, context.cwd, await context.resolveProjectRoot(), options);
  },
  }, {
    id: "@hypit/workbench#scene-record-cli",
    commands: ["scene"],
    writeRootHelp(io) {
      io.write("\nScene output\n  scene record <project.scene.json> --to <output.mp4>\n");
    },
    writeHelp(_argv, io) {
      writeSceneRecordHelp(io);
    },
    async run(argv, io, context) {
      await runSceneRecordCli(argv, io, context.cwd, await context.resolveProjectRoot(), options);
    },
  }] as const satisfies readonly CliCommandModule[];
}

export {
  runWorkbenchCli,
  startCanvasProjectWorkbench,
  startNleProjectWorkbench,
  startSceneProjectWorkbench,
  writeWorkbenchHelp,
};
export { runSceneRecordCli, writeSceneRecordHelp } from "./scene-record-cli.js";
