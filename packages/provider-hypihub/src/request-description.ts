import type { CapabilityRef, CanonicalValue } from '@hypit/hypit/protocol';
import { hypiHubRouteForCapability } from './routes.js';

/** Resolve the service model and operation before uploading input resources. */
export function describeHypiHubRequest(capability: CapabilityRef, constraints: CanonicalValue) {
  const route = hypiHubRouteForCapability(capability);
  if (!route) return undefined;
  const request = route.prepare(constraints);
  return { model: request.model, operation: request.operation };
}
