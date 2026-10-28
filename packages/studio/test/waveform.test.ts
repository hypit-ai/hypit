import assert from "node:assert/strict";
import test from "node:test";
import { bytesFile } from "../src/material.js";
import { createStudioWaveform } from "../src/storyboard.js";

test("waveform produces its fixed raster PNG without browser audio decoding", async () => {
  const samples = 8000;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
  for (let sample = 0; sample < samples; sample += 1) {
    wav.writeInt16LE(Math.round(Math.sin(sample * 2 * Math.PI * 440 / 8000) * 16000), 44 + sample * 2);
  }
  const png = Buffer.from(await createStudioWaveform(bytesFile("audio/wav", wav)));
  assert.equal(png.toString("ascii", 1, 4), "PNG");
  assert.equal(png.readUInt32BE(16), 2048);
  assert.equal(png.readUInt32BE(20), 56);
});
