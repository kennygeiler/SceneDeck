# MetroVision ingest worker — monorepo layout required (worker imports ../../src/lib, ../../src/db).
# Build from repository root:
#   docker build -f docker/metrovision-worker.Dockerfile .
#
# Runtime layout: /app/worker (npm start → tsx) and /app/src/{lib,db} for shared TS.

FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
  && pip3 install --break-system-packages "scenedetect[opencv]" \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY src/lib ./src/lib
COPY src/db ./src/db

COPY worker/package.json worker/package-lock.json ./worker/

WORKDIR /app/worker
RUN npm ci

COPY worker/tsconfig.json ./
COPY worker/src ./src

ENV PORT=3100
ENV SCENEDETECT_PATH=scenedetect

EXPOSE 3100

CMD ["npm", "start"]
