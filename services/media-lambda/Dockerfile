# FFmpeg is pinned by digest-bearing tag and then asserted, because a mutable
# upstream tag must never quietly change what a Build computes.
FROM mwader/static-ffmpeg:8.0.1 AS ffmpeg

FROM public.ecr.aws/lambda/nodejs:20
COPY --from=ffmpeg /ffmpeg /opt/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /opt/bin/ffprobe
RUN /opt/bin/ffmpeg -version | head -1 | grep -q 'ffmpeg version 8.0.1' \
 && /opt/bin/ffprobe -version | head -1 | grep -q 'ffprobe version 8.0.1'

ENV FFMPEG_PATH=/opt/bin/ffmpeg \
    FFPROBE_PATH=/opt/bin/ffprobe \
    NODE_ENV=production

COPY index.mjs ${LAMBDA_TASK_ROOT}/index.mjs
CMD ["index.handler"]
