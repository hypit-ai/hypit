import assert from "node:assert/strict";
import test from "node:test";
import { sealAudioProgram } from "@hypit/media-operations";
import { preparedAudioSource } from "@hypit/media";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { lowerPlaybackAudio } from "../src/index.js";
import { exactTemporalValueFromFrames, exactTemporalZero, identityTemporalMap } from "@hypit/temporal";

test("audio DOM is owned by shared playback and preserves the exact AudioProgram", () => {
  const artifact = {
    kind: "blob" as const,
    resource: fixtureResource("html-playback:audio"),
    size: 4,
    mediaType: "audio/wav",
  };
  const program = sealAudioProgram({
    frameRate: { numerator: 30, denominator: 1 },
    frameCount: 30,
    sampleRate: 48_000,
    sampleFrames: 48_000,
    clips: [{
      id: "voice:0",
      inputId: "voice",
      ...(() => {
        const domain = { id: "voice", duration: exactTemporalValueFromFrames(48_000,
          { frameRate: { numerator: 48_000, denominator: 1 } }) };
        const media = { source: artifact, domain, audio: { streamIndex: 0, presentationStart: exactTemporalZero(),
          sourceDomain: domain, map: identityTemporalMap(domain), interpretation: { sampleRate: 48_000, channels: 2 } } };
        return { source: preparedAudioSource(media), preparation: media.audio.map };
      })(),
      targetStartSample: 4_800,
      targetEndSampleExclusive: 28_800,
      preparedSampleFrames: 48_000,
      preparedStartSample: 9_600,
      preparedEndSampleExclusive: 33_600,
      loop: false,
      loopPhaseSample: 0,
      playbackRate: { numerator: 1, denominator: 1 },
      mixStartSample: 4_800,
      mixEndSampleExclusive: 28_800,
      gain: 2,
      fadeInSamples: 2_400,
      fadeOutSamples: 4_800,
    }],
  });
  const html = lowerPlaybackAudio(program, () => '/audio?a=1&b="two"');
  assert.match(html, /class="hypit-playback-audio"/u);
  assert.match(html, /data-start="0\.1"/u);
  assert.match(html, /data-duration="0\.5"/u);
  assert.match(html, /data-media-start="0\.2"/u);
  assert.match(html, /data-gain="2"/u);
  assert.match(html, /\/audio\?a=1&amp;b=&quot;two&quot;/u);
  assert.match(decodeURIComponent(html), /"fadeInSamples":2400/u);
});
