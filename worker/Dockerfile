FROM node:20-slim

# Install ffmpeg and python3 + scenedetect
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    && pip3 install --break-system-packages scenedetect[opencv] \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production=false

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# Clean dev deps
RUN npm prune --production

ENV PORT=3100
ENV SCENEDETECT_PATH=scenedetect

EXPOSE 3100

CMD ["node", "dist/server.js"]
