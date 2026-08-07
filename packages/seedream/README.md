# `@narratage/seedream`

Exact author/compute contracts for Seedream 5 Lite text-to-image and image-to-image generation.

The two modes are separate endpoints and return the provider-neutral `GeneratedImageSet` contract.
This package defines what the author requested, not where it runs: API translation, credentials,
retry and queue behavior belong to a selected Runtime Endpoint such as `@narratage/provider-kie`.
