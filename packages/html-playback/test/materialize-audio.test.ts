import assert from "node:assert/strict";
import test from "node:test";
import { audioProgramGraphFromClips, sealAudioProgram } from "@hypit/audio-program";
import { preservePitch } from "@hypit/audio-stretch";
import { preparedAudioSource } from "@hypit/media";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { lowerPlaybackAudio } from "../src/index.js";
import { exactTemporalValueFromFrames, exactTemporalZero, identityTemporalMap, sealTemporalMap } from "@hypit/temporal";

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
    graph: audioProgramGraphFromClips([{
      id: "voice:0",
      ...(() => {
        const domain = { id: "voice", duration: exactTemporalValueFromFrames(48_000,
          { frameRate: { numerator: 48_000, denominator: 1 } }) };
        const media = { source: artifact, domain, audio: { streamIndex: 0, presentationStart: exactTemporalZero(),
          sourceDomain: domain, map: identityTemporalMap(domain), interpretation: { sampleRate: 48_000, channels: 2 } } };
        return { source: preparedAudioSource(media), preparation: media.audio.map,
          sampling: sealTemporalMap({ stages: [{
            target: { id: "voice:occurrence", duration: exactTemporalValueFromFrames(24_000,
              { frameRate: { numerator: 48_000, denominator: 1 } }) },
            source: domain,
            pieces: [{
              target: {
                start: exactTemporalZero(),
                end: exactTemporalValueFromFrames(24_000, { frameRate: { numerator: 48_000, denominator: 1 } }),
              },
              sourceAtStart: exactTemporalValueFromFrames(9_600, { frameRate: { numerator: 48_000, denominator: 1 } }),
              rate: { numerator: 1, denominator: 1 },
            }],
          }] }) };
      })(),
      target: {
        start: exactTemporalValueFromFrames(4_800, { frameRate: { numerator: 48_000, denominator: 1 } }),
        end: exactTemporalValueFromFrames(28_800, { frameRate: { numerator: 48_000, denominator: 1 } }),
      },
      targetStartSample: 4_800,
      targetEndSampleExclusive: 28_800,
      mixStartSample: 4_800,
      mixEndSampleExclusive: 28_800,
      gain: 2,
      fadeInSamples: 2_400,
      fadeOutSamples: 4_800,
    }]),
  });
  const html = lowerPlaybackAudio(program, () => '/audio?a=1&b="two"');
  assert.match(html, /class="hypit-playback-audio"/u);
  assert.match(html, /data-start="0\.1"/u);
  assert.match(html, /data-duration="0\.5"/u);
  assert.match(html, /data-media-start="0\.2"/u);
  assert.match(html, /data-gain="2"/u);
  assert.match(html, /data-preserves-pitch="false"/u);
  assert.match(html, /\/audio\?a=1&amp;b=&quot;two&quot;/u);
  assert.match(decodeURIComponent(html), /"fadeInSamples":2400/u);
});

test("audio DOM lowers explicit pitch preservation without inventing a second speed", () => {
  const artifact = {
    kind: "blob" as const,
    resource: fixtureResource("html-playback:pitch"),
    size: 4,
    mediaType: "audio/wav",
  };
  const zero = exactTemporalZero();
  const clock = { frameRate: { numerator: 48_000, denominator: 1 } } as const;
  const half = exactTemporalValueFromFrames(24_000, clock);
  const one = exactTemporalValueFromFrames(48_000, clock);
  const domain = { id: "tone", duration: one };
  const program = sealAudioProgram({
    frameRate: { numerator: 30, denominator: 1 }, frameCount: 15,
    sampleRate: 48_000, sampleFrames: 24_000,
    graph: audioProgramGraphFromClips([{
      id: "tone",
      source: { source: artifact, streamIndex: 0, presentationStart: zero, sourceDomain: domain,
        interpretation: { sampleRate: 48_000, channels: 2 } },
      preparation: identityTemporalMap(domain),
      sampling: sealTemporalMap({ stages: [{ target: { id: "tone:occurrence", duration: half }, source: domain,
        pieces: [{ target: { start: zero, end: half }, sourceAtStart: zero,
          rate: { numerator: 2, denominator: 1 } }] }] }),
      reconstruction: preservePitch(),
      target: { start: zero, end: half }, targetStartSample: 0, targetEndSampleExclusive: 24_000,
      mixStartSample: 0, mixEndSampleExclusive: 24_000, gain: 1, fadeInSamples: 0, fadeOutSamples: 0,
    }]),
  });
  const html = lowerPlaybackAudio(program, () => "/tone.wav");
  assert.match(html, /data-playback-rate="2"/u);
  assert.match(html, /data-preserves-pitch="true"/u);
});
