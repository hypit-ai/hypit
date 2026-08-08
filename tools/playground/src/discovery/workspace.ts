/// <reference types="vite/client" />

import { discoverPreviewProducers } from "./producers.js";
import type { PreviewProducer } from "./producers.js";

/**
 * Every workspace module, handed to the discovery as loaders.
 *
 * The glob is the only part of discovery that is Vite's rather than the
 * compiler's, so it is the only part kept here — which also leaves the
 * discovery itself runnable, and testable, outside a browser.
 */
export async function workspacePreviewProducers(): Promise<readonly PreviewProducer[]> {
  return await discoverPreviewProducers({
    // Both, because a small module states its manifest in its entry rather than
    // in a file of its own — ProgramSpace is one, and a Producer that takes one
    // needs its schema to build a form.
    manifests: {
      ...import.meta.glob("../../../../packages/*/src/manifest.ts"),
      ...import.meta.glob("../../../../packages/*/src/index.ts"),
    },
    components: import.meta.glob("../../../../packages/*/src/component.ts"),
  });
}
