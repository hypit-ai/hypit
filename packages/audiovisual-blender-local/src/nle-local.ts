import { createMediaExecutionEnvironment } from "@hypit/media-local/execution";
import {
  createLocalNlePictureTerminalFacet,
  type LocalNlePictureTerminalFacet,
} from "@hypit/nle-audiovisual-local";

import {
  createBlenderTerminalCapability,
  createBlenderTerminalExecutor,
} from "./execution.js";
import { requireBlenderRuntime } from "./environment.js";
import { blenderSceneFormat } from "./program.js";

export type LocalBlenderNlePictureTerminalOptions = {
  readonly terminal: string;
  readonly blenderPath?: string;
  readonly ffmpegPath?: string;
  readonly ffprobePath?: string;
  readonly processTimeoutMs?: number;
  readonly maxProcessOutputBytes?: number;
  readonly maxFrameRate?: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Package-owned local execution facet for one frame-independent Blender Picture Terminal. */
export function createLocalBlenderNlePictureTerminalFacet(
  options: LocalBlenderNlePictureTerminalOptions,
): LocalNlePictureTerminalFacet {
  assert(options.terminal.trim().length > 0, "Local Blender Picture Terminal identity is empty.");
  return createLocalNlePictureTerminalFacet({
    terminal: options.terminal,
    create(context) {
      assert(context.sources.length > 0,
        `Blender Picture Terminal ${options.terminal} received no selected Sources.`);
      assert(context.sources.every((source) => source.terminal === options.terminal),
        `Blender Picture Terminal ${options.terminal} received a Source selected for another Terminal.`);
      assert(context.sources.every((source) => source.program.format === blenderSceneFormat),
        `Blender Picture Terminal ${options.terminal} received a non-Blender programme.`);
      const representations = new Set(context.sources.map((source) => source.representation));
      assert(representations.size === 1,
        `Blender Picture Terminal ${options.terminal} selected multiple Product representations.`);
      const media = createMediaExecutionEnvironment(context.resources, {
        ...context.media,
        ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
        ...(options.ffprobePath === undefined ? {} : { ffprobePath: options.ffprobePath }),
        ...(options.processTimeoutMs === undefined ? {} : { processTimeoutMs: options.processTimeoutMs }),
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      });
      const runtime = requireBlenderRuntime(options.blenderPath);
      const sources = { sources: context.sources.map((source) => ({
        source: source.source,
        output: source.output,
        program: structuredClone(source.program),
      })) };
      const input = {
        terminal: options.terminal,
        representation: [...representations][0]!,
        sources,
        environment: {
          artifacts: media.artifacts,
          blenderPath: runtime.executable,
          ffmpegPath: options.ffmpegPath ?? media.ffmpegPath,
          ffprobePath: options.ffprobePath ?? media.ffprobePath,
          processTimeoutMs: options.processTimeoutMs ?? media.processTimeoutMs,
          maxProcessOutputBytes: options.maxProcessOutputBytes ?? 8 * 1024 * 1024,
          maxFrameRate: options.maxFrameRate ?? 240,
          ...(context.signal === undefined ? {} : { signal: context.signal }),
        },
      };
      return {
        capability: createBlenderTerminalCapability(input),
        executor: createBlenderTerminalExecutor(input),
      };
    },
  });
}
