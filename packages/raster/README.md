# @hypit/raster

The closed deterministic raster-execution waist. It owns one `execute-raster` capability and a
finite `RasterRequest` union. Author packages such as Image Transform and Image Compose lower their
different author meanings into this contract; Providers implement the pixel engine once.

Raster contains no author Surface, queue, filesystem, OpenCV or remote placement policy.
