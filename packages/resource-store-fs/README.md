# `@hypit/resource-store-fs`

Filesystem implementation of the Runtime's transient byte port. The local Runtime gives each Build
its own working directory and removes it after the project Build Result has accepted the public
Outputs.

The Runtime Profile does not select this package or its path. It stores no Build Result, credentials
or author source. Code embedding the Runtime directly may still construct `FileResourceStore`.

Read and write methods accept `{ signal }`. Reads close their file stream on cancellation; writes
close the file and remove the unfinished `.incoming` file before rejecting. Existing resources are
retained. For `putStream` and `writeStream`, the caller's chunk producer observes the same signal
while waiting for input.
