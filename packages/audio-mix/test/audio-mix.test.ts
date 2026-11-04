import assert from "node:assert/strict";
import test from "node:test";

import { canonicalize } from "@hypit/hypit/protocol";

import {
  AUDIO_GAIN_PROCESS_FORMAT,
  audioGainControlOperator,
  audioGainOperator,
  audioGainProcess,
  audioMixComponent,
  audioMixProducers,
  evaluateAudioGainControl,
  readAudioGainProgram,
  readAudioGainProcess,
} from "../src/index.js";
import { exactTemporalValue, sealLocalTemporalDomain } from "@hypit/temporal/algebra";

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
  const producer = audioMixComponent.producers.find((candidate) =>
    candidate.producer.name === audioMixProducers.gainOperator.name)!;
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

  const producer = audioMixComponent.producers.find((candidate) =>
    candidate.producer.name === audioMixProducers.gainControlOperator.name)!;
  const result = await producer.handler({
    inputs: { control: { value: canonicalize(gainControl) } },
  } as never);
  assert.equal(result.kind, "output");
  assert.deepEqual(result.value, operator);
});
