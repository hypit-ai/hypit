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
    // Manifests have a dedicated, browser-safe entry. Globbing package indexes
    // would also bundle Node Drivers and Providers merely to discover metadata.
    manifests: import.meta.glob("../../../../packages/*/src/manifest.ts"),
    components: import.meta.glob("../../../../packages/*/src/component.ts"),
  });
}
