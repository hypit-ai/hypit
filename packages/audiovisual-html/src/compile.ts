import type { AudiovisualProgram } from "@hypit/audiovisual";
import type { HtmlProgram } from "@hypit/html-program";

import { lowerAudiovisualPictureProgramToHtmlProgram } from "./lower.js";
import { assertAudiovisualHtmlOutput } from "./source.js";
import type { AudiovisualHtmlOutput, AudiovisualHtmlSourceSet } from "./source.js";

/** Close one resolved Programme under an explicit HTML output policy. */
export function compileAudiovisualHtmlProgram(
  program: AudiovisualProgram,
  sources: AudiovisualHtmlSourceSet,
  output: AudiovisualHtmlOutput,
): HtmlProgram {
  assertAudiovisualHtmlOutput(output);
  return lowerAudiovisualPictureProgramToHtmlProgram({
    program,
    output,
    sources,
  });
}
