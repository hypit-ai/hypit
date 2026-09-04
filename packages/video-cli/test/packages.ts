import artifact from "../../artifact/src/activation.js";
import captionFine from "../../caption-fine/src/activation.js";
import caption from "../../caption/src/activation.js";
import composition from "../../composition/src/activation.js";
import estimate from "../../estimate/src/activation.js";
import film from "../../film/src/activation.js";
import fontsOpen from "../../fonts-open/src/activation.js";
import generation from "../../generation/src/activation.js";
import renderHyperframes from "../../render-hyperframes/src/activation.js";
import hyperframes from "../../hyperframes/src/activation.js";
import mediaPipeline from "../../media-pipeline/src/activation.js";
import mediaTrack from "../../media-track/src/activation.js";
import media from "../../media/src/activation.js";
import narrative from "../../narrative/src/activation.js";
import programSpace from "../../program-space/src/activation.js";
import text from "../../text/src/activation.js";
import runMarkup from "../../run-markup/src/activation.js";
import script from "../../script/src/activation.js";
import seedance from "../../seedance/src/activation.js";
import speechAlignment from "../../speech-alignment/src/activation.js";
import speechTrack from "../../speech-track/src/activation.js";
import speech from "../../speech/src/activation.js";
import speechEvidence from "../../speech-evidence/src/activation.js";
import semanticTrack from "../../semantic-track/src/activation.js";
import spatial from "../../spatial/src/activation.js";
import standIn from "../../stand-in/src/activation.js";
import temporal from "../../temporal/src/activation.js";
import visualIr from "../../visual-ir/src/activation.js";
import svs from "../../svs/src/activation.js";
import typographyTrack from "../../typography-track/src/activation.js";
import whisperX from "../../whisperx/src/activation.js";
import type { NodePackageContribution } from "@hypit/package-loader-node";

const bind = (specifier: string, contribution: NodePackageContribution) => ({
  specifier,
  contribution,
});

/** Test-only explicit environment; production video CLI starts with no author packages. */
export const videoTestPackages = [
  bind("@hypit/artifact", artifact),
  bind("@hypit/narrative", narrative),
  bind("@hypit/media", media),
  bind("@hypit/program-space", programSpace),
  bind("@hypit/speech", speech),
  bind("@hypit/speech-evidence", speechEvidence),
  bind("@hypit/semantic-track", semanticTrack),
  bind("@hypit/visual-ir", visualIr),
  bind("@hypit/composition", composition),
  bind("@hypit/svs", svs),
  bind("@hypit/script", script),
  bind("@hypit/estimate", estimate),
  bind("@hypit/fonts-open", fontsOpen),
  bind("@hypit/text", text),
  bind("@hypit/generation", generation),
  bind("@hypit/seedance", seedance),
  bind("@hypit/caption", caption),
  bind("@hypit/caption-fine", captionFine),
  bind("@hypit/speech-alignment", speechAlignment),
  bind("@hypit/speech-track", speechTrack),
  bind("@hypit/whisperx", whisperX),
  bind("@hypit/spatial", spatial),
  bind("@hypit/stand-in", standIn),
  bind("@hypit/temporal", temporal),
  bind("@hypit/media-track", mediaTrack),
  bind("@hypit/typography-track", typographyTrack),
  bind("@hypit/film", film),
  bind("@hypit/hyperframes", hyperframes),
  bind("@hypit/media-pipeline", mediaPipeline),
  bind("@hypit/render-hyperframes", renderHyperframes),
  bind("@hypit/run-markup", runMarkup),
] as const;
