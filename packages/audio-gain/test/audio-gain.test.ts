import assert from "node:assert/strict";
import test from "node:test";

import { canonicalize } from "@hypit/hypit/protocol";

import {
  AUDIO_GAIN_PROCESS_FORMAT,
  audioGainControlOperator,
  audioGainOperator,
  audioGainProcess,
  audioGainComponent,
  audioGainProducers,
  evaluateAudioGainControl,
  readAudioGainProgram,
  readAudioGainProcess,
} from "../src/index.js";
import { exactTemporalValue, sealLocalTemporalDomain } from "@hypit/temporal/algebra";
import {
  applyNleTransaction,
  createNleAuthoringHostFromFacets,
  createNleLoweringHostFromFacets,
  createNleProject,
  findNleItem,
  type NleComponentItem,
} from "@hypit/nle";
import hypitPackage from "../src/activation.js";

const at = (numerator: number, denominator = 1) => exactTemporalValue({
  numerator: BigInt(numerator), denominator: BigInt(denominator),
});

const gainControl = {
  domain: sealLocalTemporalDomain({ id: "gain:time", duration: at(1) }),
  segments: [{
    range: { start: at(0), end: at(1) },
    from: 0,
    to: 1,
    interpolation: { kind: "linear" as const },
  }],
};

test("Audio Gain publishes one typed Audio Operator with gain in its programme", async () => {
  const producer = audioGainComponent.producers.find((candidate) =>
    candidate.producer.name === audioGainProducers.gainOperator.name)!;
  const result = await producer.handler({
    inputs: { spec: { value: canonicalize({ gain: 0.25 }) } },
  } as never);
  assert.equal(result.kind, "output");
  assert.deepEqual(result.value, audioGainOperator(0.25));
});

test("Audio Gain owns its exact execution programme and payload validation", () => {
  const program = audioGainProcess(4);
  assert.equal(program.format, AUDIO_GAIN_PROCESS_FORMAT);
  assert.equal(readAudioGainProcess(program), 4);
  assert.equal(readAudioGainProcess(audioGainOperator(0.5).program), 0.5);
  assert.throws(() => audioGainOperator(-1), /invalid/u);
  assert.throws(() => readAudioGainProcess({
    format: AUDIO_GAIN_PROCESS_FORMAT,
    payload: { gain: -1 },
    artifacts: [],
  }), /invalid/u);
});

test("Audio Gain owns temporal automation instead of adding fade semantics to AVIR", async () => {
  const operator = audioGainControlOperator(gainControl);
  assert.deepEqual(operator.temporalControls, { gain: gainControl.domain });
  assert.deepEqual(readAudioGainProgram(operator.program), {
    kind: "control",
    control: gainControl,
  });
  assert.equal(evaluateAudioGainControl(gainControl, at(1, 2)), 0.5);

  const producer = audioGainComponent.producers.find((candidate) =>
    candidate.producer.name === audioGainProducers.gainControlOperator.name)!;
  const result = await producer.handler({
    inputs: { control: { value: canonicalize(gainControl) } },
  } as never);
  assert.equal(result.kind, "output");
  assert.deepEqual(result.value, operator);
});

test("Audio Gain owns NLE Audio effect parameters, lowering and authoring", () => {
  const symbol = { module: { name: "@example/synth", version: "1" }, name: "tone" } as const;
  const item: NleComponentItem = {
    id: "tone", kind: "component", component: symbol, parameters: {},
    start: at(0), duration: at(1), localStart: at(0), enabled: true,
    audio: { effects: [{
      id: "fade", effect: { module: { name: "@hypit/audio-gain", version: "1" }, name: "gain" },
      parameters: {
        kind: "keyframes", keyframes: [{ at: at(0), gain: 0 }, { at: at(1, 2), gain: 1 }],
        interpolation: { kind: "linear" },
      },
    }] },
  };
  const base = createNleProject({ id: "audio-edit", name: "Audio edit" });
  const project = applyNleTransaction(base, { revision: 0, commands: [{
    kind: "track.add", track: {
      id: "audio", name: "Audio", kind: "audio", locked: false, muted: false, items: [item],
    },
  }] });
  const effect = item.audio!.effects[0]!;
  const lowering = createNleLoweringHostFromFacets(hypitPackage.facets)
    .resolveAudioEffect(effect, item, { project, track: project.tracks[0]! });
  assert.deepEqual(Object.keys(lowering.operator.temporalControls), ["gain"]);

  const authoring = createNleAuthoringHostFromFacets(hypitPackage.facets);
  const transaction = authoring.planEffectParameterEdit(project, "tone", "fade", {
    kind: "set-keyframe-gain", at: at(1, 2), gain: 0.5,
  });
  const edited = applyNleTransaction(project, transaction);
  const next = findNleItem(edited, "tone").item;
  const parameters = next.kind === "component"
    ? next.audio?.effects[0]?.parameters as unknown as { readonly keyframes?: readonly { readonly gain: number }[] }
    : undefined;
  assert.equal(parameters?.keyframes?.[1]?.gain, 0.5);
});
