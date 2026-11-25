import assert from "node:assert/strict";
import test from "node:test";

import { blobTypes } from "@hypit/blob";
import { generationTypes } from "@hypit/generation";
import { parseStructuredElement } from "@hypit/markup";
import type { SurfaceResolvedReference } from "@hypit/markup";
import type { BlobRef } from "@hypit/protocol";
import { sealText, textTypes } from "@hypit/text";

import noizAudioPackage from "../src/activation.js";
import {
  NOIZ_COVER_SOURCE_AUDIO_MAX_BYTES,
  decodeNoizMusicCoverSurface,
  decodeNoizMusicSurface,
  decodeNoizSoundEffectSurface,
  noizAudioEndpoints,
  noizAudioMarkupSurfaces,
  noizAudioModels,
  noizAudioPorts,
  sealNoizAudioRequest,
} from "../src/index.js";

function parsed(source: string) {
  return parseStructuredElement({ name: "noiz.svml", text: source }, 0).element;
}

function makeTextRef(path: string, content: string): SurfaceResolvedReference {
  return {
    path,
    ref: { kind: "record", id: path },
    type: textTypes.text,
    record: {
      id: path,
      type: textTypes.text,
      value: { kind: "inline", value: sealText(content) },
    },
  };
}

function makeBlobRef(path: string, mediaType: string, size = 1024): SurfaceResolvedReference {
  return {
    path,
    ref: { kind: "record", id: path },
    type: blobTypes.blob,
    record: {
      id: path,
      type: blobTypes.blob,
      value: { kind: "blob", resource: `res_${path.replaceAll(".", "_")}`, size, mediaType },
    },
  };
}

function makeContext(source: string, refs: Readonly<Record<string, SurfaceResolvedReference>>) {
  return {
    sourceName: "noiz.svml",
    element: parsed(source),
    resolveReference: (path: string) => refs[path],
    resolveAsset: () => { throw new Error("no asset"); },
  };
}

const sampleAudioBlob: BlobRef = {
  kind: "blob",
  resource: "res_source_track",
  size: 1024 * 1024,
  mediaType: "audio/wav",
};

test("Noiz Audio declares the three exact audio capabilities and package activation", () => {
  assert.deepEqual(noizAudioModels, ["noiz-text-to-sound", "noiz-yue2-music", "noiz-yue2-cover"]);
  assert.ok(Object.values(noizAudioPorts).every((table) => table.result === "audio"));
  assert.ok(Object.values(noizAudioEndpoints).every(
    (endpoint) => endpoint.returns.name === generationTypes.audioSet.name,
  ));
  assert.equal(noizAudioPackage.format, "hypit.package@1");
  assert.equal(noizAudioPackage.modules[0]?.manifest.version, "1");
  assert.deepEqual(
    noizAudioMarkupSurfaces.map((surface) => surface.name),
    ["sound-effect", "music", "music-cover"],
  );
});

test("noiz-text-to-sound validates prompt, duration and outputFormat", () => {
  const minimal = sealNoizAudioRequest("noiz-text-to-sound", {
    prompt: ["Heavy rain hitting a tin roof at midnight"],
  });
  assert.deepEqual(minimal.ports.prompt, ["Heavy rain hitting a tin roof at midnight"]);

  const full = sealNoizAudioRequest("noiz-text-to-sound", {
    prompt: ["Crisp footsteps on fresh snow"],
    duration: [12.5],
    outputFormat: ["mp3"],
  });
  assert.deepEqual(full.ports.duration, [12.5]);
  assert.deepEqual(full.ports.outputFormat, ["mp3"]);

  assert.throws(
    () => sealNoizAudioRequest("noiz-text-to-sound", { prompt: ["   "] }),
    /non-whitespace/u,
  );
  assert.throws(
    () => sealNoizAudioRequest("noiz-text-to-sound", { prompt: ["a".repeat(501)] }),
    /500/u,
  );
  assert.throws(
    () => sealNoizAudioRequest("noiz-text-to-sound", { prompt: ["Thunder"], duration: [0.5] }),
    /at least 1/u,
  );
  assert.throws(
    () => sealNoizAudioRequest("noiz-text-to-sound", { prompt: ["Thunder"], duration: [31] }),
    /at most 30/u,
  );
  assert.throws(
    () => sealNoizAudioRequest("noiz-text-to-sound", { prompt: ["Thunder"], outputFormat: ["ogg"] }),
    /outputFormat/u,
  );
});

test("noiz-yue2-music validates lyrics/lyricsPrompt exclusivity and abc+cot rules", () => {
  const withLyrics = sealNoizAudioRequest("noiz-yue2-music", {
    prompt: ["Warm indie folk with acoustic guitar"],
    lyrics: ["[Verse 1]\nMorning light across the hill"],
    vocalGender: ["Female"],
    lyricTimestamps: [true],
  });
  assert.deepEqual(withLyrics.ports.vocalGender, ["Female"]);
  assert.deepEqual(withLyrics.ports.lyricTimestamps, [true]);

  const withLyricsPromptAndAbc = sealNoizAudioRequest("noiz-yue2-music", {
    prompt: ["Uplifting synth pop"],
    lyricsPrompt: ["Write a short chorus about chasing stars"],
    abc: ["X:1\nT:Stars\nM:4/4\nK:C\nCDEF G2G2|"],
    cot: ["full"],
    title: ["Chasing Stars"],
    tags: ["synth-pop, upbeat"],
    negativeTags: ["heavy metal"],
  });
  assert.deepEqual(withLyricsPromptAndAbc.ports.cot, ["full"]);

  assert.throws(
    () => sealNoizAudioRequest("noiz-yue2-music", {
      prompt: ["Ambient piano"],
    }),
    /either lyrics or lyricsPrompt/u,
  );
  assert.throws(
    () => sealNoizAudioRequest("noiz-yue2-music", {
      prompt: ["Ambient piano"],
      lyrics: ["[Verse 1]\nHello"],
      lyricsPrompt: ["Write about hello"],
    }),
    /at most one/u,
  );
  assert.throws(
    () => sealNoizAudioRequest("noiz-yue2-music", {
      prompt: ["Chamber strings"],
      lyrics: ["[Verse 1]\nQuiet dusk"],
      abc: ["X:1\nK:C\nCDEF|"],
      cot: ["off"],
    }),
    /cannot combine abc with cot=off/u,
  );
  assert.throws(
    () => sealNoizAudioRequest("noiz-yue2-music", {
      prompt: ["Chamber strings"],
      lyrics: ["[Verse 1]\nQuiet dusk"],
      abc: ["   "],
    }),
    /non-whitespace/u,
  );
});

test("noiz-yue2-cover validates source audio, description/style requirement, and melodyAdherence", () => {
  const cover = sealNoizAudioRequest("noiz-yue2-cover", {
    sourceAudio: [{ role: "audio", artifact: sampleAudioBlob }],
    lyrics: ["[Verse 1]\nNew words for the melody"],
    musicDescription: ["Acoustic jazz quartet version"],
    melodyAdherence: ["main_melody"],
    vocalGender: ["Male"],
  });
  assert.deepEqual(cover.ports.melodyAdherence, ["main_melody"]);
  assert.deepEqual(cover.ports.vocalGender, ["Male"]);

  const styleOnly = sealNoizAudioRequest("noiz-yue2-cover", {
    sourceAudio: [{ role: "audio", artifact: sampleAudioBlob }],
    lyrics: ["[Verse 1]\nNew words for the melody"],
    style: ["lo-fi, chill"],
    melodyAdherence: ["high"],
  });
  assert.deepEqual(styleOnly.ports.melodyAdherence, ["high"]);

  assert.throws(
    () => sealNoizAudioRequest("noiz-yue2-cover", {
      sourceAudio: [{ role: "audio", artifact: sampleAudioBlob }],
      lyrics: ["[Verse 1]\nNew words"],
      melodyAdherence: ["high"],
    }),
    /either musicDescription or style/u,
  );

  assert.throws(
    () => sealNoizAudioRequest("noiz-yue2-cover", {
      sourceAudio: [{
        role: "audio",
        artifact: { ...sampleAudioBlob, size: NOIZ_COVER_SOURCE_AUDIO_MAX_BYTES + 1 },
      }],
      lyrics: ["[Verse 1]\nNew words"],
      style: ["pop"],
      melodyAdherence: ["high"],
    }),
    /100 MB/u,
  );

  assert.throws(
    () => sealNoizAudioRequest("noiz-yue2-cover", {
      sourceAudio: [{
        role: "audio",
        artifact: { ...sampleAudioBlob, mediaType: "audio/webm" },
      }],
      lyrics: ["[Verse 1]\nNew words"],
      style: ["pop"],
      melodyAdherence: ["high"],
    }),
    /must use one of/u,
  );
});

test("SoundEffect surface binds prompt text and draft scalar ports", async () => {
  const refs = {
    rainPrompt: makeTextRef("rainPrompt", "Steady rain on cobblestones"),
  };
  const result = await decodeNoizSoundEffectSurface(makeContext(
    `<noiz:SoundEffect id="rain" prompt={rainPrompt} duration="8.5" output-format="mp3"/>`,
    refs,
  ));
  assert.deepEqual(result.components[0]!.outputs, { audio: "rain.audio" });
  assert.deepEqual(result.components[0]!.inputs["prompt:text"], { kind: "record", id: "rainPrompt" });
  const draft = result.records[0]!.value.kind === "inline"
    ? result.records[0]!.value.value as { ports: Record<string, unknown[]> }
    : { ports: {} };
  assert.deepEqual(draft.ports.duration, [8.5]);
  assert.deepEqual(draft.ports.outputFormat, ["mp3"]);
  assert.equal(draft.ports.prompt, undefined);

  assert.throws(
    () => decodeNoizSoundEffectSurface(makeContext(
      `<noiz:SoundEffect id="bad" prompt={longPrompt}/>`,
      { longPrompt: makeTextRef("longPrompt", "x".repeat(501)) },
    )),
    /500/u,
  );
});

test("Music surface binds text ports and enforces lyrics exclusivity and abc+cot rule", async () => {
  const refs = {
    stylePrompt: makeTextRef("stylePrompt", "Dreamy lo-fi indie ballad"),
    songLyrics: makeTextRef("songLyrics", "[Verse 1]\nPaper moon above the bay"),
    lyricsIdea: makeTextRef("lyricsIdea", "A nostalgic verse about a train ride"),
    scoreAbc: makeTextRef("scoreAbc", "X:1\nT:Moon\nM:4/4\nK:C\nCDEF|"),
  };

  const result = await decodeNoizMusicSurface(makeContext(
    `<noiz:Music id="theme" prompt={stylePrompt} lyrics={songLyrics} abc={scoreAbc} cot="full" title="Paper Moon" tags="indie, lo-fi" negative-tags="metal" vocal-gender="Female" lyric-timestamps="true"/>`,
    refs,
  ));
  assert.deepEqual(result.components[0]!.outputs, { audio: "theme.audio" });
  assert.deepEqual(result.components[0]!.inputs["prompt:text"], { kind: "record", id: "stylePrompt" });
  assert.deepEqual(result.components[0]!.inputs["lyrics:text"], { kind: "record", id: "songLyrics" });
  assert.deepEqual(result.components[0]!.inputs["abc:text"], { kind: "record", id: "scoreAbc" });
  const draft = result.records[0]!.value.kind === "inline"
    ? result.records[0]!.value.value as { ports: Record<string, unknown[]> }
    : { ports: {} };
  assert.deepEqual(draft.ports.cot, ["full"]);
  assert.deepEqual(draft.ports.title, ["Paper Moon"]);
  assert.deepEqual(draft.ports.tags, ["indie, lo-fi"]);
  assert.deepEqual(draft.ports.negativeTags, ["metal"]);
  assert.deepEqual(draft.ports.vocalGender, ["Female"]);
  assert.deepEqual(draft.ports.lyricTimestamps, [true]);

  assert.throws(
    () => decodeNoizMusicSurface(makeContext(
      `<noiz:Music id="missing" prompt={stylePrompt}/>`,
      refs,
    )),
    /exactly one of lyrics or lyrics-prompt/u,
  );
  assert.throws(
    () => decodeNoizMusicSurface(makeContext(
      `<noiz:Music id="both" prompt={stylePrompt} lyrics={songLyrics} lyrics-prompt={lyricsIdea}/>`,
      refs,
    )),
    /exactly one of lyrics or lyrics-prompt/u,
  );
  assert.throws(
    () => decodeNoizMusicSurface(makeContext(
      `<noiz:Music id="badCot" prompt={stylePrompt} lyrics={songLyrics} abc={scoreAbc} cot="off"/>`,
      refs,
    )),
    /cannot combine abc with cot="off"/u,
  );
});

test("MusicCover surface binds audio and text ports and validates source audio", async () => {
  const refs = {
    "original.audio": makeBlobRef("original.audio", "audio/mpeg", 2048),
    newLyrics: makeTextRef("newLyrics", "[Verse 1]\nCity lights begin to fade"),
    coverPrompt: makeTextRef("coverPrompt", "Warm acoustic bossa nova arrangement"),
    "poster.image": makeBlobRef("poster.image", "image/png", 1024),
  };

  const result = await decodeNoizMusicCoverSurface(makeContext(
    `<noiz:MusicCover id="cover" source-audio={original.audio} lyrics={newLyrics} music-description={coverPrompt} melody-adherence="main_melody" vocal-gender="Male" lyric-timestamps="false"/>`,
    refs,
  ));
  assert.deepEqual(result.components[0]!.outputs, { audio: "cover.audio" });
  assert.deepEqual(result.components[0]!.inputs["sourceAudio:artifact"], { kind: "record", id: "original.audio" });
  assert.ok(result.components[0]!.inputs["sourceAudio:binding"] !== undefined);
  assert.deepEqual(result.components[0]!.inputs["lyrics:text"], { kind: "record", id: "newLyrics" });
  assert.deepEqual(result.components[0]!.inputs["musicDescription:text"], { kind: "record", id: "coverPrompt" });

  assert.throws(
    () => decodeNoizMusicCoverSurface(makeContext(
      `<noiz:MusicCover id="noStyle" source-audio={original.audio} lyrics={newLyrics} melody-adherence="high"/>`,
      refs,
    )),
    /either music-description or style/u,
  );
  assert.throws(
    () => decodeNoizMusicCoverSurface(makeContext(
      `<noiz:MusicCover id="badMedia" source-audio={poster.image} lyrics={newLyrics} style="jazz" melody-adherence="high"/>`,
      refs,
    )),
    /must reference audio media/u,
  );
});
