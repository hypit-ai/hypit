import { fileURLToPath } from "node:url";

import { createProjectLocalRuntime } from "@narratage/local";
import { createGoogleVertexCaptionProvider } from "@narratage/provider-google-vertex";
import { createLocalHyperframesProvider } from "@narratage/provider-hyperframes-local";
import { createKieProvider } from "@narratage/provider-kie";
import { createLocalMediaProvider } from "@narratage/provider-media-local";
import { createLocalWhisperXProvider } from "@narratage/provider-whisperx-local";

export default async function createTalkingFilmRuntime() {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required for the explicit Vertex Gemini Caption Provider");

  const endpoints = [
    createKieProvider({
      instance: "kie.talking-film",
      lane: "generation",
      defaultConcurrency: 2,
    }),
    createLocalMediaProvider({
      instance: "media.talking-film",
      lane: "media",
      defaultConcurrency: 2,
    }),
    createLocalWhisperXProvider({
      instance: "whisperx.talking-film",
      lane: "alignment",
      defaultConcurrency: 1,
    }),
    createGoogleVertexCaptionProvider({
      project,
      instance: "vertex.talking-film",
      lane: "planning",
      defaultConcurrency: 1,
    }),
    createLocalHyperframesProvider({
      instance: "hyperframes.talking-film",
      lane: "render",
      workers: 2,
      quality: "standard",
      defaultConcurrency: 1,
    }),
  ];

  return await createProjectLocalRuntime({
    root: fileURLToPath(new URL(".", import.meta.url)),
    packageLock: "./svml.packages.lock",
    endpoints,
    allowedPermissions: [...new Set(endpoints.flatMap((endpoint) =>
      endpoint.manifest.facets.flatMap((facet) => facet.permissions)))],
    scheduling: {
      maxConcurrency: 4,
      lanes: {
        generation: 2,
        media: 2,
        alignment: 1,
        planning: 1,
        render: 1,
      },
    },
  });
}
