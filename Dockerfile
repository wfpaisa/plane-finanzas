# Imagen de producción: PocketBase sirve la API y la web compilada, un solo proceso.

# 1. Compila la web (queda en pocketbase/pb_public).
FROM oven/bun:1 AS web
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# 2. PocketBase + hooks + migraciones + la web.
FROM alpine:3.22
ARG PB_VERSION=0.40.4
RUN apk add --no-cache ca-certificates tzdata
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip pocketbase -d /pb && rm /tmp/pb.zip
WORKDIR /pb
COPY pocketbase/pb_hooks ./pb_hooks
COPY pocketbase/pb_migrations ./pb_migrations
COPY --from=web /app/pocketbase/pb_public ./pb_public
ENV TZ=America/Bogota
EXPOSE 8090
VOLUME /pb/pb_data
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--hooksDir=/pb/pb_hooks", "--migrationsDir=/pb/pb_migrations", "--publicDir=/pb/pb_public"]
