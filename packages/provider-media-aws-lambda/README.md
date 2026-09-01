# `@hypit/provider-media-aws-lambda`

Retired AWS Lambda Endpoint package for the nine capabilities declared by
`@hypit/media-pipeline` and implemented by `@hypit/media-execution`.

This route required the Runtime and Lambda function to share one selected S3 Artifact Store. Runtime
Profiles no longer select an Artifact Store: each Build has private transient working resources and
publishes its public outputs into the project Build Result. Consequently this package cannot be
activated from a current Runtime Profile.

The source remains only as the description of the former transport. A replacement must own its
remote staging internally, import completed resources into the current Build working store, and
leave no Runtime-wide storage choice behind.
