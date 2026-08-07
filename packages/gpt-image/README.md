# `@narratage/gpt-image`

Exact author/compute contracts for GPT Image 2 text-to-image and image-to-image requests.

The two modes are separate graph endpoints with mode-specific validation and a common
provider-neutral `GeneratedImageSet` result. The package owns model semantics but no API key,
Provider selection, queue or network code. `@narratage/provider-kie` is one optional Runtime
implementation.
