# Stage 1: Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build application
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

ARG QLMED_API_KEY=""
ENV QLMED_API_KEY=${QLMED_API_KEY}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build

# Stage 3: Production runner
FROM node:22-alpine AS runner
WORKDIR /app

ARG QLMED_BUILD_COMMIT_SHA="unknown"
ARG QLMED_BUILD_DEPLOYED_AT=""
ARG QLMED_BUILD_SOURCE="unknown"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=512"
ENV QLMED_BUILD_COMMIT_SHA=${QLMED_BUILD_COMMIT_SHA}
ENV QLMED_BUILD_DEPLOYED_AT=${QLMED_BUILD_DEPLOYED_AT}
ENV QLMED_BUILD_SOURCE=${QLMED_BUILD_SOURCE}

# Install tini (lightweight init to reap zombie processes) + Chromium for Puppeteer
RUN apk add --no-cache \
    tini \
    su-exec \
    openssl \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

LABEL org.opencontainers.image.revision=${QLMED_BUILD_COMMIT_SHA}
LABEL org.opencontainers.image.created=${QLMED_BUILD_DEPLOYED_AT}
LABEL org.opencontainers.image.source=${QLMED_BUILD_SOURCE}

# Copy standalone output (--chown avoids separate chown -R layer)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy Prisma files for migrations
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

# Copy entrypoint script
COPY --chown=nextjs:nodejs --chmod=755 start.sh ./start.sh

# Create writable directories used both with and without mounted volumes
RUN mkdir -p /app/xml_backup /app/storage /app/pdf_backup && chown -R nextjs:nodejs /app/xml_backup /app/storage /app/pdf_backup

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./start.sh"]
