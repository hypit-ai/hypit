# `@hypit/resource-store-s3`

S3 implementation of the Runtime's internal byte port. It is a library for a Runtime implementation
that deliberately embeds it; the local Runtime does not expose it as a Runtime Profile choice.

This package is not a Build Result repository and is not needed for ordinary local use. A project that
wants complete, reusable Build Results in S3 selects `@hypit/build-result-s3` instead. The injected AWS
client owns authentication; this package stores no Build history or credentials.
