# `@hypit/build-result-s3`

Opt-in S3-compatible repository for complete project Build Results. It stores Build manifests,
structured values and public files under one project prefix; Runtime working Artifacts remain local
to the selected Runtime implementation.

```json
{
  "results": {
    "use": "@hypit/build-result-s3",
    "config": {
      "bucket": "my-video-results",
      "prefix": "projects/episode-12",
      "region": "us-east-1"
    }
  }
}
```

`bucket` is required. `prefix`, `expectedBucketOwner`, `region`, `endpoint` and `forcePathStyle` are
optional. The AWS SDK uses its normal credential chain, so credentials stay outside the Profile.
`endpoint` and `forcePathStyle` support compatible object stores.

Objects keep the same visible shape as the filesystem repository:

```text
<prefix>/
  <build-id>/
    result.json
    files/...
    values/...
```

There is no global Build table or shared Result namespace. A reused historical Output is a
small forward reference to its producing Build and Output; following several such references still
reads the original file and does not upload another copy. While a Build is running, a private writer
file records only the state needed to continue publishing completed public Outputs and is removed when
the Result becomes terminal.
