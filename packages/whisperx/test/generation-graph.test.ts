import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import assert from "node:assert/strict";
import test from "node:test";

import { blobManifest } from "@hypit/blob";
import {
  createGenerationNodePackageFacet,
  type GenerationGraphProject,
} from "@hypit/generation-graph";
import { createNodeGenerationGraphProjectHost } from "@hypit/generation-graph/node";
import {
  mediaManifest,
  prepareMedia,
} from "@hypit/media";
import {
  mediaAssetGenerationNode,
  mediaAssetGenerationNodes,
  mediaAssetGenerationManifest,
} from "@hypit/media-asset-generation";
import { serializeMediaAssetDocument, type MediaAssetDocument } from "@hypit/media-asset";
import {
  speechEvidenceAudioFragment,
  speechEvidenceGenerationNodes,
  speechEvidenceManifest,
} from "@hypit/speech-evidence";
import {
  timedTranscriptManifest,
} from "@hypit/timed-transcript";
import { temporalManifest } from "@hypit/temporal-graph";

import {
  whisperXGenerationNodes,
  whisperXManifest,
  whisperXTranscriptionFragment,
} from "../src/index.js";

function assetDocument(): MediaAssetDocument {
  const timestamp = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } });
  const prepared = prepareMedia({
    id: "interview-media",
    source: { kind: "blob", resource: "res_source", size: 100, mediaType: "audio/wav" },
    inspection: { streams: [{
      kind: "audio", index: 0, codecName: "pcm_s16le",
      disposition: { default: true, attachedPicture: false },
      startPts: timestamp("0"), endPts: timestamp("10"), decodedSampleFrames: 160_000,
      sampleRate: 16_000, channels: 1,
    }] },
    selection: { audioStreamIndex: 0, spanAuthority: "audio" },
  });
  const { source: _source, ...interpretation } = prepared;
  return {
    format: "hypit.media-asset@1",
    id: "interview",
    media: {
      file: { path: "./interview.wav", mediaType: "audio/wav" },
      interpretation,
    },
    representations: [],
  };
}

test("Media Asset, speech evidence and WhisperX form one typed graph without central node knowledge", async () => {
  const packages = [
    { specifier: "@hypit/blob", contribution: {
      facets: [createModuleFacet(blobManifest), createGenerationModuleFacet(blobManifest)],
    } },
    { specifier: "@hypit/temporal-graph", contribution: {
      facets: [createModuleFacet(temporalManifest), createGenerationModuleFacet(temporalManifest)],
    } },
    { specifier: "@hypit/media", contribution: {
      facets: [createModuleFacet(mediaManifest), createGenerationModuleFacet(mediaManifest)],
    } },
    { specifier: "@hypit/media-asset-generation", contribution: {
      facets: [
    createModuleFacet(mediaAssetGenerationManifest), createGenerationModuleFacet(mediaAssetGenerationManifest), createGenerationNodePackageFacet({ nodes: [mediaAssetGenerationNode] })],
    } },
    { specifier: "@hypit/speech-evidence", contribution: {
      facets: [
    createModuleFacet(speechEvidenceManifest), createGenerationModuleFacet(speechEvidenceManifest), createGenerationNodePackageFacet({ nodes: [{
        kind: "operation",
        using: speechEvidenceGenerationNodes.projectAudio,
        fragment: speechEvidenceAudioFragment,
      }] })],
    } },
    { specifier: "@hypit/timed-transcript", contribution: {
      facets: [createModuleFacet(timedTranscriptManifest), createGenerationModuleFacet(timedTranscriptManifest)],
    } },
    { specifier: "@hypit/whisperx", contribution: {
      facets: [
    createModuleFacet(whisperXManifest), createGenerationModuleFacet(whisperXManifest), createGenerationNodePackageFacet({ nodes: [{
        kind: "operation",
        using: whisperXGenerationNodes.transcribe,
        fragment: whisperXTranscriptionFragment,
      }] })],
    } },
  ];
  const attachment = {
    blob: { kind: "blob" as const, resource: "res_interview" as const, size: 100, mediaType: "audio/wav" },
    open: async () => (async function* () { yield new Uint8Array(100); })(),
  };
  const project: GenerationGraphProject = {
    format: "hypit.generation-graph@1",
    id: "transcribe-interview",
    name: "Transcribe interview",
    revision: 0,
    nodes: [{
      id: "media",
      using: mediaAssetGenerationNodes.media,
      inputs: { asset: { value: { path: "assets/interview.media.json" } } },
    }, {
      id: "evidence",
      using: speechEvidenceGenerationNodes.projectAudio,
      inputs: { media: { node: "media" } },
    }, {
      id: "transcript",
      using: whisperXGenerationNodes.transcribe,
      inputs: {
        evidence: { node: "evidence" },
        language: { value: "zh" },
      },
    }],
  };
  const host = createNodeGenerationGraphProjectHost({
    packages,
    assets: {
      readAsset: () => new TextEncoder().encode(serializeMediaAssetDocument(assetDocument())),
      resolveAsset: () => attachment.blob,
      attachments: () => [attachment],
    },
  });
  const prepared = await host.prepare(project, ["transcript"]);
  assert.equal(prepared.definition.plan.steps.length, 2);
  assert.deepEqual(prepared.generated.map((item) => item.node), ["evidence", "transcript"]);
  assert.deepEqual(prepared.executionPackages, ["@hypit/speech-evidence", "@hypit/whisperx"]);
  assert.deepEqual(prepared.attachments, [attachment]);
});
