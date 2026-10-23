import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";

import type { CliIo } from "@hypit/hypit/cli";
import { speechTranscriptSource } from "@hypit/speech-evidence";

import { cutFrame, probeMedia, runMediaCli, visualBoundaries } from "../../src/files.js";
import { renderWaveform, renderWaveformView } from "../../src/waveform.js";

const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0
  && spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

function io(): { readonly io: CliIo; text: () => string } {
  let out = "";
  return {
    io: {
      write: (chunk) => { out += chunk; },
      setExitCode: () => {},
      readSecret: async () => "",
      terminal: { isTTY: false, color: false, unicode: false, columns: 100 },
    },
    text: () => out,
  };
}

/** Three seconds with three sub-second cuts, 24 fps and no audio. */
async function sample(directory: string): Promise<string> {
  const path = join(directory, "sample.mp4");
  const result = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "color=c=red:s=320x240:r=24:d=0.5",
    "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=24:d=0.5",
    "-f", "lavfi", "-i", "color=c=green:s=320x240:r=24:d=0.5",
    "-f", "lavfi", "-i", "color=c=white:s=320x240:r=24:d=1.5",
    "-filter_complex", "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", path,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return path;
}

test("media evidence keeps source times and sub-second visual changes", { skip: !ffmpeg && "ffmpeg is not installed" }, async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-media-"));
  try {
    const source = await sample(work);
    const info = await probeMedia(source);
    assert.equal(info.hasVideo, true);
    if (!info.hasVideo) throw new Error("sample has no video stream");
    assert.equal(info.width, 320);
    assert.equal(info.height, 240);
    assert.equal(info.hasAudio, false);
    assert.ok(Math.abs(info.duration - 3) < 0.1, `duration ${info.duration}`);

    const probe = io();
    await runMediaCli(["media", "probe", source, "--json"], probe.io, work);
    assert.equal((JSON.parse(probe.text()) as { width: number }).width, 320);

    const cut = io();
    await runMediaCli(["media", "cut", source, "--start", "0.5", "--end", "2", "--to", "out/piece.mp4"], cut.io, work);
    const piece = await probeMedia(join(work, "out", "piece.mp4"));
    assert.ok(Math.abs(piece.duration - 1.5) < 0.15, `cut duration ${piece.duration}`);
    await assert.rejects(
      runMediaCli(["media", "cut", source, "--start", "0", "--end", "1", "--to", "out/piece.mp4"], io().io, work),
      /already exists/,
    );
    const labeledCut = io();
    await runMediaCli(["media", "cut", source, "--start", "0.5", "--end", "1", "--label-time", "--to", "out/labeled.mp4", "--json"], labeledCut.io, work);
    assert.equal((JSON.parse(labeledCut.text()) as { labeled: boolean }).labeled, true);

    const frames = io();
    await runMediaCli(["media", "frames", source, "--at", "0.2,2.5", "--to", "out/frames"], frames.io, work);
    const written = (await readdir(join(work, "out", "frames"))).sort();
    assert.deepEqual(written, ["frame-0_200s.jpg", "frame-2_500s.jpg"]);

    const every = io();
    await runMediaCli(["media", "frames", source, "--every", "1", "--label-time", "--to", "out/every", "--json"], every.io, work);
    const everyView = JSON.parse(every.text()) as { labeled: boolean; frames: unknown[] };
    assert.equal(everyView.frames.length, 3);
    assert.equal(everyView.labeled, true);

    const gridOutput = io();
    await runMediaCli(["media", "grid", source, "--at", "0.2,1.1,2.5", "--columns", "2", "--to", "out/grid.jpg", "--json"], gridOutput.io, work);
    const grid = JSON.parse(gridOutput.text()) as { samples: number[]; columns: number; rows: number; cellWidth: number };
    assert.deepEqual(grid.samples, [0.2, 1.1, 2.5]);
    assert.equal(grid.columns, 2);
    assert.equal(grid.rows, 2);
    assert.equal(grid.cellWidth, 320, "a grid never enlarges a small source");
    assert.ok((await stat(join(work, "out", "grid.jpg"))).size > 0);

    const singleOutput = io();
    await runMediaCli(["media", "grid", source, "--at", "0.2", "--columns", "3", "--no-time",
      "--to", "out/single.png", "--json"], singleOutput.io, work);
    const single = JSON.parse(singleOutput.text()) as { columns: number; rows: number };
    assert.equal(single.columns, 1, "a one-frame grid does not reserve empty columns");
    assert.equal(single.rows, 1);
    assert.equal((await sharp(join(work, "out", "single.png")).metadata()).width, 336);

    const pureOutput = io();
    await runMediaCli(["media", "grid", source, "--at", "0.2,1.1,2.5", "--columns", "2", "--no-time",
      "--to", "out/pure-grid.jpg", "--json"], pureOutput.io, work);
    const pure = JSON.parse(pureOutput.text()) as { source: string; view: { timeLabels: boolean; wordLabels: boolean; header: boolean } };
    assert.equal(pure.source, source);
    assert.deepEqual(pure.view, { timeLabels: false, wordLabels: false, header: false });
    assert.deepEqual(await sharp(join(work, "out", "pure-grid.jpg")).metadata().then(image => [image.width, image.height]),
      [664, 504], "a picture-only grid reserves no caption area");

    const headedOutput = io();
    await runMediaCli(["media", "grid", source, "--at", "0.2,1.1,2.5", "--columns", "2", "--no-time", "--header",
      "--to", "out/headed-grid.jpg", "--json"], headedOutput.io, work);
    assert.equal(JSON.parse(headedOutput.text()).view.header, true);
    assert.ok((await sharp(join(work, "out", "headed-grid.jpg")).metadata()).height! > 504,
      "the optional grid header occupies its own area");

    const ranges = join(work, "ranges.json");
    await writeFile(ranges, JSON.stringify([
      { id: "opening", start: 0, end: 0.8, frames: 3 },
      { start: 1.5, end: 3 },
    ]));
    const pages = io();
    await runMediaCli(["media", "grid", source, "--pages", "--ranges", ranges, "--to", "out/grids", "--json"], pages.io, work);
    const grids = (JSON.parse(pages.text()) as { grids: { samples: number[]; path: string }[] }).grids;
    assert.equal(grids.length, 2);
    assert.equal(grids[0]!.samples.length, 3);
    assert.deepEqual((await readdir(join(work, "out", "grids"))).sort(), ["001-opening.jpg", "002-1_500s-3_000s.jpg"]);

    const changes = await visualBoundaries(source);
    assert.ok(changes.some((item) => Math.abs(item.at - 0.5) < 0.1), JSON.stringify(changes));
    assert.ok(changes.some((item) => Math.abs(item.at - 1) < 0.1), JSON.stringify(changes));
    assert.ok(changes.some((item) => Math.abs(item.at - 1.5) < 0.1), JSON.stringify(changes));
    const boundaries = io();
    await runMediaCli(["media", "boundaries", source], boundaries.io, work);
    assert.match(boundaries.text(), /visual-change candidates/);
    assert.match(boundaries.text(), /scores are not shot labels/);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("album artwork does not turn an audio cut into video", { skip: !ffmpeg && "ffmpeg is not installed" }, async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-covered-audio-"));
  try {
    const audio = join(work, "plain.mp3");
    const artwork = join(work, "cover.jpg");
    const covered = join(work, "covered.mp3");
    const tone = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
      "sine=frequency=440:duration=1", "-c:a", "libmp3lame", audio,
    ], { encoding: "utf8" });
    assert.equal(tone.status, 0, tone.stderr);
    await sharp({ create: { width: 32, height: 32, channels: 3, background: "#ee3344" } }).jpeg().toFile(artwork);
    const attach = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", audio, "-i", artwork,
      "-map", "0:a:0", "-map", "1:v:0", "-c", "copy", "-id3v2_version", "3",
      "-disposition:v:0", "attached_pic", covered,
    ], { encoding: "utf8" });
    assert.equal(attach.status, 0, attach.stderr);

    for (const [index, source] of [audio, covered].entries()) {
      const info = await probeMedia(source);
      assert.equal(info.hasAudio, true);
      assert.equal(info.hasVideo, false, "album artwork is not a timed video stream");
      const output = join(work, `cut-${index}.wav`);
      const cut = io();
      await runMediaCli(["media", "cut", source, "--start", "0", "--end", "0.5", "--to", output, "--json"], cut.io, work);
      const result = JSON.parse(cut.text()) as { hasVideo: boolean; hasAudio: boolean; actualSeconds: number };
      assert.equal(result.hasVideo, false);
      assert.equal(result.hasAudio, true);
      assert.ok(Math.abs(result.actualSeconds - 0.5) < 0.01);
      const probe = spawnSync("ffprobe", [
        "-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "json", output,
      ], { encoding: "utf8" });
      assert.equal(probe.status, 0, probe.stderr);
      assert.deepEqual(JSON.parse(probe.stdout).streams, [{ codec_name: "pcm_s24le", codec_type: "audio" }]);
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("waveforms accept audio and video audio tracks while grids remain video views", { skip: !ffmpeg && "ffmpeg is not installed" }, async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-waveform-"));
  try {
    const video = await sample(work);
    const audio = join(work, "tone.wav");
    const tone = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
      "-c:a", "pcm_s16le", audio,
    ], { encoding: "utf8" });
    assert.equal(tone.status, 0, tone.stderr);

    const audioWaveform = io();
    await runMediaCli(["media", "waveform", audio, "--start", "0.5", "--end", "2.5", "--width", "640", "--height", "64",
      "--to", "audio.png", "--json"], audioWaveform.io, work);
    assert.equal(JSON.parse(audioWaveform.text()).audioStream, 0);
    const audioImage = await sharp(join(work, "audio.png")).metadata();
    assert.equal(audioImage.width, 640);
    assert.equal(audioImage.height, 94, "the requested waveform height is followed by its source-time axis");

    const denseWaveform = io();
    await runMediaCli(["media", "waveform", audio, "--start", "0.5", "--end", "2.5",
      "--pixels-per-second", "320", "--filter", "average", "--scale", "cbrt", "--no-time",
      "--to", "dense.png", "--json"], denseWaveform.io, work);
    assert.equal(JSON.parse(denseWaveform.text()).width, 640);
    assert.deepEqual(await sharp(join(work, "dense.png")).metadata().then(image => [image.width, image.height]), [640, 96]);

    const spectrogramOutput = io();
    await runMediaCli(["media", "spectrogram", audio, "--start", "0.5", "--end", "2.5",
      "--pixels-per-second", "320", "--height", "80", "--frequency-scale", "linear", "--dynamic-range", "80",
      "--no-time", "--to", "spectrogram.png", "--json"], spectrogramOutput.io, work);
    const spectrogram = JSON.parse(spectrogramOutput.text()) as { width: number; height: number; frequencyScale: string };
    assert.deepEqual([spectrogram.width, spectrogram.height, spectrogram.frequencyScale], [640, 80, "linear"]);
    assert.deepEqual(await sharp(join(work, "spectrogram.png")).metadata().then(image => [image.width, image.height]), [640, 80]);

    await assert.rejects(
      runMediaCli(["media", "grid", audio, "--start", "0", "--end", "1", "--waveform", "--to", "audio-grid.jpg"], io().io, work),
      /no video stream/,
    );
    await assert.rejects(
      runMediaCli(["media", "waveform", video, "--to", "silent.png"], io().io, work),
      /no audio stream/,
    );
    await assert.rejects(
      runMediaCli(["media", "spectrogram", video, "--to", "silent-spectrum.png"], io().io, work),
      /no audio stream/,
    );

    const audiovisual = join(work, "audiovisual.mp4");
    const mux = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", video, "-i", audio,
      "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-shortest", audiovisual,
    ], { encoding: "utf8" });
    assert.equal(mux.status, 0, mux.stderr);
    await runMediaCli(["media", "waveform", audiovisual, "--to", "video.png"], io().io, work);
    assert.ok((await stat(join(work, "video.png"))).size > 0);

    const transcript = join(work, "transcript.svml");
    await writeFile(transcript, speechTranscriptSource("transcript", { sampleFrames: 48_000, passages: [{ words: [
      { text: "glass", startSample: 12_800, endSampleExclusive: 16_000 },
      { text: "breaks", startSample: 16_000, endSampleExclusive: 19_200 },
    ], chars: [] }] }));
    const phraseWaveform = io();
    await runMediaCli(["media", "waveform", audiovisual, "--around", "glass breaks", "--transcript", transcript,
      "--to", "phrase.png", "--json"], phraseWaveform.io, work);
    assert.deepEqual(JSON.parse(phraseWaveform.text()).start, 0.5);
    assert.deepEqual(JSON.parse(phraseWaveform.text()).end, 1.5);

    const plainGrid = join(work, "plain-grid.jpg");
    const audioGrid = join(work, "audio-grid.jpg");
    await runMediaCli(["media", "grid", audiovisual, "--start", "0", "--end", "3", "--frames", "4", "--columns", "2",
      "--to", plainGrid], io().io, work);
    const gridOutput = io();
    await runMediaCli(["media", "grid", audiovisual, "--start", "0", "--end", "3", "--frames", "4", "--columns", "2",
      "--waveform", "--spectrogram", "--spectrogram-height", "80", "--frame-marker-color", "#12ab34",
      "--to", audioGrid, "--json"], gridOutput.io, work);
    assert.deepEqual(JSON.parse(gridOutput.text()).view.waveform,
      { audioStream: 1, splitChannels: false, scale: "linear", filter: "peak", markerColor: "#12ab34" });
    assert.deepEqual(JSON.parse(gridOutput.text()).view.spectrogram,
      { audioStream: 1, splitChannels: false, scale: "log", frequencyScale: "log", dynamicRange: 100,
        height: 80, markerColor: "#12ab34" });
    assert.ok((await sharp(audioGrid).metadata()).height! > (await sharp(plainGrid).metadata()).height!,
      "the page waveform occupies its own track below the frame grid");

    const customMarkerView = await renderWaveformView(audio, {
      width: 300, height: 60, start: 0, end: 3, markers: [1.5], markerColor: "#12ab34", showTime: false,
    });
    assert.equal((await sharp(customMarkerView).metadata()).height, 60, "a hidden time axis reserves no space");
    const customMarker = await sharp(customMarkerView).extract({ left: 150, top: 0, width: 1, height: 1 })
      .removeAlpha().raw().toBuffer();
    assert.deepEqual([...customMarker], [0x12, 0xab, 0x34]);
    await assert.rejects(runMediaCli(["media", "grid", audiovisual, "--start", "0", "--end", "1",
      "--frame-marker-color", "red", "--to", "marker-without-waveform.jpg"], io().io, work),
    /--frame-marker-color.*require --waveform/);

    const pageOutput = io();
    await runMediaCli(["media", "grid", audiovisual, "--pages", "--start", "0", "--end", "3", "--every", "0.6",
      "--columns", "2", "--rows", "1", "--waveform", "--spectrogram", "--format", "png",
      "--to", "audio-pages", "--json"], pageOutput.io, work);
    const pages = JSON.parse(pageOutput.text()) as { view: { waveform: { audioStream: number } };
      grids: { start: number; end: number; path: string }[] };
    assert.equal(pages.view.waveform.audioStream, 1);
    assert.deepEqual(pages.grids.map((page) => [page.start, page.end]), [[0, 0.9], [0.9, 2.1], [2.1, 3]]);
    assert.deepEqual((await readdir(join(work, "audio-pages"))).sort(),
      ["001-0_000s-3_000s-p001.png", "001-0_000s-3_000s-p002.png", "001-0_000s-3_000s-p003.png"]);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("waveforms preserve source-clock gaps and require explicit selection among audio streams", { skip: !ffmpeg && "ffmpeg is not installed" }, async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-waveform-clock-"));
  try {
    const video = await sample(work);
    const first = join(work, "first.wav");
    const second = join(work, "second.wav");
    const high = join(work, "high.wav");
    for (const [path, frequency] of [[first, 440], [second, 880], [high, 10_000]] as const) {
      const tone = spawnSync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=1`,
        "-c:a", "pcm_s16le", path,
      ], { encoding: "utf8" });
      assert.equal(tone.status, 0, tone.stderr);
    }

    const waveformEnergy = async (path: string): Promise<number> => {
      const image = await sharp(await renderWaveform(path, { width: 300, height: 60 })).removeAlpha().raw().toBuffer();
      return image.reduce((sum, value) => sum + value, 0);
    };
    const lowEnergy = await waveformEnergy(first);
    const highEnergy = await waveformEnergy(high);
    assert.ok(highEnergy > lowEnergy * 0.5,
      `waveform rendering must retain audible-band frequencies instead of downsampling them away: ${lowEnergy}, ${highEnergy}`);

    const delayed = join(work, "delayed.mkv");
    const delayedMux = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", video, "-itsoffset", "1", "-i", first,
      "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "pcm_s16le", delayed,
    ], { encoding: "utf8" });
    assert.equal(delayedMux.status, 0, delayedMux.stderr);
    const delayedWaveform = await sharp(await renderWaveform(delayed, { width: 300, height: 60 })).removeAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    const energy = (from: number, to: number): number => {
      let total = 0;
      for (let y = 0; y < delayedWaveform.info.height; y += 1) {
        for (let x = from; x < to; x += 1) {
          const pixel = (y * delayedWaveform.info.width + x) * delayedWaveform.info.channels;
          total += delayedWaveform.data[pixel]!;
        }
      }
      return total;
    };
    const leading = energy(0, 90);
    const sounding = energy(110, 190);
    const trailing = energy(210, 300);
    assert.ok(sounding > leading * 20 && sounding > trailing * 20,
      `the delayed one-second tone should remain between source-clock gaps: ${leading}, ${sounding}, ${trailing}`);

    const multiple = join(work, "multiple.mkv");
    const multipleMux = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", video, "-i", first, "-i", second,
      "-map", "0:v:0", "-map", "1:a:0", "-map", "2:a:0", "-c:v", "copy", "-c:a", "pcm_s16le", multiple,
    ], { encoding: "utf8" });
    assert.equal(multipleMux.status, 0, multipleMux.stderr);
    const probe = io();
    await runMediaCli(["media", "probe", multiple, "--json"], probe.io, work);
    assert.deepEqual(JSON.parse(probe.text()).audioStreams.map((stream: { index: number }) => stream.index), [1, 2]);
    await assert.rejects(runMediaCli(["media", "waveform", multiple, "--to", "ambiguous.png"], io().io, work),
      /multiple audio streams \(1, 2\).*--audio-stream/);
    await runMediaCli(["media", "waveform", multiple, "--audio-stream", "2", "--to", "selected.png"], io().io, work);
    assert.ok((await stat(join(work, "selected.png"))).size > 0);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("cut prepares recorded audio and joined video without changing the existing evidence cut", { skip: !ffmpeg && "ffmpeg is not installed" }, async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-recorded-cut-"));
  try {
    const silentVideo = await sample(work);
    const audio = join(work, "source.wav");
    const tone = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:a", "pcm_s16le", audio], { encoding: "utf8" });
    assert.equal(tone.status, 0, tone.stderr);
    const audioProbe = await probeMedia(audio);
    assert.equal(audioProbe.hasVideo, false);
    assert.equal(audioProbe.hasAudio, true);
    const probe = io();
    await runMediaCli(["media", "probe", audio], probe.io, work);
    assert.match(probe.text(), /audio only/);

    const audioCut = io();
    await runMediaCli(["media", "cut", audio, "--keep", "0.25:1", "--keep", "2.5:3", "--to", "spoken.wav", "--json"], audioCut.io, work);
    const audioResult = JSON.parse(audioCut.text()) as { spans: { start: number; end: number }[];
      mapping: { nominalOutputStart: number; nominalOutputEnd: number }[]; actualSeconds: number; hasVideo: boolean; hasAudio: boolean };
    assert.deepEqual(audioResult.spans, [{ start: 0.25, end: 1 }, { start: 2.5, end: 3 }]);
    assert.deepEqual(audioResult.mapping.map((item) => [item.nominalOutputStart, item.nominalOutputEnd]), [[0, 0.75], [0.75, 1.25]]);
    assert.ok(Math.abs(audioResult.actualSeconds - 1.25) < 0.03, `audio duration ${audioResult.actualSeconds}`);
    assert.equal(audioResult.hasVideo, false);
    assert.equal(audioResult.hasAudio, true);
    await runMediaCli(["media", "cut", audio, "--start", "2.5", "--end", "3", "--to", "late.wav"], io().io, work);
    assert.ok(Math.abs((await probeMedia(join(work, "late.wav"))).duration - 0.5) < 0.03,
      "a late single interval lands on the requested audio time");
    await assert.rejects(runMediaCli(["media", "cut", audio, "--start", "0", "--end", "1", "--to", "spoken.wav"], io().io, work), /already exists/);
    await assert.rejects(runMediaCli(["media", "cut", audio, "--start", "0", "--end", "1", "--label-time", "--to", "labeled.wav"], io().io, work), /needs one video interval/);

    const withAudio = join(work, "source-av.mp4");
    const mux = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", silentVideo, "-i", audio,
      "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-shortest", withAudio], { encoding: "utf8" });
    assert.equal(mux.status, 0, mux.stderr);
    const videoCut = io();
    await runMediaCli(["media", "cut", withAudio, "--keep", "0:0.5", "--keep", "1:1.5", "--to", "joined.mp4", "--json"], videoCut.io, work);
    const joined = await probeMedia(join(work, "joined.mp4"));
    assert.equal(joined.hasVideo, true);
    assert.equal(joined.hasAudio, true);
    assert.ok(Math.abs(joined.duration - 1) < 0.08, `joined duration ${joined.duration}`);
    const first = join(work, "first.jpg");
    const second = join(work, "second.jpg");
    await cutFrame(join(work, "joined.mp4"), 0.2, first);
    await cutFrame(join(work, "joined.mp4"), 0.7, second);
    const firstPixel = await sharp(first).extract({ left: 160, top: 120, width: 1, height: 1 }).raw().toBuffer();
    const secondPixel = await sharp(second).extract({ left: 160, top: 120, width: 1, height: 1 }).raw().toBuffer();
    assert.ok(firstPixel[0]! > firstPixel[1]! * 2, `first frame should be red: ${firstPixel}`);
    assert.ok(secondPixel[1]! > secondPixel[0]! * 2, `second frame should be green: ${secondPixel}`);

    await runMediaCli(["media", "cut", withAudio, "--start", "2.1", "--end", "2.8", "--to", "late.mp4"], io().io, work);
    const lateVideo = await probeMedia(join(work, "late.mp4"));
    assert.equal(lateVideo.hasAudio, true);
    assert.ok(Math.abs(lateVideo.duration - 0.7) < 0.08, `late video duration ${lateVideo.duration}`);
    await runMediaCli(["media", "cut", withAudio, "--start", "0", "--end", "0.5", "--to", "clip.mov"], io().io, work);
    assert.equal((await probeMedia(join(work, "clip.mov"))).hasAudio, true);

    const silentCut = join(work, "silent-cut.mp4");
    await runMediaCli(["media", "cut", silentVideo, "--keep", "0:0.5", "--keep", "1:1.5", "--to", silentCut], io().io, work);
    assert.equal((await probeMedia(silentCut)).hasAudio, false);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("word-located grids paginate dense samples without covering the source picture", { skip: !ffmpeg && "ffmpeg is not installed" }, async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-word-grids-"));
  try {
    const source = await sample(work);
    const transcript = join(work, "words.transcript.svml");
    await writeFile(transcript, speechTranscriptSource("transcript", { sampleFrames: 48_000, passages: [{ words: [
      { text: "Hello", startSample: 1_600, endSampleExclusive: 6_400 },
      { text: "world!", startSample: 6_400, endSampleExclusive: 12_800 },
      { text: "<你好 & café>" },
      { text: "Hello", startSample: 33_600, endSampleExclusive: 38_400 },
      { text: "world!", startSample: 38_400, endSampleExclusive: 44_800 },
    ], chars: [] }] }));
    await assert.rejects(runMediaCli(["media", "grid", source, "--around", "hello world", "--transcript", transcript,
      "--to", "ambiguous.jpg"], io().io, work), /occurs 2 times.*--occurrence/);
    const around = io();
    await runMediaCli(["media", "grid", source, "--around", "hello world", "--occurrence", "2", "--padding", "0.1",
      "--every", "0.2", "--transcript", transcript, "--to", "around.jpg", "--json"], around.io, work);
    const located = JSON.parse(around.text());
    assert.deepEqual(located.samples, [2, 2.2, 2.4, 2.6, 2.8]);
    assert.deepEqual(located.frames[0].words.active, []);
    assert.equal(located.frames[1].words.active[0].text, "Hello");
    assert.equal(located.frames[1].requestedAt, 2.2);
    assert.ok(Math.abs(located.frames[1].at - 53 / 24) < 0.000001, "labels use the decoded frame time, not the requested seek time");
    assert.equal(located.frames[2].words.active[0].text, "world!");

    const wordsOnly = io();
    await runMediaCli(["media", "grid", source, "--at", "0.2,0.6", "--columns", "2", "--transcript", transcript,
      "--no-time", "--to", "words-only.jpg", "--json"], wordsOnly.io, work);
    const wordsOnlyView = JSON.parse(wordsOnly.text());
    assert.deepEqual(wordsOnlyView.view, { timeLabels: false, wordLabels: true, wordContext: "auto", header: false });
    assert.equal(wordsOnlyView.frames[0].words.active[0].text, "Hello");
    assert.ok((await sharp(join(work, "words-only.jpg")).metadata()).height! > 256,
      "word annotations remain available without a visible time label");

    const pages = io();
    await runMediaCli(["media", "grid", source, "--pages", "--start", "0", "--end", "3", "--every", "0.6",
      "--transcript", transcript, "--columns", "2", "--rows", "1", "--to", "pages", "--json"], pages.io, work);
    const grids = JSON.parse(pages.text()).grids;
    assert.deepEqual(grids.map((grid: { samples: number[] }) => grid.samples), [[0, 0.6], [1.2, 1.8], [2.4]]);
    assert.deepEqual(grids.map((grid: { start: number; end: number }) => [grid.start, grid.end]),
      [[0, 0.9], [0.9, 2.1], [2.1, 3]], "page intervals partition the selected source range at sample midpoints");
    assert.equal((await readdir(join(work, "pages"))).length, 3);
    const image = await sharp(grids[0].path).raw().toBuffer({ resolveWithObject: true });
    const center = (128 * image.info.width + 168) * image.info.channels;
    assert.ok(image.data[center]! > 220 && image.data[center + 1]! < 20, "the first source frame stays red and unobscured");
    assert.ok(image.info.height > 240 + 32, "word annotations have their own space beneath the picture");

    const frames = io();
    await runMediaCli(["media", "frames", source, "--start", "0.5", "--end", "1.5", "--every", "0.4",
      "--transcript", transcript, "--to", "frames", "--json"], frames.io, work);
    assert.deepEqual(JSON.parse(frames.text()).frames.map((frame: { requestedAt: number }) => frame.requestedAt), [0.5, 0.9, 1.3]);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
