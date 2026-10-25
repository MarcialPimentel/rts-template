# Portable game server image. Render runs Node natively (render.yaml), so this is for any other
# host: a VPS, Fly.io, Railway, or your own machine. Build from the repo root:
#
#   docker build -f deploy/Dockerfile --build-arg BUILD_ID=$(git rev-parse --short=7 HEAD) -t rts-server .
#   docker run -p 8080:8080 rts-server
#
# The host must terminate TLS so browsers can connect with wss://.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG BUILD_ID=dev
ENV BUILD_ID=${BUILD_ID}
RUN npm run build:server

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist ./server/dist
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server/dist/index.js"]
