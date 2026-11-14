import type { AudiovisualProgram } from "@hypit/audiovisual";
import {
  assertAudiovisualPictureOutput,
  type AudiovisualPictureDemand,
  type AudiovisualPictureOutput,
} from "@hypit/audiovisual-execution";
import type { HtmlProgram } from "@hypit/html-program";

import { lowerAudiovisualPictureProgramToHtmlProgram } from "./lower.js";
import type { AudiovisualHtmlSourceSet } from "./source.js";

/** Close one resolved Programme under an explicit HTML output policy. */
export function compileAudiovisualHtmlProgram(
  program: AudiovisualProgram,
  sources: AudiovisualHtmlSourceSet,
  output: AudiovisualPictureOutput,
  demand?: AudiovisualPictureDemand,
): HtmlProgram {
  assertAudiovisualPictureOutput(output);
  return lowerAudiovisualPictureProgramToHtmlProgram({
    program,
    output,
    sources,
    ...(demand === undefined ? {} : { demand }),
  });
}
