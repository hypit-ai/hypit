/**
 * Alibaba Video Generation Model Activation
 * Registers the model and surfaces with the Hypit system
 */

import type { ActivationContext } from "@hypit/elaborator";
import {
  alibabaVideoComponent,
  alibabaVideoManifest,
  alibabaVideoMarkupSurfaces,
} from "./index.js";

export function activate(context: ActivationContext) {
  // Register the model component
  context.component(alibabaVideoComponent);

  // Register the manifest
  context.manifest(alibabaVideoManifest);

  // Register all markup surfaces
  for (const surface of alibabaVideoMarkupSurfaces) {
    context.surface(surface);
  }
}
