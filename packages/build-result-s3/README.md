# `@hypit/build-result-s3`

Opt-in S3-compatible repository for complete project Build Results. It stores Build manifests,
Composite Value Documents and public Resource files under one project prefix; an active Build's
temporary Resources remain with the selected Runtime implementation.

```json
{
  "format": "hypit.build-results@1",
  "use": "@hypit/build-result-s3",
  "config": {
    "bucket": "my-video-results",
    "prefix": "projects/episode-12",
    "region": "us-east-1"
  }
}
```

`bucket` is required. `prefix`, `expectedBucketOwner`, `region`, `endpoint` and `forcePathStyle` are
optional. The AWS SDK uses its normal credential chain, so credentials stay outside the Profile.
`endpoint` and `forcePathStyle` support compatible object stores.

The repository exposes the same logical shape as the filesystem adapter:

```text
<prefix>/
  <build-id>/
    result.json
    files/...
    values/...
```

Filesystem and S3 use the same Record-to-Result encoder. The adapter only writes the selected
relative document or byte path; it does not interpret domain values. A Value Document keeps canonical
domain data separate from the paths of nested Resources.

Physical object prefixes use a reversible descending-time form derived from the ordered Build id, so
S3 can return a newest-first delimiter page directly. This is only adapter key layout: callers still
address `build + output`, and no index object or global Build table exists. A reused historical Output is a
small forward reference to the finished Result that owns its value. New references are reduced to that
terminal address as they are written, so repeated reuse still reads the original file without uploading
another copy or maintaining a reverse dependency index. While a Build is running, a private writer
file records only the state needed to continue publishing completed public Outputs and is removed when
the Result receives its outcome.

Object listing uses a bounded cursor page. File reads accept normalized byte ranges, allowing Studio to
stream remote video and audio without buffering the complete object. The adapter's active doctor uses
one bounded prefix listing to verify credentials, bucket access and endpoint reachability; it creates
no probe object and reads no Result manifest.
