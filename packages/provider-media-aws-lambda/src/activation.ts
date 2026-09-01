import {
  createRuntimeEndpointAdapterFacet,
} from "@hypit/runtime-kit";

const awsLambdaMediaRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-media-aws-lambda",
  activate(_context) {
    throw new Error(
      "@hypit/provider-media-aws-lambda is retired: it depended on a Runtime-wide shared S3 ArtifactStore."
      + " Use a Provider that owns its remote transport and imports completed resources into the Build working store.",
    );
  },
});

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  hostFacets: [awsLambdaMediaRuntimeAdapter],
};

export default hypitPackage;
