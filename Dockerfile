FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN YOUTUBE_DL_HOST=https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp npm ci --omit=dev
RUN node_modules/youtube-dl-exec/bin/yt-dlp --version && ffmpeg -version
COPY server.js ./
COPY public ./public
USER node
ENV PORT=8080 CONVERTER_MODE=cloudflare
EXPOSE 8080
CMD ["node", "server.js"]
