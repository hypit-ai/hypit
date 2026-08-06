# `@svml/local`

The trusted, zero-service developer distribution. It keeps Core and the authoritative Build
Scheduler in the current Node process while allowing every Provider Endpoint to run in a different
place.

The convenience assembly uses:

- `@svml/store-sqlite` for durable Build and Operation facts;
- `@svml/artifact-store-fs` for content-addressed project bytes;
- optional replacement by any permission-checked ArtifactStore contribution, including
  `@svml/artifact-store-s3`;
- an in-process, queue-free Scheduler whose ready work always comes from Core;
- separately installed deterministic component packages and external Provider packages.

```ts
export default await createProjectLocalRuntime({
  root: import.meta.dirname,
  artifacts: createS3ArtifactStorePackage({
    bucket: "hypit-svml-artifacts",
    prefix: "development",
    region: "us-east-1",
  }),
  components: [generationComponent, seedanceComponent],
  providers: [createKieProvider({ apiKey: credentialRef("env", "KIE_API_KEY") })],
  allowedPermissions: ["network:aws:s3", "network:api.kie.ai", "network:kieai.redpandaai.co"],
  scheduling: {
    maxConcurrency: 8,
    lanes: { "provider:kie.personal": 2 },
  },
});
```

The KIE Provider shown above is implemented; `generationComponent` owns common result validators
and `seedanceComponent` owns exact request validators and deterministic Need Producers. Swapping a
Provider package changes an Endpoint implementation and its lane, not the `.svml` author document.
`createProjectLocalRuntime` accepts a configured ArtifactStore package directly;
advanced hosts may call `createLocalRuntime` with Postgres or other implementations of the same
ports instead of using the project defaults.
