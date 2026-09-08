# `@hypit/resource-store-s3`

S3 implementation of the Runtime's internal byte port. It is a library for a Runtime implementation
that deliberately embeds it; the local Runtime does not expose it as a Runtime Profile choice.

This package is not a Build Result repository and is not needed for ordinary local use. A project that
wants complete, reusable Build Results in S3 selects `@hypit/build-result-s3` instead. The injected AWS
client owns authentication; this package stores no Build history or credentials.

Resource methods accept `{ signal }` and forward it to the object client. The AWS implementation
aborts both pending HTTP requests and response-body reads. Stream producers supplied to writes use
the same signal. A cancelled multipart write aborts its known upload with a separate five-second
cleanup deadline; if cleanup fails, the error includes the upload id. Completed objects are retained.
Streaming writes require the client's create, part-upload, completion and abort methods as well as
streaming reads. This transfer cleanup does not resume or resubmit a Build.
