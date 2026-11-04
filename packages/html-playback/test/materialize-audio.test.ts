import assert from "node:assert/strict";
import test from "node:test";
import {
  audioProgramGraphFromMediaSources,
  pointwiseOperatorTemporalSupport,
  sealAudioProgram,
} from "@hypit/audio-program";
import { audioGainControlProcess, audioGainProcess } from "@hypit/audio-mix";
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
  const programmeDomain = { id: "playback", duration: exactTemporalValueFromFrames(48_000,
    { frameRate: { numerator: 48_000, denominator: 1 } }) };
  const voiceDomain = { id: "voice", duration: exactTemporalValueFromFrames(48_000,
    { frameRate: { numerator: 48_000, denominator: 1 } }) };
  const voiceMedia = { source: artifact, domain: voiceDomain,
    audio: { streamIndex: 0, presentationStart: exactTemporalZero(),
      sourceDomain: voiceDomain, map: identityTemporalMap(voiceDomain) } };
  const child = sealAudioProgram({
    domain: voiceDomain,
    sampling: { sampleRate: 48_000 },
    graph: audioProgramGraphFromMediaSources([{
      id: "voice:0",
      source: preparedAudioSource(voiceMedia),
      preparation: voiceMedia.audio.map,
    }]),
  });
  const voiceUse = {
    kind: "program" as const,
    id: "voice-use",
    program: child,
    sampling: sealTemporalMap({ stages: [{
      target: { id: "voice:occurrence", duration: exactTemporalValueFromFrames(24_000,
        { frameRate: { numerator: 48_000, denominator: 1 } }) },
      source: voiceDomain,
      pieces: [{
        target: { start: exactTemporalZero(),
          end: exactTemporalValueFromFrames(24_000, { frameRate: { numerator: 48_000, denominator: 1 } }) },
        sourceAtStart: exactTemporalValueFromFrames(9_600, { frameRate: { numerator: 48_000, denominator: 1 } }),
        rate: { numerator: 1, denominator: 1 },
      }],
    }] }),
    target: {
      start: exactTemporalValueFromFrames(4_800, { frameRate: { numerator: 48_000, denominator: 1 } }),
      end: exactTemporalValueFromFrames(28_800, { frameRate: { numerator: 48_000, denominator: 1 } }),
    },
  };
  const control = {
    domain: programmeDomain,
    segments: [{
      range: { start: exactTemporalZero(),
        end: exactTemporalValueFromFrames(2_400, { frameRate: { numerator: 48_000, denominator: 1 } }) },
      from: 0, to: 1, interpolation: { kind: "linear" as const },
    }, {
      range: {
        start: exactTemporalValueFromFrames(2_400, { frameRate: { numerator: 48_000, denominator: 1 } }),
        end: programmeDomain.duration,
      },
      from: 1, to: 1, interpolation: { kind: "linear" as const },
    }],
  };
  const program = sealAudioProgram({
    domain: programmeDomain,
    sampling: { sampleRate: 48_000 },
    graph: { nodes: [
      voiceUse,
      { kind: "process", id: "gain", inputs: { signal: { node: voiceUse.id } },
        program: audioGainProcess(2), temporalSupport: pointwiseOperatorTemporalSupport(["signal"]), controlMappings: {} },
      { kind: "process", id: "fade", inputs: { signal: { node: "gain" } },
        program: audioGainControlProcess(control), temporalSupport: pointwiseOperatorTemporalSupport(["signal"]),
        controlMappings: { gain: identityTemporalMap(programmeDomain) } },
    ], output: { node: "fade" } },
  });
  const html = lowerPlaybackAudio(program, () => '/audio?a=1&b="two"');
  assert.match(html, /class="hypit-playback-audio"/u);
  assert.match(html, /data-start="0\.1"/u);
  assert.match(html, /data-duration="0\.5"/u);
  assert.match(html, /data-media-start="0\.2"/u);
  assert.match(html, /data-gain="2"/u);
  assert.match(html, /data-preserves-pitch="false"/u);
  assert.match(html, /\/audio\?a=1&amp;b=&quot;two&quot;/u);
  assert.match(decodeURIComponent(html), /"endSampleExclusive":2400/u);
  const alternateChild = sealAudioProgram({ ...child, graph: { ...child.graph,
    nodes: child.graph.nodes.map((node) => node.kind === "source"
      ? { ...node, media: { ...node.media, source: { ...node.media.source, streamIndex: 1 } } }
      : node) } });
  const alternate = sealAudioProgram({ ...program, graph: { ...program.graph,
    nodes: program.graph.nodes.map((node) => node.kind === "program"
      ? { ...node, program: alternateChild }
      : node) } });
  assert.throws(() => lowerPlaybackAudio(alternate, () => "/audio"),
    /cannot select audio stream 1 for voice:0/u);
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
  const child = sealAudioProgram({
    domain,
    sampling: { sampleRate: 48_000 },
    graph: audioProgramGraphFromMediaSources([{
      id: "tone",
      source: { source: artifact, streamIndex: 0, presentationStart: zero, sourceDomain: domain,
      },
      preparation: identityTemporalMap(domain),
    }]),
  });
  const program = sealAudioProgram({
    domain: { id: "pitch-playback", duration: half },
    sampling: { sampleRate: 48_000 },
    graph: { nodes: [{
      kind: "program", id: "tone-use", program: child,
      sampling: sealTemporalMap({ stages: [{ target: { id: "tone:occurrence", duration: half }, source: domain,
        pieces: [{ target: { start: zero, end: half }, sourceAtStart: zero,
          rate: { numerator: 2, denominator: 1 } }] }] }),
      reconstruction: preservePitch().program,
      target: { start: zero, end: half },
    }], output: { node: "tone-use" } },
  });
  const html = lowerPlaybackAudio(program, () => "/tone.wav");
  assert.match(html, /data-playback-rate="2"/u);
  assert.match(html, /data-preserves-pitch="true"/u);
});
