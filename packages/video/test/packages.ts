import artifact from "../../blob/src/activation.js";
import captionFine from "../../caption-fine/src/activation.js";
import caption from "../../caption/src/activation.js";
import composition from "../../composition/src/activation.js";
import film from "../../film/src/activation.js";
import fontsource from "../../fontsource/src/activation.js";
import generation from "../../generation/src/activation.js";
import htmlDocument from "../../html-document/src/activation.js";
import renderHTML from "../../html-video/src/activation.js";
import htmlProgram from "../../html-program/src/activation.js";
import mediaOperations from "../../media-operations/src/activation.js";
import mediaTrack from "../../visual-track/src/activation.js";
import media from "../../media/src/activation.js";
import narrative from "../../narrative/src/activation.js";
import narrativeCaption from "../../narrative-caption/src/activation.js";
import narrativeTemporal from "../../narrative-temporal/src/activation.js";
import text from "../../text/src/activation.js";
import runMarkup from "../../markup/src/run/activation.js";
import script from "../../script/src/activation.js";
import seedance from "../../seedance/src/activation.js";
import speechAlignment from "../../narrative-speech-alignment/src/activation.js";
import timelineAuthor from "../../timeline-author/src/activation.js";
import speechEvidence from "../../speech-evidence/src/activation.js";
import timeline from "../../timeline/src/activation.js";
import spatial from "../../spatial/src/activation.js";
import temporal from "../../temporal/src/activation.js";
import svs from "../../recipe/src/activation.js";
import textFine from "../../text-fine/src/activation.js";
import whisperX from "../../whisperx/src/activation.js";
import type { PackageContribution } from "@hypit/loader";

const bind = (specifier: string, contribution: PackageContribution) => ({
  specifier,
  contribution,
});

/** Test-only explicit environment; the production Video application starts with no author packages. */
export const videoTestPackages = [
  bind("@hypit/blob", artifact),
  bind("@hypit/narrative", narrative),
  bind("@hypit/narrative-caption", narrativeCaption),
  bind("@hypit/narrative-temporal", narrativeTemporal),
  bind("@hypit/media", media),
  bind("@hypit/speech-evidence", speechEvidence),
  bind("@hypit/timeline", timeline),
  bind("@hypit/composition", composition),
  bind("@hypit/recipe", svs),
  bind("@hypit/script", script),
  bind("@hypit/fontsource", fontsource),
  bind("@hypit/text", text),
  bind("@hypit/generation", generation),
  bind("@hypit/seedance", seedance),
  bind("@hypit/caption", caption),
  bind("@hypit/caption-fine", captionFine),
  bind("@hypit/narrative-speech-alignment", speechAlignment),
  bind("@hypit/timeline-author", timelineAuthor),
  bind("@hypit/whisperx", whisperX),
  bind("@hypit/spatial", spatial),
  bind("@hypit/temporal", temporal),
  bind("@hypit/visual-track", mediaTrack),
  bind("@hypit/text-fine", textFine),
  bind("@hypit/film", film),
  bind("@hypit/html-document", htmlDocument),
  bind("@hypit/html-program", htmlProgram),
  bind("@hypit/media-operations", mediaOperations),
  bind("@hypit/html-video", renderHTML),
  bind("@hypit/markup", runMarkup),
] as const;
