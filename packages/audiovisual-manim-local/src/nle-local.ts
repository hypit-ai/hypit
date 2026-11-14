import { createMediaExecutionEnvironment } from "@hypit/media-local/execution";
import {
  createLocalNlePictureTerminalFacet,
  type LocalNlePictureTerminalFacet,
} from "@hypit/nle-audiovisual-local";

import {
  createManimTerminalCapability,
  createManimTerminalExecutor,
} from "./execution.js";
import { requireManimRuntime } from "./environment.js";
import { manimSceneFormat } from "./program.js";

export type LocalManimNlePictureTerminalOptions = {
  /** Nominal identity selected by the component package's NLE Picture Source projection. */
  readonly terminal: string;
  readonly pythonPath?: string;
  readonly ffprobePath?: string;
  readonly processTimeoutMs?: number;
  readonly maxProcessOutputBytes?: number;
  readonly maxFrameRate?: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Package-owned local execution facet for one explicitly named Manim Picture Terminal. */
export function createLocalManimNlePictureTerminalFacet(
  options: LocalManimNlePictureTerminalOptions,
): LocalNlePictureTerminalFacet {
  assert(options.terminal.trim().length > 0, "Local Manim Picture Terminal identity is empty.");
  return createLocalNlePictureTerminalFacet({
    terminal: options.terminal,
    create(context) {
      assert(context.sources.length > 0,
        `Manim Picture Terminal ${options.terminal} received no selected Sources.`);
      assert(context.sources.every((source) => source.terminal === options.terminal),
        `Manim Picture Terminal ${options.terminal} received a Source selected for another Terminal.`);
      assert(context.sources.every((source) => source.program.format === manimSceneFormat),
        `Manim Picture Terminal ${options.terminal} received a non-Manim programme.`);
      const representations = new Set(context.sources.map((source) => source.representation));
      assert(representations.size === 1,
        `Manim Picture Terminal ${options.terminal} selected multiple Product representations.`);
      const media = createMediaExecutionEnvironment(context.resources, {
        ...context.media,
        ...(options.ffprobePath === undefined ? {} : { ffprobePath: options.ffprobePath }),
        ...(options.processTimeoutMs === undefined ? {} : { processTimeoutMs: options.processTimeoutMs }),
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      });
      const runtime = options.pythonPath === undefined ? requireManimRuntime() : undefined;
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
          pythonPath: options.pythonPath ?? runtime!.python,
          ffprobePath: options.ffprobePath ?? media.ffprobePath,
          processTimeoutMs: options.processTimeoutMs ?? media.processTimeoutMs,
          maxProcessOutputBytes: options.maxProcessOutputBytes ?? 4 * 1024 * 1024,
          maxFrameRate: options.maxFrameRate ?? 240,
          ...(context.signal === undefined ? {} : { signal: context.signal }),
        },
      };
      return {
        capability: createManimTerminalCapability(input),
        executor: createManimTerminalExecutor(input),
      };
    },
  });
}
