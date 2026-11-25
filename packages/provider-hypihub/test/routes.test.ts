import assert from "node:assert/strict";
import test from "node:test";
import type { GenerationArtifactUrlResolver } from "@hypit/generation";
import type { EndpointSupport } from "@hypit/endpoint";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";

import { hypiHubRoutes } from "../src/routes.js";
import type { HypiHubRoute } from "../src/routes.js";
import { sealGptImage2Request } from "../../gpt-image/src/index.js";

async function compile(route: HypiHubRoute, constraints: CanonicalValue, resolve: GenerationArtifactUrlResolver) {
  return await route.prepare(constraints).compile(resolve);
}

const image: BlobRef = {
  kind: "blob" as const,
  resource: "res_hypihub-route-1",
  size: 3,
  mediaType: "image/png",
};

const resolve = async () => "data:image/png;base64,AQID";
const resolveAudio = async () => "data:audio/wav;base64,AQID";

test("service restrictions leave the model request valid and reject before resolving uploads", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "gpt-image-2")!;
  const request = sealGptImage2Request({
    prompt: ["edit the cutout"], aspectRatio: ["1:1"], resolution: ["2K"],
    background: ["opaque"], images: [{ role: "image", artifact: image }],
  });
  const constraints = request as unknown as CanonicalValue;
  assert.equal(route.supports!({ capability: route.capability, returns: route.returns, constraints }).status, "unsupported");
  let resolved = 0;
  const upload: GenerationArtifactUrlResolver = async () => { resolved++; return "https://example.test/reference.png"; };
  await assert.rejects(compile(route, constraints, upload), /background option only at 1K/);
  assert.equal(resolved, 0);

  const supported = sealGptImage2Request({ ...request.ports, resolution: ["1K"] }) as unknown as CanonicalValue;
  assert.equal(route.supports!({ capability: route.capability, returns: route.returns, constraints: supported }).status, "supported");
  await compile(route, supported, upload);
  assert.equal(resolved, 1);
});

test("HypiHub GPT image requests use canonical edit references and the authored resolution tier", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "gpt-image-2");
  assert.ok(route);
  const result = await compile(route, {
    ports: {
      prompt: ["edit"],
      aspectRatio: ["1:1"],
      resolution: ["1K"],
      background: ["transparent"],
      images: [{ role: "image", artifact: image }],
    },
  }, resolve);
  assert.equal(result.model, "gpt-image-2");
  assert.deepEqual(result.input, {
    prompt: "edit",
    aspect_ratio: "1:1",
    resolution: "1K",
    background: "transparent",
    reference_images: [{ url: "data:image/png;base64,AQID" }],
  });

  const unsupported = { ports: {
    prompt: ["cutout"], aspectRatio: ["1:1"], resolution: ["2K"], background: ["opaque"],
  } } as unknown as CanonicalValue;
  assert.deepEqual(route.supports?.({
    capability: route.capability,
    returns: route.returns,
    constraints: unsupported,
  }), {
    status: "unsupported",
    reason: "HypiHub GPT Image 2 accepts the background option only at 1K; omit it at 2K",
  });
  await assert.rejects(compile(route, unsupported, resolve), /background option only at 1K/u);

  for (const constraints of [
    { ports: { prompt: ["portrait"], aspectRatio: ["5:4"], resolution: ["2K"] } },
    { ports: { prompt: ["portrait"], aspectRatio: ["3:1"], resolution: ["4K"] } },
  ]) {
    const support: EndpointSupport | undefined = route.supports?.({
      capability: route.capability,
      returns: route.returns,
      constraints,
    });
    assert.equal(support?.status, "unsupported");
    assert.match(support?.status === "unsupported" ? support.reason : "", /HypiHub GPT Image 2/u);
  }

  for (const constraints of [
    { ports: { prompt: ["portrait"], aspectRatio: ["auto"], resolution: ["4K"] } },
    { ports: { prompt: ["portrait"], aspectRatio: ["5:4"], resolution: ["4K"] } },
  ]) {
    assert.deepEqual(route.supports?.({
      capability: route.capability,
      returns: route.returns,
      constraints,
    }), { status: "supported" });
  }
});

test("HypiHub image-to-video requests preserve Hypit's first-frame semantics", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "minimax-h3");
  assert.ok(route);
  const result = await compile(route, {
    ports: {
      prompt: ["animate"],
      duration: [5],
      firstFrame: [{ role: "image", artifact: image }],
    },
  }, resolve);
  assert.equal(result.model, "minimax-h3");
  assert.deepEqual(result.input, {
    prompt: "animate",
    seconds: 5,
    resolution: "2k",
    first_frame: "data:image/png;base64,AQID",
  });
});

test("HypiHub sends audio references through the public top-level field", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "minimax-h3");
  assert.ok(route);
  const result = await compile(route, {
    ports: {
      prompt: ["animate"],
      duration: [5],
      referenceAudio: [{ role: "audio", artifact: { ...image, mediaType: "audio/wav" } }],
    },
  }, resolveAudio);
  assert.deepEqual(result.input, {
    prompt: "animate", seconds: 5, resolution: "2k",
    reference_audios: ["data:audio/wav;base64,AQID"],
  });
});

test("HypiHub Seedance sends reference images through the public top-level field", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "seedance-2");
  assert.ok(route);
  const result = await compile(route, {
    ports: {
      prompt: ["animate"],
      duration: [5],
      resolution: ["720p"],
      aspectRatio: ["16:9"],
      generateAudio: [true],
      webSearch: [false],
      referenceImage: [
        { role: "image", artifact: image, fields: { personReference: true } },
        { role: "image", artifact: { ...image, resource: "res_hypihub-route-2" }, fields: { personReference: false } },
      ],
    },
  }, resolve);
  assert.equal(result.model, "seedance-2");
  assert.deepEqual(result.input, {
    prompt: "animate",
    seconds: 5,
    resolution: "720p",
    aspect_ratio: "16:9",
    generate_audio: true,
    web_search: false,
    reference_image_urls: ["data:image/png;base64,AQID", "data:image/png;base64,AQID"],
  });
});

test("HypiHub MiniMax reference mode preserves the public image array", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "minimax-h3");
  assert.ok(route);
  const result = await compile(route, { ports: {
    prompt: ["animate"], duration: [6], aspectRatio: ["16:9"],
    referenceImage: [{ role: "image", artifact: image }],
  } }, resolve);
  assert.equal(result.model, "minimax-h3");
  assert.deepEqual(result.input, {
    prompt: "animate", seconds: 6, aspect_ratio: "16:9",
    resolution: "2k",
    reference_image_urls: ["data:image/png;base64,AQID"],
  });
});

test("HypiHub preserves reference-video roles for one or several videos", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "minimax-h3");
  assert.ok(route);
  const video = { ...image, mediaType: "video/mp4" };
  const resolveVideo = async (artifact: typeof video) => `https://hypit.ai/files/${artifact.resource.slice(-1)}.mp4`;

  const single = await compile(route, { ports: {
    prompt: ["animate"], duration: [6],
    referenceVideo: [{ role: "video", artifact: video }],
  } }, resolveVideo);
  assert.deepEqual(single.input, {
    prompt: "animate", seconds: 6, resolution: "2k",
    reference_videos: ["https://hypit.ai/files/1.mp4"],
  });

  const multiple = await compile(route, { ports: {
    prompt: ["animate"], duration: [6],
    referenceVideo: [
      { role: "video", artifact: video },
      { role: "video", artifact: { ...video, resource: "res_hypihub-route-2" } },
    ],
  } }, resolveVideo);
  assert.deepEqual(multiple.input, {
    prompt: "animate", seconds: 6, resolution: "2k",
    reference_videos: ["https://hypit.ai/files/1.mp4", "https://hypit.ai/files/2.mp4"],
  });
});

test("HypiHub MiMo Speech mappings use the public audio speech fields", async () => {
  const voiceDesign = hypiHubRoutes.find((item) => item.capability.name === "mimo-v2.5-tts-voicedesign");
  assert.ok(voiceDesign);
  const result = await compile(voiceDesign, {
    ports: { text: ["hello"], voiceDescription: ["warm and calm"] },
  }, resolve);
  assert.equal(result.model, "mimo-v2.5-tts-voicedesign");
  assert.deepEqual(result.input, { input: "hello", voice_description: "warm and calm" });

  const voiceClone = hypiHubRoutes.find((item) => item.capability.name === "mimo-v2.5-tts-voiceclone");
  assert.ok(voiceClone);
  const cloned = await compile(voiceClone, {
    ports: {
      text: ["hello again"],
      instruction: ["quiet and direct"],
      voiceReference: [{ role: "audio", artifact: { ...image, mediaType: "audio/wav" } }],
    },
  }, resolveAudio);
  assert.equal(cloned.model, "mimo-v2.5-tts-voiceclone");
  assert.deepEqual(cloned.input, {
    input: "hello again",
    prompt: "quiet and direct",
    reference_audio: ["data:audio/wav;base64,AQID"],
  });
});

test("Seedance person metadata reaches resource transport without changing video request fields", async () => {
  for (const route of hypiHubRoutes.filter((item) => item.capability.module.name === "@hypit/seedance")) {
    for (const port of ["referenceImage", "referenceVideo", "firstFrame", "lastFrame"] as const) {
      for (const flag of [true, false]) {
        const fields = { personReference: flag };
        const seen: unknown[] = [];
        const result = await compile(route, { ports: {
          prompt: ["animate"], duration: [5],
          [port]: [{ role: port === "referenceVideo" ? "video" : "image", artifact: image, fields }],
        } }, async (_artifact, metadata) => { seen.push(metadata); return "https://media.test/ref"; });
        assert.deepEqual(seen, [fields]);
        const wireField = { referenceImage: "reference_image_urls", referenceVideo: "reference_videos", firstFrame: "first_frame", lastFrame: "last_frame" }[port];
        assert.deepEqual((result.input as Record<string, unknown>)[wireField], port.startsWith("reference") ? ["https://media.test/ref"] : "https://media.test/ref");
        assert.equal(JSON.stringify(result.input).includes("person"), false);
      }
    }
  }
});

test("exact model identity survives reference mode and preview selection", async () => {
  const lite = hypiHubRoutes.find((item) => item.capability.name === "seedream-5-lite")!;
  const preview = hypiHubRoutes.find((item) => item.capability.name === "grok-imagine-video-1.5-preview")!;
  for (const images of [[], [{ role: "image", artifact: image }]]) {
    const request = { ports: { prompt: ["A scene"], ...(images.length ? { images } : {}) } };
    assert.equal((await compile(lite, request, resolve)).model, "seedream-5-lite");
    assert.equal((await compile(preview, request, resolve)).model, "grok-imagine-video-1.5-preview");
  }
});

test("canonical image models keep generation and edit operations distinct", async () => {
  for (const name of ["gpt-image-2", "seedream-5-lite", "nano-banana-2", "nano-banana-pro"]) {
    const route = hypiHubRoutes.find((item) => item.capability.name === name)!;
    for (const images of [[], [{ role: "image", artifact: image }]]) {
      const prepared = route.prepare({ ports: { prompt: ["A scene"], images } });
      assert.equal(prepared.model, name);
      assert.equal(prepared.operation, images.length ? "image_edits" : "images");
      const compiled = await prepared.compile(resolve);
      assert.equal(compiled.model, name);
      assert.deepEqual((compiled.input as Record<string, CanonicalValue>).reference_images,
        images.length ? [{ url: "data:image/png;base64,AQID" }] : []);
    }
  }
});

test("Noiz audio routes map text-to-sound immediately and YuE2 music/cover asynchronously", async () => {
  const sfx = hypiHubRoutes.find((item) => item.capability.name === "noiz-text-to-sound")!;
  assert.equal(sfx.lifecycle, "immediate");
  const sfxPrepared = sfx.prepare({ ports: { prompt: ["Rain on roof"], duration: [8.5], outputFormat: ["mp3"] } });
  assert.equal(sfxPrepared.model, "noiz-text-to-sound");
  assert.equal(sfxPrepared.operation, "audio_speech");
  assert.deepEqual((await sfxPrepared.compile(resolveAudio)).input, {
    input: "Rain on roof",
    duration_seconds: 8.5,
    response_format: "mp3",
  });

  const tts = hypiHubRoutes.find((item) => item.capability.name === "noiz-tts")!;
  assert.equal(tts.lifecycle, "immediate");
  const ttsPrepared = tts.prepare({
    ports: { text: ["Hello world"], voiceId: ["95814add"], modelId: ["v3"], outputFormat: ["mp3"], speed: [1.1] },
  });
  assert.equal(ttsPrepared.model, "noiz-tts");
  assert.equal(ttsPrepared.operation, "audio_speech");
  assert.deepEqual((await ttsPrepared.compile(resolveAudio)).input, {
    input: "Hello world",
    voice: "95814add",
    model_id: "v3",
    response_format: "mp3",
    speed: 1.1,
  });

  const vc = hypiHubRoutes.find((item) => item.capability.name === "noiz-voice-clone")!;
  assert.equal(vc.lifecycle, "immediate");
  const vcAudio: BlobRef = { kind: "blob", resource: "res_hypihub-vc-1", size: 4, mediaType: "audio/wav" };
  const vcPrepared = vc.prepare({
    ports: { text: ["Cloned line"], voiceReference: [{ role: "audio", artifact: vcAudio }], denoise: [true] },
  });
  assert.equal(vcPrepared.model, "noiz-voice-clone");
  assert.equal(vcPrepared.operation, "audio_speech");
  assert.deepEqual((await vcPrepared.compile(resolveAudio)).input, {
    input: "Cloned line",
    reference_audio: ["data:audio/wav;base64,AQID"],
    denoise: true,
  });

  const music = hypiHubRoutes.find((item) => item.capability.name === "noiz-yue2-music")!;
  assert.equal(music.lifecycle, "asynchronous");
  const musicPrepared = music.prepare({
    ports: {
      prompt: ["Warm indie folk"],
      lyrics: ["[Verse 1]\nMorning light"],
      vocalGender: ["Female"],
      lyricTimestamps: [true],
    },
  });
  assert.equal(musicPrepared.model, "noiz-yue2-music");
  assert.equal(musicPrepared.operation, "audio_music");
  assert.deepEqual((await musicPrepared.compile(resolveAudio)).input, {
    prompt: "Warm indie folk",
    lyrics: "[Verse 1]\nMorning light",
    vocal_gender: "Female",
    lyric_timestamps: true,
  });

  const cover = hypiHubRoutes.find((item) => item.capability.name === "noiz-yue2-cover")!;
  assert.equal(cover.lifecycle, "asynchronous");
  const audio: BlobRef = { kind: "blob", resource: "res_hypihub-audio-1", size: 4, mediaType: "audio/wav" };
  const coverPrepared = cover.prepare({
    ports: {
      sourceAudio: [{ role: "audio", artifact: audio }],
      lyrics: ["[Verse 1]\nNew lyrics"],
      musicDescription: ["Jazz cover"],
      melodyAdherence: ["main_melody"],
    },
  });
  assert.equal(coverPrepared.model, "noiz-yue2-cover");
  assert.equal(coverPrepared.operation, "audio_music");
  assert.deepEqual((await coverPrepared.compile(resolveAudio)).input, {
    reference_audio: ["data:audio/wav;base64,AQID"],
    lyrics: "[Verse 1]\nNew lyrics",
    music_description: "Jazz cover",
    melody_adherence: "main_melody",
  });
});
