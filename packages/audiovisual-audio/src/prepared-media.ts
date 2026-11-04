import { sealAudioProgram } from "@hypit/audio-program";
import type { AudioOutputSampling } from "@hypit/audio-program";
import { preparedAudioSource, verifyPreparedMedia } from "@hypit/media";
import type { PreparedMedia } from "@hypit/media";

import { sealAudiovisualAudioSource } from "./source.js";
import type { AudiovisualAudioSource } from "./source.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Publish the selected media signal in its own Domain; occurrence mapping remains downstream. */
export function preparedMediaAudioSource(
  media: PreparedMedia,
  sampling: AudioOutputSampling,
): AudiovisualAudioSource {
  verifyPreparedMedia(media);
  assert(media.audio !== undefined,
    `Prepared Media ${media.domain.id} has no selected Audio member.`);
  assert(Number.isSafeInteger(sampling.sampleRate) && sampling.sampleRate > 0,
    "Prepared Media Audio sample rate is invalid.");
  const program = sealAudioProgram({
    domain: structuredClone(media.domain),
    sampling: structuredClone(sampling),
    graph: {
      nodes: [{
        kind: "source",
        id: `${media.domain.id}:media`,
        media: {
          id: `${media.domain.id}:media:source`,
          source: preparedAudioSource(media),
          preparation: structuredClone(media.audio.map),
        },
      }],
      output: { node: `${media.domain.id}:media` },
    },
  });
  return sealAudiovisualAudioSource({ source: media.domain.id, output: "audio", program });
}
