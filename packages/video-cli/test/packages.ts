import artifact from "../../artifact/src/activation.js";
import captionGemini from "../../caption-gemini/src/activation.js";
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
import speechSpine from "../../speech-spine/src/activation.js";
import speechBasis from "../../speech-basis/src/activation.js";
import speech from "../../speech/src/activation.js";
import speechEvidence from "../../speech-evidence/src/activation.js";
import semanticMap from "../../semantic-map/src/activation.js";
import spatial from "../../spatial/src/activation.js";
import temporal from "../../temporal/src/activation.js";
import visualIr from "../../visual-ir/src/activation.js";
import svs from "../../svs/src/activation.js";
import typographyTrack from "../../typography-track/src/activation.js";
import whisperX from "../../whisperx/src/activation.js";
import type { NodePackageContribution } from "@narratage/package-loader-node";

const bind = (specifier: string, contribution: NodePackageContribution) => ({
  specifier,
  contribution,
});

/** Test-only explicit environment; production video CLI starts with no author packages. */
export const videoTestPackages = [
  bind("@narratage/artifact", artifact),
  bind("@narratage/narrative", narrative),
  bind("@narratage/media", media),
  bind("@narratage/program-space", programSpace),
  bind("@narratage/speech", speech),
  bind("@narratage/speech-evidence", speechEvidence),
  bind("@narratage/semantic-map", semanticMap),
  bind("@narratage/visual-ir", visualIr),
  bind("@narratage/composition", composition),
  bind("@narratage/svs", svs),
  bind("@narratage/script", script),
  bind("@narratage/estimate", estimate),
  bind("@narratage/fonts-open", fontsOpen),
  bind("@narratage/text", text),
  bind("@narratage/generation", generation),
  bind("@narratage/seedance", seedance),
  bind("@narratage/caption", caption),
  bind("@narratage/caption-fine", captionFine),
  bind("@narratage/caption-gemini", captionGemini),
  bind("@narratage/speech-alignment", speechAlignment),
  bind("@narratage/speech-basis", speechBasis),
  bind("@narratage/speech-spine", speechSpine),
  bind("@narratage/whisperx", whisperX),
  bind("@narratage/spatial", spatial),
  bind("@narratage/temporal", temporal),
  bind("@narratage/media-track", mediaTrack),
  bind("@narratage/typography-track", typographyTrack),
  bind("@narratage/film", film),
  bind("@narratage/hyperframes", hyperframes),
  bind("@narratage/media-pipeline", mediaPipeline),
  bind("@narratage/render-hyperframes", renderHyperframes),
  bind("@narratage/run-markup", runMarkup),
] as const;
