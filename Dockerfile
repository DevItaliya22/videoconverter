FROM node:20-slim

# Install FFmpeg
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source files (these rarely change)
COPY tsconfig.json ./
COPY process-videos.ts ./

# Default command
CMD ["npx", "tsx", "process-videos.ts"]
